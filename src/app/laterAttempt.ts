// The clause a README line may gain when a newer attempt did not run or did not pass.
// The committed sentence stays the prefix. The clause starts with the words "Later attempt".
import type { ResultFile } from "./figures";
import { fill, strings } from "./strings";

const NOT_A_RUN = new Set(["none", "not run"]);

export function shortDate(date: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(date) ? date.slice(0, 10) : date;
}

function withStop(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function isText(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function dateInName(name: string): string | undefined {
  return /-(\d{4}-\d{2}-\d{2})(?:-|$)/.exec(name)?.[1];
}

export function attemptDate(name: string, file: ResultFile): string | undefined {
  return isText(file["date"]) ? shortDate(String(file["date"])) : dateInName(name);
}

/** "did not run" when the record says the check never started. Anything else that is not a pass did not pass. */
export function attemptOutcome(file: ResultFile): "did not run" | "did not pass" {
  const browser = isText(file["browser"]) ? String(file["browser"]) : "";
  if (file["status"] === "miss" || browser === "" || NOT_A_RUN.has(browser)) return "did not run";
  return "did not pass";
}

export function attemptReason(file: ResultFile): string {
  return isText(file["reason"]) ? `: ${withStop(String(file["reason"]))}` : ".";
}

/** Empty when the record has no date. Otherwise a clause whose first words are "Later attempt". */
export function laterAttemptClause(name: string, file: ResultFile): string {
  const date = attemptDate(name, file);
  if (!date) return "";
  return fill(strings.cloudStatus.laterAttempt, {
    date,
    outcome: attemptOutcome(file),
    file: `${name}.json`,
    reason: attemptReason(file),
  });
}
