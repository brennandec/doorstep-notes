// A stored device-model check is a past measurement of this project.
// It is shown only with its date and its machine. A pass file that lacks either is hidden.
// The caller paints it only while this computer has no model.
import { newestResult, type ResultsLookup } from "./figures";
import { fill, strings } from "./strings";

export const DEVICE_CHECK_FILE = "device-model-check";

/** The past measurement, then the file's own steps. Null when the file is missing, not a pass, or has no date or machine. */
export function verifiedSteps(results: ResultsLookup): string[] | null {
  const file = newestResult(results, DEVICE_CHECK_FILE) as {
    status?: unknown;
    date?: unknown;
    browser?: unknown;
    steps?: unknown;
  } | undefined;
  if (file?.status !== "pass") return null;
  const date = typeof file.date === "string" ? file.date.trim() : "";
  const machine = typeof file.browser === "string" ? file.browser.trim() : "";
  if (date === "" || machine === "") return null;
  const lines = [fill(strings.deviceCheckPast, { date, machine })];
  if (Array.isArray(file.steps)) for (const step of file.steps) if (typeof step === "string" && step !== "") lines.push(step);
  return lines;
}
