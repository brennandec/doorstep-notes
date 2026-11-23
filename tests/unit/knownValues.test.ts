// Drafting task 23 (third review, X1 and Y1): what the device knows, it puts back.
// Invented people only. A value that is in the rough note, on the client list or in the mask
// map is restored in the finished note. "Added by the model" is kept only for a name that is in none of them.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { findAddedNames, isKnownValue } from "../../src/drafting/addedNames";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { prepareDraft, sendDraft } from "../../src/drafting/draftFlow";
import { screenDraft } from "../../src/drafting/screenDraft";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { makeLedger } from "../../src/egress/ledger";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DraftJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { runPasses } from "../../src/masking/entry";
import { mergeProposals } from "../../src/masking/merge";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { recordBlock } from "../../src/drafting/buildOutgoing";

const clients = parseClientList(inventedVisit.clientList).entries;
const NOTE = inventedVisit.note;
const TAG = /\[(?:Person|Place|Date|Detail) \d+\]/;
const accepting = { ...DEFAULT_POLICY, proposalsStartAccepted: true };

const returning = (text: string): DraftJob => ({
  run: async () => ({ value: { text, short: false }, inferenceSource: "IN_CLOUD", connected: false }),
});

/** Every suggestion accepted: the device pass merged over the exact and near passes on the record block. */
function allAccepted() {
  // The worker is written as "worker" in the outgoing text, so the present line here lists the two people.
  const record = { ...inventedVisit.preparedRecord, present: inventedVisit.preparedRecord.present.filter((p) => p.role !== "worker") };
  const raw = recordBlock(record);
  const base = runPasses(raw, clients, accepting).combined;
  const merged = mergeProposals(
    raw,
    base,
    [
      { text: "Bea", kind: "name" },
      { text: "12/11", kind: "dob" },
      { text: "26/11", kind: "dob" },
      { text: "benefits form", kind: "phrase" },
      { text: "Mon", kind: "place" },
      { text: "Fri", kind: "place" },
    ],
    accepting,
  );
  return prepareDraft({ record, clients, policy: accepting, spans: merged.spans });
}

describe("every suggestion accepted (Y1, unit)", () => {
  it("leaves no square-bracket tag in the finished note and reads 'Present: Maria Okonkwo-Reyes, Bea.'", async () => {
    const prep = allAccepted();
    expect(prep.outgoing.text).toMatch(/Present: \[Person 1\], \[Person \d+\]/);
    const out = await sendDraft(prep, "PREFER_IN_CLOUD", { draft: draftDouble, ledger: makeLedger(), clients, noteText: NOTE });
    if (out.status !== "drafted") throw new Error("expected a draft");
    expect(out.restored.text).toContain("Present: Maria Okonkwo-Reyes, Bea.");
    expect(out.restored.text).not.toMatch(TAG);
    expect(out.restored.added).toEqual([]);
    expect(out.restored.notes.join(" ")).not.toMatch(/Added by the model/);
  });

  it("restores a word she pressed and a near match as well", async () => {
    const prep = allAccepted();
    const out = await sendDraft(prep, "PREFER_IN_CLOUD", { draft: draftDouble, ledger: makeLedger(), clients, noteText: NOTE });
    if (out.status !== "drafted") throw new Error("expected a draft");
    // "Tomas Brandvald" in the note is a near match of the listed "Tomas Brandvold".
    expect(out.restored.text).toMatch(/Tomas Brand/);
    expect(out.restored.text).not.toMatch(TAG);
  });
});

describe("values the device finds in the returned draft (X1)", () => {
  const prep = () => prepareDraft({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
  const draft = "Present: [Person 1], Bea. Visit on 12/11 at 14 Alder Court. Born 3/3/87. {She:Person 1} agreed.";
  const find = async () => [
    { text: "Bea", kind: "name" as const },
    { text: "12/11", kind: "dob" as const },
    { text: "14 Alder Court", kind: "place" as const },
    { text: "3/3/87", kind: "dob" as const },
  ];

  it("restores values that are in the rough note, and does not mark them", async () => {
    const out = await sendDraft(prep(), "PREFER_IN_CLOUD", { draft: returning(draft), ledger: makeLedger(), clients, noteText: NOTE, findNames: find });
    if (out.status !== "drafted") throw new Error("expected a draft");
    expect(out.restored.text).toContain("Present: Maria Okonkwo-Reyes, Bea.");
    expect(out.restored.text).toContain("14 Alder Court");
    expect(out.restored.text).toContain("3/3/87");
    expect(out.restored.text).not.toMatch(TAG);
    expect(out.restored.added).toEqual([]);
    expect(out.restored.notes.join(" ")).not.toMatch(/Added by the model|not put back/);
    // The masked draft still holds tags only, for any later use.
    expect(out.maskedDraft).not.toMatch(/Bea|Alder|3\/3\/87/);
  });

  it("marks a name that is in neither the note, the list nor the map, and keeps it as a tag", async () => {
    const text = `${draft} Glenda Pruitt also rang.`;
    const out = await sendDraft(prep(), "PREFER_IN_CLOUD", {
      draft: returning(text),
      ledger: makeLedger(),
      clients,
      noteText: NOTE,
      findNames: async () => [...(await find()), { text: "Glenda Pruitt", kind: "name" as const }],
    });
    if (out.status !== "drafted") throw new Error("expected a draft");
    expect(out.restored.added).toHaveLength(1);
    expect(out.restored.added[0]!.name).toBe("Glenda Pruitt");
    expect(out.restored.text).not.toContain("Glenda");
    expect(out.restored.text.match(new RegExp(TAG.source, "g"))).toHaveLength(1);
    expect(out.restored.text).toContain("Present: Maria Okonkwo-Reyes, Bea.");
  });

  it("marks a date that the note does not hold", async () => {
    const out = await sendDraft(prep(), "PREFER_IN_CLOUD", {
      draft: returning("Born 5/5/91."),
      ledger: makeLedger(),
      clients,
      noteText: NOTE,
      findNames: async () => [{ text: "5/5/91", kind: "dob" as const }],
    });
    if (out.status !== "drafted") throw new Error("expected a draft");
    expect(out.restored.added).toHaveLength(1);
    expect(out.restored.text).not.toContain("5/5/91");
  });

  it("without the rough note, a found value that is not in the map stays marked", async () => {
    const out = await sendDraft(prep(), "PREFER_IN_CLOUD", { draft: returning("Nia Okoye came."), ledger: makeLedger(), clients, findNames: async () => [{ text: "Nia Okoye", kind: "name" as const }] });
    if (out.status !== "drafted") throw new Error("expected a draft");
    expect(out.restored.added).toHaveLength(1);
    expect(out.restored.added[0]!.name).toBe("Nia Okoye");
  });
});

describe("isKnownValue", () => {
  it("is true when every word is in the note or on the list", () => {
    expect(isKnownValue("Bea", NOTE, clients)).toBe(true);
    expect(isKnownValue("her twin brother", "Her twin brother was in.", clients)).toBe(true);
    expect(isKnownValue("Priya Halloran", NOTE, clients)).toBe(true); // on the list
  });
  it("is false when one word is in neither", () => {
    expect(isKnownValue("Glenda Pruitt", NOTE, clients)).toBe(false);
    expect(isKnownValue("Daniel Okafor", "her son Daniel", clients)).toBe(false);
  });
  it("needs a value with digits to stand whole in the note", () => {
    expect(isKnownValue("3/3/87", NOTE, clients)).toBe(true);
    expect(isKnownValue("14 Alder Court", NOTE, clients)).toBe(true);
    expect(isKnownValue("12 Alder Court", NOTE, clients)).toBe(false);
    expect(isKnownValue("5/5/91", NOTE, clients)).toBe(false);
  });
  it("is false for an empty value", () => {
    expect(isKnownValue("  ", NOTE, clients)).toBe(false);
  });
});

describe("screenDraft: known and added", () => {
  const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
  it("gives a known value a tag in the map without listing it as added", () => {
    const s = screenDraft({ draft: "Bea came.", outgoing, clients, policy: DEFAULT_POLICY, noteText: NOTE, proposed: [{ text: "Bea", kind: "name" }] });
    const existing = Object.entries(outgoing.mask.map).find(([, name]) => name === "Bea")?.[0];
    expect(existing).toMatch(/^\[Person \d+\]$/);
    expect(s.addedTags).toEqual([]);
    expect(s.added).toEqual([]);
    expect(s.maskedText).toContain(existing!);
    expect(s.mask.map[existing!]).toBe("Bea");
    const r = restoreDraft({ draft: s.maskedText, outgoing, clients, screened: s });
    expect(r.text).toBe("Bea came.");
  });
  it("treats a listed name that is on the client list as known", () => {
    const s = screenDraft({ draft: "Priya Halloran rang.", outgoing, clients, policy: DEFAULT_POLICY, noteText: NOTE });
    expect(s.added).toEqual([]);
    expect(restoreDraft({ draft: s.maskedText, outgoing, clients, screened: s }).text).toBe("Priya Halloran rang.");
  });
  it("lists an unknown name as added", () => {
    const s = screenDraft({ draft: "Glenda Pruitt rang.", outgoing, clients, policy: DEFAULT_POLICY, noteText: NOTE, proposed: [{ text: "Glenda Pruitt", kind: "name" }] });
    expect(s.added).toHaveLength(1);
  });
});

describe("findAddedNames still marks only unknown names in the record", () => {
  it("does not mark the invented visit's own people", () => {
    expect(findAddedNames(inventedVisit.preparedRecord, NOTE, clients)).toEqual([]);
  });
});
