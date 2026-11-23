import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { parseClientList } from "../../src/masking/clientList";
import { mergeProposals } from "../../src/masking/merge";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { applyMask } from "../../src/masking/apply";

const clients = parseClientList(inventedVisit.clientList).entries;
const note = inventedVisit.note;
const base = exactAndNear(note, clients, DEFAULT_POLICY);

describe("merge of exact, near and device results (masking task 8)", () => {
  it("proposes the device candidates that overlap nothing, not accepted by default", () => {
    const { spans } = mergeProposals(note, base, [
      { text: "Bea", kind: "name" },
      { text: "14 Alder Court", kind: "place" },
      { text: "3/3/87", kind: "dob" },
    ], DEFAULT_POLICY);
    const proposed = spans.filter((s) => s.kind === "proposed");
    expect(proposed.map((s) => [s.surfaceForm, s.tagKind, s.accepted])).toEqual([
      ["14 Alder Court", "Place", false],
      ["Bea", "Person", false],
      ["3/3/87", "Date", false],
    ]);
    // the exact and near spans are kept as they were
    expect(spans.filter((s) => s.kind !== "proposed")).toEqual(base);
  });

  it("drops a candidate that overlaps an exact span", () => {
    const { spans, dropped } = mergeProposals(note, base, [{ text: "Maria O-R", kind: "name" }, { text: "Maria O-R in", kind: "phrase" }], DEFAULT_POLICY);
    expect(spans).toEqual(base);
    expect(dropped.map((d) => d.text)).toEqual(["Maria O-R in", "Maria O-R"]);
  });

  it("drops a candidate that overlaps a near span", () => {
    const { spans } = mergeProposals(note, base, [{ text: "Brandvald", kind: "name" }], DEFAULT_POLICY);
    expect(spans.filter((s) => s.kind === "proposed")).toEqual([]);
  });

  it("proposes every occurrence of a candidate, under one tag", () => {
    const text = "Bea came. Later bea left. Beatrice stayed.";
    const { spans } = mergeProposals(text, [], [{ text: "Bea", kind: "name" }], DEFAULT_POLICY);
    expect(spans.map((s) => s.surfaceForm)).toEqual(["Bea", "bea"]);
    const r = applyMask(text, spans.map((s) => ({ ...s, accepted: true })), []);
    expect(r.maskedText).toBe("[Person 1] came. Later [Person 1] left. Beatrice stayed.");
  });

  it("takes the longer candidate where two overlap", () => {
    const text = "Her twin brother came.";
    const { spans } = mergeProposals(text, [], [{ text: "twin brother", kind: "phrase" }, { text: "Her twin brother", kind: "phrase" }], DEFAULT_POLICY);
    expect(spans.map((s) => s.surfaceForm)).toEqual(["Her twin brother"]);
  });

  it("starts proposals accepted only when the policy says so", () => {
    const { spans } = mergeProposals(note, base, [{ text: "Bea", kind: "name" }], { ...DEFAULT_POLICY, proposalsStartAccepted: true });
    expect(spans.find((s) => s.kind === "proposed")!.accepted).toBe(true);
  });

  it("leaves a proposed span in the text until it is accepted", () => {
    const { spans } = mergeProposals(note, base, [{ text: "Bea", kind: "name" }], DEFAULT_POLICY);
    const r = applyMask(note, spans, clients);
    expect(r.maskedText).toContain("sister Bea there too");
    const accepted = applyMask(note, spans.map((s) => (s.kind === "proposed" ? { ...s, accepted: true } : s)), clients);
    expect(accepted.maskedText).toContain("sister [Person 2] there too");
  });

  it("ignores empty candidates and repeats", () => {
    const { spans, dropped } = mergeProposals(note, base, [{ text: "  ", kind: "name" }, { text: "Bea", kind: "name" }, { text: "bea", kind: "name" }], DEFAULT_POLICY);
    expect(spans.filter((s) => s.kind === "proposed")).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it("R22.4: a lone capitalised role word is not proposed, so no lower-case 'landlord' is masked", () => {
    const text = "Landlord came by. The landlord says the boiler is fixed.";
    const { spans } = mergeProposals(text, [], [{ text: "Landlord", kind: "phrase" }], DEFAULT_POLICY);
    // MergeResult has no field called added: with an empty base, the proposed spans are what the merge added.
    const added = spans.filter((s) => s.kind === "proposed");
    expect(added).toEqual([]);
    expect(added).toHaveLength(0);
    expect(spans).toEqual([]);
  });
});
