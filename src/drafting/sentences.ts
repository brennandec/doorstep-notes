// Which sentences of the outgoing text can be rewritten (drafting R10.1).
// Only the masked record part can be selected: not the fixed instructions, not the date line,
// not the list of people. A sentence is one item of Seen, Agreed, Risks or Next steps, or one
// sentence inside such an item. Offsets are into the outgoing text itself.
import { findWholeWords, fold, foldWithMap } from "../masking/fold";
import { tagsIn } from "../masking/tags";
import type { MaskEntry, MaskSpan, TagKind } from "../masking/types";
import type { Outgoing } from "./buildOutgoing";
import type { Prepared } from "./draftFlow";

export interface SentenceRange {
  start: number;
  end: number;
  text: string;
}

/** The fixed instructions begin here (buildOutgoing INSTRUCTIONS). */
const BOUNDARY = "\n\nInstructions:";
const SKIP_LINES = /^(?:Visit date|Present):/;
const LABEL = /^[A-Z][A-Za-z ]*:\s*/;

/** The end of the masked record part, or null when the text has no such part (the reader's text, for one). */
export function recordPartEnd(text: string): number | null {
  const at = text.indexOf(BOUNDARY);
  return at === -1 ? null : at;
}

export function selectableSentences(text: string): SentenceRange[] {
  const end = recordPartEnd(text);
  if (end === null) return [];
  const out: SentenceRange[] = [];
  let lineStart = 0;
  for (const line of text.slice(0, end).split("\n")) {
    const here = lineStart;
    lineStart += line.length + 1;
    if (SKIP_LINES.test(line)) continue;
    const label = LABEL.exec(line);
    if (!label) continue;
    const bodyStart = here + label[0].length;
    const body = line.slice(label[0].length);
    // Items are joined by "; "; inside an item a new sentence starts after . ! or ? and a space.
    let from = 0;
    const cut = /;\s+|(?<=[.!?])\s+(?=[A-Z[])/g;
    const pieces: [number, number][] = [];
    for (const m of body.matchAll(cut)) {
      pieces.push([from, m.index ?? 0]);
      from = (m.index ?? 0) + m[0].length;
    }
    pieces.push([from, body.length]);
    for (const [a, b] of pieces) {
      const piece = body.slice(a, b).replace(/;\s*$/, "");
      if (!/\p{L}/u.test(piece) || piece.trim().toLowerCase() === "none") continue;
      out.push({ start: bodyStart + a, end: bodyStart + a + piece.length, text: piece });
    }
  }
  return out;
}

/** A sentence she replaced: the nth place its text stands in the record part. */
export interface Replacement {
  from: string;
  to: string;
  /** which occurrence of `from` in the record part, counting from zero */
  nth: number;
}

/** The place the selected sentence stands among equal sentences before it. */
export function occurrenceIndex(text: string, range: SentenceRange): number {
  let n = 0;
  for (const r of selectableSentences(text)) {
    if (r.start >= range.start) break;
    if (r.text === range.text) n++;
  }
  return n;
}

function nthIndex(haystack: string, needle: string, nth: number): number {
  let at = -1;
  for (let i = 0; i <= nth; i++) {
    at = haystack.indexOf(needle, at + 1);
    if (at === -1) return -1;
  }
  return at;
}

const ANY_TAG = /\[(?:Person|Place|Date|Detail) \d+\]/gi;

function tagIntervals(text: string): { start: number; end: number }[] {
  return [...text.matchAll(ANY_TAG)].map((m) => {
    const start = m.index ?? 0;
    return { start, end: start + m[0].length };
  });
}

function highestDetailNumber(record: string, map: Readonly<Record<string, string>>): number {
  let max = 0;
  for (const tag of [...Object.keys(map), ...tagsIn(record)]) {
    const m = /^\[Detail (\d+)\]$/i.exec(tag);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Mask additional whole-word terms on an already-built (and possibly rewritten) Outgoing record,
 * preserving existing tags and updating mask.map, mask.surfaceForms, mask.entries, and mask.spans.
 */
export function maskTermsInOutgoing(outgoing: Outgoing, terms: readonly string[]): Outgoing {
  if (terms.length === 0) return outgoing;
  let record = outgoing.maskedRecord;
  const map = { ...outgoing.mask.map };
  const surfaceForms = [...outgoing.mask.surfaceForms];
  const entries: MaskEntry[] = (outgoing.mask.entries ?? []).map((e) => ({ tag: e.tag, forms: [...e.forms] }));
  const spans: MaskSpan[] = [...outgoing.mask.spans];
  let nextDetail = highestDetailNumber(record, map);
  let changed = false;

  for (const rawTerm of terms) {
    const wanted = rawTerm.trim();
    if (wanted === "") continue;
    const folded = foldWithMap(record);
    const locked = tagIntervals(record);
    const hits = findWholeWords(record, wanted, folded).filter(
      (hit) => !locked.some((t) => hit.start < t.end && hit.end > t.start),
    );
    if (hits.length === 0) continue;

    const firstSurface = record.slice(hits[0]!.start, hits[0]!.end);
    const foldedFirst = fold(firstSurface);
    let tag = Object.keys(map).find((k) => fold(map[k]!) === foldedFirst);
    if (!tag) {
      nextDetail += 1;
      tag = `[Detail ${nextDetail}]`;
      map[tag] = firstSurface;
    }

    const tagKindMatch = /^\[(Person|Place|Date|Detail) /i.exec(tag);
    const tagKind = (tagKindMatch ? tagKindMatch[1] : "Detail") as TagKind;
    let entry = entries.find((e) => e.tag === tag);
    if (!entry) {
      entry = { tag, forms: [map[tag]!] };
      entries.push(entry);
    }

    let nextRecord = "";
    let cursor = 0;
    for (const hit of hits) {
      const surface = record.slice(hit.start, hit.end);
      nextRecord += record.slice(cursor, hit.start) + tag;
      cursor = hit.end;
      if (!surfaceForms.some((x) => fold(x) === fold(surface))) surfaceForms.push(surface);
      if (!entry.forms.some((x) => fold(x) === fold(surface))) entry.forms.push(surface);
      spans.push({
        start: hit.start,
        end: hit.end,
        surfaceForm: surface,
        tag,
        kind: "manual",
        tagKind,
        key: `text:${fold(wanted)}`,
        accepted: true,
        sentOnPurpose: false,
      });
    }
    record = nextRecord + record.slice(cursor);
    changed = true;
  }

  if (!changed) return outgoing;
  const text = record + outgoing.text.slice(outgoing.maskedRecord.length);
  return {
    ...outgoing,
    text,
    maskedRecord: record,
    mask: {
      ...outgoing.mask,
      maskedText: record,
      spans,
      map,
      surfaceForms,
      entries,
    },
  };
}

/** Apply stored sentence replacements to an Outgoing record and report how many targets failed to match. */
export function applyRecordReplacements(outgoing: Outgoing, list: readonly Replacement[]): { outgoing: Outgoing; skipped: number } {
  if (list.length === 0) return { outgoing, skipped: 0 };
  const oldRecord = outgoing.maskedRecord;
  let record = oldRecord;
  let skipped = 0;
  for (const r of list) {
    const at = nthIndex(record, r.from, r.nth);
    if (at === -1) {
      skipped += 1;
      continue;
    }
    // An item that is followed by another is joined with "; ", so its own full stop is dropped (drafting R15.6).
    const after = record.slice(at + r.from.length);
    const to = after.startsWith(";") ? r.to.replace(/\.$/, "") : r.to;
    record = record.slice(0, at) + to + after;
  }
  if (record === oldRecord) return { outgoing, skipped };
  const text = record + outgoing.text.slice(oldRecord.length);
  return {
    outgoing: { ...outgoing, text, maskedRecord: record, mask: { ...outgoing.mask, maskedText: record } },
    skipped,
  };
}

/**
 * The prepared draft with the replacements applied to its record part. The preview check runs again
 * on the new text, so the string shown, the string checked and the string given to Send agree (R2.2, R2.3).
 */
export function applyReplacements(prep: Prepared, list: readonly Replacement[], makePreview: (text: string) => Prepared["preview"]): Prepared {
  const { outgoing } = applyRecordReplacements(prep.outgoing, list);
  if (outgoing === prep.outgoing) return prep;
  return { ...prep, outgoing, preview: makePreview(outgoing.text) };
}
