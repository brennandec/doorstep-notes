// The fixed instructions of the second reader (R1.1). They are part of the text zone 2
// shows and the job is given: the masked record, then these words. They ask who the
// text could be about and which words point there. They hold no record text and no name.

export const SECOND_READER_INSTRUCTIONS =
  "Instructions: Read the record above as someone who knows the area would. Say who it could be about. " +
  "For each guess give a short description of the person, why you think so, and the kind of clue: place, relation, date, role, name or other. " +
  "Quote only the exact words from the record that would identify the person to someone local, not tags such as [Person 1]. " +
  "Quote only words that appear in the record.";

/** The text of a second reader job: the masked record, then the fixed instructions. */
export function secondReaderText(maskedRecord: string): string {
  return `${maskedRecord}\n\n${SECOND_READER_INSTRUCTIONS}`;
}

/** The record part of a second reader text; the whole text when the instructions are missing. */
export function recordOf(text: string): string {
  const at = text.lastIndexOf(`\n\n${SECOND_READER_INSTRUCTIONS}`);
  return at === -1 ? text : text.slice(0, at);
}
