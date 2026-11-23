// Dates in the visit record (capture-and-record R12, direction U1).
//
// The model never writes a date. The record's date field holds the note's own
// words. This module does three plain things, with no model:
//   1. finds date-like tokens in text, and checks a record against the rough note;
//   2. proposes a reading of the date words (day, month, year), always marked;
//   3. audits text for a year the note does not hold.
// It imports no inference code.
import { fold } from "../masking/fold";
import type { VisitRecord } from "../inference/types";

export type DateKind = "iso" | "numeric" | "year" | "month" | "weekday" | "relative";

export interface DateToken {
  text: string;
  index: number;
  kind: DateKind;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_SHORT = ["jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"];
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAY_SHORT = ["mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun"];
const RELATIVE = ["today", "tomorrow", "yesterday"];
/** Words that are also ordinary words. They count as dates only when written with a capital letter. */
const NEED_CAPITAL = new Set(["may", "march", "mar", "sat", "sun", "wed"]);

const alt = (words: string[]) => [...words].sort((a, b) => b.length - a.length).join("|");

const PATTERNS: [RegExp, DateKind][] = [
  [/(?<![\d/.\-])\d{4}-\d{1,2}-\d{1,2}(?!\d)/g, "iso"],
  [/(?<![\d/.\-:])\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?(?![\d])/g, "numeric"],
  [/(?<!\d)(?:19|20)\d{2}(?!\d)/g, "year"],
  [new RegExp(`(?<![\\p{L}])(?:${alt([...MONTHS, ...MONTH_SHORT])})(?![\\p{L}])`, "giu"), "month"],
  [new RegExp(`(?<![\\p{L}])(?:${alt([...WEEKDAYS, ...WEEKDAY_SHORT])})(?![\\p{L}])`, "giu"), "weekday"],
  [new RegExp(`(?<![\\p{L}])(?:${alt(RELATIVE)})(?![\\p{L}])`, "giu"), "relative"],
];

/** Every date-like token in the text, in order. A longer token wins over a shorter one it overlaps. */
export function dateTokens(text: string): DateToken[] {
  const found: DateToken[] = [];
  for (const [re, kind] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const word = m[0];
      if (NEED_CAPITAL.has(word.toLowerCase()) && !/^\p{Lu}/u.test(word)) continue;
      found.push({ text: word, index: m.index ?? 0, kind });
    }
  }
  found.sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  const kept: DateToken[] = [];
  for (const t of found) {
    const last = kept[kept.length - 1];
    if (last && t.index < last.index + last.text.length) continue;
    kept.push(t);
  }
  return kept;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the token stands in the note as written, ignoring case, and not inside a longer word or number. */
export function inNote(token: string, note: string): boolean {
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(fold(token))}(?![\\p{L}\\p{N}])`, "u");
  return re.test(fold(note));
}

const DAY_MONTH = new RegExp(`(?<!\\d)\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${alt([...MONTHS, ...MONTH_SHORT])})(?![\\p{L}])(?:,?\\s+(?:19|20)\\d{2})?`, "iu");
const MONTH_DAY = new RegExp(`(?<![\\p{L}])(?:${alt([...MONTHS, ...MONTH_SHORT])})\\s+\\d{1,2}(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+(?:19|20)\\d{2})?`, "iu");

/** The first date words in the note, as written; an empty string when there are none. */
export function firstDateWords(note: string): string {
  const tokens = dateTokens(note);
  const first = tokens.find((t) => t.kind === "iso" || t.kind === "numeric" || t.kind === "month") ?? tokens[0];
  if (!first) return "";
  if (first.kind === "month") {
    for (const re of [DAY_MONTH, MONTH_DAY]) {
      const m = re.exec(note);
      if (m && m.index <= first.index && first.index < m.index + m[0].length) return m[0];
    }
  }
  return first.text;
}

export interface DateGuard {
  record: VisitRecord;
  /** true when the date field held a date the note does not contain and was replaced */
  replacedDate: boolean;
  /** tokens in the other fields that the note does not contain, as the record wrote them */
  flagged: string[];
}

const TEXT_FIELDS = ["seen", "agreed", "risks", "nextSteps"] as const;

/** The app does not trust the prompt (R12.3). Checks every date-like token of a record against the rough note. */
export function guardRecordDates(record: VisitRecord, note: string): DateGuard {
  let visitDate = record.visitDate;
  let replacedDate = false;
  if (dateTokens(visitDate).some((t) => !inNote(t.text, note))) {
    visitDate = firstDateWords(note);
    replacedDate = true;
  }
  const flagged: string[] = [];
  for (const field of TEXT_FIELDS) {
    for (const item of record[field]) {
      for (const t of dateTokens(item)) {
        if (!inNote(t.text, note) && !flagged.some((f) => fold(f) === fold(t.text))) flagged.push(t.text);
      }
    }
  }
  return { record: { ...record, visitDate }, replacedDate, flagged };
}

/** True while the record still holds the flagged token in a text field. */
export function recordHolds(record: VisitRecord, token: string): boolean {
  return TEXT_FIELDS.some((f) => record[f].some((item) => dateTokens(item).some((t) => fold(t.text) === fold(token))));
}

/** The record as the outgoing text is built from it: flagged tokens are left out while they are marked. */
export function withoutFlagged(record: VisitRecord, flagged: string[]): VisitRecord {
  if (flagged.length === 0) return record;
  const clean = (item: string): string => {
    let out = item;
    for (const token of flagged) {
      out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(token)}(?![\\p{L}\\p{N}])`, "giu"), "");
    }
    return out.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
  };
  const next: VisitRecord = { ...record };
  for (const f of TEXT_FIELDS) next[f] = record[f].map(clean).filter((s) => s !== "");
  return next;
}

// --- The reading -----------------------------------------------------------

export interface NoteDate {
  day: number;
  month: number;
  year: number;
  /** true when the words held no year and the year of the clock was used */
  yearAssumed: boolean;
  /** true when day and month could be read either way and the locale decided */
  orderAssumed: boolean;
  /** true when day and month could be read either way and another date in the note settled it (X4): an inference */
  orderFromNote: boolean;
}

export interface ReadOptions {
  locale: string;
  now: () => Date;
  /** the rough note the words came from; a date in it with a first number above 12 shows the note is day first (X4) */
  note?: string;
}

/**
 * True when a numeric date in the note has a first number above 12 and a second number from 1 to 12,
 * as in "26/11". Such a date can only be day first, so every date in that note is read day first (third review, X4).
 * A time such as "14.30" or "14:00" is not a date.
 */
export function dayFirstEvidence(note: string): boolean {
  for (const m of note.matchAll(/(?<![\d/.\-:])(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?(?![\d])/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && a <= 31 && b >= 1 && b <= 12) return true;
  }
  return false;
}

/** "dmy" or "mdy", from the order the browser's locale writes a numeric date in. */
export function dayMonthOrder(locale: string): "dmy" | "mdy" {
  try {
    const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric" }).formatToParts(new Date(2000, 10, 12));
    const kinds = parts.map((p) => p.type).filter((t) => t === "day" || t === "month");
    return kinds[0] === "month" ? "mdy" : "dmy";
  } catch {
    return "dmy";
  }
}

const valid = (y: number, m: number, d: number): boolean => {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

function monthNumber(word: string): number | null {
  const w = word.toLowerCase();
  const full = MONTHS.indexOf(w);
  if (full !== -1) return full + 1;
  const short = MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3)) && (w === "sept" || w.length <= 3));
  return short === -1 ? null : short + 1;
}

function fullYear(text: string, nowYear: number): number {
  const n = Number(text);
  if (text.length === 4) return n;
  return 2000 + n > nowYear ? 1900 + n : 2000 + n;
}

/**
 * The app's reading of the date words (R12.4). The year is the year in the words, or the
 * year of the clock, assumed. Words that cannot be read as a date give null.
 */
export function readNoteDate(words: string, opts: ReadOptions): NoteDate | null {
  const nowYear = opts.now().getFullYear();
  const done = (day: number, month: number, yearText: string | undefined, orderAssumed: boolean, orderFromNote = false): NoteDate | null => {
    const year = yearText ? fullYear(yearText, nowYear) : nowYear;
    if (!valid(year, month, day)) return null;
    return { day, month, year, yearAssumed: !yearText, orderAssumed, orderFromNote };
  };

  const iso = /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/.exec(words);
  if (iso) return done(Number(iso[3]), Number(iso[2]), iso[1], false);

  const numeric = /(?<![\d/.\-:])(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?(?!\d)/.exec(words);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    let day: number;
    let month: number;
    let orderAssumed = false;
    let orderFromNote = false;
    if (a > 12 && b <= 12) [day, month] = [a, b];
    else if (b > 12 && a <= 12) [day, month] = [b, a];
    else if (a > 12 && b > 12) return null;
    else if (opts.note !== undefined && dayFirstEvidence(opts.note)) {
      // The note shows its dates are day first, so the locale does not decide (X4).
      [day, month] = [a, b];
      orderFromNote = a !== b;
    } else {
      [day, month] = dayMonthOrder(opts.locale) === "dmy" ? [a, b] : [b, a];
      orderAssumed = a !== b;
    }
    return done(day, month, numeric[3], orderAssumed, orderFromNote);
  }

  const names = alt([...MONTHS, ...MONTH_SHORT]);
  const dayFirst = new RegExp(`(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${names})(?![\\p{L}])(?:,?\\s+((?:19|20)\\d{2}))?`, "iu").exec(words);
  if (dayFirst) {
    const month = monthNumber(dayFirst[2]!);
    return month === null ? null : done(Number(dayFirst[1]), month, dayFirst[3], false);
  }
  const monthFirst = new RegExp(`(?<![\\p{L}])(${names})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:,?\\s+((?:19|20)\\d{2}))?`, "iu").exec(words);
  if (monthFirst) {
    const month = monthNumber(monthFirst[1]!);
    return month === null ? null : done(Number(monthFirst[2]), month, monthFirst[3], false);
  }
  return null;
}

const MONTH_TITLE = MONTHS.map((m) => m[0]!.toUpperCase() + m.slice(1));

/** "12 November 2026" */
export function formatDate(d: { day: number; month: number; year: number }): string {
  return `${d.day} ${MONTH_TITLE[d.month - 1]} ${d.year}`;
}

/** Reads the value of a date input ("2026-11-12") back into parts; null when it is not a date. */
export function parseIsoDate(value: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return valid(y, mo, d) ? { day: d, month: mo, year: y } : null;
}

// --- The year audit (R12.6) ------------------------------------------------

const MARKED = /assumed|confirmed by you|set by you/i;

/**
 * Years in the text that the note does not contain, on a line that carries no mark.
 * Read line by line: a mark on one line does not cover another.
 */
export function unmarkedYears(text: string, note: string): string[] {
  const found: string[] = [];
  for (const line of text.split("\n")) {
    if (MARKED.test(line)) continue;
    for (const m of line.matchAll(/(?<!\d)(?:19|20)\d{2}(?!\d)/g)) {
      if (!inNote(m[0], note) && !found.includes(m[0])) found.push(m[0]);
    }
  }
  return found;
}

// --- A fixed flag on the text that would leave --------------------------------
// No model. A year-carrying date is always flagged. In a sentence that names a
// birth, a day and month alone, or a year alone, is flagged too. A day and month
// alone outside that sentence, a clock time, a flat or house number, and a count
// are not. The words are the clue sentence; the phrase is what Mask this clue removes.

export const BIRTH_DATE_WHAT = "A date of birth";
export const FULL_DATE_WHAT = "A full date";

export interface DateFlag {
  /** the matched text, still in the outgoing string */
  phrase: string;
  /** the "{what}" of "is still written out." */
  what: typeof BIRTH_DATE_WHAT | typeof FULL_DATE_WHAT;
  index: number;
}

const MONTH_NAME = alt([...MONTHS, ...MONTH_SHORT]);
const BIRTH_WORD = /\b(?:DOB|D\.O\.B\.|date of birth|born|birthday)(?![\p{L}\p{N}])/iu;
const BARE_BEFORE = /(?:flat|house|apt|apartment|no\.?|#)\s*$/i;
const BARE_AFTER = /^\s*(?:emails?|times|people|children|weeks|days|months|years|calls|notes|visits|forms)\b/i;

interface DateCand {
  index: number;
  end: number;
  phrase: string;
  carriesYear: boolean;
  shape: "date" | "dayMonth" | "year";
}

function dayAndMonth(a: number, b: number): boolean {
  if (a < 1 || b < 1 || a > 31 || b > 31) return false;
  return a <= 12 || b <= 12;
}

function dobRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(/D\.O\.B\./gi)) out.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return out;
}

function sentenceBoundary(text: string, i: number, dob: Array<[number, number]>): boolean {
  const c = text[i];
  if (c === "\n" || c === "!" || c === "?") return true;
  if (c !== ".") return false;
  if (dob.some(([a, b]) => i >= a && i < b)) return false;
  const prev = text[i - 1] ?? "";
  const next = text[i + 1] ?? "";
  if (/\d/.test(prev) && /\d/.test(next)) return false;
  return true;
}

function sentenceHasBirth(text: string, index: number, dob: Array<[number, number]>): boolean {
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (sentenceBoundary(text, i, dob)) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i += 1) {
    if (sentenceBoundary(text, i, dob)) {
      end = i + 1;
      break;
    }
  }
  return BIRTH_WORD.test(text.slice(start, end));
}

function pushMatch(out: DateCand[], text: string, m: RegExpMatchArray, carriesYear: boolean, shape: DateCand["shape"]): void {
  const index = m.index ?? 0;
  out.push({ index, end: index + m[0].length, phrase: text.slice(index, index + m[0].length), carriesYear, shape });
}

function collectDates(text: string): DateCand[] {
  const out: DateCand[] = [];
  for (const m of text.matchAll(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g)) {
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    pushMatch(out, text, m, true, "date");
  }
  for (const m of text.matchAll(/(?<![\d/.\-:])(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?!\d)/g)) {
    if (!dayAndMonth(Number(m[1]), Number(m[2]))) continue;
    pushMatch(out, text, m, true, "date");
  }
  // A following separator-and-digit is a longer date. A sentence period is not.
  for (const m of text.matchAll(/(?<![\d/.\-:])(\d{1,2})[/.\-](\d{1,2})(?![\d]|[/.\-]\d)/g)) {
    if (!dayAndMonth(Number(m[1]), Number(m[2]))) continue;
    pushMatch(out, text, m, false, "dayMonth");
  }
  const dayMonth = new RegExp(`(?<!\\d)(\\d{1,2}(?:st|nd|rd|th)?)\\s+(${MONTH_NAME})(?![\\p{L}])(?:,?\\s+((?:19|20)\\d{2}|\\d{2}))?(?!\\d)`, "giu");
  for (const m of text.matchAll(dayMonth)) pushMatch(out, text, m, m[3] !== undefined, m[3] !== undefined ? "date" : "dayMonth");
  const monthDay = new RegExp(`(?<![\\p{L}])(${MONTH_NAME})\\s+(\\d{1,2}(?:st|nd|rd|th)?)(?!\\d)(?:,?\\s+((?:19|20)\\d{2}|\\d{2}))?(?!\\d)`, "giu");
  for (const m of text.matchAll(monthDay)) pushMatch(out, text, m, m[3] !== undefined, m[3] !== undefined ? "date" : "dayMonth");
  for (const m of text.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)) pushMatch(out, text, m, false, "year");
  for (const m of text.matchAll(/(?<![\d/.\-:])(\d{2})(?![\d/\-:]|\.\d)/g)) {
    const n = Number(m[1]);
    const index = m.index ?? 0;
    const end = index + m[0].length;
    if (n < 32) continue;
    if (BARE_BEFORE.test(text.slice(Math.max(0, index - 16), index))) continue;
    if (BARE_AFTER.test(text.slice(end, end + 16))) continue;
    pushMatch(out, text, m, false, "year");
  }
  return out;
}

function keepDates(cands: DateCand[]): DateCand[] {
  const sorted = [...cands].sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  const kept: DateCand[] = [];
  for (const c of sorted) {
    const last = kept[kept.length - 1];
    if (last && c.index < last.end) continue;
    kept.push(c);
  }
  return kept;
}

/** The first flagged date in the exact text that would be sent, or null. */
export function dateFlag(text: string): DateFlag | null {
  const dob = dobRanges(text);
  for (const c of keepDates(collectDates(text))) {
    const birth = sentenceHasBirth(text, c.index, dob);
    if (c.carriesYear) return { phrase: c.phrase, what: birth ? BIRTH_DATE_WHAT : FULL_DATE_WHAT, index: c.index };
    if (birth && (c.shape === "dayMonth" || c.shape === "year")) return { phrase: c.phrase, what: BIRTH_DATE_WHAT, index: c.index };
  }
  return null;
}
