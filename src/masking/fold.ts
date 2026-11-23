// Case folding and whole-word search on folded text (masking R2.1).
// JavaScript has no built-in full case fold. This uses NFC, then upper case,
// then lower case, which maps "ß" and "SS" alike and keeps accented letters as
// written. Its limits are in OPEN-QUESTIONS item 17. No model, no dependency.

export function fold(s: string): string {
  return s.normalize("NFC").toUpperCase().toLowerCase();
}

/**
 * Folds, then treats the pairs a photo read confuses as one letter: I and l, O and 0
 * (results/handwriting.json: "Ione" read as "lone"). Each letter maps to one letter,
 * so positions stay the same. Used by the exact pass only.
 */
export function foldConfusable(s: string): string {
  return fold(s).replace(/i/g, "l").replace(/0/g, "o");
}

export interface Folded {
  /** the folded text */
  text: string;
  /** for each UTF-16 unit of `text`, where its source letter starts in the original */
  starts: number[];
  /** for each UTF-16 unit of `text`, where its source letter ends in the original */
  ends: number[];
}

/** Folds letter by letter (a letter and its accents together), remembering where each part came from. */
export function foldWithMap(original: string, confusable = false): Folded {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const m of original.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const index = m.index ?? 0;
    const piece = confusable ? foldConfusable(m[0]) : fold(m[0]);
    for (let i = 0; i < piece.length; i++) {
      starts.push(index);
      ends.push(index + m[0].length);
    }
    text += piece;
  }
  return { text, starts, ends };
}

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

function charBefore(s: string, i: number): string {
  if (i <= 0) return "";
  const low = s.charCodeAt(i - 1);
  if (low >= 0xdc00 && low <= 0xdfff && i >= 2) return s.slice(i - 2, i);
  return s.slice(i - 1, i);
}
function charAt(s: string, i: number): string {
  if (i >= s.length) return "";
  const cp = s.codePointAt(i);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

export interface Hit {
  start: number;
  end: number;
}

/**
 * Every place the term occurs in the text as a whole word, ignoring case by folding.
 * Positions are in the original text. A word boundary is any character that is not
 * a letter, a digit or an accent mark.
 */
export function findWholeWords(original: string, term: string, foldedOrNot?: Folded, confusable = false): Hit[] {
  const folded: Folded = foldedOrNot ?? foldWithMap(original, confusable);
  const needle = confusable ? foldConfusable(term) : fold(term);
  if (needle === "") return [];
  const hits: Hit[] = [];
  let from = 0;
  for (;;) {
    const i = folded.text.indexOf(needle, from);
    if (i === -1) break;
    from = i + 1;
    const j = i + needle.length;
    // The match must start and end on whole letters of the original.
    if (i > 0 && folded.starts[i - 1] === folded.starts[i]) continue;
    if (j < folded.text.length && folded.starts[j] === folded.starts[j - 1]) continue;
    const start = folded.starts[i]!;
    const end = folded.ends[j - 1]!;
    if (WORD_CHAR.test(charBefore(original, start))) continue;
    if (WORD_CHAR.test(charAt(original, end))) continue;
    hits.push({ start, end });
  }
  return hits;
}
