// The story-order film take (2026-11-17): its slots, its stop line, its inputs and the six keep conditions.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STORY_CLIENT_LIST,
  STORY_NOTE,
  STORY_TAKE_CAP,
  STORY_TYPED_PHRASE,
  budgetStop,
  beaSuggested,
  dobSuggested,
  firstWords,
  householdGuess,
  likelyWordAction,
  listedChip,
  quotesTheNeighbour,
  selectStorySuffix,
  splitAroundPhrase,
  storyGates,
  type StoryGateInput,
} from "../e2e/device/storyTake";

const passing: StoryGateInput = {
  finished: true,
  problems: [],
  proposedChips: ["Bea suggested", "3/3/87 suggested"],
  pass1Chip: { rule: "neighbour-quote", quote: "neighbour, also on my list" },
  pass2: { settled: true, guesses: 3, error: null },
  finishedNote: { labels: "in the cloud", text: "Maria Okonkwo-Reyes and Bea were present at the visit on 12/11." },
  verdict: "No listed name left this device: 0 of 20.",
};

describe("story take inputs", () => {
  it("types the seven-line example note and keeps the 12-name list", () => {
    expect(STORY_NOTE.split("\n")).toHaveLength(7);
    expect(STORY_CLIENT_LIST.split("\n")).toHaveLength(12);
    expect(STORY_CLIENT_LIST.split("\n")[0]).toMatch(/^Maria Okonkwo-Reyes;/);
    expect(STORY_TAKE_CAP).toBe(3);
  });
  it("splits the note around the phrase of crop 3, and the pieces join back to the note", () => {
    const p = splitAroundPhrase(STORY_NOTE, STORY_TYPED_PHRASE);
    expect(p.before + p.phrase + p.after).toBe(STORY_NOTE);
    expect(p.after.startsWith(" last wk")).toBe(true);
    expect(() => splitAroundPhrase(STORY_NOTE, "not in the note")).toThrow();
  });
});

describe("story take slots and the stop line", () => {
  it("takes the next slot with no record and no folder, and never reuses one", () => {
    const root = mkdtempSync(join(tmpdir(), "story-take-"));
    try {
      const results = join(root, "results");
      const raw = join(root, "raw");
      mkdirSync(results);
      mkdirSync(raw);
      expect(selectStorySuffix("take", results, raw)).toEqual({ suffix: "s1", rawDir: join(raw, "raw-s1"), record: "film-story-take" });
      writeFileSync(join(results, "film-story-take-2026-11-17-s1.json"), "{}");
      expect(selectStorySuffix("take", results, raw).suffix).toBe("s2");
      mkdirSync(join(raw, "raw-s2"));
      expect(selectStorySuffix("take", results, raw).suffix).toBe("s3");
      expect(selectStorySuffix("rehearsal", results, raw)).toEqual({ suffix: "r1", rawDir: join(raw, "rehearsal-r1"), record: "film-story-rehearsal" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("refuses an attempt at 34 calls or more and allows one below", () => {
    expect(budgetStop(29)).toBeNull();
    expect(budgetStop(33)).toBeNull();
    expect(budgetStop(34)).toMatch(/34 calls/);
    expect(budgetStop(40)).not.toBeNull();
  });
});

describe("story take readings", () => {
  it("reads the chips the crops need", () => {
    expect(beaSuggested(["26/11 suggested", " Bea  suggested "])).toBe(true);
    expect(beaSuggested(["Beatrice suggested"])).toBe(false);
    expect(dobSuggested(["DOB on form 3/3/87 suggested"])).toBe(true);
    expect(listedChip(["Bea suggested", "[Person 1]  on your list"])).toBe("[Person 1] on your list");
    expect(listedChip(["[Person 3] near a listed name"])).toBeNull();
  });
  it("knows a neighbour quote, the household guess and the first words", () => {
    expect(quotesTheNeighbour("neighbour, also on my list")).toBe(true);
    expect(quotesTheNeighbour("a neighbor")).toBe(true);
    expect(quotesTheNeighbour("neighbourhood")).toBe(false);
    expect(householdGuess(["A visiting professional.", "A local tenant living with ongoing damp and disrepair."])).toBe(
      "A local tenant living with ongoing damp and disrepair.",
    );
    expect(householdGuess(["A visiting professional."])).toBeNull();
    expect(firstWords("  Maria Okonkwo-Reyes and Bea were present at the visit.", 6)).toBe("Maria Okonkwo-Reyes and Bea were present");
  });
  it("masks a capital-letter guess that names a person of the note and keeps any other", () => {
    expect(likelyWordAction("Bea")).toBe("mask");
    expect(likelyWordAction("Brandvald")).toBe("mask");
    expect(likelyWordAction("Landlord")).toBe("keep");
    expect(likelyWordAction("Mould")).toBe("keep");
  });
});

describe("story take gates", () => {
  it("keeps a take that meets all six conditions", () => {
    expect(storyGates(passing)).toEqual({
      gates: { statusPass: true, beaSuggested: true, neighbourQuoted: true, pass2Recorded: true, finishedRestoredInCloud: true, verdictPresent: true },
      keep: true,
      missed: [],
    });
  });
  it("names each condition a take misses", () => {
    const r = storyGates({
      ...passing,
      problems: ["step 7: no quote about the neighbour"],
      proposedChips: ["26/11 suggested"],
      pass1Chip: { rule: "first-pressable", quote: "Mould in back bedroom again" },
      pass2: null,
      finishedNote: { labels: "on this device", text: "[Person 1] was present." },
      verdict: "Nothing went to the cloud: 0 of 20 listed names.",
    });
    expect(r.keep).toBe(false);
    expect(r.missed).toEqual([
      "status pass",
      '"Bea suggested" appears',
      "pass 1 quotes a phrase about the neighbour that she can mask",
      "pass 2 recorded",
      'finished note with its names put back, labelled "in the cloud"',
      'verdict line "No listed name left this device"',
    ]);
  });
  it("a finished note that still holds a tag, or a walk that did not finish, is not kept", () => {
    expect(storyGates({ ...passing, finishedNote: { labels: "in the cloud", text: "Maria Okonkwo-Reyes met [Person 3]." } }).gates.finishedRestoredInCloud).toBe(false);
    expect(storyGates({ ...passing, finished: false }).gates.statusPass).toBe(false);
    expect(storyGates({ ...passing, pass2: { settled: true, guesses: 2, error: "The second reader could not answer." } }).gates.pass2Recorded).toBe(false);
  });
});
