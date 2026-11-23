import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeHeader, readResults, writeMeasured, writeResults } from "../../../scripts/results";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "results-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("results header (measurement R6.1)", () => {
  it("holds date, browser, script and version", () => {
    const h = makeHeader({ browser: "Invented Browser 1", script: "invented.ts", scriptVersion: "1", now: new Date("2026-01-02T03:04:05Z") });
    expect(h).toEqual({ date: "2026-01-02T03:04:05.000Z", browser: "Invented Browser 1", script: "invented.ts", scriptVersion: "1" });
  });

  it("refuses an empty field", () => {
    expect(() => makeHeader({ browser: "", script: "a.ts", scriptVersion: "1" })).toThrow(/browser/);
    expect(() => makeHeader({ browser: "b", script: " ", scriptVersion: "1" })).toThrow(/script/);
    expect(() => makeHeader({ browser: "b", script: "a.ts", scriptVersion: "" })).toThrow(/scriptVersion/);
  });

  it("defaults the date to now", () => {
    const h = makeHeader({ browser: "b", script: "a.ts", scriptVersion: "1" });
    expect(Math.abs(Date.parse(h.date) - Date.now())).toBeLessThan(5000);
  });

  it("writes a file under results/ with the header first, and reads it back", () => {
    const root = tmp();
    const header = makeHeader({ browser: "Invented Browser 1", script: "invented.ts", scriptVersion: "1" });
    const file = writeResults("catch-rate", header, { setSize: 3 }, root);
    expect(file).toBe(join(root, "results", "catch-rate.json"));
    const text = readFileSync(file, "utf8");
    expect(Object.keys(JSON.parse(text)).slice(0, 4)).toEqual(["date", "browser", "script", "scriptVersion"]);
    expect(readResults("catch-rate", root)).toMatchObject({ setSize: 3, script: "invented.ts" });
  });

  it("reads a missing or unreadable file as undefined", () => {
    const root = tmp();
    expect(readResults("nothing", root)).toBeUndefined();
    writeResults("x", makeHeader({ browser: "b", script: "a.ts", scriptVersion: "1" }), {}, root);
    // Corrupt it.
    writeFileForTest(join(root, "results", "x.json"), "{ not json");
    expect(readResults("x", root)).toBeUndefined();
  });

  it("does not write a new date when the named numbers are the same", () => {
    const root = tmp();
    const first = makeHeader({ browser: "Node v22.23.2 (no browser)", script: "scripts/buildSet.ts", scriptVersion: "1", now: new Date("2026-11-13T08:10:27.740Z") });
    writeResults("synthetic-set", first, { seed: 7, count: 2, notes: [{ id: "n001" }] }, root);
    const before = readFileSync(join(root, "results", "synthetic-set.json"), "utf8");
    const later = makeHeader({ browser: "Node v22.23.2 (no browser)", script: "scripts/buildSet.ts", scriptVersion: "1", now: new Date("2026-11-23T12:00:00.000Z") });
    writeMeasured("synthetic-set", later, { seed: 7, count: 2, notes: [{ id: "n001" }] }, ["seed", "count", "notes"], root);
    expect(readFileSync(join(root, "results", "synthetic-set.json"), "utf8")).toBe(before);
    writeMeasured("synthetic-set", later, { seed: 7, count: 3, notes: [{ id: "n001" }] }, ["seed", "count", "notes"], root);
    expect(readResults("synthetic-set", root)?.["count"]).toBe(3);
    expect(readResults("synthetic-set", root)?.["date"]).toBe("2026-11-23T12:00:00.000Z");
  });

  it("does not let the body overwrite the header", () => {
    const root = tmp();
    const header = makeHeader({ browser: "real", script: "a.ts", scriptVersion: "1" });
    writeResults("y", header, { browser: "other" } as never, root);
    expect(readResults("y", root)?.["browser"]).toBe("real");
  });
});

import { writeFileSync } from "node:fs";
function writeFileForTest(path: string, text: string) {
  writeFileSync(path, text);
}
