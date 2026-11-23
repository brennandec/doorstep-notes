import { describe, expect, it } from "vitest";
import { bundledResults, type ResultsLookup } from "../../../src/app/figures";
import { figureLines, figureText } from "../../../src/app/figureText";

// Invented results files. Every number here is made up for the test.
const header = { date: "2026-01-02T03:04:05.000Z", browser: "Invented Browser 1", script: "x.ts", scriptVersion: "1" };
const score = (caught: number, total: number, falseMasks = 0) => ({ caught, total, falseMasks, byKind: {} });
const catchRate = {
  ...header,
  setSize: 50,
  seed: 1,
  exact: score(30, 80, 2),
  near: score(5, 80, 0),
  exactAndNear: score(33, 80, 2),
  device: { date: "2026-01-03T00:00:00.000Z", browser: "Invented Chrome 9", n: 12, caught: 20, total: 31, falseMasks: 4, notesPerMinute: 2, stoppedAtLimit: true },
  merged: { date: "2026-01-03T00:00:00.000Z", browser: "Invented Chrome 9", n: 12, caught: 28, total: 31, falseMasks: 5 },
};
const lookup = (files: Record<string, unknown>): ResultsLookup => (name) => files[name] as never;

describe("figure text (measurement R4.3, R6.3, R6.4)", () => {
  it("reads 'not measured' for every figure when no results file exists", () => {
    const lines = figureLines(() => undefined);
    for (const l of lines) expect(l.text, l.id).toMatch(/not measured/);
    expect(lines.map((l) => l.id)).toEqual(["exact", "near", "exactAndNear", "device", "merged", "coldStart"]);
  });

  it("reads 'not measured' when the file is missing the figure, or holds the wrong types", () => {
    expect(figureText("exact", lookup({ "catch-rate": { ...header } }))).toMatch(/not measured/);
    expect(figureText("exact", lookup({ "catch-rate": { ...header, exact: { caught: "many", total: 5 } } }))).toMatch(/not measured/);
    expect(figureText("exact", lookup({ "catch-rate": { ...header, exact: score(9, 5) } }))).toMatch(/not measured/);
    expect(figureText("exact", lookup({ "catch-rate": { ...header, exact: score(-1, 5) } }))).toMatch(/not measured/);
    expect(figureText("exact", lookup({ "catch-rate": { ...header, exact: score(1.5, 5) } }))).toMatch(/not measured/);
  });

  it("reads 'not measured' when a figure has no date or no browser", () => {
    expect(figureText("exact", lookup({ "catch-rate": { ...catchRate, date: undefined } }))).toMatch(/not measured/);
    expect(figureText("exact", lookup({ "catch-rate": { ...catchRate, browser: "" } }))).toMatch(/not measured/);
  });

  it("shows the exact figure with its counts, date and browser from the file", () => {
    const t = figureText("exact", lookup({ "catch-rate": catchRate }));
    expect(t).toBe("Exact match caught 30 of 80 identifiers on the invented set (2026-01-02, Invented Browser 1). False masks: 2.");
  });

  it("shows the near and the exact-and-near figures the same way", () => {
    const r = lookup({ "catch-rate": catchRate });
    expect(figureText("near", r)).toContain("Near match caught 5 of 80 identifiers on the invented set (2026-01-02, Invented Browser 1)");
    expect(figureText("exactAndNear", r)).toContain("Exact and near match together caught 33 of 80 identifiers");
  });

  it("names n and N in a device figure, filled from the file, with the device run's own date and browser", () => {
    const t = figureText("device", lookup({ "catch-rate": catchRate }));
    expect(t).toBe("Device model pass caught 20 of 31 identifiers on 12 of 50 invented notes (2026-01-03, Invented Chrome 9). False masks: 4.");
    expect(figureText("merged", lookup({ "catch-rate": catchRate }))).toContain("on 12 of 50 invented notes (2026-01-03, Invented Chrome 9)");
  });

  it("changes n and N with the file", () => {
    const other = { ...catchRate, setSize: 7, device: { ...catchRate.device, n: 3 } };
    expect(figureText("device", lookup({ "catch-rate": other }))).toContain("on 3 of 7 invented notes");
  });

  it("does not show a device figure that names no n, or an n above N, or has no date or browser of its own", () => {
    const dev = (over: object) => lookup({ "catch-rate": { ...catchRate, device: { ...catchRate.device, ...over } } });
    expect(figureText("device", dev({ n: undefined }))).toMatch(/not measured/);
    expect(figureText("device", dev({ n: 51 }))).toMatch(/not measured/);
    expect(figureText("device", dev({ n: 0 }))).toMatch(/not measured/);
    expect(figureText("device", dev({ date: undefined }))).toMatch(/not measured/);
    expect(figureText("device", dev({ browser: undefined }))).toMatch(/not measured/);
  });

  it("reads 'not measured' with the reason when the device pass was not run", () => {
    const file = { ...catchRate, device: { status: "not measured", reason: "Google Chrome is not installed on this computer" }, merged: { status: "not measured", reason: "x" } };
    expect(figureText("device", lookup({ "catch-rate": file }))).toBe("Device model pass: not measured. Google Chrome is not installed on this computer.");
    expect(figureText("merged", lookup({ "catch-rate": file }))).toMatch(/not measured/);
  });

  it("does not repeat a reason twice or add a second full stop", () => {
    const file = { ...catchRate, device: { status: "not measured", reason: "No answer." } };
    expect(figureText("device", lookup({ "catch-rate": file }))).toBe("Device model pass: not measured. No answer.");
  });

  it("gives H8 only as a figure about the author's computer", () => {
    const cold = lookup({ "cold-start": { ...header, status: "pass", seconds: 41 } });
    const t = figureText("coldStart", cold);
    expect(t).toContain("on the author's computer");
    expect(t).toContain("41 seconds");
    expect(figureText("coldStart", () => undefined)).toMatch(/not measured/);
  });

  it("never shows a figure the lookup did not give: a throwing lookup reads 'not measured'", () => {
    const boom: ResultsLookup = () => {
      throw new Error("unreadable");
    };
    for (const l of figureLines(boom)) expect(l.text, l.id).toMatch(/not measured/);
  });
});

describe("the app's bundled results", () => {
  it("does not bundle the synthetic set or the miss lists into the page", () => {
    expect(bundledResults("synthetic-set")).toBeUndefined();
    expect(bundledResults("misses")).toBeUndefined();
  });
});
