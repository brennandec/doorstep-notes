import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { parseClientList } from "../../src/masking/clientList";
import { findExact } from "../../src/masking/exact";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const forms = (text: string, list = clients, policy = DEFAULT_POLICY) =>
  findExact(text, list, policy).map((s) => text.slice(s.start, s.end));
const one = (line: string) => parseClientList(line).entries;

describe("exact pass (masking task 4)", () => {
  it("masks a full name", () => {
    const text = "Priya Halloran was in.";
    const spans = findExact(text, clients, DEFAULT_POLICY);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ surfaceForm: "Priya Halloran", kind: "listed", clientId: "c3", accepted: true, sentOnPurpose: false, tagKind: "Person" });
  });

  it("ignores case: MARIA and maria", () => {
    expect(forms("MARIA and maria and Mari")).toEqual(["MARIA", "maria", "Mari"]);
  });

  it("masks the longest form first: other name Maria O-R is one span", () => {
    const text = "Maria O-R in, sister Bea there too.";
    const spans = findExact(text, clients, DEFAULT_POLICY);
    expect(spans.map((s) => s.surfaceForm)).toEqual(["Maria O-R"]);
    expect(spans[0]!.clientId).toBe("c1");
  });

  it("masks both parts of a hyphenated surname", () => {
    expect(forms("Okonkwo said so. Reyes agreed. Joel Ashworth-Nkemelu, then Nkemelu alone.")).toEqual([
      "Okonkwo", "Reyes", "Joel Ashworth-Nkemelu", "Nkemelu",
    ]);
  });

  it("masks a first name alone and a surname alone", () => {
    expect(forms("Tomas rang. Brandvold did not.")).toEqual(["Tomas", "Brandvold"]);
  });

  it("does not mask a name inside a longer word", () => {
    expect(forms("Tomasz and Mariana and Brandvolds and Wrenches")).toEqual([]);
  });

  it("does not mask a name part shorter than the policy length", () => {
    const list = one("Jo Li Ng; ; they/them");
    expect(forms("Jo met Li and Ng.", list)).toEqual([]);
    expect(forms("Jo Li Ng came.", list)).toEqual(["Jo Li Ng"]);
  });

  it("uses the policy length for parts", () => {
    const list = one("Anna Marie Lindqvist; ; she/her");
    expect(forms("Anna spoke. Marie spoke. Lindqvist spoke.", list, DEFAULT_POLICY)).toEqual(["Anna", "Marie", "Lindqvist"]);
    expect(forms("Anna spoke. Marie spoke. Lindqvist spoke.", list, { ...DEFAULT_POLICY, minPartLength: 6 })).toEqual(["Lindqvist"]);
  });

  it("gives two clients two keys and one client one key", () => {
    const text = "Priya Halloran and Emeka Fairbairn. Halloran again. Emeka too.";
    const spans = findExact(text, clients, DEFAULT_POLICY);
    expect(spans.map((s) => s.key)).toEqual(["client:c3", "client:c8", "client:c3", "client:c8"]);
  });

  it("reuses the same key for every occurrence and form of one person", () => {
    const text = "Maria Okonkwo-Reyes, Mari and MARIA O-R.";
    const keys = new Set(findExact(text, clients, DEFAULT_POLICY).map((s) => s.key));
    expect([...keys]).toEqual(["client:c1"]);
  });

  it("returns spans in text order, each with its exact surface form", () => {
    const text = "Dmitri, Dima and DMITRI OYELARAN.";
    const spans = findExact(text, clients, DEFAULT_POLICY);
    expect(spans.map((s) => s.start)).toEqual([...spans.map((s) => s.start)].sort((a, b) => a - b));
    for (const s of spans) expect(text.slice(s.start, s.end)).toBe(s.surfaceForm);
    expect(spans.map((s) => s.surfaceForm)).toEqual(["Dmitri", "Dima", "DMITRI OYELARAN"]);
  });

  it("gives a part shared by two clients to the first client on the list", () => {
    const list = one("Anna Lindqvist; ; she/her\nBerit Lindqvist; ; she/her");
    expect(findExact("Lindqvist came.", list, DEFAULT_POLICY)[0]!.clientId).toBe("c1");
  });

  it("finds nothing in an empty list or empty text", () => {
    expect(findExact("Maria", [], DEFAULT_POLICY)).toEqual([]);
    expect(findExact("", clients, DEFAULT_POLICY)).toEqual([]);
  });
});
