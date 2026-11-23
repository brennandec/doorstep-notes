// The words that say what the egress check scans (egress-check R9.3, shell-and-offline R21).
// One sentence, filled from the string table and the two constants. The page and the README
// both use it, and a test checks that the README holds it word for word.
import { MIN_NAME_PART_LENGTH, NEAR_MATCH_MIN_LETTERS } from "../constants";
import { fill, strings } from "./strings";

export function scannedSentence(): string {
  return fill(strings.egress.scanned, { min: MIN_NAME_PART_LENGTH, max: NEAR_MATCH_MIN_LETTERS });
}
