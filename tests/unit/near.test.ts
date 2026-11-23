import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { parseClientList } from "../../src/masking/clientList";
import { findExact } from "../../src/masking/exact";
import { findNear, levenshtein } from "../../src/masking/near";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const near = (text: string, list = clients, policy = DEFAULT_POLICY) => {
  const exact = findExact(text, list, policy);
  return findNear(text, list, policy, exact).map((s) => text.slice(s.start, s.end));
};

describe("edit distance", () => {
  it("counts one added, dropped or changed letter as 1", () => {
    expect(levenshtein("brandvold", "brandvald")).toBe(1);
    expect(levenshtein("brandvold", "brandvol")).toBe(1);
    expect(levenshtein("brandvold", "brandvolds")).toBe(1);
    expect(levenshtein("brandvold", "brandvold")).toBe(0);
  });
  it("counts a swap as 2", () => {
    expect(levenshtein("okonkwo", "okonkow")).toBe(2);
  });
});

describe("near pass (masking task 5)", () => {
  it("matches Brandvald for Brandvold, with distance exactly 1", () => {
    const text = "Tomas Brandvald (neighbour) offered to help.";
    const exact = findExact(text, clients, DEFAULT_POLICY);
    const spans = findNear(text, clients, DEFAULT_POLICY, exact);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ surfaceForm: "Brandvald", kind: "near", clientId: "c2", key: "client:c2", tagKind: "Person", accepted: true });
  });

  it("matches a dropped and an added letter, and ignores case", () => {
    expect(near("BRANDVOLD? Brandvol and Brandvolds and brandvald.")).toEqual(["Brandvol", "Brandvolds", "brandvald"]);
  });

  it("does not match a swap of two letters", () => {
    expect(near("Okonkow rang.")).toEqual([]);
  });

  it("does not match two edits", () => {
    expect(near("Brandvald and Brandveld")).toEqual(["Brandvald", "Brandveld"]);
    expect(near("Brendvald rang.")).toEqual([]);
  });

  it("never matches a name part of 4 letters or fewer", () => {
    const list = parseClientList("Tomas Lee; Tom; he/him").entries;
    expect(near("Tomo and Tam and Lea and Tomaz", list)).toEqual(["Tomaz"]);
    // Tomas has 5 letters so Tomaz is near; Tom, Lee are 3 letters so Tam, Lea and Tomo are not.
  });

  it("does not report a word the exact pass already masked", () => {
    expect(near("Brandvold and Okonkwo-Reyes")).toEqual([]);
  });

  it("does not overlap a span passed in", () => {
    const text = "Brandvald";
    const fake = [{ ...findExact("Brandvold", clients, DEFAULT_POLICY)[0]! }];
    expect(findNear(text, clients, DEFAULT_POLICY, fake)).toEqual([]);
  });

  it("is switched off by policy", () => {
    expect(near("Brandvald", clients, { ...DEFAULT_POLICY, nearMatch: false })).toEqual([]);
  });

  it("does no accent stripping and no punctuation stripping", () => {
    const list = parseClientList("Renata Moreau; ; she/her").entries;
    expect(near("Morèau Moreau", list)).toEqual(["Morèau"]); // one changed letter
    expect(near("Moreau's and Mor-eau", list)).toEqual([]);
  });

  it("finds nothing without clients", () => {
    expect(near("Brandvald", [])).toEqual([]);
  });
});
