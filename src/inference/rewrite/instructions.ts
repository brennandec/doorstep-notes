// The fixed instructions of the rewrite job (R7.2). They are part of the text zone 2
// shows and the job is given. The reply asked for is one sentence and nothing
// else: a bare rewrite prompt returns a list of options (browser document, fact 5).

const COMMON =
  "Reply with exactly one rewritten sentence and nothing else. No list, no options, no explanation. " +
  "Keep every tag such as [Person 1] exactly as written. " +
  "Keep every fact: every person, object, place, date, number and action. " +
  "Do not add a person, place, date, number or object. " +
  "If the note is two sentences, join them with and. " +
  "Example: Sentence: [Person 1] brought the key to the meeting. The gate was shut. " +
  "Reply: [Person 1] brought the key to the meeting, and the gate was shut.";

export const REWRITE_INSTRUCTIONS = {
  shorter: `Rewrite the sentence below as a light edit in plain word order. ${COMMON}`,
  plainer: `Rewrite the sentence below as a light edit in plainer word order. ${COMMON}`,
} as const;

export type RewriteKind = keyof typeof REWRITE_INSTRUCTIONS;

export const SENTENCE_LABEL = "Sentence: ";

/** The text of a rewrite job: the fixed instructions, then the one masked sentence. */
export function rewriteText(kind: RewriteKind, sentence: string): string {
  return `${REWRITE_INSTRUCTIONS[kind]}\n\n${SENTENCE_LABEL}${sentence}`;
}

/** The sentence part of a rewrite text; empty when the label is missing. */
export function sentenceOf(text: string): string {
  const at = text.indexOf(`\n\n${SENTENCE_LABEL}`);
  return at === -1 ? "" : text.slice(at + 2 + SENTENCE_LABEL.length);
}
