// Which mask-map entries are applied to an outgoing text (third review, X2).
// An entry is applied when its tag stands in the masked part of the text. The fixed
// instructions of every job hold an example tag; it is not a masked value, so the
// part that is looked at leaves the instructions out. No model, no network.
import { tagsIn } from "./tags";
import type { MaskEntry } from "./types";

const INSTRUCTIONS_AT = "\n\nInstructions:";
const SENTENCE_AT = "\n\nSentence: ";

/** The part of an outgoing text that holds masked record text. */
export function maskedPart(text: string): string {
  const sentence = text.indexOf(SENTENCE_AT);
  if (sentence !== -1) return text.slice(sentence + SENTENCE_AT.length);
  const instructions = text.indexOf(INSTRUCTIONS_AT);
  return instructions === -1 ? text : text.slice(0, instructions);
}

/** The entries whose tag stands in the masked part of the text, each once. */
export function appliedEntries(entries: MaskEntry[], text: string): MaskEntry[] {
  const present = new Set(tagsIn(maskedPart(text)).map((t) => t.toLowerCase()));
  return entries.filter((e) => present.has(e.tag.toLowerCase()));
}
