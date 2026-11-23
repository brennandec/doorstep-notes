// Changing masks by hand: toggle a chip, mask a word or phrase, send a name on
// purpose (masking R5.2, R5.3, R7). Each change returns the new spans and the
// words to announce to assistive technology. Spans are in text order with tags.
import { fold, findWholeWords, foldWithMap } from "./fold";
import { overlaps } from "./exact";
import { fill, strings } from "../app/strings";
import { assignTags, tagLabel } from "./tags";
import type { MaskSpan } from "./types";

export interface Change {
  spans: MaskSpan[];
  /** plain words for the polite live region; empty when nothing changed */
  announcement: string;
}

const sameValue = (a: MaskSpan, b: MaskSpan) =>
  a.key === b.key && a.tagKind === b.tagKind && fold(a.surfaceForm) === fold(b.surfaceForm);

function announceMasked(s: MaskSpan): string {
  return fill(strings.masking.announceMasked, { what: tagLabel(s.tag) });
}
function announceUnmasked(s: MaskSpan): string {
  return fill(strings.masking.announceUnmasked, { what: s.surfaceForm });
}

/**
 * Press or Enter on a chip. Every occurrence of the same value changes together,
 * so the egress check does not find the others. Masking again removes "sent on purpose".
 */
export function toggleSpan(spans: MaskSpan[], index: number): Change {
  const target = spans[index];
  if (!target) return { spans, announcement: "" };
  const accepted = !target.accepted;
  const next = spans.map((s) => (sameValue(s, target) ? { ...s, accepted, sentOnPurpose: false } : s));
  return { spans: next, announcement: accepted ? announceMasked(target) : announceUnmasked(target) };
}

/**
 * Mask a word or phrase by hand. All occurrences of the same text, by case-folded
 * exact match, are masked together. There is no option for one occurrence only.
 */
export function maskText(raw: string, spans: MaskSpan[], text: string): Change {
  const wanted = text.trim();
  if (wanted === "") return { spans, announcement: "" };
  const folded = foldWithMap(raw);
  let next = [...spans];
  let first: MaskSpan | undefined;
  for (const hit of findWholeWords(raw, wanted, folded)) {
    const same = next.findIndex((s) => s.start === hit.start && s.end === hit.end);
    if (same !== -1) {
      const s = next[same]!;
      if (!s.accepted) next[same] = { ...s, accepted: true, sentOnPurpose: false };
      first ??= next[same]!;
      continue;
    }
    if (next.some((s) => overlaps(s, hit))) continue;
    const added: MaskSpan = {
      start: hit.start,
      end: hit.end,
      surfaceForm: raw.slice(hit.start, hit.end),
      tag: "",
      kind: "manual",
      tagKind: "Detail",
      key: `text:${fold(wanted)}`,
      accepted: true,
      sentOnPurpose: false,
    };
    next.push(added);
    first ??= added;
  }
  if (!first) return { spans, announcement: "" };
  next = assignTags(next);
  const tagged = next.find((s) => s.key === first!.key && s.tagKind === first!.tagKind) ?? first;
  return { spans: next, announcement: announceMasked(tagged) };
}

/** The question asked before a listed name is sent on purpose. It names the value. */
export function purposeQuestion(span: MaskSpan): string {
  return fill(strings.masking.purposeQuestion, { name: span.surfaceForm });
}

/** Only a listed or near value can be sent on purpose (ruling 5). Call after she confirms. */
export function sendOnPurpose(spans: MaskSpan[], index: number): Change {
  const target = spans[index];
  if (!target || (target.kind !== "listed" && target.kind !== "near")) return { spans, announcement: "" };
  const next = spans.map((s) => (sameValue(s, target) ? { ...s, accepted: false, sentOnPurpose: true } : s));
  return { spans: next, announcement: fill(strings.masking.label.purpose, { what: target.surfaceForm }) };
}

/** A new record starts with no value sent on purpose. */
export function clearPurpose(spans: MaskSpan[]): MaskSpan[] {
  return spans.map((s) => (s.sentOnPurpose ? { ...s, sentOnPurpose: false } : s));
}
