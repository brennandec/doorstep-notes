// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { coldStartLine } from "../../src/app/coldStart";
import { renderScreen } from "../../src/app/screen";
import { emptyState } from "../../src/app/state";
import type { ResultsLookup } from "../../src/app/figures";

const file = (over: Record<string, unknown>): ResultsLookup => (n) =>
  n === "cold-start" ? { date: "2026-01-02", browser: "Invented Browser 1", machine: "invented laptop", ...over } : undefined;

describe("cold start figure (H8)", () => {
  it("reads 'not measured' with no results file", () => {
    expect(coldStartLine(() => undefined)).toBe("Cold start to the first record: not measured.");
  });
  it("shows the seconds with date and browser, as the author's computer, from an invented passing file", () => {
    expect(coldStartLine(file({ status: "pass", seconds: 41 }))).toBe(
      "Cold start to the first record: 41 seconds, on the author's computer (2026-01-02, Invented Browser 1). Not measured on this computer.",
    );
  });
  it("shows the seconds for a recorded failure that was over the limit, with its reason", () => {
    const line = coldStartLine(file({ status: "fail", seconds: 75, reason: "Over the target." }));
    expect(line).toContain("75 seconds");
    expect(line).toContain("on the author's computer");
  });
  it("reads 'not measured' when the check could not run, whatever the reason", () => {
    expect(coldStartLine(file({ status: "fail", reason: "The device model is not on this computer." }))).toBe("Cold start to the first record: not measured.");
    expect(coldStartLine(file({ status: "miss", reason: "Chrome absent" }))).toBe("Cold start to the first record: not measured.");
  });
  it("keeps the measured sentence and names a later attempt that did not run", () => {
    const measured = "Cold start to the first record: 13 seconds, on the author's computer (2026-11-13, Google Chrome 157.0.8103.79). Not measured on this computer.";
    const files: Record<string, Record<string, unknown>> = {
      "cold-start": { status: "pass", seconds: 13, date: "2026-11-13", browser: "Google Chrome 157.0.8103.79" },
      "cold-start-2026-11-23-h20": { status: "fail", date: "2026-11-23", browser: "none", reason: "Chrome is not installed." },
    };
    const lookup = Object.assign((n: string) => files[n], { names: () => Object.keys(files) }) as ResultsLookup;
    const line = coldStartLine(lookup);
    expect(line.startsWith(measured)).toBe(true);
    expect(line.slice(measured.length).startsWith(" Later attempt")).toBe(true);
    expect(line).toContain("did not run (`results/cold-start-2026-11-23-h20.json`)");
    expect(line).not.toBe("Cold start to the first record: not measured.");
  });
  it("reads 'not measured' when the file has no date or browser or the seconds are not a number", () => {
    expect(coldStartLine(file({ status: "pass", seconds: 41, date: undefined }))).toBe("Cold start to the first record: not measured.");
    expect(coldStartLine(file({ status: "pass", seconds: "fast" }))).toBe("Cold start to the first record: not measured.");
  });
  it("appears on the screen", () => {
    const root = document.createElement("div");
    root.append(...renderScreen(emptyState({ started: true }), { onNoteInput() {}, onListInput() {}, onTryExample() {}, onRemoveExample() {}, onGetModel() {}, onMakeRecord() {} }));
    expect(root.querySelector("[data-cold-start]")?.textContent).toBe("Cold start to the first record: not measured.");
  });
});
