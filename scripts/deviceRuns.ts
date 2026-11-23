// Two device runs, both kept (measurement R12.3, R12.4, direction U9). No browser here.
// Before the second run writes anything, the first run's two files are copied to the -run-1
// files, and the copy refuses to overwrite either. `catch-rate.json` then holds `deviceRuns`.
import { copyFileSync, constants as fsConstants, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { strings } from "../src/app/strings";
import { applyDeviceRun, type DeviceRun, type FilePair, type RunTiming } from "./deviceScore";
import type { ResultsHeader } from "./results";

export type { DeviceRun };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

const PAIRS = [
  ["catch-rate.json", "catch-rate-run-1.json"],
  ["misses.json", "misses-run-1.json"],
] as const;

const PAIRS_2 = [
  ["catch-rate.json", "catch-rate-run-2.json"],
  ["misses.json", "misses-run-2.json"],
] as const;

const dir = (root: string) => resolve(root, "results");

/** Throws when a -run-1 file already exists. Called before a long run starts. */
export function assertFirstRunNotKept(root = process.cwd()): void {
  for (const [, kept] of PAIRS) {
    if (existsSync(join(dir(root), kept))) {
      throw new Error(`results/${kept} already kept. The first run is never overwritten; move it away by hand if a third run is meant.`);
    }
  }
}

/** Copies the first run's two files to the -run-1 files. Changes neither when it refuses. */
export function keepFirstRun(root = process.cwd()): void {
  assertFirstRunNotKept(root);
  for (const [from] of PAIRS) {
    if (!existsSync(join(dir(root), from))) throw new Error(`results/${from} is missing, so there is no first run to keep.`);
  }
  // COPYFILE_EXCL refuses if the target appeared in the meantime.
  for (const [from, kept] of PAIRS) copyFileSync(join(dir(root), from), join(dir(root), kept), fsConstants.COPYFILE_EXCL);
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);

/** The first run as an entry of `deviceRuns`: from the array if there is one, else from `device` and `merged`. */
function firstRunOf(earlier: Obj, setSize: number): Obj | undefined {
  const list = earlier["deviceRuns"];
  if (Array.isArray(list)) return list.find(isObj);
  const dev = earlier["device"];
  const merged = earlier["merged"];
  if (!isObj(dev) || !isObj(merged) || dev["status"] === "not measured") return undefined;
  const { n, date, browser, caught, total, falseMasks } = dev;
  if (num(n) === undefined || !text(date) || !text(browser) || num(caught) === undefined || num(total) === undefined || num(falseMasks) === undefined) return undefined;
  return {
    label: strings.figures.firstRunLabel,
    n, N: setSize, date, browser, caught, total, falseMasks,
    ...(num(dev["notesPerMinute"]) !== undefined ? { notesPerMinute: dev["notesPerMinute"] } : {}),
    ...(isObj(dev["byKind"]) ? { byKind: dev["byKind"] } : {}),
    merged: { caught: merged["caught"], total: merged["total"], falseMasks: merged["falseMasks"] },
  };
}

/**
 * The files after a second run. The first run stays as the first entry of `deviceRuns`; the
 * second run is the second. `device` and `merged` hold the later run, as the page shows it.
 */
export function addSecondRun(earlierCatch: Obj, earlierMisses: Obj, run: DeviceRun, header: ResultsHeader, timing: RunTiming, model?: string): FilePair {
  const setSize = num(earlierCatch["setSize"]);
  if (setSize === undefined) throw new Error("results/catch-rate.json has no setSize, so the runs cannot name N.");
  const first = firstRunOf(earlierCatch, setSize);
  const pair = applyDeviceRun(earlierCatch, earlierMisses, run, header, timing, model);
  const dev = pair.catchRate["device"];
  const merged = pair.catchRate["merged"];
  if (!isObj(dev) || !isObj(merged) || dev["status"] === "not measured") return pair;
  const second: Obj = {
    label: strings.figures.secondRunLabel,
    n: dev["n"], N: setSize, date: dev["date"], browser: dev["browser"],
    caught: dev["caught"], total: dev["total"], falseMasks: dev["falseMasks"],
    notesPerMinute: dev["notesPerMinute"],
    elapsedSeconds: dev["elapsedSeconds"],
    stoppedAtLimit: dev["stoppedAtLimit"],
    byKind: dev["byKind"],
    merged: { caught: merged["caught"], total: merged["total"], falseMasks: merged["falseMasks"] },
  };
  return { ...pair, catchRate: { ...pair.catchRate, deviceRuns: first ? [first, second] : [second] } };
}

/** Throws when a -run-2 file already exists. Called before the third run starts (measurement R13.2). */
export function assertSecondRunNotKept(root = process.cwd()): void {
  for (const [, kept] of PAIRS_2) {
    if (existsSync(join(dir(root), kept))) {
      throw new Error(`results/${kept} already kept. The second run is never overwritten; move it away by hand if a further run is meant.`);
    }
  }
}

/** Copies the current two files (which hold runs 1 and 2) to the -run-2 files. Changes neither when it refuses. */
export function keepSecondRun(root = process.cwd()): void {
  assertSecondRunNotKept(root);
  for (const [from] of PAIRS_2) {
    if (!existsSync(join(dir(root), from))) throw new Error(`results/${from} is missing, so there is no earlier run to keep.`);
  }
  for (const [from, kept] of PAIRS_2) copyFileSync(join(dir(root), from), join(dir(root), kept), fsConstants.COPYFILE_EXCL);
}

/**
 * The files after a third run. The runs already in `deviceRuns` stay as they were and the third
 * is added. `device` and `merged` hold the later run, as the page shows it. No target is set.
 */
export function addThirdRun(earlierCatch: Obj, earlierMisses: Obj, run: DeviceRun, header: ResultsHeader, timing: RunTiming, model?: string): FilePair {
  const setSize = num(earlierCatch["setSize"]);
  if (setSize === undefined) throw new Error("results/catch-rate.json has no setSize, so the runs cannot name N.");
  const earlierRuns = Array.isArray(earlierCatch["deviceRuns"]) ? earlierCatch["deviceRuns"].filter(isObj) : [];
  const pair = applyDeviceRun(earlierCatch, earlierMisses, run, header, timing, model);
  const dev = pair.catchRate["device"];
  const merged = pair.catchRate["merged"];
  if (!isObj(dev) || !isObj(merged) || dev["status"] === "not measured") return pair;
  const third: Obj = {
    label: strings.figures.thirdRunLabel,
    n: dev["n"], N: setSize, date: dev["date"], browser: dev["browser"],
    caught: dev["caught"], total: dev["total"], falseMasks: dev["falseMasks"],
    notesPerMinute: dev["notesPerMinute"],
    elapsedSeconds: dev["elapsedSeconds"],
    stoppedAtLimit: dev["stoppedAtLimit"],
    byKind: dev["byKind"],
    merged: { caught: merged["caught"], total: merged["total"], falseMasks: merged["falseMasks"] },
  };
  return { ...pair, catchRate: { ...pair.catchRate, deviceRuns: [...earlierRuns, third] } };
}

const PAIRS_3 = [
  ["catch-rate.json", "catch-rate-run-3.json"],
  ["misses.json", "misses-run-3.json"],
] as const;

/** The files that keep the fourth run as the record of the try (sixth review R6, measurement R15.2). */
export const FOURTH_RUN_FILES = ["catch-rate-run-4.json", "misses-run-4.json"] as const;

/** Throws when a -run-3 file already exists. Called before the fourth run starts (measurement R15.1). */
export function assertThirdRunNotKept(root = process.cwd()): void {
  for (const [, kept] of PAIRS_3) {
    if (existsSync(join(dir(root), kept))) {
      throw new Error(`results/${kept} already kept. The third run is never overwritten; move it away by hand if a further run is meant.`);
    }
  }
  for (const kept of FOURTH_RUN_FILES) {
    if (existsSync(join(dir(root), kept))) {
      throw new Error(`results/${kept} already kept. The fourth run is never overwritten; move it away by hand if a further run is meant.`);
    }
  }
}

/** Copies the current two files (which hold runs 1 to 3) to the -run-3 files. Changes neither when it refuses. */
export function keepThirdRun(root = process.cwd()): void {
  assertThirdRunNotKept(root);
  for (const [from] of PAIRS_3) {
    if (!existsSync(join(dir(root), from))) throw new Error(`results/${from} is missing, so there is no earlier run to keep.`);
  }
  for (const [from, kept] of PAIRS_3) copyFileSync(join(dir(root), from), join(dir(root), kept), fsConstants.COPYFILE_EXCL);
}

const dobCaught = (run: unknown): number | undefined => {
  if (!isObj(run)) return undefined;
  const kinds = run["byKind"];
  const dob = isObj(kinds) ? kinds["dob"] : undefined;
  return isObj(dob) ? num(dob["caught"]) : undefined;
};

export interface FourthRunFiles {
  /** the files as the page and the README read them: the run that stands */
  standing: FilePair;
  /** the files exactly as the fourth run wrote them, kept as `-run-4` */
  tried: FilePair;
  /** false when dates of birth found dropped below the third run's and the rule is to come out */
  ruleStands: boolean;
  /** dates of birth found by the device pass: the third run's count and the fourth's */
  dob: { third: number; fourth: number };
}

/**
 * The files after a fourth run (measurement R15.1, R15.2). The four runs sit in `deviceRuns`. When the
 * dates of birth found by the device pass drop below the third run's, the fourth entry is marked
 * `stands: false`, and `standing` keeps the third run's device, merged and misses parts, so the page and
 * the README show the run that stands. `tried` is the fourth run in full. No target is set.
 */
export function addFourthRun(earlierCatch: Obj, earlierMisses: Obj, run: DeviceRun, header: ResultsHeader, timing: RunTiming, model?: string): FourthRunFiles {
  const setSize = num(earlierCatch["setSize"]);
  if (setSize === undefined) throw new Error("results/catch-rate.json has no setSize, so the runs cannot name N.");
  const earlierRuns = Array.isArray(earlierCatch["deviceRuns"]) ? earlierCatch["deviceRuns"].filter(isObj) : [];
  const third = earlierRuns[earlierRuns.length - 1];
  const thirdDob = dobCaught(third);
  if (thirdDob === undefined) throw new Error("The third run in results/catch-rate.json has no count of dates of birth, so the rule cannot be judged.");
  const pair = applyDeviceRun(earlierCatch, earlierMisses, run, header, timing, model);
  const dev = pair.catchRate["device"];
  const merged = pair.catchRate["merged"];
  if (!isObj(dev) || !isObj(merged) || dev["status"] === "not measured") {
    // A miss: the earlier runs stand and nothing is kept as a fourth run.
    return { standing: { catchRate: earlierCatch, misses: earlierMisses }, tried: pair, ruleStands: true, dob: { third: thirdDob, fourth: thirdDob } };
  }
  const fourthDob = dobCaught(dev);
  if (fourthDob === undefined) throw new Error("The fourth run has no count of dates of birth, so the rule cannot be judged.");
  const ruleStands = fourthDob >= thirdDob;
  const fourth: Obj = {
    label: strings.figures.fourthRunLabel,
    n: dev["n"], N: setSize, date: dev["date"], browser: dev["browser"],
    caught: dev["caught"], total: dev["total"], falseMasks: dev["falseMasks"],
    notesPerMinute: dev["notesPerMinute"],
    elapsedSeconds: dev["elapsedSeconds"],
    stoppedAtLimit: dev["stoppedAtLimit"],
    byKind: dev["byKind"],
    merged: { caught: merged["caught"], total: merged["total"], falseMasks: merged["falseMasks"] },
    ...(ruleStands ? {} : { stands: false, rule: "date-word rule (masking R19), taken out again because dates of birth found dropped below the third run" }),
  };
  const deviceRuns = [...earlierRuns, fourth];
  const tried: FilePair = { catchRate: { ...pair.catchRate, deviceRuns }, misses: pair.misses };
  const standing: FilePair = ruleStands ? tried : { catchRate: { ...earlierCatch, deviceRuns }, misses: earlierMisses };
  return { standing, tried, ruleStands, dob: { third: thirdDob, fourth: fourthDob } };
}
