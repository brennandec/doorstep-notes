// Which sentences of the rough note reach the record (capture-and-record R15). No model, no request. Compares words, not meaning.
import type { VisitRecord } from "../inference/types";

/** Words that carry no fact on their own. */
const STOP = new Set(["the","and","for","not","but","with","too","there","this","that","also","was","were","his","her","she","him","they","them","then","has","had","have","are","its","our","into","from","any","all","who","what","when","again","last","just","very"]);
const LABEL = /^\p{L}[\p{L} ]{0,19}:\s+/u;

export const tokens = (s: string): string[] => s.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}]+(?:[\/:'-][\p{L}\p{N}]+)*/gu) ?? [];

/** The note's sentences; a line break inside a sentence is a space. */
export function noteSentences(note: string): string[] {
  return note.replace(/\s*\n\s*/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s !== "");
}

/**
 * Note sentences with no counterpart in the record, in note order. A sentence is missing when one of its tokens with a digit
 * is in no field, or when fewer than two thirds of its other words (3+ letters, not in STOP) are in any field. The first
 * sentence that holds every token of record.visitDate is the visit header: its date is the date field and the record has no
 * field for time or place (R4.2), so it is not checked. A leading label such as "Agreed:" is not a word of the sentence.
 * Known gap: a word lost inside a sentence that keeps two thirds of its words is not reported.
 */
export function findMissingSentences(note: string, record: VisitRecord): string[] {
  const have = new Set([record.visitDate, ...record.present.map((p) => p.label), ...record.seen, ...record.agreed, ...record.risks, ...record.nextSteps].flatMap(tokens));
  const dateTokens = tokens(record.visitDate);
  let headerSeen = false;
  const missing: string[] = [];
  for (const sentence of noteSentences(note)) {
    const t = tokens(sentence.replace(LABEL, ""));
    if (!headerSeen && dateTokens.length > 0 && dateTokens.every((d) => t.includes(d))) { headerSeen = true; continue; }
    const keys = t.filter((x) => /\p{N}/u.test(x));
    const words = t.filter((x) => !/\p{N}/u.test(x) && x.length >= 3 && !STOP.has(x));
    const kept = words.filter((x) => have.has(x)).length;
    if (keys.some((x) => !have.has(x)) || (words.length > 0 && kept * 3 < words.length * 2)) missing.push(sentence);
  }
  return missing;
}
