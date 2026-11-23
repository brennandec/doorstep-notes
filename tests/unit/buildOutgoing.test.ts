import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing, INSTRUCTIONS, recordBlock } from "../../src/drafting/buildOutgoing";
import { checkEgress } from "../../src/egress/check";
import { makePreview } from "../../src/egress/send";
import { toggleSpan } from "../../src/masking/toggle";
import type { VisitRecord } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const base: VisitRecord = {
  visitDate: "2026-11-12",
  present: [
    { label: "Maria Okonkwo-Reyes", role: "client" },
    { label: "Bea", role: "other" },
    { label: "Dana Whitfield", role: "worker" },
  ],
  seen: ["Mould in the back bedroom."],
  agreed: ["Worker rings the landlord on Monday."],
  risks: ["Rent arrears if the form is late."],
  nextSteps: ["Revisit on 26/11."],
};
const build = (record: VisitRecord, extra: Partial<Parameters<typeof buildOutgoing>[0]> = {}) =>
  buildOutgoing({ record, clients, policy: DEFAULT_POLICY, ...extra });
const listedNames = clients.flatMap((c) => [c.fullName, ...c.otherNames]);

describe("buildOutgoing (ruling 24, one road out)", () => {
  it("masks a listed surname that is in a record field but not in the rough note", () => {
    expect(inventedVisit.note).not.toMatch(/Halloran/);
    const record = { ...base, agreed: ["Halloran offered to drive her to the office."] };
    const out = build(record);
    expect(out.text).not.toMatch(/Halloran/i);
    expect(out.text).toMatch(/\[Person \d\] offered to drive/);
  });

  it("masks a listed full name added by the model in every field", () => {
    const record: VisitRecord = {
      visitDate: "2026-11-12",
      present: [{ label: "Priya Halloran", role: "client" }],
      seen: ["Priya Halloran at the door."],
      agreed: ["Priya Halloran will call."],
      risks: ["Wren Castellano-Hughes mentioned a debt."],
      nextSteps: ["Phone Emeka Fairbairn."],
    };
    const out = build(record);
    for (const name of ["Priya", "Halloran", "Wren", "Castellano", "Hughes", "Emeka", "Fairbairn"]) {
      expect(out.text, name).not.toMatch(new RegExp(name, "i"));
    }
    const r = checkEgress({
      captured: [{ url: "", body: new TextEncoder().encode(out.text) }],
      listedNames,
      surfaceForms: out.mask.surfaceForms,
      sentOnPurpose: [],
    });
    expect(r.passed).toBe(true);
    expect(r.listedFound).toEqual([]);
  });

  it("masks the exact pass, a near variant, an other name and a case variant", () => {
    const record = { ...base, seen: ["MARIA OKONKWO-REYES let us in.", "Tomas Brandvald was there, and Tom too."] };
    const out = build(record);
    expect(out.text).not.toMatch(/okonkwo|brandvald|\btom\b/i);
  });

  it("uses one tag for one person across fields", () => {
    const record = { ...base, seen: ["Maria was tired."], agreed: ["Maria posts the form."] };
    const out = build(record);
    const tags = out.maskedRecord.match(/\[Person \d\]/g) ?? [];
    expect(new Set(tags).size).toBeLessThan(tags.length);
    const seen = out.maskedRecord.match(/Seen: \[(Person \d)\]/)![1];
    const agreed = out.maskedRecord.match(/Agreed: \[(Person \d)\]/)![1];
    expect(seen).toBe(agreed);
  });

  it("writes the worker as 'worker', never by name", () => {
    const out = build(base);
    expect(out.text).not.toContain("Dana");
    expect(out.text).toContain("worker");
  });

  it("masks Present entries by default, and unmasking one stays unmasked", () => {
    const out = build(base);
    expect(out.text).not.toMatch(/\bBea\b/);
    expect(out.maskedRecord).toMatch(/Present: \[Person \d+\], \[Person \d+\], worker/);
    const bea = out.mask.spans.find((s) => s.surfaceForm === "Bea" && s.key.startsWith("present:"));
    expect(bea?.accepted).toBe(true);
    expect(bea?.tagKind).toBe("Person");
    expect(bea?.tag).toMatch(/^\[Person \d+\]$/);
    const toggled = toggleSpan(out.mask.spans, out.mask.spans.indexOf(bea!)).spans;
    const again = build(base, { spans: toggled });
    expect(again.text).toMatch(/\bBea\b/);
    expect(again.mask.spans.find((s) => s.surfaceForm === "Bea")?.accepted).toBe(false);
    expect(again.text).not.toContain("Dana");
  });

  it("still blocks a listed name at Send after that name is unmasked", () => {
    const out = build(base);
    const maria = out.mask.spans.find((s) => s.kind === "listed" && s.accepted && s.surfaceForm === "Maria Okonkwo-Reyes");
    expect(maria).toBeTruthy();
    const toggled = toggleSpan(out.mask.spans, out.mask.spans.indexOf(maria!)).spans;
    const again = build(base, { spans: toggled });
    expect(again.text).toContain("Maria Okonkwo-Reyes");
    const checked = checkEgress({
      captured: [{ url: "", body: new TextEncoder().encode(again.text) }],
      listedNames: again.mask.listedNames,
      surfaceForms: again.mask.surfaceForms,
      sentOnPurpose: again.mask.sentOnPurpose,
    });
    expect(checked.passed).toBe(false);
    expect(checked.listedFound.length).toBeGreaterThan(0);
    const preview = makePreview(again.text, {
      listedNames: again.mask.listedNames,
      surfaceForms: again.mask.surfaceForms,
      sentOnPurpose: again.mask.sentOnPurpose,
    });
    expect(preview.canSend).toBe(false);
  });

  it("masks values that were masked in the note by hand", () => {
    const record = { ...base, seen: ["Mould at Alder Court, back bedroom."] };
    const out = build(record, { extraMasked: ["Alder Court"] });
    expect(out.text).not.toContain("Alder Court");
    expect(out.mask.surfaceForms).toContain("Alder Court");
    expect(build(record).text).toContain("Alder Court");
  });

  it("leaves a name in when she chose to send it on purpose, and the preview allows it", () => {
    const out = build(base, { sentOnPurpose: ["Maria Okonkwo-Reyes"] });
    expect(out.text).toContain("Maria Okonkwo-Reyes");
    expect(out.mask.sentOnPurpose).toContain("Maria Okonkwo-Reyes");
    const p = makePreview(out.text, {
      listedNames: out.mask.listedNames,
      surfaceForms: out.mask.surfaceForms,
      sentOnPurpose: out.mask.sentOnPurpose,
    });
    expect(p.canSend).toBe(true);
  });

  it("gives a preview that can be sent when nothing listed is left", () => {
    const out = build({ ...base, seen: ["Maria and Tomas Brandvold, and Bea."] }, { extraMasked: ["Bea"] });
    const p = makePreview(out.text, {
      listedNames: out.mask.listedNames,
      surfaceForms: out.mask.surfaceForms,
      sentOnPurpose: out.mask.sentOnPurpose,
    });
    expect(p.canSend).toBe(true);
  });

  it("keeps the fixed labelled lines and ends with the fixed instructions", () => {
    const out = build(base);
    expect(out.text.split("\n").slice(0, 6).map((l) => l.split(":")[0])).toEqual([
      "Visit date", "Present", "Seen", "Agreed", "Risks", "Next steps",
    ]);
    expect(out.text.endsWith(INSTRUCTIONS)).toBe(true);
    expect(out.text).toBe(`${out.maskedRecord}\n\n${INSTRUCTIONS}`);
  });

  it("writes a plain sentence for an empty field (H46: no label for the cloud to copy)", () => {
    expect(recordBlock({ ...base, risks: [], present: [] })).toContain("No risks were recorded.");
    expect(recordBlock({ ...base, present: [] })).toContain("No one was present.");
    expect(recordBlock({ ...base, seen: [], agreed: [], nextSteps: [] })).toContain("Nothing was seen.");
    expect(recordBlock({ ...base, seen: [], agreed: [], nextSteps: [] })).toContain("Nothing was agreed.");
    expect(recordBlock({ ...base, seen: [], agreed: [], nextSteps: [] })).toContain("No next steps were recorded.");
    expect(recordBlock({ ...base, seen: [], agreed: [], risks: [], nextSteps: [] })).not.toMatch(/^(Seen|Agreed|Risks|Next steps): none$/m);
  });

  // The six groundwork cases from the desk's h46-groundwork (nemotron set), verbatim records.
  it.each([
    {
      record: { visitDate: "[Date 1]", present: [{ label: "worker", role: "worker" as const }], seen: ["[Place 1], [Place 2], curtains shut; left a card"], agreed: [], risks: [], nextSteps: ["Rebooked for Thursday; Text sent to confirm; noted for the team meeting"] },
      contains: ["Visit date: [Date 1]", "Seen: [Place 1], [Place 2], curtains shut; left a card", "Nothing was agreed.", "No risks were recorded.", "Next steps: Rebooked for Thursday; Text sent to confirm; noted for the team meeting"],
      notContains: ["Agreed: none", "Risks: none"],
    },
    {
      record: { visitDate: "[Date 2]", present: [{ label: "[Person 1]", role: "client" as const }, { label: "[Person 2]", role: "client" as const }], seen: ["[Place 3]"], agreed: ["Review care plan"], risks: ["Fall hazard on stairs"], nextSteps: ["Refer to OT"] },
      contains: ["Agreed: Review care plan", "Risks: Fall hazard on stairs", "Next steps: Refer to OT"],
      notContains: ["Nothing was agreed.", "No risks were recorded.", "No next steps were recorded.", "Nothing was seen."],
    },
    {
      record: { visitDate: "[Date 3]", present: [{ label: "[Person 3]", role: "client" as const }], seen: [], agreed: [], risks: [], nextSteps: [] },
      contains: ["Nothing was seen.", "Nothing was agreed.", "No risks were recorded.", "No next steps were recorded."],
      notContains: ["Seen: none", "Agreed: none", "Risks: none", "Next steps: none"],
    },
    {
      record: { visitDate: "", present: [{ label: "[Person 4]", role: "client" as const }], seen: ["[Place 5]"], agreed: ["Medication review"], risks: [], nextSteps: ["GP letter"] },
      contains: ["Present: [Person 4]", "Agreed: Medication review", "No risks were recorded.", "Next steps: GP letter"],
      notContains: ["Visit date:", "Risks: none"],
    },
  ])("renders none fields as sentences (groundwork case)", ({ record, contains, notContains }) => {
    const block = recordBlock(record as never);
    for (const s of contains) expect(block).toContain(s);
    for (const s of notContains) expect(block).not.toContain(s);
  });

  it("writes no household member present when present is empty on a missed visit (H42b)", () => {
    const missed: VisitRecord = {
      visitDate: "13/06",
      present: [],
      seen: ["curtains shut"],
      agreed: [],
      risks: [],
      nextSteps: ["Missed appt", "Went to Flat 23, left a card"],
    };
    const block = recordBlock(missed);
    expect(block).toContain("Present: no household member present (no answer / missed visit)");
    expect(block).not.toContain("Present: none");
    expect(INSTRUCTIONS).toMatch(/nobody answered|no household member was present/i);
    expect(INSTRUCTIONS).toMatch(/never state that a \[Person N\] was present/i);
    expect(INSTRUCTIONS).toMatch(/if it lists any \[Person N\].*never say nobody was present/i);
    expect(INSTRUCTIONS).toMatch(/Only when Present: states no household member present/i);
    expect(INSTRUCTIONS).toMatch(/use only verbs the note already contains/i);
    expect(INSTRUCTIONS).toMatch(/Do not add a reporting verb the note does not contain/);
    expect(INSTRUCTIONS).not.toMatch(/\b(?:confirmed|noted|indicated)\b/i);
  });

  it("never carries the rough note or the client list", () => {
    const out = build(base);
    expect(out.text).not.toContain(inventedVisit.note.split("\n")[0]!);
    expect(out.text).not.toContain("she/her");
  });
});
