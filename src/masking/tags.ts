// Tags: [Person 1], [Place 1], [Date 1], [Detail 1] (masking R2.3).
// Numbered by first appearance in the text across all spans, accepted or not,
// so pressing a chip never renumbers the others.
import type { MaskSpan, TagKind } from "./types";

export function tagLabel(tag: string): string {
  return tag.replace(/^\[|\]$/g, "");
}

export function assignTags(spans: MaskSpan[]): MaskSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const counters: Record<TagKind, number> = { Person: 0, Place: 0, Date: 0, Detail: 0 };
  const known = new Map<string, string>();
  return sorted.map((s) => {
    const id = `${s.tagKind}|${s.key}`;
    let tag = known.get(id);
    if (tag === undefined) {
      counters[s.tagKind] += 1;
      tag = `[${s.tagKind} ${counters[s.tagKind]}]`;
      known.set(id, tag);
    }
    return { ...s, tag };
  });
}

/** A tag as the masker writes it. Case is read loosely, so a changed tag such as [person 1] is still found. */
const TAG_PATTERN = /\[(Person|Place|Date|Detail) \d+\]/gi;

/** The tags in a text, exactly as written, without repeats, in order of first appearance. */
export function tagsIn(text: string): string[] {
  return [...new Set(text.match(TAG_PATTERN) ?? [])];
}
