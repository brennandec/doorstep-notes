// The guard with the bound written by the real-browser token limit check (capture-and-record task 16).
import { describe, expect, it } from "vitest";
import { bundledResults } from "../../src/app/figures";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { checkLength } from "../../src/inference/lengthGuard";
import { SYSTEM_PROMPT } from "../../src/inference/structure/createOptions";
import { VISIT_RECORD_SCHEMA } from "../../src/inference/structure/structure.schema";

const file = bundledResults("device-token-limit");

describe.skipIf(file?.status !== "pass")("length guard with the measured bound", () => {
  const bound = file?.["bound"] as number;
  const photoAmount = file?.["photoAmount"] as number;

  it("the file holds a bound and a photo amount in characters, with a date and a browser", () => {
    expect(typeof bound).toBe("number");
    expect(typeof photoAmount).toBe("number");
    expect(file?.["unit"]).toBe("characters");
    expect(file?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(file?.browser).toMatch(/^Google Chrome /);
  });

  it("lets the invented note through, with and without a photo", () => {
    expect(checkLength({ note: inventedVisit.note, hasPhoto: false, results: bundledResults })).toBe("ok");
    expect(checkLength({ note: inventedVisit.note, hasPhoto: true, results: bundledResults })).toBe("ok");
  });

  it("stops a note far above the bound", () => {
    expect(checkLength({ note: "a".repeat(bound * 2), hasPhoto: false, results: bundledResults })).toBe("tooLong");
  });

  it("a photo makes the allowed note shorter by the photo amount", () => {
    const edge = bound - JSON.stringify(VISIT_RECORD_SCHEMA).length - SYSTEM_PROMPT.length; // note characters left once the schema and the system prompt are counted
    const note = "a".repeat(edge - 10);
    expect(checkLength({ note, hasPhoto: false, results: bundledResults })).toBe("ok");
    expect(checkLength({ note, hasPhoto: true, results: bundledResults })).toBe(photoAmount > 10 ? "tooLong" : "ok");
  });
});
