import { describe, expect, it } from "vitest";
import { assertNoLeak, findLeaks, LeakError, noteParts, type LeakTarget, type RecordedRequest } from "../../src/egress/assertNoLeak";
import { inventedVisit } from "../../src/app/example/inventedVisit";

const target: LeakTarget = {
  listedNames: ["Maria Okonkwo-Reyes", "Tomas Brandvold", "Priya Halloran"],
  surfaceForms: ["Alder Court", "3/3/87"],
  rawNote: inventedVisit.note,
};
const clean = (body: string): RecordedRequest => ({
  url: "https://example.invalid/v1/generate",
  method: "POST",
  headers: { "content-type": "application/json" },
  postData: body,
});

describe("assertNoLeak", () => {
  it("passes for requests that carry none of them", () => {
    expect(() => assertNoLeak([clean('{"text":"Present: [Person 1] at [Place 1]"}'), { url: "https://example.invalid/ping" }], target)).not.toThrow();
  });

  it("fails on a seeded leak: a listed name", () => {
    expect(() => assertNoLeak([clean('{"text":"Present: Priya Halloran"}')], target)).toThrow(LeakError);
  });

  it("fails on a masked value, in any case", () => {
    const leaks = findLeaks([clean('{"text":"ALDER COURT"}')], target);
    expect(leaks).toEqual([{ request: 0, url: "https://example.invalid/v1/generate", kind: "masked value", value: "Alder Court" }]);
  });

  it("fails on the raw note, whole", () => {
    const leaks = findLeaks([clean(JSON.stringify({ text: inventedVisit.note }))], target);
    expect(leaks.some((l) => l.kind === "raw note")).toBe(true);
  });

  it("fails on one long line of the raw note", () => {
    const line = inventedVisit.note.split("\n")[1]!;
    expect(line.length).toBeGreaterThanOrEqual(20);
    const leaks = findLeaks([clean(JSON.stringify({ text: `prefix ${line.toUpperCase()} suffix` }))], target);
    expect(leaks.map((l) => l.kind)).toContain("raw note");
  });

  it("ignores note lines shorter than 20 characters", () => {
    const parts = noteParts("short line\nThis line is longer than twenty characters.");
    expect(parts).toContain("This line is longer than twenty characters.");
    expect(parts).not.toContain("short line");
    expect(parts[0]).toBe("short line\nThis line is longer than twenty characters.");
  });

  it("finds a name hidden by a JSON escape", () => {
    expect(() => assertNoLeak([clean('{"text":"met Tomas Brandv\\u006fld"}')], target)).toThrow(LeakError);
  });

  it("finds a name in the URL and in a header", () => {
    expect(() => assertNoLeak([{ url: "https://example.invalid/?n=Maria%20Okonkwo-Reyes&m=Maria Okonkwo-Reyes" }], target)).toThrow(LeakError);
    expect(() => assertNoLeak([{ url: "https://example.invalid/", headers: { "x-who": "Priya Halloran" } }], target)).toThrow(LeakError);
  });

  it("reads a body given as bytes", () => {
    expect(() => assertNoLeak([{ url: "https://example.invalid/", postData: new TextEncoder().encode("Tomas Brandvold") }], target)).toThrow(LeakError);
  });

  it("names the request that leaked", () => {
    try {
      assertNoLeak([clean('{"text":"fine"}'), clean('{"text":"Priya Halloran"}')], target);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(LeakError);
      expect((e as LeakError).leaks[0]?.request).toBe(1);
      expect((e as Error).message).toContain("request 1");
    }
  });

  it("passes with an empty note and no requests", () => {
    expect(() => assertNoLeak([], { ...target, rawNote: "" })).not.toThrow();
    expect(noteParts("   ")).toEqual([]);
  });
});
