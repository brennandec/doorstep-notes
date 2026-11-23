// The story-order film take (2026-11-17): the fixed inputs and the gates of the one product take for the film
// "After the Last Door", kept apart from Playwright so a unit check can run them. Invented people only.
//
// The take is kept only if (the film panel, section 3c): the walk passed; "Bea suggested" appeared; pass 1 of the
// second reader quoted a phrase about the neighbour that she can mask; pass 2 was recorded; the finished note has
// its names put back and is labelled "in the cloud"; the verdict line "No listed name left this device" is shown.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { inventedVisit } from "../../../src/app/example/inventedVisit";

export const STORY_TAKE_RECORD = "film-story-take";
export const STORY_REHEARSAL_RECORD = "film-story-rehearsal";
export const STORY_TAKE_SUFFIXES = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;
export const STORY_REHEARSAL_SUFFIXES = ["r1", "r2", "r3", "r4"] as const;
/** Second reader pass 1, pass 2 and the draft: the three cloud calls of one take. */
export const STORY_TAKE_CAP = 3;
/** The desk's stop line for this film (order of 2026-11-17): no attempt starts once the day's ledger holds 34 calls. */
export const STORY_TAKE_STOP_TOTAL = 34;
/** The seven-line example note, typed key by key in the take. */
export const STORY_NOTE = inventedVisit.note;
/** Her client list: the 12 invented names, kept in this browser before the walk starts. */
export const STORY_CLIENT_LIST = inventedVisit.clientList;
/** The words the caret runs along in the typed note (crop 3); the crop stops before the date of birth. */
export const STORY_TYPED_PHRASE = "Maria missed the benefits form deadline";
export const STORY_ZONES = ["Your note", "What leaves", "Finished note"] as const;
export const STORY_VERDICT_RE = /^No listed name left this device: 0 of \d+\.$/;
/** Names in the note of invented people. A capital-letter guess that is one of these is masked; any other is kept. */
export const STORY_PERSON_WORDS = ["Maria", "Bea", "Tomas", "Brandvald", "Brandvold", "Okonkwo-Reyes", "Dana"] as const;

const clean = (t: string): string => t.replace(/\s+/g, " ").trim();

/** The note in three pieces around the phrase of crop 3, so the take can time the caret on that phrase. */
export function splitAroundPhrase(note: string, phrase: string): { before: string; phrase: string; after: string } {
  const at = note.indexOf(phrase);
  if (at < 0) throw new Error(`the note does not hold "${phrase}"`);
  return { before: note.slice(0, at), phrase, after: note.slice(at + phrase.length) };
}

/**
 * The next free take slot: no results/<record>-<any date>-<suffix>.json and no folder for it under the raw root.
 * A take never overwrites a record or a video.
 */
export function selectStorySuffix(
  kind: "take" | "rehearsal",
  resultsDir: string,
  rawRoot: string,
): { suffix: string; rawDir: string; record: string } {
  const record = kind === "take" ? STORY_TAKE_RECORD : STORY_REHEARSAL_RECORD;
  const suffixes: readonly string[] = kind === "take" ? STORY_TAKE_SUFFIXES : STORY_REHEARSAL_SUFFIXES;
  const existing = existsSync(resultsDir) ? readdirSync(resultsDir) : [];
  for (const s of suffixes) {
    const taken = existing.some((f) => new RegExp(`^${record}-\\d{4}-\\d{2}-\\d{2}-${s}\\.json$`).test(f));
    const rawDir = join(rawRoot, `${kind === "take" ? "raw" : "rehearsal"}-${s}`);
    if (!taken && !existsSync(rawDir)) return { suffix: s, rawDir, record };
  }
  throw new Error(`All ${suffixes.length} ${kind} slots of ${record} have run.`);
}

/** Null when an attempt may start; otherwise the reason it may not. */
export function budgetStop(total: number, stopAt = STORY_TAKE_STOP_TOTAL): string | null {
  return total >= stopAt ? `The day's cloud ledger holds ${total} calls; the stop line for this film is ${stopAt}.` : null;
}

/** A chip offered by the device pass that reads "Bea suggested". */
export function beaSuggested(proposedChips: readonly string[]): boolean {
  return proposedChips.map(clean).some((t) => t === "Bea suggested");
}

/** A chip offered by the device pass that holds the date of birth of the note. */
export function dobSuggested(proposedChips: readonly string[]): boolean {
  return proposedChips.some((t) => t.includes("3/3/87"));
}

/** The first chip of a listed name, as it reads: "[Person 1] on your list". */
export function listedChip(chips: readonly string[]): string | null {
  return chips.map(clean).find((t) => /^\[Person \d+\] on your list$/.test(t)) ?? null;
}

export const quotesTheNeighbour = (quote: string): boolean => /\bneighbou?r\b/i.test(quote);

/** The guess about the household (the damp, the tenant), the subject of crop 8. */
export function householdGuess(descriptions: readonly string[]): string | null {
  return descriptions.map(clean).find((d) => /\b(damp|mould|mold|disrepair|tenant|household)\b/i.test(d)) ?? null;
}

export function firstWords(text: string, n: number): string {
  return clean(text).split(" ").slice(0, n).join(" ");
}

/** A capital-letter guess at Draft: mask it when it names a person of the note, keep it otherwise. */
export function likelyWordAction(word: string): "mask" | "keep" {
  const w = clean(word).toLowerCase();
  return STORY_PERSON_WORDS.some((p) => p.toLowerCase() === w) ? "mask" : "keep";
}

export interface StoryGateInput {
  finished: boolean;
  problems: readonly string[];
  proposedChips: readonly string[];
  /** the chip chosen in pass 1 and the rule that chose it */
  pass1Chip: { rule: string; quote: string } | null;
  pass2: { settled: boolean; guesses: number; error: string | null } | null;
  finishedNote: { labels: string; text: string } | null;
  verdict: string | null;
}

export interface StoryGates {
  statusPass: boolean;
  beaSuggested: boolean;
  neighbourQuoted: boolean;
  pass2Recorded: boolean;
  finishedRestoredInCloud: boolean;
  verdictPresent: boolean;
}

const GATE_WORDS: Record<keyof StoryGates, string> = {
  statusPass: "status pass",
  beaSuggested: '"Bea suggested" appears',
  neighbourQuoted: "pass 1 quotes a phrase about the neighbour that she can mask",
  pass2Recorded: "pass 2 recorded",
  finishedRestoredInCloud: 'finished note with its names put back, labelled "in the cloud"',
  verdictPresent: 'verdict line "No listed name left this device"',
};

/** The six keep conditions of the take, each true or false, and the ones missed in plain words. */
export function storyGates(i: StoryGateInput): { gates: StoryGates; keep: boolean; missed: string[] } {
  const text = i.finishedNote?.text ?? "";
  const gates: StoryGates = {
    statusPass: i.finished && i.problems.length === 0,
    beaSuggested: beaSuggested(i.proposedChips),
    neighbourQuoted: i.pass1Chip !== null && i.pass1Chip.rule === "neighbour-quote" && quotesTheNeighbour(i.pass1Chip.quote),
    pass2Recorded: i.pass2 !== null && i.pass2.settled && i.pass2.error === null && i.pass2.guesses > 0,
    finishedRestoredInCloud:
      i.finishedNote !== null &&
      i.finishedNote.labels.includes("in the cloud") &&
      text.includes("Maria Okonkwo-Reyes") &&
      !/\[(?:Person|Place|Date|Detail) \d+\]/.test(text),
    verdictPresent: i.verdict !== null && STORY_VERDICT_RE.test(clean(i.verdict)),
  };
  const missed = (Object.keys(gates) as (keyof StoryGates)[]).filter((k) => !gates[k]).map((k) => GATE_WORDS[k]);
  return { gates, keep: missed.length === 0, missed };
}
