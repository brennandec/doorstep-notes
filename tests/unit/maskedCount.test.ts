// Egress-check task 22 (third review, X2 and Y2): one count of masked values.
// The "masked values" number is the number of mask-map entries applied to the outgoing text.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { prepareDraft, sendDraft } from "../../src/drafting/draftFlow";
import { applyReplacements } from "../../src/drafting/sentences";
import { checkEgress } from "../../src/egress/check";
import { makeLedger } from "../../src/egress/ledger";
import { makePreview } from "../../src/egress/send";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { runPasses } from "../../src/masking/entry";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { tagsIn } from "../../src/masking/tags";

const clients = parseClientList(inventedVisit.clientList).entries;
const record = {
  ...inventedVisit.preparedRecord,
  seen: ["Maria O-R showed the mould.", "Maria Okonkwo-Reyes signed. Tomas Brandvold waited."],
};
const prep = () => prepareDraft({ record, clients, policy: DEFAULT_POLICY });
const appliedTags = (p: ReturnType<typeof prep>) => tagsIn(p.outgoing.maskedRecord).filter((t) => p.outgoing.mask.map[t] !== undefined);

describe("mask entries", () => {
  it("lists one entry for each tag, with every form that stands for it", () => {
    const raw = "Maria O-R spoke. Maria Okonkwo-Reyes signed. Mari left.";
    const m = applyMask(raw, runPasses(raw, clients, DEFAULT_POLICY).combined, clients);
    expect(m.entries).toHaveLength(1);
    expect(m.entries![0]!.tag).toBe("[Person 1]");
    expect(m.entries![0]!.forms).toEqual(expect.arrayContaining(["Maria O-R", "Maria Okonkwo-Reyes", "Mari"]));
  });
});

describe("the count equals the applied mask-map entries (Y2)", () => {
  it("is the number of distinct tags with a map entry in the masked record, two forms of one person counting once", async () => {
    const p = prep();
    const expected = appliedTags(p).length;
    expect(expected).toBeGreaterThanOrEqual(2);
    expect(p.preview.result.maskedChecked).toBe(expected);
    const out = await sendDraft(p, "PREFER_IN_CLOUD", { draft: draftDouble, ledger: makeLedger(), clients });
    if (out.status !== "drafted") throw new Error("expected a draft");
    expect(out.check.maskedChecked).toBe(expected);
    expect(out.entry.maskedChecked).toBe(expected);
    expect(out.lines.rows[0]!.value).toBe(`0 of ${expected}`);
  });

  it("does not count the example tag in the fixed instructions", () => {
    const p = prepareDraft({ record: { ...record, seen: ["Mould in the back bedroom."], agreed: [], present: [], nextSteps: [] }, clients, policy: DEFAULT_POLICY });
    expect(p.outgoing.text).toContain("[Person 1]"); // the instructions hold the example tag
    expect(appliedTags(p)).toEqual([]);
    expect(p.preview.result.maskedChecked).toBe(0);
  });

  it("does not count a tag that a replaced sentence removed", () => {
    const p = prep();
    const before = p.preview.result.maskedChecked;
    const sentence = "[Person 1] showed the mould";
    expect(p.outgoing.text).toContain(sentence);
    const q = applyReplacements(p, [{ from: sentence, to: "The mould was shown.", nth: 0 }], (t) => makePreview(t, p.values));
    const left = new Set(appliedTags(q));
    expect(q.preview.result.maskedChecked).toBe(left.size);
    expect(q.preview.result.maskedChecked).toBeLessThanOrEqual(before);
  });

  it("finds a seeded leak of one form and counts it once", async () => {
    const p = prep();
    const out = await sendDraft(p, "PREFER_IN_CLOUD", {
      draft: draftDouble,
      ledger: makeLedger(),
      clients,
      seedLeak: (body) => new TextEncoder().encode(`${new TextDecoder().decode(body)} Maria O-R`),
    });
    if (out.status !== "drafted") throw new Error("expected a draft");
    expect(out.check.maskedFound).toHaveLength(1);
    expect(out.check.passed).toBe(false);
    expect(out.check.maskedChecked).toBe(appliedTags(p).length);
  });
});

describe("checkEgress with entries", () => {
  const body = (s: string) => ({ url: "", body: new TextEncoder().encode(s) });
  const entries = [{ tag: "[Person 1]", forms: ["Maria Okonkwo-Reyes", "Maria O-R"] }, { tag: "[Place 1]", forms: ["14 Alder Court"] }];
  it("counts entries, not forms", () => {
    const r = checkEgress({ captured: [body("nothing")], listedNames: [], surfaceForms: ["a", "b", "c"], sentOnPurpose: [], entries });
    expect(r.maskedChecked).toBe(2);
    expect(r.maskedFound).toEqual([]);
  });
  it("finds an entry by any of its forms", () => {
    const r = checkEgress({ captured: [body("seen at 14 alder court")], listedNames: [], surfaceForms: [], sentOnPurpose: [], entries });
    expect(r.maskedFound).toEqual(["14 Alder Court"]);
    expect(r.passed).toBe(false);
  });
  it("reports an entry she chose to send as on purpose", () => {
    const r = checkEgress({ captured: [body("Maria O-R")], listedNames: [], surfaceForms: [], sentOnPurpose: ["Maria O-R"], entries });
    expect(r.maskedFound).toEqual([]);
    expect(r.onPurposeFound).toEqual(["Maria O-R"]);
    expect(r.passed).toBe(true);
  });
  it("keeps the older count by forms when no entries are given", () => {
    const r = checkEgress({ captured: [body("x")], listedNames: [], surfaceForms: ["a", "b"], sentOnPurpose: [] });
    expect(r.maskedChecked).toBe(2);
  });
});
