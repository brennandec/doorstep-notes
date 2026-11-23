// Suggestions the app does not trust the model to leave out (masking R16.2 and R18, directions U9 and K4).
// This file holds the lists. A candidate whose whole text is one of these is not something to mask:
//   - a weekday, a month, a time of day or a relative day, in any case;
//   - one role or relation word, in any case ("neighbour", "Landlord", "sister"), when it is the whole candidate (masking R22).
// A role word followed by a capitalised word is cut to the capitalised words ("neighbour Bea" -> "Bea").
// A date such as "3/3/87" is kept. No model, no dependency.
import { fold } from "./fold";

const WEEKDAYS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
];

const MONTHS = [
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
];

const TIMES_OF_DAY = ["morning", "afternoon", "evening", "night", "noon", "midday", "midnight", "lunchtime", "overnight"];

const RELATIVE_DAYS = ["today", "tomorrow", "yesterday", "tonight"];

/** Role words: what a person does or is to the household. Lower case only. */
export const ROLE_WORDS: readonly string[] = [
  "neighbour", "neighbor", "landlord", "landlady", "tenant", "resident", "friend", "partner", "colleague",
  "doctor", "nurse", "teacher", "carer", "manager", "officer", "worker", "caseworker", "client",
];

/** Relation words: kin. Lower case only. */
export const RELATION_WORDS: readonly string[] = [
  "sister", "brother", "son", "daughter", "mother", "father", "mum", "mam", "dad", "husband", "wife",
  "aunt", "uncle", "cousin", "niece", "nephew", "grandmother", "grandfather", "grandson", "granddaughter",
  "sibling", "parent", "child",
];

const ALWAYS = new Set([...WEEKDAYS, ...MONTHS, ...TIMES_OF_DAY, ...RELATIVE_DAYS]);
const LOWER_ONLY = new Set([...ROLE_WORDS, ...RELATION_WORDS]);

// 14:00, 9:30, 09:05:10, 9.30am, 2pm, 9:30 am
const CLOCK = /^(?:\d{1,2}[:.]\d{2}(?::\d{2})?(?:\s?[ap]m)?|\d{1,2}\s?[ap]m)$/;

export function isNotNeeded(text: string): boolean {
  const trimmed = text.trim().replace(/[.,;]+$/, "").trim();
  if (trimmed === "") return false;
  const t = fold(trimmed);
  if (ALWAYS.has(t) || CLOCK.test(t)) return true;
  // R22 (H51f): a lone role word in any case is dropped. fold() folds both sides of a mask, so a kept "Landlord"
  // would mask every lower-case "landlord" in the note. The no-whitespace test keeps "Doctor Aldous" maskable.
  if (LOWER_ONLY.has(t) && !/\s/.test(trimmed)) return true;
  // A role word with a capital may start a name ("Doctor Aldous"), so only a lone word is dropped.
  return LOWER_ONLY.has(trimmed) && trimmed === trimmed.toLowerCase();
}

/**
 * "neighbour Bea" -> "Bea". Only when the first word is a lower-case role or relation word and the
 * next word starts with a capital letter. Anything else comes back as it was given.
 */
export function withoutRoleWord(text: string): string {
  const m = /^\s*(\p{Ll}+)\s+(\p{Lu}.*?)\s*$/u.exec(text);
  if (m === null || !LOWER_ONLY.has(m[1]!)) return text;
  return m[2]!;
}

// Date words (masking R19, sixth review R6): tried and taken out again. The fourth device run, with a rule
// that dropped a date suggestion with no year and no word of birth within three words, found 130 dates of
// birth against 131 in the third run, so the rule is not in the code. The try is kept in
// results/catch-rate-run-4.json and results/misses-run-4.json. A bare date from the device pass is kept.
