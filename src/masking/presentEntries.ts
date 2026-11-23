// Present-field entries are masked by default, with no device model.
// A span that already covers the entry is left alone, so an unmask stays an unmask.
// The worker role is the word "worker" in the record block and is not an entry.
import { overlaps } from "./exact";
import { findWholeWords, fold, foldWithMap } from "./fold";
import type { MaskSpan } from "./types";

export interface PresentEntry {
  label: string;
  role: string;
}

const SKIP = new Set(["i", "worker", "none"]);
const ALREADY_TAG = /^\[(?:Person|Place|Date|Detail) \d+\]$/i;

/** The value of a "Present:" line, in the original text. */
function presentLineRange(raw: string): { start: number; end: number } | null {
  const m = /^\s*Present:\s*(.*)$/im.exec(raw);
  if (!m || m[1] === undefined) return null;
  const valueStart = m.index + m[0].length - m[1].length;
  return { start: valueStart, end: valueStart + m[1].length };
}

/**
 * Mask each non-worker Present entry that no span already covers.
 * New spans are people and start accepted. An existing span keeps its accepted flag.
 */
export function maskPresentEntries(raw: string, spans: MaskSpan[], present: readonly PresentEntry[]): MaskSpan[] {
  const line = presentLineRange(raw);
  if (!line || present.length === 0) return spans;
  const folded = foldWithMap(raw);
  const next = [...spans];
  for (const person of present) {
    if (person.role === "worker") continue;
    const label = person.label.trim().replace(/[.;]+$/, "");
    if (label === "" || SKIP.has(fold(label)) || ALREADY_TAG.test(label)) continue;
    for (const hit of findWholeWords(raw, label, folded)) {
      if (hit.start < line.start || hit.end > line.end) continue;
      if (next.some((s) => overlaps(s, hit))) continue;
      next.push({
        start: hit.start,
        end: hit.end,
        surfaceForm: raw.slice(hit.start, hit.end),
        tag: "",
        kind: "manual",
        tagKind: "Person",
        key: `present:${fold(label)}`,
        accepted: true,
        sentOnPurpose: false,
      });
    }
  }
  return next;
}
