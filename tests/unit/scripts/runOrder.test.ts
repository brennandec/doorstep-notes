import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSet } from "../../../scripts/buildSet";
import { makeHeader, writeResults } from "../../../scripts/results";
import { RESULT_FILES, checkRunOrder, formatRunOrder } from "../../../scripts/runOrder";
import { runMeasureExact } from "../../../scripts/measureExact";
import { SYNTHETIC_SEED } from "../../../src/constants";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "run-order-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const header = makeHeader({ browser: "b", script: "s", scriptVersion: "1" });
const find = (r: ReturnType<typeof checkRunOrder>, file: string) => r.files.find((f) => f.file === file)!;

describe("run order check (measurement R10.1)", () => {
  it("names the twelve results files of R6.1", () => {
    expect(RESULT_FILES).toEqual([
      "synthetic-set", "catch-rate", "misses", "device-model-check", "cold-start", "h1", "h2-part-a", "h2-part-b", "h4",
      "device-structured-output", "device-token-limit", "draft-network-drop",
    ]);
  });

  it("lists every file as missing in an empty folder, and the four steps as not done", () => {
    const r = checkRunOrder(tmp());
    expect(r.files.every((f) => f.state === "missing")).toBe(true);
    expect(r.steps.map((s) => [s.step, s.state])).toEqual([
      ["set", "missing"], ["exact", "missing"], ["device", "missing"], ["cold start", "missing"],
    ]);
    expect(r.problems).toEqual([]);
  });

  it("follows the order set, exact, device, cold start", () => {
    const root = tmp();
    const small = buildSet(SYNTHETIC_SEED, 5);
    writeResults("synthetic-set", header, { seed: SYNTHETIC_SEED, count: 5, notes: small }, root);
    let r = checkRunOrder(root);
    expect(r.steps.map((s) => s.state)).toEqual(["present", "missing", "missing", "missing"]);
    runMeasureExact(root);
    r = checkRunOrder(root);
    expect(r.steps.map((s) => s.state)).toEqual(["present", "present", "not measured", "missing"]);
    expect(r.steps[2]!.detail).toMatch(/device pass has not been run/i);
    expect(find(r, "catch-rate").state).toBe("present");
    expect(find(r, "misses").state).toBe("present");
  });

  it("reads a measured device part as present", () => {
    const root = tmp();
    writeResults("synthetic-set", header, { seed: 1, count: 1, notes: [] }, root);
    writeResults("catch-rate", header, { seed: 1, setSize: 1, exact: {}, device: { n: 1, caught: 0, total: 1, falseMasks: 0 }, merged: {} }, root);
    expect(checkRunOrder(root).steps[2]!.state).toBe("present");
  });

  it("reads cold start by its status: a run with seconds is present, one without is not measured", () => {
    const root = tmp();
    writeResults("cold-start", header, { status: "pass", seconds: 40, machine: "invented laptop" }, root);
    expect(checkRunOrder(root).steps[3]!.state).toBe("present");
    writeResults("cold-start", header, { status: "fail", reason: "Chrome is not installed", machine: "invented laptop" }, root);
    const r = checkRunOrder(root);
    expect(r.steps[3]!.state).toBe("not measured");
    expect(r.steps[3]!.detail).toContain("Chrome is not installed");
  });

  it("reads a miss file from the device checks as not measured, with its reason", () => {
    const root = tmp();
    writeResults("h1", header, { status: "miss", reason: "The device model reported: downloadable" }, root);
    const f = find(checkRunOrder(root), "h1");
    expect(f.state).toBe("not measured");
    expect(f.detail).toContain("downloadable");
  });

  it("reports a file that cannot be read", () => {
    const root = tmp();
    mkdirSync(join(root, "results"));
    writeFileSync(join(root, "results", "catch-rate.json"), "{ nope");
    expect(find(checkRunOrder(root), "catch-rate").state).toBe("unreadable");
  });

  it("flags a step that has a result while an earlier step has none", () => {
    const root = tmp();
    writeResults("catch-rate", header, { seed: 1, setSize: 1, exact: {}, device: { n: 1 } }, root);
    const r = checkRunOrder(root);
    expect(r.problems.join(" ")).toMatch(/exact.*synthetic set|synthetic set.*exact/i);
    writeResults("cold-start", header, { status: "pass", seconds: 1, machine: "m" }, root);
    expect(checkRunOrder(root).problems.length).toBeGreaterThan(0);
  });

  it("prints one line per file and says which read not measured", () => {
    const root = tmp();
    writeResults("h1", header, { status: "miss", reason: "x" }, root);
    const text = formatRunOrder(checkRunOrder(root));
    expect(text.split("\n").filter((l) => l.startsWith("  ")).length).toBeGreaterThanOrEqual(RESULT_FILES.length);
    expect(text).toContain("h1: not measured");
    expect(text).toContain("h2-part-b: missing");
  });
});
