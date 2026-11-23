// Scoring for the synthetic set (measurement design, Scoring).
// An identifier is caught if every character of its span lies inside a masked
// span. A partial cover is a miss. A masked span that overlaps no known
// identifier is a false mask. The same rules apply to every pass.
//
// The accepted flag of a span is not read here: a proposed span counts as a
// mask, because the figure describes what the pass finds, not what she accepts.
import type { IdentifierKind, KnownIdentifier, SyntheticNote } from "./buildSet";

export interface Span {
  start: number;
  end: number;
}

export interface NoteScore {
  caught: KnownIdentifier[];
  missed: KnownIdentifier[];
  falseMasks: (Span & { text: string })[];
}

export interface PassScore {
  caught: number;
  total: number;
  falseMasks: number;
  byKind: Record<string, { caught: number; total: number }>;
}

export interface MissItem {
  noteId: string;
  kind: string;
  text: string;
}

export interface PassResult {
  score: PassScore;
  misses: MissItem[];
  falseMaskItems: MissItem[];
  /** how many notes were scored */
  notesScored: number;
}

export const KINDS: IdentifierKind[] = ["listedName", "otherName", "nearVariant", "place", "dob", "phrase"];

/** Joins overlapping and touching spans, dropping empty ones. */
function union(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

export function scoreNote(note: SyntheticNote, spans: Span[]): NoteScore {
  const merged = union(spans);
  const covered = (i: Span) => merged.some((m) => m.start <= i.start && i.end <= m.end);
  const caught: KnownIdentifier[] = [];
  const missed: KnownIdentifier[] = [];
  for (const i of note.identifiers) (covered(i) ? caught : missed).push(i);
  const falseMasks = spans
    .filter((s) => s.end > s.start)
    .filter((s) => !note.identifiers.some((i) => s.start < i.end && i.start < s.end))
    .map((s) => ({ start: s.start, end: s.end, text: note.text.slice(s.start, s.end) }));
  return { caught, missed, falseMasks };
}

export function scorePass(notes: SyntheticNote[], spansByNote: Map<string, Span[]>, firstN?: number): PassResult {
  if (firstN !== undefined && (!Number.isInteger(firstN) || firstN < 0)) throw new Error("firstN must be a whole number of 0 or more.");
  const scored = firstN === undefined ? notes : notes.slice(0, firstN);
  const byKind: PassScore["byKind"] = Object.fromEntries(KINDS.map((k) => [k, { caught: 0, total: 0 }]));
  const misses: MissItem[] = [];
  const falseMaskItems: MissItem[] = [];
  let caught = 0;
  let total = 0;
  for (const note of scored) {
    const s = scoreNote(note, spansByNote.get(note.id) ?? []);
    for (const i of s.caught) {
      caught += 1;
      total += 1;
      const k = (byKind[i.kind] ??= { caught: 0, total: 0 });
      k.caught += 1;
      k.total += 1;
    }
    for (const i of s.missed) {
      total += 1;
      (byKind[i.kind] ??= { caught: 0, total: 0 }).total += 1;
      misses.push({ noteId: note.id, kind: i.kind, text: i.text });
    }
    for (const f of s.falseMasks) falseMaskItems.push({ noteId: note.id, kind: "falseMask", text: f.text });
  }
  return {
    score: { caught, total, falseMasks: falseMaskItems.length, byKind },
    misses,
    falseMaskItems,
    notesScored: scored.length,
  };
}
