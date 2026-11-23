// Merge the exact, near and device results on the raw text (masking R4.2, ruling 6).
// A candidate that overlaps a listed or near mask is dropped. A candidate whose
// text is not in the record is dropped (R4.4). The rest are proposed, and not
// accepted unless the policy says so.
import { findWholeWords, foldWithMap, fold } from "./fold";
import { overlaps } from "./exact";
import { isNotNeeded, withoutRoleWord } from "./notNeeded";
import { allowsCategory, type MaskPolicy } from "./policy";
import type { MaskSpan, TagKind } from "./types";

/** The shape of a device proposal. Kept here so masking imports no inference module. */
export interface Proposal {
  text: string;
  kind: "name" | "place" | "dob" | "phrase";
}

const TAG_KIND: Record<Proposal["kind"], TagKind> = { name: "Person", place: "Place", dob: "Date", phrase: "Detail" };

export interface MergeResult {
  spans: MaskSpan[];
  /** candidates with no occurrence left to propose */
  dropped: Proposal[];
}

export function mergeProposals(raw: string, base: MaskSpan[], candidates: Proposal[], policy: MaskPolicy): MergeResult {
  const folded = foldWithMap(raw);
  const taken: MaskSpan[] = [...base];
  const added: MaskSpan[] = [];
  const dropped: Proposal[] = [];
  const seen = new Set<string>();
  // Longest first, so "her twin brother" wins over "twin brother".
  const ordered = candidates
    // A role word before a name is cut away and the name is kept (R18.2).
    .map((c) => ({ ...c, text: withoutRoleWord(c.text.trim()) }))
    .filter((c) => c.text !== "")
    .filter((c) => allowsCategory(policy, c.kind))
    // The prompt may be ignored, so a weekday, a time, a relative day or a lone role word is dropped here (R16.2, R18.1).
    .filter((c) => !isNotNeeded(c.text))
    .sort((a, b) => b.text.length - a.text.length);
  for (const c of ordered) {
    const id = `${c.kind}|${fold(c.text)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const hits = findWholeWords(raw, c.text, folded);
    let kept = 0;
    for (const hit of hits) {
      if (taken.some((s) => overlaps(s, hit))) continue;
      const span: MaskSpan = {
        start: hit.start,
        end: hit.end,
        surfaceForm: raw.slice(hit.start, hit.end),
        tag: "",
        kind: "proposed",
        tagKind: TAG_KIND[c.kind] ?? "Detail", // no kind from the model is a Detail, never a Place (X5)
        key: `text:${fold(c.text)}`,
        accepted: policy.proposalsStartAccepted,
        sentOnPurpose: false,
      };
      taken.push(span);
      added.push(span);
      kept += 1;
    }
    if (kept === 0) dropped.push(c);
  }
  return { spans: [...base, ...added].sort((a, b) => a.start - b.start), dropped };
}
