// @vitest-environment happy-dom
// Measurement tasks 12 and 14 (R11.1, R11.2, R11.4, R11.5): the two figure lines sit in the
// masks view in zone 1, under the masking controls, with the invented-set caveat. Invented numbers.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderNoteZone } from "../../src/app/zones/note";
import { emptyState } from "../../src/app/state";
import type { ResultsLookup } from "../../src/app/figures";
import { flattenStrings, strings } from "../../src/app/strings";
import { screenFigureLines } from "../../src/app/figureText";

const handlers = {
  onNoteInput() {}, onListInput() {}, onTryExample() {}, onRemoveExample() {}, onGetModel() {}, onMakeRecord() {},
} as never;

const score = (caught: number, total: number, falseMasks = 0) => ({ caught, total, falseMasks, byKind: {} });
const run = (label: string, over: object = {}) => ({
  label, n: 9, N: 9, date: "2030-03-01T00:00:00.000Z", browser: "Invented Chrome 8",
  caught: 70, total: 100, falseMasks: 6, merged: score(90, 100, 8), ...over,
});
const file = {
  date: "2030-01-02T03:04:05.000Z", browser: "Invented Node 1 (no browser)", setSize: 9,
  exact: score(30, 100), near: score(5, 100), exactAndNear: score(35, 100, 2),
  deviceRuns: [run("first run, before the prompt change", { falseMasks: 21, merged: score(80, 100, 25) }), run("second run, after the prompt change")],
};

function render(results: ResultsLookup, withRecord = true) {
  const state = emptyState({ results, ...(withRecord ? { record: structuredClone(inventedVisit.preparedRecord) } : {}) });
  return renderNoteZone(state, handlers);
}
const withFile: ResultsLookup = (n) => (n === "catch-rate" ? (file as never) : undefined);

describe("the figure lines in the masks view (measurement R11.1)", () => {
  it("are in the closed 'How this was measured' disclosure, under the masking view and not in it (H20 R4)", () => {
    const zone = render(withFile);
    const figures = zone.querySelector("[data-figures]")!;
    expect(figures).not.toBeNull();
    expect(figures.closest('details[data-details="measured"]')).not.toBeNull();
    expect(zone.querySelector("[data-mask-section] [data-figures]")).toBeNull();
    // not also above the record, as the first build had it
    expect(zone.querySelectorAll("[data-figures]")).toHaveLength(1);
  });

  it("show line one and line two, the same text the README uses", () => {
    const zone = render(withFile);
    const { one, two } = screenFigureLines(withFile);
    expect(zone.querySelector("[data-figure-one]")?.textContent).toBe(one);
    expect(zone.querySelector("[data-figure-two]")?.textContent).toBe(two);
    expect(one).toContain("On 9 invented notes her list alone found 35 of 100 identifying details");
  });

  it("show the later device run when the file holds two (R11.5)", () => {
    const zone = render(withFile);
    expect(zone.querySelector("[data-figure-two]")?.textContent).toContain("also suggested 6 things");
    expect(zone.querySelector("[data-figure-one]")?.textContent).toContain("With the model on this device: 90 of 100");
    expect(zone.querySelector("[data-figures]")?.textContent).not.toContain("21 things");
  });

  it("say the figures describe invented notes and not real ones (R11.4)", () => {
    const limits = render(withFile).querySelector("[data-figures-limits]")!;
    expect(limits.textContent).toBe(strings.figures.limits);
    expect(strings.figures.limits).toMatch(/invented notes/);
    expect(strings.figures.limits).toMatch(/do not predict real use/);
  });

  it("keep the cold start line where it was, once", () => {
    expect(render(withFile).querySelectorAll("[data-cold-start]")).toHaveLength(1);
  });

  it("are not on the page before a record exists", () => {
    expect(render(withFile, false).querySelector("[data-figures]")).toBeNull();
  });
});

describe("with no catch-rate file (measurement R11.2, V2)", () => {
  it("both lines read 'not measured' and no digit from any figure is shown", () => {
    const missing: ResultsLookup = (n) => (n === "catch-rate" ? undefined : (undefined as never));
    const section = render(missing).querySelector("[data-figures]")!;
    const one = section.querySelector("[data-figure-one]")!.textContent!;
    const two = section.querySelector("[data-figure-two]")!.textContent!;
    expect(one).toMatch(/not measured/);
    expect(two).toMatch(/not measured/);
    expect(section.textContent).not.toMatch(/\d/);
  });

  it("an unreadable lookup reads 'not measured' too, with no digit", () => {
    const boom: ResultsLookup = (n) => {
      if (n === "catch-rate") throw new Error("unreadable");
      return undefined;
    };
    const section = render(boom).querySelector("[data-figures]")!;
    expect(section.textContent).toMatch(/not measured/);
    expect(section.textContent).not.toMatch(/\d/);
  });
});

describe("figure strings", () => {
  it("hold no digit and no banned word", () => {
    const all = flattenStrings(strings.figures).join("\n");
    expect(all).not.toMatch(/\d/);
    expect(all).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
  });
});

describe("the real-browser report is not bundled into the page", () => {
  it("figures.ts leaves out results/real-browser-*.json", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/app/figures.ts", "utf8")).toContain('"!/results/real-browser-*.json"');
  });
});
