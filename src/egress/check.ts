// The egress check (egress-check R4, rulings 1, 4, 24).
// Exact string search on folded text. Nothing else: no model, no scoring.
// It scans the URL and the body of every captured request. A body is scanned as
// UTF-8 text and, when it parses as JSON, also as its string values joined by a
// newline, so an escaped character does not hide a name.
//
// What is looked for:
//   listed names   each full name and other name on the list, and each single
//                  part of one of them of at least MIN_NAME_PART_LENGTH letters
//   masked values  every recorded surface form (the original text that was masked)
// A listed name counts as found if the name or any of its parts is in the text.
import { MIN_NAME_PART_LENGTH, NEAR_MATCH_MIN_LETTERS } from "../constants";
import { fold } from "../masking/fold";
import { nameParts } from "../masking/exact";
import type { MaskEntry } from "../masking/types";

/** How a request was answered: the HTTP status, or "no answer" when `fetch` threw (egress-check R17). */
export type Answer = number | "no answer";

export interface Captured {
  url: string;
  body: Uint8Array;
  /** set by the capture wrapper; absent for a body the send path built itself (a test double) */
  status?: Answer;
  /**
   * Set by the capture wrapper from the method and headers of the call.
   * True when the browser will send an OPTIONS preflight the page cannot see.
   * Absent means the capture did not see the call, and the count stays 0.
   */
  preflight?: boolean;
}

export interface CheckInput {
  captured: Captured[];
  /** full names and other names on the list */
  listedNames: string[];
  /** every masked occurrence as found */
  surfaceForms: string[];
  /** listed values she chose to send: full names and surface forms */
  sentOnPurpose: string[];
  /**
   * The mask-map entries applied to the outgoing text (third review, X2). When given, the masked
   * count is the number of entries and an entry is found when any of its forms is in the bytes.
   * When absent, the older count by distinct surface forms is kept.
   */
  entries?: MaskEntry[];
  /** shortest name part scanned alone; defaults to the constant */
  minPartLength?: number;
}

export interface CheckResult {
  /** listed names checked, after folding and removing duplicates and empty values */
  listedChecked: number;
  /** listed names found and not sent on purpose, as written on the list */
  listedFound: string[];
  maskedChecked: number;
  /** surface forms found and not sent on purpose */
  maskedFound: string[];
  /** listed names and surface forms found that she chose to send */
  onPurposeFound: string[];
  /** false if any found value is not on purpose */
  passed: boolean;
}

const decoder = new TextDecoder("utf-8", { fatal: false });

function jsonStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) jsonStrings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) jsonStrings(v, out);
}

/** The folded texts to search for one request: URL, body text, and the body's JSON string values. */
export function scanTexts(c: Captured): string[] {
  const body = decoder.decode(c.body);
  const texts = [c.url, body];
  try {
    const strings: string[] = [];
    jsonStrings(JSON.parse(body), strings);
    if (strings.length > 0) texts.push(strings.join("\n"));
  } catch {
    // Not JSON: the body text above is all there is to scan.
  }
  return texts.map(fold);
}

const letters = (s: string) => [...s].length;

/** The folded values that stand for one listed name: the name, then its parts of enough letters. */
export function valuesForName(name: string, minPartLength: number): string[] {
  const whole = fold(name.trim());
  if (whole === "") return [];
  const parts = nameParts(name).map(fold).filter((p) => letters(p) >= minPartLength);
  return [...new Set([whole, ...parts])];
}

const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/**
 * True if the folded value is in the folded text. A value of fewer than
 * NEAR_MATCH_MIN_LETTERS letters must stand as a whole word, so that "Tom" does
 * not find "tomorrow". A longer value is found anywhere (OPEN-QUESTIONS, egress check).
 */
export function containsValue(text: string, value: string): boolean {
  if (value === "") return false;
  if (letters(value) >= NEAR_MATCH_MIN_LETTERS) return text.includes(value);
  for (let from = 0; ; ) {
    const i = text.indexOf(value, from);
    if (i === -1) return false;
    from = i + 1;
    const before = text.slice(0, i).match(/.$/su)?.[0] ?? "";
    const after = text.slice(i + value.length).match(/^./su)?.[0] ?? "";
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
  }
}

export function checkEgress(input: CheckInput): CheckResult {
  const texts = input.captured.flatMap(scanTexts);
  const present = (folded: string) => texts.some((t) => containsValue(t, folded));
  const min = input.minPartLength ?? MIN_NAME_PART_LENGTH;
  const purpose = new Set(input.sentOnPurpose.map(fold).filter((v) => v !== ""));
  // A value she chose to send, and the parts of it, are not failures.
  const purposeValues = new Set<string>(purpose);
  for (const p of input.sentOnPurpose) for (const v of valuesForName(p, min)) purposeValues.add(v);

  const listed = new Map<string, string>(); // folded full value -> as written
  for (const n of input.listedNames) {
    const f = fold(n.trim());
    if (f !== "" && !listed.has(f)) listed.set(f, n.trim());
  }
  const forms = new Map<string, string>();
  if (!input.entries) {
    for (const s of input.surfaceForms) {
      const f = fold(s);
      if (f.trim() !== "" && !forms.has(f)) forms.set(f, s);
    }
  }

  const listedFound: string[] = [];
  const maskedFound: string[] = [];
  const onPurposeFound: string[] = [];

  for (const written of listed.values()) {
    const hits = valuesForName(written, min).filter(present);
    if (hits.length === 0) continue;
    // On purpose only if everything that matched belongs to a value she chose to send.
    (hits.every((h) => purposeValues.has(h)) ? onPurposeFound : listedFound).push(written);
  }
  for (const [f, written] of forms) {
    if (!present(f)) continue;
    if (purpose.has(f)) {
      if (!onPurposeFound.some((v) => fold(v) === f)) onPurposeFound.push(written);
    } else {
      maskedFound.push(written);
    }
  }

  // By entries: one tag is one masked value, however many forms stand for it.
  for (const entry of input.entries ?? []) {
    const hits = entry.forms.filter((form) => fold(form).trim() !== "" && present(fold(form)));
    if (hits.length === 0) continue;
    const loud = hits.filter((h) => !purpose.has(fold(h)));
    if (loud.length > 0) maskedFound.push(loud[0]!);
    else if (!onPurposeFound.some((v) => fold(v) === fold(hits[0]!))) onPurposeFound.push(hits[0]!);
  }

  return {
    listedChecked: listed.size,
    listedFound,
    maskedChecked: input.entries ? input.entries.length : forms.size,
    maskedFound,
    onPurposeFound,
    passed: listedFound.length === 0 && maskedFound.length === 0,
  };
}
