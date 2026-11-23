// Drafting task 17 (ruling 24): a model's output is text like any other. The draft
// goes through the masker before it is shown or used again; a name the model added is
// marked, and is not put back without her press.
// Rewritten by drafting task 23 (third review, X1): a value that is on the client list or in the
// rough note is known and is put back. The names that stay marked here are in neither
// ("Glenda Pruitt", "Daniel Okafor"), so those tests use them instead of the listed "Priya Halloran".
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { prepareDraft, sendDraft } from "../../src/drafting/draftFlow";
import { restoreAddedTag, restoreDraft } from "../../src/drafting/restoreDraft";
import { screenDraft } from "../../src/drafting/screenDraft";
import { makeLedger } from "../../src/egress/ledger";
import type { DraftJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({
  record: { ...inventedVisit.preparedRecord, seen: ["Mould in the back bedroom. Bea was there."] },
  clients,
  policy: DEFAULT_POLICY,
  extraMasked: ["Bea"],
});
const screen = (draft: string, names: { text: string; kind: "name" | "place" | "dob" | "phrase" }[] = []) =>
  screenDraft({ draft, outgoing, clients, policy: DEFAULT_POLICY, proposed: names });
const GLENDA = [{ text: "Glenda Pruitt", kind: "name" as const }];

/** A double that adds a name the model was never given. */
const addingDouble = (text: string): DraftJob => ({
  run: async () => ({ value: { text, short: false }, inferenceSource: "IN_CLOUD", connected: true }),
});

describe("screenDraft: names already in the sent tags", () => {
  it("leaves a draft that holds only tags exactly as it was", () => {
    const s = screen("[Person 1] and [Detail 1] agreed. {She:Person 1} will post it.");
    expect(s.maskedText).toBe("[Person 1] and [Detail 1] agreed. {She:Person 1} will post it.");
    expect(s.addedTags).toEqual([]);
  });

  it("turns a listed name that has a tag back into that tag, and does not mark it as added", () => {
    const s = screen("Maria Okonkwo-Reyes agreed, and Bea helped.");
    expect(s.maskedText).toBe("[Person 1] agreed, and [Detail 1] helped.");
    expect(s.addedTags).toEqual([]);
  });
});

describe("screenDraft: names the model added", () => {
  it("masks a listed name that was not in the sent record with a new tag, and does not mark it (it is on the list)", () => {
    const s = screen("[Person 1] agreed. Priya Halloran also rang.");
    expect(s.maskedText).not.toMatch(/Priya|Halloran/);
    expect(s.addedTags).toHaveLength(1);
    expect(s.added).toEqual([]);
    const tag = s.addedTags[0]!;
    expect(s.maskedText).toContain(`${tag} also rang.`);
    expect(tag).toMatch(/^\[Person \d+\]$/);
    expect(outgoing.mask.map[tag]).toBeUndefined();
    expect(s.mask.map[tag]).toBe("Priya Halloran");
    expect(s.mask.surfaceForms).toContain("Priya Halloran");
  });

  it("marks a name that is in neither the list nor the note as added by the model", () => {
    const s = screen("[Person 1] agreed. Glenda Pruitt also rang.", GLENDA);
    expect(s.added).toHaveLength(1);
    expect(s.added[0]).toMatchObject({ tag: s.addedTags[0], name: "Glenda Pruitt" });
  });

  it("uses one new tag for one added name, however many times it appears or how it is cased", () => {
    const s = screen("Priya Halloran rang. PRIYA HALLORAN left. Halloran came back.");
    expect(s.addedTags).toHaveLength(1);
    const tag = s.addedTags[0]!;
    expect(s.maskedText.split(tag)).toHaveLength(4);
  });

  it("numbers new tags after the sent ones, so they never collide", () => {
    const s = screen("Priya Halloran and Emeka Fairbairn rang.");
    expect(s.addedTags).toHaveLength(2);
    for (const t of s.addedTags) expect(Object.keys(outgoing.mask.map)).not.toContain(t);
    expect(new Set(s.addedTags).size).toBe(2);
  });

  it("masks a near variant of a listed name", () => {
    const s = screen("Emeka Fairbarn rang.");
    expect(s.maskedText).not.toMatch(/Fairbarn|Emeka/);
    expect(s.addedTags).toHaveLength(1);
  });

  it("masks an unlisted name that the device found in the draft, as added", () => {
    const s = screen("[Person 1] agreed. Daniel Okafor visited.", [{ text: "Daniel Okafor", kind: "name" }]);
    expect(s.maskedText).not.toContain("Daniel");
    expect(s.addedTags).toHaveLength(1);
    expect(s.addedTags[0]).toMatch(/^\[Person \d+\]$/);
    expect(s.mask.map[s.addedTags[0]!]).toBe("Daniel Okafor");
  });

  it("tags a device-found place and date by kind", () => {
    const s = screen("They met at Harbour Row on 3 March 1987.", [
      { text: "Harbour Row", kind: "place" },
      { text: "3 March 1987", kind: "dob" },
    ]);
    expect(s.maskedText).toMatch(/at \[Place \d+\] on \[Date \d+\]\./);
    expect(s.addedTags).toHaveLength(2);
  });

  it("ignores a device candidate that is only a tag or is not in the draft", () => {
    const s = screen("[Person 1] agreed.", [{ text: "[Person 1]", kind: "name" }, { text: "Nobody Here", kind: "name" }]);
    expect(s.maskedText).toBe("[Person 1] agreed.");
    expect(s.addedTags).toEqual([]);
  });

  it("does not change the sent mask result", () => {
    const before = JSON.stringify(outgoing.mask.map);
    screen("Priya Halloran rang.");
    expect(JSON.stringify(outgoing.mask.map)).toBe(before);
  });
});

describe("restoring with added names", () => {
  it("does not put an added name back without a press, and says so", () => {
    const s = screen("[Person 1] agreed. Glenda Pruitt also rang. {She:Person 1} will post it.", GLENDA);
    const tag = s.addedTags[0]!;
    const r = restoreDraft({ draft: s.maskedText, outgoing, clients, screened: s });
    expect(r.text).toContain("Maria Okonkwo-Reyes agreed.");
    expect(r.text).toContain(`${tag} also rang.`);
    expect(r.text).not.toContain("Glenda");
    expect(r.shown).toContain("(name not put back) also rang.");
    expect(r.shown).not.toContain("Glenda");
    expect(r.added).toHaveLength(1);
    expect(r.added[0]).toMatchObject({ tag, name: "Glenda Pruitt" });
    expect(r.notes).toContain(strings.drafting.addedByModel);
    expect(r.notes.some((n) => n.startsWith("Not put back:"))).toBe(false);
  });

  it("leaves a pronoun token for an added name out of the shown text", () => {
    const s = screen("Glenda Pruitt rang and {she:Glenda Pruitt} left.", GLENDA);
    const tag = s.addedTags[0]!;
    const withToken = `${tag} rang and {she:${tag.slice(1, -1)}} left.`;
    const r = restoreDraft({ draft: withToken, outgoing, clients, screened: s });
    expect(r.text).toContain(`{she:${tag.slice(1, -1)}}`);
    expect(r.shown).toBe("(name not put back) rang and (pronoun not put back) left.");
  });

  it("puts the name back on a press, one tag at a time", () => {
    const s = screen("[Person 1] agreed. Glenda Pruitt rang. Daniel Okafor left.", [...GLENDA, { text: "Daniel Okafor", kind: "name" }]);
    const r = restoreDraft({ draft: s.maskedText, outgoing, clients, screened: s });
    const [first, second] = r.added;
    const a = restoreAddedTag(r, first!.tag);
    expect(a.text).toContain(first!.name);
    expect(a.text).toContain(second!.tag);
    expect(a.shown).toContain(first!.name);
    expect(a.shown).toContain("(name not put back)");
    expect(a.added).toEqual([second]);
    expect(a.notes).toContain(strings.drafting.addedByModel);
    const b = restoreAddedTag(a, second!.tag);
    expect(b.added).toEqual([]);
    expect(b.text).toContain(second!.name);
    expect(b.notes).not.toContain(strings.drafting.addedByModel);
  });
});

describe("through the flow: a double that adds a name", () => {
  const run = async (text: string, findNames?: (t: string) => Promise<{ text: string; kind: "name" }[]>) => {
    const prep = prepareDraft({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const out = await sendDraft(prep, "PREFER_IN_CLOUD", {
      draft: addingDouble(text),
      ledger: makeLedger(),
      clients,
      ...(findNames ? { findNames } : {}),
    });
    if (out.status !== "drafted") throw new Error("expected a draft");
    return out;
  };

  it("shows the added name as a tag, marked, and not restored", async () => {
    const out = await run("[Person 1] agreed. Glenda Pruitt also rang.", async () => [{ text: "Glenda Pruitt", kind: "name" as const }]);
    expect(out.restored.text).not.toContain("Glenda");
    expect(out.restored.added).toHaveLength(1);
    expect(out.maskedDraft).not.toMatch(/Glenda|Pruitt/);
    expect(out.restored.notes.some((n) => n.startsWith("Added by the model:"))).toBe(true);
  });

  it("restores a listed name the model brought, since it is on the client list", async () => {
    const out = await run("[Person 1] agreed. Priya Halloran also rang.");
    expect(out.restored.text).toContain("Priya Halloran also rang.");
    expect(out.restored.added).toEqual([]);
    expect(out.maskedDraft).not.toMatch(/Priya|Halloran/);
  });

  it("gives the masked draft (tags only) for any later use", async () => {
    const out = await run("[Person 1] agreed. Priya Halloran also rang.");
    expect(out.maskedDraft).toContain("[Person 1] agreed.");
    expect(out.maskedDraft).toMatch(/\[Person \d+\] also rang\./);
  });

  it("asks the device for names in the draft and marks what it finds", async () => {
    const find = vi.fn(async () => [{ text: "Daniel Okafor", kind: "name" as const }]);
    const out = await run("[Person 1] agreed. Daniel Okafor visited.", find);
    expect(find).toHaveBeenCalledWith("[Person 1] agreed. Daniel Okafor visited.");
    expect(out.restored.text).not.toContain("Daniel");
    expect(out.restored.added).toHaveLength(1);
  });

  it("carries on when the device cannot look", async () => {
    const out = await run("[Person 1] agreed.", async () => { throw new Error("no model"); });
    expect(out.restored.text).toBe("Maria Okonkwo-Reyes agreed.");
  });

  it("wording of the notes comes from the string table", () => {
    expect(strings.drafting.addedByModel).toBe(
      "Added by the model: a name, place or date that is not in your note or your list. The note shows a phrase in round brackets until you press to put it back.",
    );
  });
});
