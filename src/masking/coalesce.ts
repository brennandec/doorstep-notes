// Join neighbouring listed or near spans of one person into one span, so
// "Tomas Brandvald" is one mask with one tag and not two (masking R2.3),
// and a hyphen between that person's own parts is inside the same span.
// A hyphen between two people stays, and so does a sentence or a comma.
import type { MaskSpan } from "./types";

const GAP = /^(?:[ \t\u00a0]+|[ \t\u00a0]*[-‐‑–—]+[ \t\u00a0]*)$/;

export function coalesceAdjacent(raw: string, spans: MaskSpan[]): MaskSpan[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: MaskSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    const joinable =
      last !== undefined &&
      last.key === s.key &&
      last.tagKind === s.tagKind &&
      (last.kind === "listed" || last.kind === "near") &&
      (s.kind === "listed" || s.kind === "near") &&
      last.accepted === s.accepted &&
      GAP.test(raw.slice(last.end, s.start));
    if (joinable) {
      out[out.length - 1] = {
        ...last,
        end: s.end,
        surfaceForm: raw.slice(last.start, s.end),
        kind: last.kind === "near" || s.kind === "near" ? "near" : "listed",
      };
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
