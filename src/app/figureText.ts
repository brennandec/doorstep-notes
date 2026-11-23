// Figure text for the page and the README (measurement R4.3, R6.3, R6.4, R7).
// Every figure is built from a results file. A missing file, a missing field, a
// field of the wrong type or a number that cannot be right gives "not measured".
// No number is written here. This file reads no browser API and no Vite feature,
// so the README writer can use it in Node.
import { coldStartLine } from "./coldStart";
import { requestWords, withCommas } from "./countWords";
import { attemptDate, attemptOutcome, attemptReason, laterAttemptClause, shortDate } from "./laterAttempt";
import { datedResultNames, newestResultName } from "./newest";
import type { ResultsLookup } from "./figures";
import { fill, strings } from "./strings";

export type FigureId = "exact" | "near" | "exactAndNear" | "device" | "merged" | "coldStart";

export const FIGURE_IDS: FigureId[] = ["exact", "near", "exactAndNear", "device", "merged", "coldStart"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function safeLookup(lookup: ResultsLookup, name: string): Obj | undefined {
  try {
    const f = lookup(name);
    return isObj(f) ? f : undefined;
  } catch {
    return undefined;
  }
}

function withStop(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

interface Parsed {
  caught: number;
  total: number;
  falseMasks: number;
}

function parseScore(v: unknown): Parsed | undefined {
  if (!isObj(v)) return undefined;
  const { caught, total, falseMasks } = v;
  if (!isCount(caught) || !isCount(total) || !isCount(falseMasks) || caught > total) return undefined;
  return { caught, total, falseMasks };
}

function notMeasured(id: Exclude<FigureId, "coldStart">, reason?: string): string {
  const label = strings.figures.labels[id];
  return reason ? fill(strings.figures.notMeasuredWhy, { label, reason: withStop(reason) }) : fill(strings.figures.notMeasured, { label });
}

function reasonOf(part: unknown): string | undefined {
  return isObj(part) && part["status"] === "not measured" && isText(part["reason"]) ? part["reason"] : undefined;
}

function pass(id: "exact" | "near" | "exactAndNear", file: Obj): string {
  const s = parseScore(file[id]);
  if (!s || !isText(file["date"]) || !isText(file["browser"])) return notMeasured(id);
  return fill(strings.figures[id], { ...s, date: shortDate(file["date"]), browser: file["browser"] });
}

function devicePass(id: "device" | "merged", file: Obj): string {
  const part = file[id];
  const s = parseScore(part);
  const setSize = file["setSize"];
  if (!s || !isObj(part) || !isCount(setSize)) return notMeasured(id, reasonOf(part));
  const n = part["n"];
  // A device figure names its n and N, and carries the date and browser of its own run.
  if (!isCount(n) || n < 1 || n > setSize || !isText(part["date"]) || !isText(part["browser"])) return notMeasured(id);
  return fill(strings.figures[id], { ...s, n, N: setSize, date: shortDate(part["date"]), browser: part["browser"] });
}

/** When the file holds `deviceRuns`, the device and merged parts are those of the later run. */
function withLatestRun(file: Obj): Obj {
  if (!Array.isArray(file["deviceRuns"])) return file;
  const r = standingRun(runsOf(file));
  if (!r) return { ...file, device: undefined, merged: undefined };
  const own = { n: r.n, date: r.date, browser: r.browser };
  return {
    ...file,
    setSize: r.N,
    device: { ...own, caught: r.caught, total: r.total, falseMasks: r.falseMasks },
    merged: { ...own, ...r.merged },
  };
}

/** 1033 shows as "1,033". */
const grouped = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** One device run, as the file keeps it (measurement R12.4). */
export interface DeviceRunFigure {
  label: string;
  n: number;
  N: number;
  date: string;
  browser: string;
  /** the device pass alone */
  caught: number;
  total: number;
  falseMasks: number;
  /** all passes together, on the same notes */
  merged: Parsed;
  /** false when the run tried a rule that was then taken out; the page and the README show the last run that stands */
  stands: boolean;
  /** dates of birth found by the device pass in this run, when the file holds them */
  dob?: { caught: number; total: number };
}

function parseRun(v: unknown): DeviceRunFigure | undefined {
  if (!isObj(v)) return undefined;
  const own = parseScore(v);
  const merged = parseScore(v["merged"]);
  const { label, n, N, date, browser } = v;
  if (!own || !merged || !isText(label) || !isCount(n) || !isCount(N) || n < 1 || n > N || !isText(date) || !isText(browser)) return undefined;
  const kinds = v["byKind"];
  const dobRaw = isObj(kinds) ? parseDob(kinds["dob"]) : undefined;
  return { label, n, N, date, browser, ...own, merged, stands: v["stands"] !== false, ...(dobRaw ? { dob: dobRaw } : {}) };
}

function parseDob(v: unknown): { caught: number; total: number } | undefined {
  if (!isObj(v) || !isCount(v["caught"]) || !isCount(v["total"])) return undefined;
  return { caught: v["caught"], total: v["total"] };
}

/** A run kept the old way, in `device` and `merged` of the file, before `deviceRuns` existed. */
function legacyRun(file: Obj): DeviceRunFigure | undefined {
  const part = file["device"];
  const all = file["merged"];
  const setSize = file["setSize"];
  const own = parseScore(part);
  const merged = parseScore(all);
  if (!isObj(part) || !own || !merged || !isCount(setSize)) return undefined;
  const { n, date, browser } = part;
  if (!isCount(n) || n < 1 || n > setSize || !isText(date) || !isText(browser)) return undefined;
  return { label: strings.figures.firstRunLabel, n, N: setSize, date, browser, ...own, merged, stands: true };
}

/** The last run that stands: a run that tried a rule and was taken out again is kept in the file but not shown. */
function standingRun(runs: DeviceRunFigure[]): DeviceRunFigure | undefined {
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i]!.stands) return runs[i];
  return undefined;
}

function runsOf(file: Obj): DeviceRunFigure[] {
  const list = file["deviceRuns"];
  if (Array.isArray(list)) return list.map(parseRun).filter((r): r is DeviceRunFigure => r !== undefined);
  const one = legacyRun(file);
  return one ? [one] : [];
}

/** The device runs in `results/catch-rate.json`, oldest first. Malformed entries are left out. */
export function deviceRuns(lookup: ResultsLookup): DeviceRunFigure[] {
  const file = safeLookup(lookup, "catch-rate");
  return file ? runsOf(file) : [];
}

const RUN_NAMES = (): string[] => [strings.figures.runFirst, strings.figures.runSecond, strings.figures.runThird, strings.figures.runFourth];

/**
 * The runs side by side (the last four at most), or null when the file does not hold two (measurement R12.4, R13.3).
 * A run that tried a rule and was taken out again is named in one more sentence, with the run whose figures stand.
 */
export function compareRuns(runs: DeviceRunFigure[]): string | null {
  if (runs.length < 2) return null;
  const f = strings.figures;
  const names = RUN_NAMES();
  const first = Math.max(0, runs.length - names.length);
  const shown = runs.slice(first).map((r, i) => ({ r, name: names[i]! }));
  const list = (pick: (r: DeviceRunFigure) => number) => shown.map(({ r, name }) => `${name} ${grouped(pick(r))}`).join(", ");
  const line = fill(f.compareRuns, { falseMasks: list((r) => r.falseMasks), caught: list((r) => r.caught) });
  const tried = shown.filter(({ r }) => !r.stands);
  const stands = shown.filter(({ r }) => r.stands).pop();
  if (tried.length === 0 || !stands) return line;
  const t = tried[tried.length - 1]!;
  const before = stands.r.dob;
  const after = t.r.dob;
  const dob = before && after ? { before: grouped(before.caught), after: grouped(after.caught) } : { before: "not measured", after: "not measured" };
  return `${line} ${fill(f.triedRuleOut, { tried: t.name, stands: stands.name, ...dob })}`;
}

/**
 * The two lines under Masking and in the README (measurement R11.1). Line one is her list alone
 * (the exact and near passes together, from Node) and the model with it (all passes, from the
 * later device run). Line two is the device pass's false masks. A part that cannot be read reads
 * "not measured", and the other part is kept.
 */
export function screenFigureLines(lookup: ResultsLookup): { one: string; two: string } {
  const f = strings.figures;
  const file = safeLookup(lookup, "catch-rate");
  const list = file ? parseScore(file["exactAndNear"]) : undefined;
  const setSize = file ? file["setSize"] : undefined;
  const listOk = file !== undefined && list !== undefined && isCount(setSize) && isText(file["date"]) && isText(file["browser"]);
  const runs = file ? runsOf(file) : [];
  const run = standingRun(runs);

  const parts: string[] = [];
  if (listOk) {
    parts.push(fill(f.listAlone, { N: setSize, caught: grouped(list.caught), total: grouped(list.total), date: shortDate(file["date"] as string), browser: file["browser"] as string }));
  } else parts.push(f.listAloneNot);
  if (run) {
    parts.push(fill(f.withModel, { caught: grouped(run.merged.caught), total: grouped(run.merged.total), n: run.n, N: run.N, date: shortDate(run.date), browser: run.browser }));
  } else parts.push(f.withModelNot);
  if (listOk || run) parts.push(f.measuredOn);

  const two = run
    ? fill(run.falseMasks === 1 ? f.needlessOne : f.needless, { count: grouped(run.falseMasks), n: run.n, N: run.N, date: shortDate(run.date), browser: run.browser })
    : f.needlessNot;
  return { one: parts.join(" "), two };
}

export function figureText(id: FigureId, lookup: ResultsLookup): string {
  if (id === "coldStart") {
    try {
      return coldStartLine(lookup);
    } catch {
      return strings.coldStart.notMeasured;
    }
  }
  const file = safeLookup(lookup, "catch-rate");
  if (!file) return notMeasured(id);
  return id === "device" || id === "merged" ? devicePass(id, withLatestRun(file)) : pass(id, file);
}

export function figureLines(lookup: ResultsLookup): { id: FigureId; text: string }[] {
  return FIGURE_IDS.map((id) => ({ id, text: figureText(id, lookup) }));
}

/**
 * The status lines about the cloud half (measurement R16.1), one per results file: the cloud draft,
 * "Shorter" and the second reader. Each carries its file's date and browser. A file that is missing or
 * unreadable reads "not measured"; a run that did not answer HTTP 200 says so and does not read as connected.
 */
export function cloudStatusLines(lookup: ResultsLookup): string[] {
  const s = strings.cloudStatus;
  const OK = 200;
  const common = (file: Obj) => ({ status: String(file["status"]), date: shortDate(String(file["date"])), browser: String(file["browser"]) });
  const readable = (file: Obj | undefined): file is Obj => file !== undefined && isText(file["date"]) && isText(file["browser"]) && typeof file["status"] === "number";

  // H20: a new run of a check writes a new dated record; the newest one is read, the old name when there is none.
  const newestOf = (base: string, legacy: string): string => {
    const n = newestResultName(lookup, base);
    return safeLookup(lookup, n) !== undefined ? n : legacy;
  };
  const line = (name: string, what: string, ok: (file: Obj) => string | undefined, base: string = name): string => {
    const file = safeLookup(lookup, newestOf(base, name));
    if (!readable(file)) return fill(s.notMeasured, { what });
    if (file["status"] !== OK) return fill(s.notAnswered, { what, ...common(file), ok: String(OK) });
    return ok(file) ?? fill(s.notMeasured, { what });
  };

  return [
    line("cloud-draft-2026-11-14", s.cloudDraft, (f) =>
      isText(f["model"]) && isText(f["label"]) ? fill(s.cloudDraftOk, { ...common(f), model: f["model"], label: f["label"] }) : undefined,
      "cloud-draft",
    ),
    line("rewrite-real-service", s.shorter, (f) =>
      isCount(f["sentenceSentChars"]) && isCount(f["sentenceShownChars"])
        ? fill(s.shorterOk, { ...common(f), from: f["sentenceSentChars"], to: f["sentenceShownChars"] })
        : undefined,
    ),
    line("second-reader-real-service", s.reader, (f) => {
      const [mb, mr, ab, ar] = [f["bytesToModel"], f["requestsToModel"], f["bytesIncludingAppCheck"], f["requestsIncludingAppCheck"]];
      if (!isCount(mb) || !isCount(mr) || !isCount(ab) || !isCount(ar)) return undefined;
      return fill(s.readerOk, {
        ...common(f),
        modelCount: fill(strings.secondReader.passModelCount, { bytes: withCommas(mb), requests: requestWords(mr) }),
        allCount: fill(strings.secondReader.passAllCount, { bytes: withCommas(ab), requests: requestWords(ar) }),
      });
    }),
    ...dated2(lookup),
  ];
}

const NOT_A_RUN = new Set(["none", "not run"]);

/** A pass the status line can show: status pass, a date, a browser that ran, and the field that line requires. */
function shownPass(file: Obj | undefined, kind: "both" | "cut"): file is Obj {
  if (!file || file["status"] !== "pass" || !isText(file["date"]) || !isText(file["browser"])) return false;
  if (NOT_A_RUN.has(String(file["browser"]))) return false;
  return kind === "both" ? isText(file["hybridRun"]) : isText(file["label"]);
}

/** One clause for the newest attempt that is newer than the pass on this line. */
function laterClause(name: string, file: Obj): string {
  return laterAttemptClause(name, file);
}

/**
 * The two lines of session H15. Each line shows the newest pass that names a date and a browser.
 * A newer attempt that did not run, or did not pass, is a second clause on that same line.
 * A miss does not replace the pass, and the pass does not hide the miss.
 * With no such pass, a fail that names a date and a browser is printed as a fail.
 * A dated miss with no pass names its date and reason. Anything else reads "not measured".
 */
function dated2(lookup: ResultsLookup): string[] {
  const s = strings.cloudStatus;
  const line = (base: string, kind: "both" | "cut", what: string, ok: string, failed: string): string => {
    const dated = datedResultNames(lookup, base)
      .map((name) => ({ name, file: safeLookup(lookup, name) }))
      .filter((row): row is { name: string; file: Obj } => row.file !== undefined);
    const passAt = dated.findIndex((row) => shownPass(row.file, kind));
    if (passAt >= 0) {
      const pass = dated[passAt]!;
      const head = { status: "pass", date: shortDate(String(pass.file["date"])), browser: String(pass.file["browser"]) };
      const text = kind === "cut"
        ? fill(ok, { ...head, label: String(pass.file["label"]) })
        : fill(ok, head);
      const newer = dated[0];
      return passAt === 0 || !newer ? text : `${text}${laterClause(newer.name, newer.file)}`;
    }
    const top = dated[0];
    const failHead = top
      && top.file["status"] === "fail"
      && isText(top.file["date"])
      && isText(top.file["browser"])
      && !NOT_A_RUN.has(String(top.file["browser"]))
      && (kind === "both" ? isText(top.file["hybridRun"]) : isText(top.file["label"]))
      ? { status: "fail", date: shortDate(String(top.file["date"])), browser: String(top.file["browser"]) }
      : undefined;
    if (top && failHead) {
      return kind === "cut" ? fill(failed, { ...failHead, label: String(top.file["label"]) }) : fill(failed, failHead);
    }
    if (top) {
      const date = attemptDate(top.name, top.file);
      if (date) {
        return fill(s.datedAttempt, {
          what,
          date,
          outcome: attemptOutcome(top.file),
          file: `${top.name}.json`,
          reason: attemptReason(top.file),
        });
      }
    }
    return fill(s.notMeasured, { what });
  };
  return [
    line("h2-part-b", "both", s.bothHalves, s.bothHalvesOk, s.bothHalvesFailed),
    line("draft-network-drop", "cut", s.cutCall, s.cutCallOk, s.cutCallFailed),
  ];
}

/**
 * The line that keeps ruling 2: shown until H2 part B has passed, and it says what has not run. It reads the newest
 * dated part B record (session H15), falling back to `results/h2-part-b.json`. A newest record that did not pass says
 * so, with its date, instead of saying the run has not happened. A dated pass the status line can show removes this
 * line, including when a newer attempt did not pass. That attempt is the second clause on the status line.
 */
export function notCheckedLine(lookup: ResultsLookup): string | null {
  const datedPass = datedResultNames(lookup, "h2-part-b").some((name) => shownPass(safeLookup(lookup, name), "both"));
  if (datedPass) return null;
  const name = newestResultName(lookup, "h2-part-b");
  const file = safeLookup(lookup, name);
  if (file?.["status"] === "pass") return null;
  const part = `part B, \`results/${name}.json\``;
  if (name !== "h2-part-b" && isText(file?.["date"])) {
    return `${strings.standing.h2NotChecked} ${fill(strings.standing.h2RanNotPassed, { part, date: shortDate(String(file!["date"])) })}`;
  }
  return `${strings.standing.h2NotChecked} ${fill(strings.standing.h2NotRun, { part: "part B, `results/h2-part-b.json`" })}`;
}
