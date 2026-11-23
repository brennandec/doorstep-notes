import { describe, expect, it } from "vitest";
import { checkEgress, containsValue, type CheckInput, type Captured } from "../../src/egress/check";

const enc = (s: string) => new TextEncoder().encode(s);
const req = (body: string, url = "https://example.invalid/v1/generate"): Captured => ({ url, body: enc(body) });

const listedNames = ["Maria Okonkwo-Reyes", "Tomas Brandvold", "Priya Halloran"];

function input(over: Partial<CheckInput> & { text?: string }): CheckInput {
  const { text, ...rest } = over;
  return {
    captured: [req(text ?? "Visit with [Person 1] about the form.")],
    listedNames,
    surfaceForms: [],
    sentOnPurpose: [],
    ...rest,
  };
}

describe("checkEgress: listed names", () => {
  it("passes when no name is in the text", () => {
    const r = checkEgress(input({}));
    expect(r.passed).toBe(true);
    expect(r.listedFound).toEqual([]);
    expect(r.listedChecked).toBe(3);
  });

  it("finds a name in the body", () => {
    const r = checkEgress(input({ text: "The visit was with Maria Okonkwo-Reyes today." }));
    expect(r.passed).toBe(false);
    expect(r.listedFound).toEqual(["Maria Okonkwo-Reyes"]);
  });

  it("finds a name in all capitals and in mixed case", () => {
    expect(checkEgress(input({ text: "MARIA OKONKWO-REYES" })).listedFound).toContain("Maria Okonkwo-Reyes");
    expect(checkEgress(input({ text: "Maria okonkwo-reyes" })).listedFound).toContain("Maria Okonkwo-Reyes");
  });

  it("matches the German sharp s against SS", () => {
    const r = checkEgress(input({ listedNames: ["Hanna Strasse"], text: "Hanna Stra\u00dfe was in." }));
    expect(r.listedFound).toEqual(["Hanna Strasse"]);
    const r2 = checkEgress(input({ listedNames: ["Hanna Stra\u00dfe"], text: "HANNA STRASSE" }));
    expect(r2.listedFound).toEqual(["Hanna Stra\u00dfe"]);
  });

  it("finds a name that is hidden by a JSON escape", () => {
    const body = '{"contents":[{"parts":[{"text":"met Mar\\u0069a Okonkwo-Reyes at home"}]}]}';
    expect(body).not.toContain("Maria");
    const r = checkEgress(input({ text: body }));
    expect(r.listedFound).toEqual(["Maria Okonkwo-Reyes"]);
  });

  it("finds a name after a JSON line break escape", () => {
    const body = JSON.stringify({ text: "line one\nTomas Brandvold" });
    expect(checkEgress(input({ text: body })).listedFound).toEqual(["Tomas Brandvold"]);
  });

  it("finds a name in the URL", () => {
    const r = checkEgress({ ...input({}), captured: [req("{}", "https://example.invalid/?q=priya%20x&n=Priya Halloran")] });
    expect(r.listedFound).toEqual(["Priya Halloran"]);
  });

  it("scans every captured request", () => {
    const r = checkEgress({ ...input({}), captured: [req("clean"), req("Tomas Brandvold")] });
    expect(r.listedFound).toEqual(["Tomas Brandvold"]);
  });

  it("skips empty values and does not count them", () => {
    const r = checkEgress(input({ listedNames: ["", "   ", "Priya Halloran"], surfaceForms: ["", " "], text: "anything" }));
    expect(r.listedChecked).toBe(1);
    expect(r.maskedChecked).toBe(0);
    expect(r.passed).toBe(true);
  });

  it("counts duplicates once, also after folding", () => {
    const r = checkEgress(
      input({ listedNames: ["Priya Halloran", "PRIYA HALLORAN", "priya halloran"], text: "Priya Halloran, PRIYA HALLORAN" }),
    );
    expect(r.listedChecked).toBe(1);
    expect(r.listedFound).toEqual(["Priya Halloran"]);
  });

  it("handles a body that is not text", () => {
    const r = checkEgress({ ...input({}), captured: [{ url: "https://example.invalid/", body: new Uint8Array([0xff, 0xfe, 0x00]) }] });
    expect(r.passed).toBe(true);
  });

  it("handles a request with no body", () => {
    const r = checkEgress({ ...input({}), captured: [{ url: "https://example.invalid/", body: new Uint8Array(0) }] });
    expect(r.passed).toBe(true);
  });
});

describe("checkEgress: masked values (surface forms)", () => {
  it("finds the exact surface form that was masked", () => {
    const r = checkEgress(input({ surfaceForms: ["Alder Court", "Bea"], text: "She lives at alder court." }));
    expect(r.maskedChecked).toBe(2);
    expect(r.maskedFound).toEqual(["Alder Court"]);
    expect(r.passed).toBe(false);
  });

  it("does not find a tag", () => {
    const r = checkEgress(input({ surfaceForms: ["Bea"], text: "[Person 2] was there." }));
    expect(r.maskedFound).toEqual([]);
  });

  it("finds a surface form hidden by a JSON escape", () => {
    const r = checkEgress(input({ surfaceForms: ["3/3/87"], text: '{"t":"born 3\\/3\\/87"}' }));
    expect(r.maskedFound).toEqual(["3/3/87"]);
  });
});

describe("checkEgress: sent on purpose", () => {
  it("reports an on-purpose name apart and still passes", () => {
    const r = checkEgress(input({ text: "Met Maria Okonkwo-Reyes.", sentOnPurpose: ["Maria Okonkwo-Reyes"] }));
    expect(r.listedFound).toEqual([]);
    expect(r.onPurposeFound).toEqual(["Maria Okonkwo-Reyes"]);
    expect(r.passed).toBe(true);
  });

  it("compares the on-purpose value with case folding", () => {
    const r = checkEgress(input({ text: "MARIA OKONKWO-REYES", sentOnPurpose: ["maria okonkwo-reyes"] }));
    expect(r.onPurposeFound).toEqual(["Maria Okonkwo-Reyes"]);
    expect(r.passed).toBe(true);
  });

  it("still fails for another name in the same text", () => {
    const r = checkEgress(input({ text: "Maria Okonkwo-Reyes and Tomas Brandvold", sentOnPurpose: ["Maria Okonkwo-Reyes"] }));
    expect(r.listedFound).toEqual(["Tomas Brandvold"]);
    expect(r.onPurposeFound).toEqual(["Maria Okonkwo-Reyes"]);
    expect(r.passed).toBe(false);
  });

  it("reports an on-purpose surface form apart", () => {
    const r = checkEgress(input({ surfaceForms: ["Bea"], text: "Bea came", sentOnPurpose: ["Bea"] }));
    expect(r.maskedFound).toEqual([]);
    expect(r.onPurposeFound).toEqual(["Bea"]);
    expect(r.passed).toBe(true);
  });
});

describe("containsValue", () => {
  it("finds a long value inside a longer word", () => {
    expect(containsValue("xxmariaoxx", "mariao")).toBe(true);
  });
  it("finds a short value only as a whole word", () => {
    expect(containsValue("see you tomorrow", "tom")).toBe(false);
    expect(containsValue("tom came", "tom")).toBe(true);
    expect(containsValue("it was tom's", "tom")).toBe(true);
  });
  it("never finds an empty value", () => {
    expect(containsValue("abc", "")).toBe(false);
  });
});
