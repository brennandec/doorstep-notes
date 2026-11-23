// The guess by capital letters (masking R15.1, direction U6). No model, no list: it only points
// at words that look like names and that the passes did not catch. It is a guess, never a check.
//
// A word counts when it starts with a capital letter, is not the first word of a sentence or line,
// is not already masked or matched, is not written wholly in capitals, and is not a weekday or month.
// A semicolon also ends a sentence here, because the record text joins its items with "; "
// (OPEN-QUESTIONS, second review).
import { fold } from "./fold";

export interface Place {
  start: number;
  end: number;
}

export interface LikelyName {
  /** the word as first written */
  word: string;
  /** every place it stands in the text */
  occurrences: Place[];
}

const CALENDAR = new Set(
  [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  ],
);

const WORD = /\p{L}[\p{L}\p{M}'\u2019]*(?:-\p{L}[\p{L}\p{M}'\u2019]*)*/gu;
const ENDS_SENTENCE = /[.!?:;]$/;

/** Capitalised words that are not on her list and do not start a sentence. `known` are the spans already masked or matched. */
export function likelyNames(text: string, known: readonly Place[]): LikelyName[] {
  const found = new Map<string, LikelyName>();
  let previousEnd = 0;
  for (const m of text.matchAll(WORD)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const word = m[0];
    const gap = text.slice(previousEnd, start);
    previousEnd = end;

    if (!/^\p{Lu}/u.test(word)) continue;
    if (word === word.toUpperCase()) continue; // wholly in capitals: DOB, NHS, I
    if (CALENDAR.has(fold(word))) continue;
    if (known.some((s) => start < s.end && s.start < end)) continue;

    // The first word of the text, of a line, or after the end of a sentence.
    const before = text.slice(0, start).trimEnd();
    if (before === "" || ENDS_SENTENCE.test(before) || gap.includes("\n")) continue;

    const key = fold(word);
    const entry = found.get(key) ?? { word, occurrences: [] };
    entry.occurrences.push({ start, end });
    found.set(key, entry);
  }
  return [...found.values()];
}
