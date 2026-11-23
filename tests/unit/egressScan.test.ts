// egress-check task 18 (R9.1, R9.2, U10): characterise what the scan finds, against the code as it is.
// If one of these fails, R9.1 is changed to say what the code does, and the difference goes to OPEN-QUESTIONS.
import { describe, expect, it } from "vitest";
import { MIN_NAME_PART_LENGTH, NEAR_MATCH_MIN_LETTERS } from "../../src/constants";
import { checkEgress, containsValue, type Captured } from "../../src/egress/check";
import { fold } from "../../src/masking/fold";

const enc = (s: string) => new TextEncoder().encode(s);
const request = (url: string, body = ""): Captured => ({ url, body: enc(body) });
const scan = (c: Captured[], listedNames: string[], surfaceForms: string[] = []) =>
  checkEgress({ captured: c, listedNames, surfaceForms, sentOnPurpose: [] });

// Invented people only.
const MARIA = "Maria Okonkwo-Reyes";
const TOM = "Tom Lindqvist";
const TOMAS = "Tomas Brandvold";

describe("the constants the words are built from", () => {
  it("are 3 and 5, with their sources named", () => {
    expect(MIN_NAME_PART_LENGTH).toBe(3);
    expect(NEAR_MATCH_MIN_LETTERS).toBe(5);
  });
});

describe("what the scan finds (R9.2)", () => {
  it("finds a listed name in the address, in the query", () => {
    const r = scan([request("https://example.invalid/v1/models/x:generate?note=Maria%20Okonkwo-Reyes&q=Maria Okonkwo-Reyes")], [MARIA]);
    expect(r.listedFound).toEqual([MARIA]);
    expect(r.passed).toBe(false);
  });

  it("finds a listed name in the address even when the body is empty", () => {
    expect(scan([request("https://example.invalid/?who=Okonkwo-Reyes")], [MARIA]).listedFound).toEqual([MARIA]);
  });

  it("finds a listed name in the body", () => {
    const r = scan([request("https://example.invalid/", JSON.stringify({ contents: [{ parts: [{ text: "Visit by Maria Okonkwo-Reyes" }] }] }))], [MARIA]);
    expect(r.listedFound).toEqual([MARIA]);
  });

  it("finds a name part of three letters as a whole word", () => {
    expect(containsValue(fold("Then Tom said no."), fold("tom"))).toBe(true);
    const r = scan([request("", "Then Tom said no.")], [TOM]);
    expect(r.listedFound).toEqual([TOM]);
  });

  it("does not find the same three letters inside 'Tomorrow'", () => {
    expect(containsValue(fold("Tomorrow is fine."), fold("tom"))).toBe(false);
    const r = scan([request("", "Revisit Tomorrow, please.")], [TOM]);
    expect(r.listedFound).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it("finds a listed value of five letters or more inside a longer word", () => {
    expect(containsValue(fold("Mr Brandvoldsen came."), fold("Brandvold"))).toBe(true);
    const r = scan([request("", "Mr Brandvoldsen came.")], [TOMAS]);
    expect(r.listedFound).toEqual([TOMAS]);
  });

  it("finds a leak of the surname only", () => {
    expect(scan([request("", "Contact Okonkwo-Reyes again.")], [MARIA]).listedFound).toEqual([MARIA]);
    expect(scan([request("", "Contact Reyes again.")], [MARIA]).listedFound).toEqual([MARIA]);
  });

  it("finds a leak of the first name only", () => {
    expect(scan([request("", "Maria was in.")], [MARIA]).listedFound).toEqual([MARIA]);
  });

  it("finds a recorded surface form in the address or the body", () => {
    expect(scan([request("", "sister Bea there")], [], ["Bea"]).maskedFound).toEqual(["Bea"]);
    expect(scan([request("https://example.invalid/?x=Bea")], [], ["Bea"]).maskedFound).toEqual(["Bea"]);
  });

  it("finds a surface form shorter than five letters only as a whole word", () => {
    expect(scan([request("", "Beatrice and beans")], [], ["Bea"]).maskedFound).toEqual([]);
  });

  it("ignores case, with Unicode case folding", () => {
    expect(scan([request("", "MARIA OKONKWO-REYES")], [MARIA]).listedFound).toEqual([MARIA]);
    expect(scan([request("", "STRASSE")], ["Straße"]).listedFound).toEqual(["Straße"]);
  });

  it("finds a name escaped inside JSON", () => {
    const body = JSON.stringify({ text: "Maria\u00a0Okonkwo-Reyes" });
    expect(scan([request("", body)], [MARIA]).listedFound).toEqual([MARIA]);
  });

  it("finds nothing in a clean request", () => {
    const r = scan([request("https://example.invalid/v1", "Visit date: 12/11\nPresent: [Person 1], worker")], [MARIA, TOM, TOMAS], ["Bea"]);
    expect(r.passed).toBe(true);
    expect(r.listedChecked).toBe(3);
  });
});
