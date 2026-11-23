// Measurement task 15 (R12.1, R12.3, R12.4): the second device run. No browser here.
// Invented numbers and people only.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEVICE_MEASURE_LIMIT_MIN, CONSTANT_SOURCES } from "../../../src/constants";
import { addSecondRun, assertFirstRunNotKept, keepFirstRun, type DeviceRun } from "../../../scripts/deviceRuns";
import type { PassResult } from "../../../scripts/score";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "doorstep-runs-"));
  dirs.push(root);
  mkdirSync(join(root, "results"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, "results", name), body);
  return root;
}

describe("the time box and the wrapper (R12.1)", () => {
  it("is 15 minutes, with its source in the second review", () => {
    expect(DEVICE_MEASURE_LIMIT_MIN).toBe(15);
    expect(CONSTANT_SOURCES["DEVICE_MEASURE_LIMIT_MIN"]).toMatch(/second review/);
    expect(CONSTANT_SOURCES["DEVICE_MEASURE_LIMIT_MIN"]).toMatch(/15 minutes/);
  });
  it("runs under a 1200 second wrapper", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["measure:device"]).toContain("alarm 1200;");
    expect(pkg.scripts["measure:device"]).not.toContain("1900");
  });
});

describe("keepFirstRun (R12.3)", () => {
  it("copies catch-rate.json and misses.json to the -run-1 files, unchanged", () => {
    const root = project({ "catch-rate.json": '{"a":1}\n', "misses.json": '{"b":2}\n' });
    keepFirstRun(root);
    expect(readFileSync(join(root, "results", "catch-rate-run-1.json"), "utf8")).toBe('{"a":1}\n');
    expect(readFileSync(join(root, "results", "misses-run-1.json"), "utf8")).toBe('{"b":2}\n');
    expect(readFileSync(join(root, "results", "catch-rate.json"), "utf8")).toBe('{"a":1}\n');
  });

  it("refuses to overwrite a -run-1 file, and changes neither", () => {
    const root = project({ "catch-rate.json": "new", "misses.json": "new", "catch-rate-run-1.json": "kept" });
    expect(() => keepFirstRun(root)).toThrow(/catch-rate-run-1\.json/);
    expect(readFileSync(join(root, "results", "catch-rate-run-1.json"), "utf8")).toBe("kept");
    expect(existsSync(join(root, "results", "misses-run-1.json"))).toBe(false);
    const root2 = project({ "catch-rate.json": "new", "misses.json": "new", "misses-run-1.json": "kept" });
    expect(() => keepFirstRun(root2)).toThrow(/misses-run-1\.json/);
    expect(existsSync(join(root2, "results", "catch-rate-run-1.json"))).toBe(false);
  });

  it("refuses when the file to copy is missing", () => {
    expect(() => keepFirstRun(project({ "catch-rate.json": "x" }))).toThrow(/misses\.json/);
  });

  it("assertFirstRunNotKept refuses early, before a long run, when a -run-1 file exists", () => {
    expect(() => assertFirstRunNotKept(project({ "misses-run-1.json": "kept" }))).toThrow(/already kept/);
    expect(() => assertFirstRunNotKept(project({}))).not.toThrow();
  });
});

describe("addSecondRun (R12.4)", () => {
  const pass = (caught: number, total: number, falseMasks: number): PassResult =>
    ({ score: { caught, total, falseMasks, byKind: {} }, misses: [], falseMaskItems: [] }) as unknown as PassResult;
  const header = { date: "2030-04-05T00:00:00.000Z", browser: "Invented Chrome 9", script: "scripts/measureDevice.ts", scriptVersion: "1" };
  const timing = { elapsedMs: 600_000, limitMin: 15, stoppedAtLimit: false };
  const run: DeviceRun = {
    n: 20, attempted: 20, failed: [],
    exact: pass(40, 100, 1), exactAndNear: pass(45, 100, 1), device: pass(70, 100, 5), merged: pass(88, 100, 7),
  };
  const earlier = {
    date: "2030-04-01T00:00:00.000Z", browser: "Invented Node 1 (no browser)", script: "scripts/measureExact.ts", scriptVersion: "1", setSize: 20,
    exactAndNear: { caught: 45, total: 100, falseMasks: 1 },
    device: { date: "2030-04-02T00:00:00.000Z", browser: "Invented Chrome 8", n: 20, attempted: 20, failedNotes: 0, caught: 72, total: 100, falseMasks: 30 },
    merged: { date: "2030-04-02T00:00:00.000Z", browser: "Invented Chrome 8", n: 20, attempted: 20, failedNotes: 0, caught: 90, total: 100, falseMasks: 33 },
  };

  it("holds two entries, the first run kept as it was and the second from this run", () => {
    const out = addSecondRun(earlier, {}, run, header, timing);
    const runs = out.catchRate["deviceRuns"] as Record<string, unknown>[];
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ label: "first run, before the prompt change", n: 20, N: 20, date: "2030-04-02T00:00:00.000Z", browser: "Invented Chrome 8", caught: 72, total: 100, falseMasks: 30 });
    expect(runs[0]!["merged"]).toMatchObject({ caught: 90, total: 100, falseMasks: 33 });
    expect(runs[1]).toMatchObject({ label: "second run, after the prompt change", n: 20, N: 20, date: header.date, browser: "Invented Chrome 9", caught: 70, total: 100, falseMasks: 5, notesPerMinute: 2 });
    expect(runs[1]!["merged"]).toMatchObject({ caught: 88, total: 100, falseMasks: 7 });
  });

  it("keeps the other parts of the file, and makes device and merged the later run", () => {
    const out = addSecondRun(earlier, {}, run, header, timing);
    expect(out.catchRate["exactAndNear"]).toEqual(earlier.exactAndNear);
    expect(out.catchRate["setSize"]).toBe(20);
    expect(out.catchRate["device"]).toMatchObject({ caught: 70, falseMasks: 5 });
    expect(out.catchRate["merged"]).toMatchObject({ caught: 88 });
  });

  it("reads the first run from deviceRuns when the file already has the array", () => {
    const once = addSecondRun(earlier, {}, run, header, timing).catchRate;
    const runs = once["deviceRuns"] as unknown[];
    expect(runs).toHaveLength(2);
    const again = addSecondRun({ ...once, deviceRuns: [runs[0]] }, {}, run, header, timing);
    expect((again.catchRate["deviceRuns"] as unknown[]).length).toBe(2);
  });

  it("holds only the second run when the earlier file has no usable first run", () => {
    const { device: _d, merged: _m, ...bare } = earlier;
    const out = addSecondRun(bare, {}, run, header, timing);
    const runs = out.catchRate["deviceRuns"] as { label: string }[];
    expect(runs).toHaveLength(1);
    expect(runs[0]!.label).toBe("second run, after the prompt change");
  });
});

// Measurement task 17 (R13.2, R13.3): the third run. Invented numbers only.
import { addThirdRun, assertSecondRunNotKept, keepSecondRun } from "../../../scripts/deviceRuns";

describe("keepSecondRun (R13.2)", () => {
  it("copies catch-rate.json and misses.json to the -run-2 files, unchanged, and leaves the -run-1 files alone", () => {
    const root = project({ "catch-rate.json": '{"a":2}\n', "misses.json": '{"b":2}\n', "catch-rate-run-1.json": "one", "misses-run-1.json": "one" });
    keepSecondRun(root);
    expect(readFileSync(join(root, "results", "catch-rate-run-2.json"), "utf8")).toBe('{"a":2}\n');
    expect(readFileSync(join(root, "results", "misses-run-2.json"), "utf8")).toBe('{"b":2}\n');
    expect(readFileSync(join(root, "results", "catch-rate-run-1.json"), "utf8")).toBe("one");
    expect(readFileSync(join(root, "results", "misses-run-1.json"), "utf8")).toBe("one");
  });

  it("refuses to overwrite a -run-2 file, and changes neither", () => {
    const root = project({ "catch-rate.json": "new", "misses.json": "new", "catch-rate-run-2.json": "kept" });
    expect(() => keepSecondRun(root)).toThrow(/catch-rate-run-2\.json/);
    expect(readFileSync(join(root, "results", "catch-rate-run-2.json"), "utf8")).toBe("kept");
    expect(existsSync(join(root, "results", "misses-run-2.json"))).toBe(false);
    const root2 = project({ "catch-rate.json": "new", "misses.json": "new", "misses-run-2.json": "kept" });
    expect(() => keepSecondRun(root2)).toThrow(/misses-run-2\.json/);
    expect(existsSync(join(root2, "results", "catch-rate-run-2.json"))).toBe(false);
  });

  it("refuses when the file to copy is missing", () => {
    expect(() => keepSecondRun(project({ "catch-rate.json": "x" }))).toThrow(/misses\.json/);
  });

  it("assertSecondRunNotKept refuses early, before a long run", () => {
    expect(() => assertSecondRunNotKept(project({ "misses-run-2.json": "kept" }))).toThrow(/already kept/);
    expect(() => assertSecondRunNotKept(project({ "catch-rate-run-1.json": "ok" }))).not.toThrow();
  });
});

describe("addThirdRun (R13.3)", () => {
  const pass = (caught: number, total: number, falseMasks: number): PassResult =>
    ({ score: { caught, total, falseMasks, byKind: {} }, misses: [], falseMaskItems: [] }) as unknown as PassResult;
  const header = { date: "2030-04-09T00:00:00.000Z", browser: "Invented Chrome 10", script: "scripts/measureDevice.ts", scriptVersion: "1" };
  const timing = { elapsedMs: 300_000, limitMin: 15, stoppedAtLimit: false };
  const run: DeviceRun = {
    n: 20, attempted: 20, failed: [],
    exact: pass(40, 100, 1), exactAndNear: pass(45, 100, 1), device: pass(60, 100, 2), merged: pass(80, 100, 3),
  };
  const entry = (label: string, caught: number, falseMasks: number) => ({
    label, n: 20, N: 20, date: "2030-04-02T00:00:00.000Z", browser: "Invented Chrome 8", caught, total: 100, falseMasks,
    merged: { caught: caught + 10, total: 100, falseMasks: falseMasks + 3 },
  });
  const earlier = {
    date: "2030-04-01T00:00:00.000Z", browser: "Invented Node 1 (no browser)", script: "scripts/measureExact.ts", scriptVersion: "1", setSize: 20,
    exactAndNear: { caught: 45, total: 100, falseMasks: 1 },
    device: { date: "2030-04-05T00:00:00.000Z", browser: "Invented Chrome 9", n: 20, attempted: 20, failedNotes: 0, caught: 70, total: 100, falseMasks: 5 },
    merged: { date: "2030-04-05T00:00:00.000Z", browser: "Invented Chrome 9", n: 20, attempted: 20, failedNotes: 0, caught: 88, total: 100, falseMasks: 7 },
    deviceRuns: [entry("first run, before the prompt change", 72, 30), entry("second run, after the prompt change", 70, 5)],
  };

  it("holds three entries, the two earlier kept as they were and the third from this run", () => {
    const out = addThirdRun(earlier, {}, run, header, timing);
    const runs = out.catchRate["deviceRuns"] as Record<string, unknown>[];
    expect(runs).toHaveLength(3);
    expect(runs[0]).toEqual(earlier.deviceRuns[0]);
    expect(runs[1]).toEqual(earlier.deviceRuns[1]);
    expect(runs[2]).toMatchObject({ label: "third run, after the list of words not needed", n: 20, N: 20, date: header.date, browser: "Invented Chrome 10", caught: 60, total: 100, falseMasks: 2, notesPerMinute: 4 });
    expect(runs[2]!["merged"]).toMatchObject({ caught: 80, total: 100, falseMasks: 3 });
  });

  it("makes device and merged the later run and keeps the other parts", () => {
    const out = addThirdRun(earlier, {}, run, header, timing);
    expect(out.catchRate["exactAndNear"]).toEqual(earlier.exactAndNear);
    expect(out.catchRate["device"]).toMatchObject({ caught: 60, falseMasks: 2 });
    expect(out.catchRate["merged"]).toMatchObject({ caught: 80 });
  });

  it("records a lower found count as lower, with no target", () => {
    const out = addThirdRun(earlier, {}, run, header, timing);
    const runs = out.catchRate["deviceRuns"] as { caught: number }[];
    expect(runs[2]!.caught).toBeLessThan(runs[1]!.caught);
  });
});

describe("the device script keeps the earlier runs before it writes (R13.2, R15.1)", () => {
  it("is the fourth-run script now: it keeps the third run, not the second, before anything is written", () => {
    const src = readFileSync("scripts/measureDevice.ts", "utf8");
    expect(src).toContain("assertThirdRunNotKept()");
    expect(src.indexOf("keepThirdRun()")).toBeGreaterThan(-1);
    expect(src.indexOf("keepThirdRun()")).toBeLessThan(src.indexOf("write(four.standing, header)"));
    expect(src).toContain("addFourthRun(");
    expect(src).not.toContain("keepSecondRun()");
  });
});
