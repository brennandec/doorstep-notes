import { describe, expect, it } from "vitest";
import { parseClientList } from "../../src/masking/clientList";
import { findExact } from "../../src/masking/exact";
import { DEFAULT_POLICY } from "../../src/masking/policy";

// A photo read can swap a capital I for a small l, and a capital O for a zero.
// results/handwriting.json: the sister's name Ione was read as "lone".
const clients = parseClientList("Odalys Brennan-Webb; ; she/her\nIone Marsh; ; she/her\nTobias Quill; ; he/him").entries;
const forms = (text: string) => findExact(text, clients, DEFAULT_POLICY).map((s) => text.slice(s.start, s.end));

describe("photo path confusions in the exact pass (H02)", () => {
  it("still masks a listed name when l stands for I: Ione read as lone", () => {
    expect(forms("Her sister lone was there.")).toEqual(["lone"]);
  });

  it("still masks a listed name when 0 stands for O: Odalys read as 0dalys", () => {
    expect(forms("Visited 0dalys at home.")).toEqual(["0dalys"]);
  });

  it("leaves an ordinary word that is not on the list unmasked", () => {
    expect(forms("The door was open and the lamp was on. Tomorrow she will bring 10 forms.")).toEqual([]);
  });

  it("keeps the spans of the correct spellings", () => {
    expect(forms("Ione and Odalys")).toEqual(["Ione", "Odalys"]);
  });
});
