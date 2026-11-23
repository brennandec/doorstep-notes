import { describe, expect, it } from "vitest";
import { checkLength, TOO_LONG_LINE } from "../../src/inference/lengthGuard";
import { SYSTEM_PROMPT } from "../../src/inference/structure/createOptions";
import { VISIT_RECORD_SCHEMA } from "../../src/inference/structure/structure.schema";
import { strings } from "../../src/app/strings";

const overhead = JSON.stringify(VISIT_RECORD_SCHEMA).length + SYSTEM_PROMPT.length;
const file = (bound: number, photoAmount: number) => (n: string) =>
  n === "device-token-limit" ? { status: "pass" as const, bound, photoAmount, date: "2026-01-01", browser: "invented" } : undefined;

describe("length line", () => {
  it("is the exact line", () => {
    expect(TOO_LONG_LINE).toBe("This note is too long for the device model. Split it into two parts.");
    expect(TOO_LONG_LINE).toBe(strings.record.tooLong);
  });
});

describe("length guard (best effort)", () => {
  it("is off when there is no results file", () => {
    expect(checkLength({ note: "x".repeat(1_000_000), hasPhoto: true, results: () => undefined })).toBe("ok");
  });
  it("is off when the results file is a miss", () => {
    expect(checkLength({ note: "x".repeat(1_000_000), hasPhoto: false, results: () => ({ status: "miss", reason: "Chrome absent" }) })).toBe("ok");
  });
  it("counts the note, the schema text and the system prompt against the bound", () => {
    const bound = overhead + 100;
    expect(checkLength({ note: "x".repeat(100), hasPhoto: false, results: file(bound, 500) })).toBe("ok");
    expect(checkLength({ note: "x".repeat(101), hasPhoto: false, results: file(bound, 500) })).toBe("tooLong");
  });
  it("adds the photo amount only when a photo is attached", () => {
    const bound = overhead + 100 + 500;
    expect(checkLength({ note: "x".repeat(100), hasPhoto: true, results: file(bound, 500) })).toBe("ok");
    expect(checkLength({ note: "x".repeat(101), hasPhoto: true, results: file(bound, 500) })).toBe("tooLong");
    expect(checkLength({ note: "x".repeat(101), hasPhoto: false, results: file(bound, 500) })).toBe("ok");
  });
  it("is off when the file has no usable bound", () => {
    expect(checkLength({ note: "x".repeat(100000), hasPhoto: false, results: () => ({ status: "pass", bound: "big" }) })).toBe("ok");
  });
});
