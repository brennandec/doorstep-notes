// Near pass: edit distance exactly 1 to a listed name part of 5 letters or
// more, after case folding (masking R3, ruling 11). Nothing else counts as
// near: no accent stripping, no punctuation stripping, no swaps (a swap is
// distance 2). No model.
import { NEAR_MATCH_EDIT_DISTANCE, NEAR_MATCH_MIN_LETTERS } from "../constants";
import type { ClientEntry } from "./clientList";
import { fold } from "./fold";
import { nameParts, overlaps } from "./exact";
import { allowsCategory, type MaskPolicy } from "./policy";
import type { MaskSpan } from "./types";

/** Edit distance on letters: one letter added, dropped or changed each count 1. */
export function levenshtein(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + cost);
    }
    previous = row;
  }
  return previous[y.length]!;
}

interface NearTerm {
  folded: string;
  clientId: string;
}

function nearTerms(clients: ClientEntry[]): NearTerm[] {
  const seen = new Set<string>();
  const out: NearTerm[] = [];
  for (const c of clients) {
    for (const name of [c.fullName, ...c.otherNames]) {
      for (const part of nameParts(name)) {
        const folded = fold(part);
        if ([...folded].length < NEAR_MATCH_MIN_LETTERS || seen.has(folded)) continue;
        seen.add(folded);
        out.push({ folded, clientId: c.id });
      }
    }
  }
  return out;
}

/**
 * Words in the text one edit away from a listed name part. Words that overlap a span
 * already found, and words equal to a listed part, are left to the exact pass.
 */
export function findNear(raw: string, clients: ClientEntry[], policy: MaskPolicy, existing: MaskSpan[]): MaskSpan[] {
  if (!policy.nearMatch || raw === "" || clients.length === 0 || !allowsCategory(policy, "name")) return [];
  const terms = nearTerms(clients);
  if (terms.length === 0) return [];
  const exactTerms = new Set(terms.map((t) => t.folded));
  const spans: MaskSpan[] = [];
  for (const m of raw.matchAll(/[\p{L}\p{M}]+/gu)) {
    const word = m[0];
    const hit = { start: m.index ?? 0, end: (m.index ?? 0) + word.length };
    const f = fold(word);
    if (exactTerms.has(f)) continue;
    if (existing.some((s) => overlaps(s, hit))) continue;
    const t = terms.find((term) => Math.abs([...f].length - [...term.folded].length) <= 1 && levenshtein(f, term.folded) === NEAR_MATCH_EDIT_DISTANCE);
    if (!t) continue;
    spans.push({
      ...hit,
      surfaceForm: word,
      tag: "",
      kind: "near",
      clientId: t.clientId,
      tagKind: "Person",
      key: `client:${t.clientId}`,
      accepted: true,
      sentOnPurpose: false,
    });
  }
  return spans;
}
