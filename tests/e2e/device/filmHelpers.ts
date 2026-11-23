// Shared pure validators, hosted helpers, and video decoder for H36b filmRehearsal & filmRun.
import { chromium, type Page } from "@playwright/test";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { findBareColonMarks } from "../../../src/drafting/restoreDraft";
import { findWholeWords } from "../../../src/masking/fold";
import { tagsIn } from "../../../src/masking/tags";
import { normalizeTokens, TOKEN_ROLES } from "../../../src/masking/tokenForms";
import { redactedPath, type RecordedRequest } from "../fixtures/deviceModel";
import type { ServedBundleIdentity } from "../fixtures/records";
import { draftProblems } from "./hybridSupport";
import { hasCopiedRecordLabel } from "./n3Audit";

/** H44b 3: stricter than the device rule, on purpose: any record label followed by a colon, anywhere, in any case. */
const FILM_LABEL_ANYWHERE_RE = /\b(?:Visit[ \t]+date|Present|Seen|Agreed|Risks|Next[ \t]+steps)[ \t]*[*_]*:/i;

export interface FrameCheck {
  atS: number;
  width: number;
  height: number;
  rightGreyPct: number;
  bottomGreyPct: number;
  fills: boolean;
}

export interface BoxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const A5_PRONOUN_WARNING = "Check this sentence: a pronoun may point at the wrong person.";
export const UNREAD_MARK_LINE = "The model left a mark the app could not read. Read the note before you copy.";
export const REQUIRED_LEDGER_MODES = ["ONLY_ON_DEVICE", "PREFER_ON_DEVICE", "PREFER_IN_CLOUD", "ONLY_IN_CLOUD"] as const;
export const TAKE_SUFFIXES = ["h36", "h36-2", "h36-3", "h36-4", "h36-5", "h36-6", "h36-7", "h36-8", "h36-9"] as const;
export type FilmTakeSuffix = (typeof TAKE_SUFFIXES)[number];
export const H37_TAKE_SUFFIXES = ["h37-1", "h37-2", "h37-3", "h37-4"] as const;
export type H37TakeSuffix = (typeof H37_TAKE_SUFFIXES)[number];
export const H39_TAKE_SUFFIXES = ["h39-1", "h39-2", "h39-3", "h39-4", "h39-5"] as const;
export type H39TakeSuffix = (typeof H39_TAKE_SUFFIXES)[number];
export const H42_TAKE_SUFFIXES = [
  "h42-1", "h42-2", "h42-3", "h42-4", "h42-5", "h42-6",
  "h42-7", "h42-8", "h42-9", "h42-10", "h42-11", "h42-12",
] as const;
export type H42TakeSuffix = (typeof H42_TAKE_SUFFIXES)[number];
export const NO_DROP_STOP_STATUS = "stopped: no dropped line" as const;
export const FILM_RAW_DIR_ENV = "DOORSTEP_FILM_RAW_DIR";

/** Resolves symlinks on the deepest existing ancestor (or dangling symlink) + remaining relative tail. */
function resolveWithSymlinks(targetPath: string, depth = 0): string {
  const abs = resolve(targetPath);
  if (depth > 40) return abs;
  let probe = abs;
  const tail: string[] = [];
  while (!existsSync(probe)) {
    try {
      const stat = lstatSync(probe);
      if (stat.isSymbolicLink()) {
        const linked = resolve(dirname(probe), readlinkSync(probe));
        const resolvedLinked = resolveWithSymlinks(linked, depth + 1);
        return tail.length > 0 ? join(resolvedLinked, ...tail) : resolvedLinked;
      }
    } catch {
      // path segment does not exist yet
    }
    const parent = dirname(probe);
    if (parent === probe) break;
    tail.unshift(basename(probe));
    probe = parent;
  }
  const base = existsSync(probe) ? realpathSync(probe) : probe;
  return tail.length > 0 ? join(base, ...tail) : base;
}

function assertRawRootOutsideRepo(rawPath: string, cwd = process.cwd()): string {
  const resolvedRoot = resolve(rawPath);
  const resolvedCwd = resolve(cwd);
  const realRoot = resolveWithSymlinks(resolvedRoot);
  const realCwd = resolveWithSymlinks(resolvedCwd);
  const rel = relative(realCwd, realRoot);
  if (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\")) {
    throw new Error(`${FILM_RAW_DIR_ENV} (${resolvedRoot} -> ${realRoot}) must point outside the repo (${realCwd}).`);
  }
  return resolvedRoot;
}

export function requireFilmRawRoot(
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): string {
  const raw = (env[FILM_RAW_DIR_ENV] ?? "").trim();
  if (!raw) {
    throw new Error(`${FILM_RAW_DIR_ENV} is required and must point to an external folder outside the repo.`);
  }
  return assertRawRootOutsideRepo(raw, cwd);
}

export interface FilmObservation {
  step: string;
  rule: string;
  seen: string;
}

const escRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LISTED_NAMES: string[] = inventedVisit.clientList.split("\n").flatMap((line) => {
  const [name, alt] = line.split(";").map((s) => s.trim());
  return [name ?? "", ...(alt ?? "").split(",").map((s) => s.trim())].filter((s) => s !== "");
});

/** Whole-word matches for listed names and alternate names from the invented client list. */
export function listedInNote(text: string): string[] {
  return LISTED_NAMES.filter((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escRe(n)}(?![\\p{L}\\p{N}])`, "iu").test(text));
}

/** True when any item contains the sister's name ("Bea") as a whole token. */
export const holdsBeaIn = (items: readonly string[]): boolean => items.some((t) => /(?<![\p{L}\p{N}])Bea(?![\p{L}\p{N}])/u.test(t));

/** True when any item contains the visit date of birth ("3/3/87"). */
export const holdsDobIn = (items: readonly string[]): boolean => items.some((t) => t.includes("3/3/87"));

const clean = (t: string): string => t.replace(/\s+/g, " ").trim();
const first = (e: unknown): string => String((e as Error).message ?? e).split("\n")[0] ?? "failed";

/** Reads and validates docs/submission/links.json hostedPage (no trailing slash). */
export function readHostedOrigin(): { ok: true; hostedPage: string; hostedOrigin: string } | { ok: false; reason: string } {
  let hostedPage: unknown;
  try {
    hostedPage = JSON.parse(readFileSync("docs/submission/links.json", "utf8")).hostedPage;
  } catch {
    return { ok: false, reason: "docs/submission/links.json could not be read" };
  }
  if (typeof hostedPage !== "string" || !/^https:\/\/[a-z0-9.-]+$/.test(hostedPage)) {
    return { ok: false, reason: "hostedPage in docs/submission/links.json is not a valid https origin" };
  }
  return { ok: true, hostedPage, hostedOrigin: `${hostedPage}/` };
}

/** Captures hosted bundle identity (folder "hosted", module entry chunk, last-modified/date header). */
export async function extractServedBundle(page: Page, chunkHeaders: ReadonlyMap<string, string>): Promise<ServedBundleIdentity> {
  const src = await page.evaluate(() => document.querySelector('script[type="module"][src]')?.getAttribute("src") ?? "");
  const mainChunk = src.replace(/^https?:\/\/[^/]+/, "").replace(/^\.?\//, "").replace(/[?#].*$/, "");
  const header = chunkHeaders.get(`/${mainChunk}`) ?? "";
  const parsed = header === "" ? NaN : Date.parse(header);
  return {
    folder: "hosted",
    mainChunk: mainChunk === "" ? "unknown" : mainChunk,
    buildTime: Number.isNaN(parsed) ? "unknown" : new Date(parsed).toISOString(),
  };
}

/** Counts pronoun tokens naming the nearest previous tag in the same sentence (observation only per A6). */
export function tokensNamingThePreviousTag(text: string): { total: number; byRole: Record<string, number> } {
  const byRole: Record<string, number> = Object.fromEntries(TOKEN_ROLES.map((r) => [r, 0]));
  let total = 0;
  const mention = new RegExp(String.raw`\{(${TOKEN_ROLES.join("|")}):((?:Person|Place|Date|Detail) \d+)\}|\[((?:Person|Place|Date|Detail) \d+)\]`, "gi");
  for (const sentence of normalizeTokens(text).split(/(?<=[.!?])\s+|\r?\n+/)) {
    let previous: string | null = null;
    for (const m of sentence.matchAll(mention)) {
      const label = (m[2] ?? m[3])!.toLowerCase();
      if (m[1] !== undefined && previous === label) {
        byRole[m[1].toLowerCase()]!++;
        total++;
      }
      previous = label;
    }
  }
  return { total, byRole };
}

/** Finds doubled words: "X or X", "X/X", and adjacent repeats such as "she she" or "he he". */
export function doublesInText(text: string): string[] {
  const hits: string[] = [];
  const orSlash = /(?<![\p{L}])(\p{L}+)(?:\s+or\s+|\s*\/\s*)\1(?![\p{L}])/giu;
  for (const m of text.matchAll(orSlash)) {
    hits.push(m[0]);
  }
  const adjacent = /(?<![\p{L}])(\p{L}+)(?:\s+\1)+(?![\p{L}])/giu;
  for (const m of text.matchAll(adjacent)) {
    hits.push(m[0]);
  }
  return [...new Set(hits)];
}

/** H36g `a` (privacy): stops if What leaves holds Bea, 3/3/87, or a listed name after masking. */
export function privacyWhatLeavesProblems(step: string, text: string): string[] {
  const out: string[] = [];
  if (holdsBeaIn([text])) out.push(`${step}: What leaves held Bea after masking`);
  if (holdsDobIn([text])) out.push(`${step}: What leaves held 3/3/87 after masking`);
  const listed = listedInNote(text);
  if (listed.length > 0) out.push(`${step}: What leaves held listed name(s): ${listed.join(", ")}`);
  return out;
}

/**
 * H36g `b` (page fault lines under the note + bracket or brace on the sheet): stops ONLY on
 * "Not put back:", "Added by the model:", the wrong-person line, the unreadable-mark line,
 * or `[` `]` `{` `}` anywhere on `[data-sheet]`. Every other `.sheet-notes` item goes to `observedNotes`.
 */
export function classifySheetFaults(input: {
  sheetText: string;
  noteItems: readonly string[];
}): { stops: string[]; observedNotes: string[] } {
  const stops: string[] = [];
  const observedNotes: string[] = [];
  for (const item of input.noteItems) {
    if (
      item.startsWith("Not put back:") ||
      item.startsWith("Added by the model:") ||
      item.includes(A5_PRONOUN_WARNING) ||
      item.includes(UNREAD_MARK_LINE)
    ) {
      stops.push(`page fault line under note: ${item}`);
    } else {
      observedNotes.push(item);
    }
  }
  const bracketAt = input.sheetText.search(/[[\]{}]/);
  if (bracketAt !== -1) {
    const around = input.sheetText.slice(Math.max(0, bracketAt - 30), bracketAt + 31).replace(/\r?\n/g, " / ");
    stops.push(`bracket or brace (${input.sheetText[bracketAt]}) on the sheet in "${around}"`);
  }
  const colonHits = findBareColonMarks(input.sheetText);
  if (colonHits.length > 0) {
    stops.push(`word:Role mark (${colonHits[0]}) on the sheet`);
  }
  return { stops, observedNotes };
}

export interface FilmCandidateMark {
  candidate: boolean;
  reasons: string[];
}

/**
 * H44 item 3: a take is a candidate for the film only when its cloud draft carries no copied record label and
 * the sheet shows no warning line. A warning line is a note the walk already stops on (see classifySheetFaults) or
 * any line that starts "Check this sentence:" (the wrong-person line and the copied-label line). The mark is written
 * into the take's own record; it never changes `status`.
 */
export function filmCandidateMark(input: { finishedText: string | null; noteItems: readonly string[] | null }): FilmCandidateMark {
  const reasons: string[] = [];
  if (input.finishedText === null || input.finishedText === "") {
    reasons.push("no finished cloud note in this record");
  } else if (hasCopiedRecordLabel(input.finishedText) || FILM_LABEL_ANYWHERE_RE.test(input.finishedText)) {
    reasons.push("the cloud draft carries a copied record label");
  }
  for (const item of input.noteItems ?? []) {
    const isWarning =
      item.startsWith("Check this sentence:") ||
      item.startsWith("Not put back:") ||
      item.startsWith("Added by the model:") ||
      item.includes(A5_PRONOUN_WARNING) ||
      item.includes(UNREAD_MARK_LINE);
    if (isWarning) reasons.push(`warning line on the sheet: ${item}`);
  }
  return { candidate: reasons.length === 0, reasons };
}

/**
 * H36g `c` (the walk itself): stops ONLY on cap passed, missing/grey video, or >= 180 seconds.
 * Never stops on `generateContent < 3` when the walk completed under the cap.
 */
export function walkCompletionStopProblems(input: {
  stoppedAtCap: boolean;
  generateContent: number;
  cap: number;
  walkDurationS: number;
  videoFilesCount: number;
  videoFileMatchesWalk: boolean;
  videoFills: boolean;
  decodedDurationS: number | null;
  videoError?: string;
}): string[] {
  const stops: string[] = [];
  if (input.stoppedAtCap || input.generateContent > input.cap) {
    stops.push(`model-call cap passed (generateContent=${input.generateContent}, cap=${input.cap}, stoppedAtCap=${input.stoppedAtCap})`);
  }
  if (input.walkDurationS >= 180) {
    stops.push(`walk duration ${input.walkDurationS} s reached or exceeded 180 s`);
  }
  if (input.videoFilesCount !== 1) {
    stops.push(`the raw directory holds ${input.videoFilesCount} files, not one`);
  }
  if (!input.videoFileMatchesWalk) {
    stops.push("the one file in the raw directory is not the walk page's video");
  }
  if (!input.videoFills) {
    stops.push(`raw video missing or grey-bordered in checkVideo: ${input.videoError ?? "fills=false"}`);
  }
  if (input.decodedDurationS !== null && input.decodedDurationS >= 180) {
    stops.push(`decoded raw video duration ${input.decodedDurationS} s is >= 180 s`);
  }
  return stops;
}

/** H36g `d` (claim of the film — Shot A): stops only if proposed chips miss Bea or 3/3/87. */
export function devicePassClaimStopProblems(proposedChips: readonly string[]): string[] {
  const stops: string[] = [];
  if (!holdsBeaIn(proposedChips)) stops.push("device pass did not propose Bea after Add to Seen");
  if (!holdsDobIn(proposedChips)) stops.push("device pass did not propose 3/3/87 after Add to Seen");
  return stops;
}

/** H36g `d` (claim of the film — Shot D): stops only if the ledger lacks any of the 4 InferenceModes. */
export function ledgerClaimStopProblems(shownModes: readonly string[]): string[] {
  return REQUIRED_LEDGER_MODES.filter((m) => !shownModes.includes(m)).map(
    (m) => `ledger is missing required InferenceMode row: ${m}`,
  );
}

/** H36g non-stop Shot C.3 observations: non-fault note items, doublesInText, markdownProblems, draftProblems. */
export function collectFinishedObservations(input: {
  finishedText: string;
  observedNotes: readonly string[];
}): FilmObservation[] {
  const out: FilmObservation[] = [];
  for (const note of input.observedNotes) {
    out.push({ step: "Shot C.3", rule: "sheetNote", seen: note });
  }
  const doubles = doublesInText(input.finishedText);
  if (doubles.length > 0) {
    out.push({ step: "Shot C.3", rule: "doublesInText", seen: doubles.join(", ") });
  }
  for (const m of markdownProblems(input.finishedText)) {
    out.push({ step: "Shot C.3", rule: "markdownProblems", seen: m });
  }
  for (const d of draftProblems("Shot C.3", input.finishedText)) {
    out.push({ step: "Shot C.3", rule: "draftProblems", seen: d });
  }
  return out;
}

/**
 * H36g Shot A / Shot C.3 truthful no-sheet outcomes (`[role="alert"]` / `[data-no-draft]`).
 * Never throws when `.sheet-text` is absent; records visible alert or no-draft markers as observations.
 */
export function classifyDraftOutcomeObservations(input: {
  step: string;
  hasSheet: boolean;
  alertText: string | null;
  noDraftText: string | null;
}): { hasSheet: boolean; observations: FilmObservation[] } {
  const observations: FilmObservation[] = [];
  if (input.alertText !== null && clean(input.alertText) !== "") {
    observations.push({ step: input.step, rule: "zone1Alert", seen: clean(input.alertText) });
  }
  if (input.noDraftText !== null && clean(input.noDraftText) !== "") {
    observations.push({ step: input.step, rule: "noDraftMarker", seen: clean(input.noDraftText) });
  }
  if (!input.hasSheet && observations.length === 0) {
    observations.push({ step: input.step, rule: "noSheet", seen: "sheet-text absent without alert or no-draft marker" });
  }
  return { hasSheet: input.hasSheet, observations };
}

/**
 * H36g Shot C.4 Pass 1 & Pass 2 classification: truthful `[data-reader-error]`,
 * `[data-reader-none]`, `[data-reader-hidden]`, and `[data-reader-dropped]` states become
 * observations and skip Pass 2 cleanly rather than stopping the take.
 */
export function classifyReaderPassOutcome(input: {
  step: string;
  readerError: string | null;
  readerNone: string | null;
  readerHidden: string | null;
  readerDropped: string | null;
  guessesCount: number;
  pressableCount: number;
  requirePressable?: boolean;
}): { hasError: boolean; canContinue: boolean; observations: FilmObservation[] } {
  const observations: FilmObservation[] = [];
  if (input.readerError !== null && clean(input.readerError) !== "") {
    observations.push({ step: input.step, rule: "readerError", seen: clean(input.readerError) });
  }
  if (input.readerNone !== null && clean(input.readerNone) !== "") {
    observations.push({ step: input.step, rule: "readerNone", seen: clean(input.readerNone) });
  }
  if (input.readerHidden !== null && clean(input.readerHidden) !== "") {
    observations.push({ step: input.step, rule: "readerHidden", seen: clean(input.readerHidden) });
  }
  if (input.readerDropped !== null && clean(input.readerDropped) !== "") {
    observations.push({ step: input.step, rule: "readerDropped", seen: clean(input.readerDropped) });
  }
  if (
    input.guessesCount === 0 &&
    input.readerError === null &&
    input.readerNone === null &&
    input.readerHidden === null
  ) {
    observations.push({ step: input.step, rule: "emptyGuesses", seen: "guesses.length === 0" });
  }
  const requirePressable = input.requirePressable !== false;
  if (requirePressable && input.pressableCount === 0 && input.readerError === null && input.readerDropped === null) {
    observations.push({ step: input.step, rule: "noPressableQuote", seen: "pressable.count() === 0" });
  }
  const hasError = input.readerError !== null;
  return {
    hasError,
    canContinue: !hasError && input.guessesCount > 0 && (!requirePressable || input.pressableCount > 0),
    observations,
  };
}

/**
 * H36g Shot C.4 Pass 2 completion predicate: settles once the cloud call or `[data-reader-error]`
 * lands and the reader finishes working, even if the rendered pass line is identical to Pass 1.
 */
export function isReaderPassSettled(input: {
  generateContentCount: number;
  beforeCount: number;
  errorCount: number;
  workingCount: number;
  askEnabled: boolean;
}): boolean {
  return (
    (input.generateContentCount > input.beforeCount || input.errorCount > 0) &&
    input.workingCount === 0 &&
    input.askEnabled
  );
}

/** Flags Markdown formatting markers that must never stand in a finished note. */
export function markdownProblems(text: string): string[] {
  const out: string[] = [];
  if (text.includes("**")) out.push("finished note holds double asterisks (**)");
  if (text.includes("__")) out.push("finished note holds double underscores (__)");
  if (/(?<!\S)\*[^*\n]{1,80}\*(?!\S)/.test(text)) out.push("finished note holds inline asterisk italics");
  if (/(?<!\S)_[^_\n]{1,80}_(?!\S)/.test(text)) out.push("finished note holds inline underscore italics");
  const lines = text.split("\n");
  if (lines.some((l) => /^\s*#{1,6}\s/.test(l))) out.push("finished note holds a # heading line");
  if (lines.some((l) => /^\s*[-*\u2022]\s/.test(l))) out.push("finished note holds a bullet list line");
  if (lines.some((l) => /^\s*\d+[.)]\s/.test(l))) out.push("finished note holds a numbered list line");
  return out;
}

/** True when any finished-note flag is the A5 pronoun warning line. */
export function hasA5PronounWarning(flags: readonly string[]): boolean {
  return flags.some((f) => f.includes(A5_PRONOUN_WARNING));
}

/** Checks forbidden page strings in the current UI state. */
export function forbiddenCopyProblems(input: {
  pageText: string;
  offline: boolean;
  finishedShown?: boolean;
  outgoingPopulated?: boolean;
  zone2Text?: string;
  zone3Text?: string;
  networkWords?: string;
}): string[] {
  const out: string[] = [];
  if (input.pageText.includes("Send this name on purpose")) out.push('forbidden copy "Send this name on purpose" appeared');
  if (/\b(?:1st|2nd)\b/i.test(input.pageText)) out.push('forbidden ordinal copy ("1st"/"2nd") appeared');
  if (input.offline && input.pageText.includes("The cloud half is connected")) {
    out.push('"The cloud half is connected" stood while offline');
  }
  if (!input.offline && input.networkWords === "offline") {
    out.push('network status read "offline" while online');
  }
  if (input.outgoingPopulated && input.zone2Text?.includes("Nothing to send yet")) {
    out.push('"Nothing to send yet" stayed visible after Draft populated What leaves');
  }
  if (input.finishedShown && input.zone3Text?.includes("The finished note appears here")) {
    out.push('"The finished note appears here" stayed visible after arrival');
  }
  return out;
}

/** Bounding-box overlap in CSS pixels (> 0 in both axes means overlap). */
export function rectOverlapPx(a: BoxRect, b: BoxRect): { width: number; height: number; overlaps: boolean } {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return { width, height, overlaps: width > 0 && height > 0 };
}

export interface ShotALocatorLike {
  count(): Promise<number>;
  first(): ShotALocatorLike;
  isVisible(): Promise<boolean>;
  scrollIntoViewIfNeeded?(options?: { timeout?: number }): Promise<void>;
  innerText(): Promise<string>;
  click(): Promise<void>;
}

export interface ShotAPage {
  locator(selector: string): ShotALocatorLike;
}

export interface ShotARecovery {
  shotAPath: "complete" | "added-to-seen";
  addedLines: string[];
}

/**
 * H36e Shot A honest record handling: when [data-record-missing] is visible, hold 2.5 s on it and press
 * up to 3 "Add to Seen" buttons holding 1.5 s after each; otherwise go on with no added lines.
 */
export async function recoverShotARecord(page: ShotAPage, hold: (ms: number) => Promise<void>): Promise<ShotARecovery> {
  const missing = page.locator("[data-record-missing]").first();
  if (!(await missing.isVisible())) {
    return { shotAPath: "complete", addedLines: [] };
  }
  await missing.scrollIntoViewIfNeeded?.();
  await hold(2500);
  const addedLines: string[] = [];
  const buttons = page.locator("[data-record-missing] button");
  const lines = page.locator("[data-record-missing] [data-missed-line]");
  for (let i = 0; i < 3; i++) {
    if ((await buttons.count()) === 0) break;
    const text = (await lines.count()) > 0 ? clean(await lines.first().innerText()) : clean(await buttons.first().innerText());
    await buttons.first().click();
    addedLines.push(text);
    await hold(1500);
  }
  return { shotAPath: "added-to-seen", addedLines };
}

/** Checks that a hosted H36 rehearsal record (h36r or h36r-2) passed cleanly with 0 cloud calls and fills frame. */
export function rehearsalGateFrom(
  dir = "results",
  expectedHostedPage?: string,
  requiredSuffix?: string,
): { ok: boolean; reason: string; maxAttemptS: number } {
  if (!existsSync(dir)) return { ok: false, reason: "results directory is missing", maxAttemptS: 0 };
  const files = readdirSync(dir)
    .map((f) => ({ f, m: /^film-rehearsal-(\d{4}-\d{2}-\d{2})-(h36r(?:-(\d+))?)\.json$/.exec(f) }))
    .filter((x): x is { f: string; m: RegExpExecArray } => x.m !== null && (requiredSuffix === undefined || x.m[2] === requiredSuffix))
    .sort((a, b) => {
      if (a.m[1] !== b.m[1]) return a.m[1]! < b.m[1]! ? -1 : 1;
      return (Number(a.m[3] ?? 1) || 1) - (Number(b.m[3] ?? 1) || 1);
    })
    .map((x) => x.f);
  const f = files[files.length - 1];
  const tag = requiredSuffix ?? "h36r";
  if (!f) return { ok: false, reason: `no ${tag} hosted rehearsal record exists`, maxAttemptS: 0 };
  const r = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
    status?: string;
    hostedOrigin?: string;
    gate?: { passed?: boolean };
    videoCheck?: { fills?: boolean };
    generateContent?: number;
    cloudCalls?: { generateContent?: number; appCheck?: number; recaptcha?: number };
    maxAttemptS?: number;
  };
  const zeroCloud =
    r.generateContent === 0 &&
    (r.cloudCalls?.generateContent ?? 0) === 0 &&
    (r.cloudCalls?.appCheck ?? 0) === 0 &&
    (r.cloudCalls?.recaptcha ?? 0) === 0;
  const originOk = expectedHostedPage === undefined || r.hostedOrigin === expectedHostedPage;
  const ok = r.status === "pass" && r.gate?.passed === true && r.videoCheck?.fills === true && zeroCloud && originOk;
  return { ok, reason: ok ? "" : `the rehearsal record ${f} did not pass its ${tag} gate`, maxAttemptS: r.maxAttemptS ?? 0 };
}

/**
 * Selects the next unused H36 film take suffix from ["h36" .. "h36-9"].
 * Stops immediately if any existing H36 take already passed or all 9 takes have run.
 */
export function selectFilmTakeSuffix(
  resultsDir = "results",
  date = new Date().toISOString().slice(0, 10),
  rawRoot?: string,
): { suffix: FilmTakeSuffix; rawDir: string } {
  const resolvedRoot = rawRoot !== undefined ? assertRawRootOutsideRepo(rawRoot) : requireFilmRawRoot();
  const existing = existsSync(resultsDir) ? readdirSync(resultsDir).sort() : [];
  for (const s of TAKE_SUFFIXES) {
    const matchRe = new RegExp(`^film-run-\\d{4}-\\d{2}-\\d{2}-${s}\\.json$`);
    for (const f of existing) {
      if (!matchRe.test(f)) continue;
      const p = join(resultsDir, f);
      try {
        const parsed = JSON.parse(readFileSync(p, "utf8")) as { status?: unknown };
        if (parsed.status === "pass") {
          throw new Error(`A passing H36 film take already exists (${p}); stopping at the first pass per A7.`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("A passing H36 film take already exists")) throw e;
      }
    }
  }
  for (const s of TAKE_SUFFIXES) {
    const datePath = join(resultsDir, `film-run-${date}-${s}.json`);
    const anyDateMatch = existing.some((f) => new RegExp(`^film-run-\\d{4}-\\d{2}-\\d{2}-${s}\\.json$`).test(f));
    if (!existsSync(datePath) && !anyDateMatch) {
      return { suffix: s, rawDir: join(resolvedRoot, `raw-${s}`) };
    }
  }
  throw new Error(`All ${TAKE_SUFFIXES.length} allowed H36 film takes have run; cap of ${TAKE_SUFFIXES.length} takes reached per A7.`);
}

function selectSeriesTakeSuffix<S extends string>(
  suffixes: readonly S[],
  seriesLabel: string,
  resultsDir: string,
  date: string,
  rawRoot?: string,
): { suffix: S; rawDir: string } {
  const resolvedRoot = rawRoot !== undefined ? assertRawRootOutsideRepo(rawRoot) : requireFilmRawRoot();
  const existing = existsSync(resultsDir) ? readdirSync(resultsDir).sort() : [];
  for (const s of suffixes) {
    const datePath = join(resultsDir, `film-run-${date}-${s}.json`);
    const anyDateMatch = existing.some((f) => new RegExp(`^film-run-\\d{4}-\\d{2}-\\d{2}-${s}\\.json$`).test(f));
    if (!existsSync(datePath) && !anyDateMatch) {
      return { suffix: s, rawDir: join(resolvedRoot, `raw-${s}`) };
    }
  }
  throw new Error(`All ${suffixes.length} allowed ${seriesLabel} film takes have run; cap of ${suffixes.length} takes reached per ${seriesLabel}.`);
}

/**
 * Selects the next unused H37 retake suffix from ["h37-1", "h37-2", "h37-3", "h37-4"].
 * Independent of prior H36 takes and allows h37-2..h37-4 after a passing take per H37c.
 */
export function selectH37TakeSuffix(
  resultsDir = "results",
  date = new Date().toISOString().slice(0, 10),
  rawRoot?: string,
): { suffix: H37TakeSuffix; rawDir: string } {
  return selectSeriesTakeSuffix(H37_TAKE_SUFFIXES, "H37", resultsDir, date, rawRoot);
}

/**
 * Selects the next unused H39 final take suffix from ["h39-1" .. "h39-5"].
 */
export function selectH39TakeSuffix(
  resultsDir = "results",
  date = new Date().toISOString().slice(0, 10),
  rawRoot?: string,
): { suffix: H39TakeSuffix; rawDir: string } {
  return selectSeriesTakeSuffix(H39_TAKE_SUFFIXES, "H39", resultsDir, date, rawRoot);
}

/**
 * Selects the next unused H42 take suffix from ["h42-1" .. "h42-12"].
 */
export function selectH42TakeSuffix(
  resultsDir = "results",
  date = new Date().toISOString().slice(0, 10),
  rawRoot?: string,
): { suffix: H42TakeSuffix; rawDir: string } {
  return selectSeriesTakeSuffix(H42_TAKE_SUFFIXES, "H42", resultsDir, date, rawRoot);
}

/**
 * H42 item 10: stop right after Shot A (before reconnecting network, 0 cloud calls) when
 * DOORSTEP_FILM_STOP_NO_DROP=1 is set and Shot A ended with 0 lines added back.
 */
export function shouldStopOnNoDrop(input: { stopEnabled: boolean; addedLinesCount: number }): boolean {
  return input.stopEnabled && input.addedLinesCount === 0;
}

export interface SecondReaderMiddleColumnCheck {
  chosenSentence: string;
  rewrittenSentence: string;
  rewriteApplied: boolean;
  pass1HasRewritten: boolean;
  pass1HasChosenOriginal: boolean;
  pass2HasRewrittenOrMasked: boolean;
  pass2HasChosenOriginal: boolean;
  status: "pass" | "fail" | "not counted";
  ok: boolean;
  reason: string | null;
}

/**
 * H42 N8: verify Zone 2 middle column (`pre.outgoing`) holds the rewritten sentence (and not the un-rewritten original)
 * after "Ask a second reader" in Pass 1 and (masked if quoted) in Pass 2.
 */
export function checkSecondReaderMiddleColumn(input: {
  chosenSentence: string;
  rewrittenSentence: string;
  rewriteApplied: boolean;
  readerText1: string;
  readerText2?: string | null;
  pressedQuote?: string | null;
  pass2Ran?: boolean;
}): SecondReaderMiddleColumnCheck {
  const chosen = clean(input.chosenSentence);
  const rewritten = clean(input.rewrittenSentence);
  const t1 = clean(input.readerText1);
  const t2 = input.readerText2 === undefined || input.readerText2 === null ? null : clean(input.readerText2);
  const hasPressedQuote = typeof input.pressedQuote === "string" && clean(input.pressedQuote) !== "";
  const pass2Complete = t2 !== null && t2 !== "" && input.pass2Ran !== false;
  const distinctOriginal = chosen !== "" && chosen !== rewritten;
  const pass1HasRewritten = rewritten !== "" && t1.includes(rewritten);
  const pass1HasChosenOriginal = distinctOriginal && t1.includes(chosen);

  let quoteHitInRewritten = false;
  let quoteMaskedInPass2 = true;
  if (hasPressedQuote) {
    let rest = input.pressedQuote!;
    for (const tag of tagsIn(input.pressedQuote!)) rest = rest.split(tag).join("\n");
    const pieces = rest.split("\n").map((p) => p.trim()).filter((p) => /[\p{L}\p{N}]/u.test(p));
    quoteHitInRewritten = pieces.some((p) => findWholeWords(rewritten, p).length > 0);
    if (pass2Complete && quoteHitInRewritten) {
      quoteMaskedInPass2 = pieces.every((p) => findWholeWords(t2, p).length === 0) && /\[Detail \d+\]/.test(t2);
    }
  }

  const pass2HasRewrittenOrMasked =
    pass2Complete && (quoteHitInRewritten ? quoteMaskedInPass2 : rewritten !== "" && t2.includes(rewritten));
  const pass2HasChosenOriginal = pass2Complete && distinctOriginal && t2.includes(chosen);

  let status: "pass" | "fail" | "not counted" = "pass";
  let reason: string | null = null;
  if (!input.rewriteApplied || chosen === "" || rewritten === "") {
    status = "not counted";
    reason = "Shot C.4 sentence rewrite gave no result (not counted)";
  } else if (rewritten === chosen) {
    status = "not counted";
    reason = "Shot C.4 sentence rewrite did not change the text (not counted)";
  } else if (!pass1HasRewritten) {
    status = "fail";
    reason = `Shot C.4 Pass 1 middle column missing rewritten sentence: "${rewritten}"`;
  } else if (pass1HasChosenOriginal) {
    status = "fail";
    reason = `Shot C.4 Pass 1 middle column still showed original sentence: "${chosen}"`;
  } else if (!hasPressedQuote) {
    status = "not counted";
    reason = "Shot C.4 no quote chip was pressed (not counted)";
  } else if (!pass2Complete) {
    status = "not counted";
    reason = "Shot C.4 second pass did not run (not counted)";
  } else if (!pass2HasRewrittenOrMasked) {
    status = "fail";
    reason = `Shot C.4 Pass 2 middle column missing rewritten/masked sentence: "${rewritten}"`;
  } else if (pass2HasChosenOriginal) {
    status = "fail";
    reason = `Shot C.4 Pass 2 middle column still showed original sentence: "${chosen}"`;
  }

  return {
    chosenSentence: chosen,
    rewrittenSentence: rewritten,
    rewriteApplied: input.rewriteApplied,
    pass1HasRewritten,
    pass1HasChosenOriginal,
    pass2HasRewrittenOrMasked,
    pass2HasChosenOriginal,
    status,
    ok: status === "pass",
    reason,
  };
}

/**
 * Resolves the serialized take record `status`, ensuring `"not counted"` is returned only when
 * `finished` is true and no non-middle-column failure exists in `problems`.
 */
export function resolveFilmTakeStatus(input: {
  earlyStopStatus: string | null;
  finished: boolean;
  problems: readonly string[];
  middleCol?: {
    status?: string;
    reason?: string | null;
    retryCheck?: { status?: string; reason?: string | null } | null;
  };
}): string {
  if (input.earlyStopStatus !== null) {
    return input.problems.length === 0 ? input.earlyStopStatus : "fail";
  }
  const effectiveCheck = input.middleCol?.retryCheck ?? input.middleCol;
  const notCountedReasons = new Set<string>();
  if (input.middleCol?.status === "not counted" && input.middleCol.reason) {
    notCountedReasons.add(input.middleCol.reason);
  }
  if (input.middleCol?.retryCheck?.status === "not counted" && input.middleCol.retryCheck.reason) {
    notCountedReasons.add(input.middleCol.retryCheck.reason);
  }
  const nonMiddleProblems = input.problems.filter((p) => !notCountedReasons.has(p));
  if (effectiveCheck?.status === "not counted" && input.finished && nonMiddleProblems.length === 0) {
    return "not counted";
  }
  return input.problems.length === 0 && input.finished ? "pass" : "fail";
}

export interface H39ChipCandidate {
  index: number;
  quoteIndex: number;
  kind: string | null;
  quote: string;
}

export interface H39ChipChoice {
  rule: "neighbour-quote" | "first-pressable";
  pressedKind: string | null;
  pressedIndex: number;
  pressedQuoteIndex: number;
  pressedQuote: string;
  candidates: H39ChipCandidate[];
}

/**
 * H39 Shot C.4 Pass 1 chip selector: prefers any pressable chip quoting the neighbour phrase
 * ("neighbour" / "neighbor"), otherwise falls back to the first pressable chip.
 */
export function chooseH39Chip(
  guesses: ReadonlyArray<{ kind: string | null; quotes: readonly string[] }>,
  pressableQuotesPerCard: ReadonlyArray<readonly string[]>,
): H39ChipChoice | null {
  const neighbourRe = /\bneighbou?r\b/i;
  const candidates: H39ChipCandidate[] = [];
  let firstPressable: H39ChipCandidate | null = null;
  for (let i = 0; i < pressableQuotesPerCard.length; i++) {
    const quotes = pressableQuotesPerCard[i] ?? [];
    for (let j = 0; j < quotes.length; j++) {
      const quote = quotes[j] ?? "";
      const candidate: H39ChipCandidate = {
        index: i,
        quoteIndex: j,
        kind: guesses[i]?.kind ?? null,
        quote,
      };
      if (firstPressable === null) firstPressable = candidate;
      if (neighbourRe.test(quote)) candidates.push(candidate);
    }
  }
  if (candidates.length > 0) {
    const preferred =
      candidates.find((c) => (c.kind ?? "").toLowerCase() === "role") ?? candidates[0]!;
    return {
      rule: "neighbour-quote",
      pressedKind: preferred.kind,
      pressedIndex: preferred.index,
      pressedQuoteIndex: preferred.quoteIndex,
      pressedQuote: preferred.quote,
      candidates,
    };
  }
  if (firstPressable === null) return null;
  return {
    rule: "first-pressable",
    pressedKind: firstPressable.kind,
    pressedIndex: firstPressable.index,
    pressedQuoteIndex: firstPressable.quoteIndex,
    pressedQuote: firstPressable.quote,
    candidates,
  };
}

/** True if any recorded request invokes debug token exchange or leaks a local debug token. */
export function namesDebug(requests: readonly RecordedRequest[]): boolean {
  let token = "";
  try {
    token = readFileSync("appcheck-debug-token.local", "utf8").trim();
  } catch {
    token = "";
  }
  for (const r of requests) {
    const path = redactedPath(r.url);
    if (path.includes("exchangeDebugToken")) return true;
    const body = r.body ? r.body.toString("utf8") : "";
    if (token.length >= 8 && (r.url.includes(token) || body.includes(token))) return true;
  }
  return false;
}

/** Decodes a recorded walk video in Playwright's bundled Chromium (all requests aborted) and rejects grey borders. */
export async function checkVideo(videoPath: string): Promise<{ frames: FrameCheck[]; fills: boolean; checkerAborted: number; durationS: number | null; error?: string }> {
  let aborted = 0;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext();
    await ctx.route("**/*", (route) => {
      aborted += 1;
      return route.abort();
    });
    const page = await ctx.newPage();
    await page.setContent('<input type="file" id="f">');
    await page.setInputFiles("#f", videoPath);
    const out = await page.evaluate(async () => {
      const input = document.getElementById("f") as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) throw new Error("no file");
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.src = URL.createObjectURL(file);
      const once = (name: string) =>
        new Promise<void>((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`timeout waiting for ${name}`)), 30_000);
          video.addEventListener(name, () => (clearTimeout(timer), res()), { once: true });
          video.addEventListener("error", () => (clearTimeout(timer), rej(new Error("video error"))), { once: true });
        });
      await once("loadedmetadata");
      let duration = video.duration;
      if (!Number.isFinite(duration)) {
        const changed = once("durationchange");
        video.currentTime = 1e9;
        await changed;
        duration = video.duration;
      }
      const times = [1, duration / 2, Math.max(0, duration - 0.3)];
      const frames: { atS: number; width: number; height: number; rightGreyPct: number; bottomGreyPct: number; fills: boolean }[] = [];
      for (const t of times) {
        const seeked = once("seeked");
        video.currentTime = t;
        await seeked;
        const w = video.videoWidth;
        const h = video.videoHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext("2d", { willReadFrequently: true });
        if (!c) throw new Error("no canvas");
        c.drawImage(video, 0, 0, w, h);
        const grey = (x: number, y: number, ww: number, hh: number): number => {
          const d = c.getImageData(x, y, ww, hh).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (Math.abs((d[i] ?? 0) - 128) <= 4 && Math.abs((d[i + 1] ?? 0) - 128) <= 4 && Math.abs((d[i + 2] ?? 0) - 128) <= 4) n++;
          return Math.round((n / (d.length / 4)) * 1000) / 10;
        };
        const sx = Math.floor(w * 0.95);
        const sy = Math.floor(h * 0.95);
        const right = grey(sx, 0, w - sx, h);
        const bottom = grey(0, sy, w, h - sy);
        frames.push({ atS: Math.round(t * 10) / 10, width: w, height: h, rightGreyPct: right, bottomGreyPct: bottom, fills: right < 50 && bottom < 50 });
      }
      return { frames, durationS: Math.round(duration * 10) / 10 };
    });
    return { frames: out.frames, fills: out.frames.length === 3 && out.frames.every((f) => f.fills), checkerAborted: aborted, durationS: out.durationS };
  } catch (error) {
    return { frames: [], fills: false, checkerAborted: aborted, durationS: null, error: first(error) };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
