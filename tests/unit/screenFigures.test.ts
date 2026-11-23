// Measurement tasks 11 and 14 (R11.1, R11.2, R12.4): the two figure lines of the page and the
// README, and the side-by-side line for two device runs. Every number here is invented.
import { describe, expect, it } from "vitest";
import type { ResultsLookup } from "../../src/app/figures";
import { compareRuns, deviceRuns, screenFigureLines } from "../../src/app/figureText";

const score = (caught: number, total: number, falseMasks = 0) => ({ caught, total, falseMasks, byKind: {} });
const base = {
  date: "2030-02-03T04:05:06.000Z",
  browser: "Invented Node 1 (no browser)",
  setSize: 60,
  exact: score(300, 1200, 4),
  near: score(20, 1200, 0),
  exactAndNear: score(1010, 2300, 4),
};
const legacyDevice = { date: "2030-02-04T00:00:00.000Z", browser: "Invented Chrome 7", n: 55, caught: 1500, total: 2100, falseMasks: 41 };
const legacyMerged = { date: "2030-02-04T00:00:00.000Z", browser: "Invented Chrome 7", n: 55, caught: 1900, total: 2100, falseMasks: 48 };
const legacy = { ...base, device: legacyDevice, merged: legacyMerged };

const run = (label: string, over: object = {}) => ({
  label,
  n: 60,
  N: 60,
  date: "2030-03-01T00:00:00.000Z",
  browser: "Invented Chrome 8",
  caught: 1600,
  total: 2300,
  falseMasks: 12,
  notesPerMinute: 20,
  merged: score(2000, 2300, 20),
  ...over,
});
const two = { ...base, deviceRuns: [run("first run, before the prompt change", { caught: 1500, falseMasks: 41, date: "2030-02-04T00:00:00.000Z", browser: "Invented Chrome 7" }), run("second run, after the prompt change")] };
const lookup = (file: unknown): ResultsLookup => (name) => (name === "catch-rate" ? (file as never) : undefined);

describe("screenFigureLines: line one and line two (R11.1)", () => {
  it("builds line one from the file, with thousands separators, n and N, date and browser of each part", () => {
    const { one } = screenFigureLines(lookup(legacy));
    expect(one).toBe(
      "On 60 invented notes her list alone found 1,010 of 2,300 identifying details (2030-02-03, Invented Node 1 (no browser)). " +
        "With the model on this device: 1,900 of 2,100, on 55 of 60 invented notes (2030-02-04, Invented Chrome 7). Measured on the author's computer.",
    );
  });

  it("builds line two from the false masks of the device pass", () => {
    expect(screenFigureLines(lookup(legacy)).two).toBe(
      "The model on this device also suggested 41 things that were not needed (on 55 of 60 invented notes, 2030-02-04, Invented Chrome 7).",
    );
    const one = { ...legacy, device: { ...legacyDevice, falseMasks: 1 } };
    expect(screenFigureLines(lookup(one)).two).toContain("also suggested 1 thing that was not needed");
  });

  it("shows the later run when the file holds two", () => {
    const { one, two: l2 } = screenFigureLines(lookup(two));
    expect(one).toContain("With the model on this device: 2,000 of 2,300, on 60 of 60 invented notes (2030-03-01, Invented Chrome 8)");
    expect(l2).toContain("also suggested 12 things");
    expect(one).not.toContain("1,900");
  });

  it("changes with the file: nothing is typed in the code", () => {
    const other = { ...legacy, setSize: 7, exactAndNear: score(5, 9), device: { ...legacyDevice, n: 3 } };
    expect(screenFigureLines(lookup(other)).one).toContain("On 7 invented notes her list alone found 5 of 9 identifying details");
    expect(screenFigureLines(lookup(other)).one).toContain("on 3 of 7 invented notes");
  });

  it("reads 'not measured' for the part that is missing and keeps the other", () => {
    const noDevice = { ...base };
    const a = screenFigureLines(lookup(noDevice));
    expect(a.one).toContain("1,010 of 2,300");
    expect(a.one).toContain("With the model on this device: not measured.");
    expect(a.two).toBe("Things the model on this device suggested that were not needed: not measured.");
    const noList = { ...legacy, exactAndNear: undefined };
    const b = screenFigureLines(lookup(noList));
    expect(b.one).toContain("Her list alone: not measured.");
    expect(b.one).toContain("1,900 of 2,100");
  });

  it("reads 'not measured' in both lines, with no digit, when there is no catch-rate file", () => {
    const { one, two: l2 } = screenFigureLines(() => undefined);
    expect(one).toBe("Her list alone: not measured. With the model on this device: not measured.");
    expect(l2).toBe("Things the model on this device suggested that were not needed: not measured.");
    expect(one + l2).not.toMatch(/\d/);
  });

  it("reads 'not measured' for an unreadable file and for a wrong field type", () => {
    const boom: ResultsLookup = () => {
      throw new Error("unreadable");
    };
    expect(screenFigureLines(boom).one).not.toMatch(/\d/);
    for (const bad of [
      { ...legacy, exactAndNear: score("many" as never, 5), device: { ...legacyDevice, caught: "x" }, merged: { ...legacyMerged, caught: "x" } },
      { ...legacy, setSize: "sixty", exactAndNear: score(1, 2), device: { ...legacyDevice } },
      "not an object",
      [],
    ]) {
      const l = screenFigureLines(lookup(bad));
      expect(l.one + l.two, JSON.stringify(bad).slice(0, 40)).not.toMatch(/\d/);
    }
  });

  it("reads the device parts as 'not measured' when the run says so, or has no n, date or browser", () => {
    const off = { ...legacy, device: { status: "not measured", reason: "No Chrome" }, merged: { status: "not measured", reason: "No Chrome" } };
    expect(screenFigureLines(lookup(off)).one).toContain("With the model on this device: not measured.");
    const noN = { ...legacy, device: { ...legacyDevice, n: undefined }, merged: { ...legacyMerged, n: undefined } };
    expect(screenFigureLines(lookup(noN)).two).toContain("not measured");
    const noBrowser = { ...legacy, deviceRuns: [run("first run, before the prompt change", { browser: "" })] };
    expect(screenFigureLines(lookup(noBrowser)).one).toContain("With the model on this device: not measured.");
  });

  it("does not say it was measured on the author's computer when nothing was measured", () => {
    expect(screenFigureLines(() => undefined).one).not.toContain("author's computer");
  });
});

describe("deviceRuns and compareRuns (R12.4)", () => {
  it("lists the runs in the file, or the one legacy run, or none", () => {
    expect(deviceRuns(lookup(two)).map((r) => r.label)).toEqual(["first run, before the prompt change", "second run, after the prompt change"]);
    expect(deviceRuns(lookup(legacy))).toHaveLength(1);
    expect(deviceRuns(lookup(base))).toEqual([]);
    expect(deviceRuns(() => undefined)).toEqual([]);
  });

  it("leaves out a run that is malformed", () => {
    const f = { ...base, deviceRuns: [run("first run, before the prompt change"), { label: "x", n: "?" }] };
    expect(deviceRuns(lookup(f))).toHaveLength(1);
  });

  it("puts both runs side by side", () => {
    expect(compareRuns(deviceRuns(lookup(two)))).toBe("False masks: first run 41, second run 12. Identifiers caught: first run 1,500, second run 1,600.");
  });

  it("returns nothing with fewer than two runs", () => {
    expect(compareRuns(deviceRuns(lookup(legacy)))).toBeNull();
    expect(compareRuns([])).toBeNull();
  });

  it("reports a rise as it is", () => {
    const worse = { ...base, deviceRuns: [run("a", { caught: 1600, falseMasks: 10 }), run("b", { caught: 1400, falseMasks: 30 })] };
    expect(compareRuns(deviceRuns(lookup(worse)))).toBe("False masks: first run 10, second run 30. Identifiers caught: first run 1,600, second run 1,400.");
  });
});

describe("three runs side by side (measurement R13.3)", () => {
  const three = {
    ...base,
    deviceRuns: [
      run("first run, before the prompt change", { caught: 1500, falseMasks: 41 }),
      run("second run, after the prompt change", { caught: 1600, falseMasks: 12 }),
      run("third run, after the list of words not needed", { caught: 1550, falseMasks: 4 }),
    ],
  };
  it("lists three runs and compares all three", () => {
    expect(deviceRuns(lookup(three))).toHaveLength(3);
    expect(compareRuns(deviceRuns(lookup(three)))).toBe(
      "False masks: first run 41, second run 12, third run 4. Identifiers caught: first run 1,500, second run 1,600, third run 1,550.",
    );
  });
  it("shows the third run, with its own date and browser, in the screen lines", () => {
    const t = { ...three, deviceRuns: [...three.deviceRuns.slice(0, 2), run("third run, after the list of words not needed", { caught: 1550, falseMasks: 4, date: "2031-01-02T00:00:00.000Z", browser: "Invented Chrome 77" })] };
    const lines = screenFigureLines(lookup(t));
    expect(lines.two).toContain("suggested 4 things");
    expect(lines.two).toContain("2031-01-02, Invented Chrome 77");
    expect(lines.one).toContain("Invented Chrome 77");
  });
});
