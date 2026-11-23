// WO-12 acceptance counts. Pure. No browser, no network.
// A tag leak is a mask token still in the shown note.
// An unclear pronoun is a bare pronoun in a sentence that already names two listed people.
import { cloudStatusView } from "../src/app/cloudStatus";

export interface CasePartText {
  purpose: string;
  observed: string;
  agreed: string;
  risks: string;
  next: string;
}

const TAG_RE = /\[(?:Person|Place|Date|Detail)[ \t]+\d+\]/;
const PERSON_TAG_RE = /\[Person[ \t]+\d+\]/i;
const BARE_RE = /\b(?:he|she|him|her|his|hers|they|them|their|theirs)\b/gi;

export function fivePartsPresent(parts: CasePartText): boolean {
  return [parts.purpose, parts.observed, parts.agreed, parts.risks, parts.next].every((part) => part.trim() !== "");
}

export function tagLeak(text: string): string | null {
  return text.match(TAG_RE)?.[0] ?? null;
}

/** The first bare pronoun whose sentence already contains two different listed names. */
export function unclearAfterSecondPerson(text: string, names: readonly string[]): string | null {
  const wanted = [...new Set(names.map((name) => name.trim()).filter((name) => name.length > 1))];
  const sentences = text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "");
  for (const sentence of sentences) {
    BARE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BARE_RE.exec(sentence)) !== null) {
      const before = sentence.slice(0, match.index).toLowerCase();
      let named = 0;
      for (const name of wanted) {
        if (before.includes(name.toLowerCase())) named += 1;
      }
      if (named >= 2) return match[0];
    }
  }
  return null;
}

/** Tags in the raw reply must be names in the shown note. A reply with no person tag has nothing to put back. */
export function namesPutBack(input: { shown: string; raw: string | null; names: readonly string[] }): boolean {
  if (TAG_RE.test(input.shown)) return false;
  if (input.raw === null || !PERSON_TAG_RE.test(input.raw)) return true;
  const lower = input.shown.toLowerCase();
  return input.names.some((name) => {
    const trimmed = name.trim();
    return trimmed.length > 1 && lower.includes(trimmed.toLowerCase());
  });
}

export interface Wo12Flags {
  fiveParts: boolean;
  invented: boolean;
  tagLeak: boolean;
  unclear: boolean;
  namesBack: boolean;
}

export function summarizeWo12(samples: readonly Wo12Flags[], kind: "cloud" | "device"): {
  n: number;
  fiveParts: number;
  invented: number;
  tagLeaks: number;
  unclear: number;
  namesBack: number;
  pass: boolean;
} {
  const fiveParts = samples.filter((sample) => sample.fiveParts).length;
  const invented = samples.filter((sample) => sample.invented).length;
  const tagLeaks = samples.filter((sample) => sample.tagLeak).length;
  const unclear = samples.filter((sample) => sample.unclear).length;
  const namesBack = samples.filter((sample) => sample.namesBack).length;
  const n = samples.length;
  // Plan: device at least 10 of 12 with 0 invented. Cloud stays 12 of 12.
  const pass =
    kind === "cloud"
      ? n === 12 && fiveParts === 12 && invented === 0 && tagLeaks === 0 && unclear === 0 && namesBack === 12
      : n === 12 && fiveParts >= 10 && invented === 0;
  return { n, fiveParts, invented, tagLeaks, unclear, namesBack, pass };
}

/** The cloud chip before a draft call. WO-02: ready, never "connected", and no call is made. */
export function cloudWordsBeforeDraft(): string {
  return cloudStatusView({ kind: "ready" }).words;
}
