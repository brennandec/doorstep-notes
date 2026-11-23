import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { verifiedSteps } from "../../src/app/firstRun";
import { strings } from "../../src/app/strings";
import type { ResultsLookup } from "../../src/app/figures";

const lookup = (file: Record<string, unknown> | undefined): ResultsLookup =>
  (name) => (name === "device-model-check" ? file as never : undefined);

describe("stored device-model check", () => {
  it("is hidden when the pass file has no date or no machine", () => {
    expect(verifiedSteps(lookup({ status: "pass", chromeVersion: "999.0", steps: ["ready"] }))).toBeNull();
    expect(verifiedSteps(lookup({ status: "pass", date: "2026-11-13", steps: ["ready"] }))).toBeNull();
    expect(verifiedSteps(lookup({ status: "pass", browser: "Chrome", steps: ["ready"] }))).toBeNull();
    expect(verifiedSteps(lookup({ status: "pass", date: "  ", browser: "Chrome" }))).toBeNull();
    expect(verifiedSteps(lookup({ status: "fail", date: "2026-11-13", browser: "Chrome" }))).toBeNull();
    expect(verifiedSteps(lookup(undefined))).toBeNull();
  });

  it("leads with the project's past measurement, then the file's own steps", () => {
    const steps = verifiedSteps(lookup({
      status: "pass",
      date: "2026-11-13",
      browser: "Google Chrome 999.0",
      steps: ["The browser reported the device model as ready, with no Chrome flag set."],
    }));
    expect(steps?.[0]).toBe(strings.deviceCheckPast
      .replace("{date}", "2026-11-13")
      .replace("{machine}", "Google Chrome 999.0"));
    expect(steps?.[0]).toContain("Not measured on this computer");
    expect(steps?.[1]).toContain("reported the device model as ready");
  });

  it("frames the shipped check by its own date and machine", () => {
    const path = join(dirname(fileURLToPath(import.meta.url)), "../../results/device-model-check.json");
    const file = JSON.parse(readFileSync(path, "utf8")) as { date: string; browser: string; steps: string[] };
    const steps = verifiedSteps(lookup(file));
    expect(steps?.[0]).toContain(file.date);
    expect(steps?.[0]).toContain(file.browser);
    expect(steps?.[0]).toContain("Not measured on this computer");
    expect(steps?.slice(1)).toEqual(file.steps);
  });
});