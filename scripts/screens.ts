// The fourteen screenshot names of the second to sixth reviews (shell-and-offline R23, R26, R31, R37, R40) and the check on
// `results/screens.json`. Reads files only. The screenshots are taken by real-browser tasks 39, 40, 44, 61, 72 and 81.
import { existsSync } from "node:fs";
import { join } from "node:path";

export const SCREEN_NAMES = [
  "01-first-run",
  "02-note-record-masks",
  "03-outgoing-egress-pass",
  "04-egress-fail-seeded",
  "05-finished-note",
  "06-offline",
  "07-stacked-1024",
  "08-device-record",
  "09-device-masks",
  "10-whole-journey-device",
  "11-whole-journey-all-accepted",
  "12-after-reload-offline",
  "13-egress-fail-card",
  "14-send-blocked",
] as const;

/**
 * The names `results/screens.json` may hold: the fourteen, the second reader's screen from the real service, which the
 * hybrid run retakes through holdScreen (H20 R9), and, from H23, screens 16 and 18, which the Shorter and loop specs retake
 * through holdScreen only when RETAKE_SCREENS names them.
 */
export const SCREEN_NAMES_IN_FILE: readonly string[] = [
  ...SCREEN_NAMES,
  "17-second-reader-real-service",
  "16-shorter-real-service",
  "18-second-reader-ask-again",
];
/** The names whose png is missing from the folder. */
export function missingScreens(folder = "docs/screens"): string[] {
  return SCREEN_NAMES.filter((n) => !existsSync(join(folder, `${n}.png`)));
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.trim() !== "";

/** Problems found in a parsed `results/screens.json`; an empty list means it is sound. */
export function screensProblems(file: unknown): string[] {
  if (!isObj(file) || !isObj(file["screens"])) return ["The file has no 'screens' object."];
  const screens = file["screens"];
  const out: string[] = [];
  for (const [name, entry] of Object.entries(screens)) {
    if (!SCREEN_NAMES_IN_FILE.includes(name)) out.push(`${name}: not one of the fourteen names.`);
    if (!isObj(entry)) {
      out.push(`${name}: not an object.`);
      continue;
    }
    if (!text(entry["date"])) out.push(`${name}: no date.`);
    if (!text(entry["browser"])) out.push(`${name}: no browser.`);
    const vp = entry["viewport"];
    if (!isObj(vp) || typeof vp["width"] !== "number" || typeof vp["height"] !== "number") out.push(`${name}: no viewport.`);
    if (typeof entry["scrollY"] !== "number") out.push(`${name}: no scroll position.`);
    else if (name === "10-whole-journey-device" && entry["scrollY"] !== 0) out.push(`${name}: scroll position is not 0.`);
  }
  return out;
}
