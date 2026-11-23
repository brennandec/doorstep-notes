import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as filmHelpers from "../e2e/device/filmHelpers";
import {
  A5_PRONOUN_WARNING,
  TAKE_SUFFIXES,
  classifySheetFaults,
  collectFinishedObservations,
  doublesInText,
  hasA5PronounWarning,
} from "../e2e/device/filmHelpers";

const H36_4 = JSON.parse(readFileSync("results/film-run-2026-11-15-h36-4.json", "utf8")) as { finishedText: string };
const H36_5 = JSON.parse(readFileSync("results/film-run-2026-11-15-h36-5.json", "utf8")) as { finishedText: string };

describe("H36f + H36g pronoun rule: stop only on A5 wrong-person line, record doubled words as observations, never use genderMismatches", () => {
  it("removes genderMismatches from filmHelpers and filmRun.spec.ts", () => {
    expect("genderMismatches" in filmHelpers).toBe(false);
    const helpersSrc = readFileSync("tests/e2e/device/filmHelpers.ts", "utf8");
    expect(helpersSrc).not.toMatch(/genderMismatches/);
    const filmRunSrc = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    expect(filmRunSrc).not.toMatch(/genderMismatches/);
  });

  it("classifies A5 warning as a stop while h36-4, h36-5, neutral pronoun notes, and doubled words pass without stopping", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["classifySheetFaults"]).toBe("function");
    expect(typeof mod["collectFinishedObservations"]).toBe("function");
    expect(doublesInText(H36_4.finishedText)).toEqual([]);
    expect(doublesInText(H36_5.finishedText)).toEqual([]);
    expect(classifySheetFaults({ sheetText: H36_4.finishedText, noteItems: [] }).stops).toEqual([]);
    expect(classifySheetFaults({ sheetText: H36_5.finishedText, noteItems: [] }).stops).toEqual([]);
    expect(
      classifySheetFaults({
        sheetText: "Tomas Brandvold, a neighbour who is also on the client list, offered to help her with the form.",
        noteItems: [],
      }).stops,
    ).toEqual([]);
    expect(
      classifySheetFaults({
        sheetText: "Tomas Brandvold, a neighbor also on my list, offered to help her with the form.",
        noteItems: [],
      }).stops,
    ).toEqual([]);
    expect(
      classifySheetFaults({
        sheetText: "Maria Okonkwo-Reyes missed the form and he left a note.",
        noteItems: ["The draft used no pronoun tokens, so no pronouns were changed."],
      }),
    ).toEqual({
      stops: [],
      observedNotes: ["The draft used no pronoun tokens, so no pronouns were changed."],
    });
    expect(hasA5PronounWarning([`${A5_PRONOUN_WARNING} Tomas offered to help her.`])).toBe(true);
    expect(
      classifySheetFaults({
        sheetText: H36_4.finishedText,
        noteItems: [`${A5_PRONOUN_WARNING} Tomas offered to help her.`],
      }).stops,
    ).toHaveLength(1);
    const obsShe = collectFinishedObservations({
      finishedText: "Agreed with Maria she she posts the form.",
      observedNotes: [],
    });
    expect(obsShe.some((o) => o.rule === "doublesInText" && o.seen.includes("she she"))).toBe(true);
    const obsOr = collectFinishedObservations({
      finishedText: "Agreed with Maria she or she posts the form.",
      observedNotes: [],
    });
    expect(obsOr.some((o) => o.rule === "doublesInText" && o.seen.includes("she or she"))).toBe(true);
    const obsSlash = collectFinishedObservations({
      finishedText: "Agreed with Tomas he/he posts the form.",
      observedNotes: [],
    });
    expect(obsSlash.some((o) => o.rule === "doublesInText" && o.seen.includes("he/he"))).toBe(true);
  });

  it("extends TAKE_SUFFIXES through h36-9 under H36g", () => {
    expect(TAKE_SUFFIXES).toEqual(["h36", "h36-2", "h36-3", "h36-4", "h36-5", "h36-6", "h36-7", "h36-8", "h36-9"]);
  });

  it("OPEN-QUESTIONS.md adds Session H36f without banned words or emojis", () => {
    const doc = readFileSync(".kiro/specs/OPEN-QUESTIONS.md", "utf8");
    const idx = doc.indexOf("## Session H36f");
    expect(idx).toBeGreaterThan(-1);
    const sec = doc.slice(idx);
    expect(sec).toMatch(/h36-4/);
    expect(sec).toMatch(/Tomas Brandvold/);
    expect(sec).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
    expect(sec).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u);
  });
});
