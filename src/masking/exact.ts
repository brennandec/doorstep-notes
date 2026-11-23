// Exact pass: whole words, case folded, no model (masking R2, ruling 11).
// Matches every full name and other name as written, and every name part of at
// least the policy length. The longest form is taken first, so "Maria O-R" is
// one span and not three.
import { fold, foldWithMap, findWholeWords } from "./fold";
import type { ClientEntry } from "./clientList";
import { allowsCategory, type MaskPolicy } from "./policy";
import type { MaskSpan } from "./types";

export interface Term {
  /** the folded text to look for */
  folded: string;
  clientId: string;
  /** the term as written on the list */
  written: string;
}

const letters = (s: string) => [...s].length;

/** Splits a name into its parts on spaces, hyphens and other marks. */
export function nameParts(name: string): string[] {
  return name.split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
}

/** Whole names (full and other) and parts of at least `minPartLength`, first client wins. */
export function buildTerms(clients: ClientEntry[], minPartLength: number): Term[] {
  const seen = new Set<string>();
  const terms: Term[] = [];
  const add = (written: string, clientId: string) => {
    const folded = fold(written);
    if (folded === "" || seen.has(folded)) return;
    seen.add(folded);
    terms.push({ folded, clientId, written });
  };
  // Whole names first so that a part shared with a whole name belongs to its owner.
  for (const c of clients) {
    add(c.fullName, c.id);
    for (const o of c.otherNames) add(o, c.id);
  }
  for (const c of clients) {
    for (const name of [c.fullName, ...c.otherNames]) {
      for (const p of nameParts(name)) if (letters(fold(p)) >= minPartLength) add(p, c.id);
    }
  }
  return terms;
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

export function findExact(raw: string, clients: ClientEntry[], policy: MaskPolicy): MaskSpan[] {
  if (raw === "" || clients.length === 0 || !allowsCategory(policy, "name")) return [];
  const folded = foldWithMap(raw, true);
  const terms = buildTerms(clients, policy.minPartLength).sort((a, b) => b.folded.length - a.folded.length);
  const spans: MaskSpan[] = [];
  for (const t of terms) {
    for (const hit of findWholeWords(raw, t.written, folded, true)) {
      if (spans.some((s) => overlaps(s, hit))) continue;
      spans.push({
        start: hit.start,
        end: hit.end,
        surfaceForm: raw.slice(hit.start, hit.end),
        tag: "",
        kind: "listed",
        clientId: t.clientId,
        tagKind: "Person",
        key: `client:${t.clientId}`,
        accepted: true,
        sentOnPurpose: false,
      });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}
