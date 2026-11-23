// Rank a second-reader reply on this device. Place, relation and date come before
// role words such as "worker" and "landlord". Nothing here calls a model.
import { findWholeWords } from "../masking/fold";
import type { Guess, GuessKind } from "../inference/types";

export interface Clues {
  place: string;
  relation: string;
}

const ROLE_WORDS = new Set(["worker", "landlord", "landlady"]);
const STOP = new Set(["the", "a", "an", "on", "in", "of", "to", "and", "for", "at", "by", "was", "were"]);

const KIND_RANK: Record<GuessKind, number> = {
  place: 0,
  relation: 1,
  date: 2,
  name: 3,
  other: 4,
  role: 5,
};

/** A quote whose remaining words are only role words. */
export function isRoleWordQuote(quote: string): boolean {
  const words = quote
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word !== "" && !STOP.has(word));
  return words.length > 0 && words.every((word) => ROLE_WORDS.has(word));
}

function hasClue(text: string, clue: string): boolean {
  return clue !== "" && findWholeWords(text, clue).length > 0;
}

function onlyRoleWords(guess: Guess): boolean {
  const quotes = guess.evidence.map((quote) => quote.trim()).filter((quote) => quote !== "");
  return quotes.length > 0 && quotes.every((quote) => isRoleWordQuote(quote));
}

function score(guess: Guess, clues: Clues): number {
  const evidence = guess.evidence.join("\n");
  const roleOnly = onlyRoleWords(guess);
  if (hasClue(evidence, clues.place) && !roleOnly) return 0;
  if (hasClue(evidence, clues.relation) && !roleOnly) return 1;
  if (guess.kind === "date" && !roleOnly) return 2;
  if (roleOnly || guess.kind === "role") return 5;
  if (guess.kind === "place") return 0;
  if (guess.kind === "relation") return 1;
  return guess.kind ? KIND_RANK[guess.kind] : 4;
}

/** Stable order: place, then relation, then date, then other kinds, then role words. */
export function rankGuesses(guesses: Guess[], clues: Clues): Guess[] {
  return guesses
    .map((guess, index) => ({ guess, index, rank: score(guess, clues) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.guess);
}

/**
 * How many guesses still quote a place or relation clue that the masked text still holds.
 * A clue that has been masked is quoted by none of them.
 */
export function pointingCount(guesses: Guess[], clues: Clues, maskedText: string): number {
  const placeLeft = hasClue(maskedText, clues.place);
  const relationLeft = hasClue(maskedText, clues.relation);
  return guesses.filter((guess) => {
    const evidence = guess.evidence.join("\n");
    return (placeLeft && hasClue(evidence, clues.place)) || (relationLeft && hasClue(evidence, clues.relation));
  }).length;
}

/** The clue to mark in the masked text: the highest ranked quote that is still written out. */
export function quotedClue(guesses: Guess[], clues: Clues, maskedText: string): string | null {
  for (const guess of rankGuesses(guesses, clues)) {
    const evidence = guess.evidence.join("\n");
    if (hasClue(maskedText, clues.place) && hasClue(evidence, clues.place)) return clues.place;
    if (hasClue(maskedText, clues.relation) && hasClue(evidence, clues.relation)) return clues.relation;
  }
  return null;
}
