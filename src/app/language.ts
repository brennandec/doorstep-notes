// A simple check, not a language detector. The device model reads English,
// Spanish, Japanese, German and French (sdk-facts 8) and the create options
// state English, so a note that does not look English gets a plain warning.
import { strings } from "./strings";

const ENGLISH_WORDS = new Set(
  ("a an and are as at be but by for from had has have he her his i if in is it its me my no not of on or our she so " +
    "that the their them there they this to too was we were what when will with you also again agreed form next risk " +
    "visit seen said rang ring letter note").split(" "),
);

const MIN_WORDS = 6;
const MIN_ENGLISH_SHARE = 0.15;

export function looksNotEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 12) return false;
  const nonLatin = letters.filter((c) => !/\p{Script=Latin}/u.test(c)).length;
  if (nonLatin / letters.length > 0.5) return true;
  const words = (text.toLowerCase().match(/\p{L}+/gu) ?? []);
  if (words.length < MIN_WORDS) return false;
  const english = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return english / words.length < MIN_ENGLISH_SHARE;
}

export function languageLine(text: string): string | null {
  return looksNotEnglish(text) ? strings.record.language : null;
}
