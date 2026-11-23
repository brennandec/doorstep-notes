// Measurement tasks 24 and 25 (R15.1 to R15.3, sixth review R6): the fourth device run, kept beside the
// three; the rule stays or is taken out by the count of dates of birth. No browser here. Invented numbers only.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addFourthRun, assertThirdRunNotKept, keepThirdRun, type DeviceRun } from "../../../scripts/deviceRuns";
import type { PassResult } from "../../../scripts/score";
import { compareRuns, deviceRuns, screenFigureLines } from "../../../src/app/figureText";
import type { ResultsLookup } from "../../../src/app/figures";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "doorstep-run4-"));
  dirs.push(root);
  mkdirSync(join(root, "results"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, "results", name), body);
  return root;
}

describe("keepThirdRun (R15.1)", () => {
  it("copies the two files to the -run-3 files, unchanged, and leaves the -run-1 and -run-2 files alone", () => {
    const root = project({ "catch-rate.json": '{"a":3}\n', "misses.json": '{"b":3}\n', "catch-rate-run-2.json": "two", "misses-run-2.json": "two" });
    keepThirdRun(root);
    expect(readFileSync(join(root, "results", "catch-rate-run-3.json"), "utf8")).toBe('{"a":3}\n');
    expect(readFileSync(join(root, "results", "misses-run-3.json"), "utf8")).toBe('{"b":3}\n');
    expect(readFileSync(join(root, "results", "catch-rate-run-2.json"), "utf8")).toBe("two");
  });
  it("refuses to overwrite a -run-3 file, and changes neither", () => {
    const root = project({ "catch-rate.json": "new", "misses.json": "new", "catch-rate-run-3.json": "kept" });
    expect(() => keepThirdRun(root)).toThrow(/catch-rate-run-3\.json/);
    expect(readFileSync(join(root, "results", "catch-rate-run-3.json"), "utf8")).toBe("kept");
    expect(existsSync(join(root, "results", "misses-run-3.json"))).toBe(false);
    const root2 = project({ "catch-rate.json": "new", "misses.json": "new", "misses-run-3.json": "kept" });
    expect(() => keepThirdRun(root2)).toThrow(/misses-run-3\.json/);
    expect(existsSync(join(root2, "results", "catch-rate-run-3.json"))).toBe(false);
  });
  it("refuses early when a -run-4 file already exists, and when the file to copy is missing", () => {
    expect(() => assertThirdRunNotKept(project({ "catch-rate-run-4.json": "kept" }))).toThrow(/already kept/);
    expect(() => assertThirdRunNotKept(project({ "misses-run-4.json": "kept" }))).toThrow(/already kept/);
    expect(() => assertThirdRunNotKept(project({ "catch-rate-run-2.json": "ok" }))).not.toThrow();
    expect(() => keepThirdRun(project({ "catch-rate.json": "x" }))).toThrow(/misses\.json/);
  });
});

describe("addFourthRun (R15.1, R15.2)", () => {
  const pass = (caught: number, total: number, falseMasks: number, dobCaught = 0): PassResult =>
    ({ score: { caught, total, falseMasks, byKind: { dob: { caught: dobCaught, total: 40 } } }, misses: [], falseMaskItems: [] }) as unknown as PassResult;
  const header = { date: "2030-04-12T00:00:00.000Z", browser: "Invented Chrome 11", script: "scripts/measureDevice.ts", scriptVersion: "1" };
  const timing = { elapsedMs: 300_000, limitMin: 15, stoppedAtLimit: false };
  const runWith = (dobCaught: number): DeviceRun => ({
    n: 20, attempted: 20, failed: [],
    exact: pass(40, 100, 1), exactAndNear: pass(45, 100, 1), device: pass(61, 100, 2, dobCaught), merged: pass(81, 100, 3),
  });
  const entry = (label: string, caught: number, falseMasks: number, dob: number) => ({
    label, n: 20, N: 20, date: "2030-04-02T00:00:00.000Z", browser: "Invented Chrome 8", caught, total: 100, falseMasks,
    byKind: { dob: { caught: dob, total: 40 } },
    merged: { caught: caught + 10, total: 100, falseMasks: falseMasks + 3 },
  });
  const earlier = {
    date: "2030-04-01T00:00:00.000Z", browser: "Invented Node 1 (no browser)", script: "scripts/measureExact.ts", scriptVersion: "1", setSize: 20,
    exactAndNear: { caught: 45, total: 100, falseMasks: 1 },
    device: { date: "2030-04-09T00:00:00.000Z", browser: "Invented Chrome 10", n: 20, attempted: 20, failedNotes: 0, caught: 60, total: 100, falseMasks: 2, byKind: { dob: { caught: 30, total: 40 } } },
    merged: { date: "2030-04-09T00:00:00.000Z", browser: "Invented Chrome 10", n: 20, attempted: 20, failedNotes: 0, caught: 80, total: 100, falseMasks: 3 },
    deviceRuns: [entry("first run, before the prompt change", 72, 30, 29), entry("second run, after the prompt change", 70, 5, 28), entry("third run, after the list of words not needed", 60, 2, 30)],
  };
  const earlierMisses = { device: [{ note: "third" }], falseMasks: { device: ["third"] } };

  it("keeps the rule when dates of birth found are equal or higher, and shows the fourth run", () => {
    for (const dob of [30, 35]) {
      const out = addFourthRun(earlier, earlierMisses, runWith(dob), header, timing);
      expect(out.ruleStands).toBe(true);
      expect(out.dob).toEqual({ third: 30, fourth: dob });
      const runs = out.standing.catchRate["deviceRuns"] as Record<string, unknown>[];
      expect(runs).toHaveLength(4);
      expect(runs.slice(0, 3)).toEqual(earlier.deviceRuns);
      expect(runs[3]).toMatchObject({ label: "fourth run, after the date-word rule", date: header.date, browser: "Invented Chrome 11", caught: 61, falseMasks: 2 });
      expect(runs[3]!["stands"]).toBeUndefined();
      expect(out.standing.catchRate["device"]).toMatchObject({ caught: 61 });
    }
  });

  it("takes the rule out when dates of birth found drop below the third run's, and keeps the try", () => {
    const out = addFourthRun(earlier, earlierMisses, runWith(29), header, timing);
    expect(out.ruleStands).toBe(false);
    expect(out.dob).toEqual({ third: 30, fourth: 29 });
    const runs = out.standing.catchRate["deviceRuns"] as Record<string, unknown>[];
    expect(runs).toHaveLength(4);
    expect(runs[3]).toMatchObject({ stands: false, caught: 61 });
    // The parts the page reads and the misses are the third run's again.
    expect(out.standing.catchRate["device"]).toEqual(earlier.device);
    expect(out.standing.catchRate["merged"]).toEqual(earlier.merged);
    expect(out.standing.misses).toEqual(earlierMisses);
    // The fourth run in full is kept apart.
    expect(out.tried.catchRate["device"]).toMatchObject({ caught: 61, falseMasks: 2 });
    expect(out.tried.misses).not.toEqual(earlierMisses);
  });

  it("is a miss when the device model answered no note: the earlier runs stand and no fourth entry is made", () => {
    const none: DeviceRun = { ...runWith(30), n: 0, attempted: 1, failed: [{ noteId: "n1", reason: "No answer." }] };
    const out = addFourthRun(earlier, earlierMisses, none, header, timing);
    expect(out.ruleStands).toBe(true);
    expect(out.standing.catchRate).toEqual(earlier);
    expect(out.tried.catchRate["device"]).toMatchObject({ status: "not measured" });
  });

  it("refuses when the third run has no count of dates of birth", () => {
    const bare = { ...earlier, deviceRuns: [{ ...earlier.deviceRuns[2]!, byKind: undefined }] };
    expect(() => addFourthRun(bare, earlierMisses, runWith(30), header, timing)).toThrow(/dates of birth/);
  });
});

describe("the page and the README show the run that stands (R15.3)", () => {
  const score = (caught: number, total: number, falseMasks = 0) => ({ caught, total, falseMasks, byKind: {} });
  const run = (label: string, caught: number, falseMasks: number, dob: number, over: object = {}) => ({
    label, n: 60, N: 60, date: "2030-03-01T00:00:00.000Z", browser: "Invented Chrome 8", caught, total: 2300, falseMasks,
    byKind: { dob: { caught: dob, total: 100 } }, merged: score(caught + 400, 2300, falseMasks + 8), ...over,
  });
  const file = (fourth: object) => ({
    date: "2030-02-03T04:05:06.000Z", browser: "Invented Node 1 (no browser)", setSize: 60, exactAndNear: score(1010, 2300, 4),
    deviceRuns: [run("first run, before the prompt change", 1500, 41, 90), run("second run, after the prompt change", 1600, 12, 91), run("third run, after the list of words not needed", 1550, 9, 92), fourth],
  });
  const lookup = (f: unknown): ResultsLookup => (name) => (name === "catch-rate" ? (f as never) : undefined);

  it("shows the fourth run, with four runs side by side, when the rule stands", () => {
    const f = file(run("fourth run, after the date-word rule", 1560, 5, 93, { date: "2031-05-06T00:00:00.000Z", browser: "Invented Chrome 9" }));
    expect(compareRuns(deviceRuns(lookup(f)))).toBe(
      "False masks: first run 41, second run 12, third run 9, fourth run 5. Identifiers caught: first run 1,500, second run 1,600, third run 1,550, fourth run 1,560.",
    );
    const lines = screenFigureLines(lookup(f));
    expect(lines.two).toContain("suggested 5 things");
    expect(lines.two).toContain("2031-05-06, Invented Chrome 9");
    expect(lines.one).toContain("1,960 of 2,300");
  });

  it("shows the third run, and says the rule was taken out, when the fourth run is marked as not standing", () => {
    const f = file(run("fourth run, after the date-word rule", 1560, 5, 85, { stands: false, date: "2031-05-06T00:00:00.000Z", browser: "Invented Chrome 9" }));
    const lines = screenFigureLines(lookup(f));
    expect(lines.two).toContain("suggested 9 things");
    expect(lines.two).not.toContain("2031-05-06");
    expect(lines.one).toContain("1,950 of 2,300");
    const compare = compareRuns(deviceRuns(lookup(f)))!;
    expect(compare).toContain("fourth run 5");
    expect(compare).toContain("The fourth run tried the date-word rule. It found fewer dates of birth (92 to 85), so the rule was taken out again and the figures above are those of the third run.");
  });
});
