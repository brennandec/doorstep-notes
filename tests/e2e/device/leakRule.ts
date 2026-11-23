// The raw-line rule of the device checks (H16). Pure functions, no browser, so a unit test can run them.
//
// A line of the raw note found in a request is a leak only when that raw line still carries something that
// identifies: a listed name, another name of a listed person, a name part, a surface form or a masked original.
// The remainder of a line whose names were masked ("my list) offered to help with the form.") carries none of
// those, and the cloud is meant to receive the masked note, so it is not a leak. The name checks are separate and
// unchanged (listed names, other names, name parts, masked originals; see hybridSupport.leakCheck).

const escape = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * True when `value` is in `text`, folded for case. Under five letters a value must stand as a whole word, as in
 * the app's own check (NEAR_MATCH_MIN_LETTERS); from five letters it is also found inside a longer word.
 */
export function valueInText(text: string, value: string): boolean {
  if (value.trim() === "") return false;
  const t = text.toLowerCase();
  const low = value.toLowerCase();
  const letters = [...value].filter((c) => /\p{L}/u.test(c)).length;
  if (letters >= 5) return t.includes(low);
  return new RegExp(`(?<![\\p{L}])${escape(low)}(?![\\p{L}])`, "u").test(t);
}

/** True when the raw line holds any of the values. */
export function lineCarriesValue(line: string, values: string[]): boolean {
  return values.some((v) => valueInText(line, v));
}

/** The raw note lines that are in the wire text and still carry a value that identifies. */
export function noteLinesLeaked(wireTexts: string[], noteLines: string[], values: string[]): string[] {
  return noteLines.filter((line) => wireTexts.some((t) => valueInText(t, line)) && lineCarriesValue(line, values));
}
