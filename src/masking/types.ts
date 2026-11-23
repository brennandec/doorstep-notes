// Shapes for masking (design.md, Data shapes). No model is imported here.
import type { ClientEntry } from "./clientList";

export type { ClientEntry };

export type MaskKind = "listed" | "near" | "proposed" | "manual";
export type TagKind = "Person" | "Place" | "Date" | "Detail";

export interface MaskSpan {
  start: number;
  end: number;
  /** exact text found at [start, end) in the text that was searched */
  surfaceForm: string;
  /** "[Person 1]"; empty until tags are assigned */
  tag: string;
  kind: MaskKind;
  clientId?: string;
  /** which tag family this span belongs to */
  tagKind: TagKind;
  /** same key and same tag kind means the same tag: "client:c1" or "text:bea" */
  key: string;
  /** proposed spans start false */
  accepted: boolean;
  /** ruling 5, listed values only */
  sentOnPurpose: boolean;
}

/** tag to the listed full name, or the first surface form for other values */
export interface MaskMap {
  [tag: string]: string;
}

/** One mask-map entry: a tag and every form of the original that stands for it (third review, X2). */
export interface MaskEntry {
  tag: string;
  /** the original as mapped, then each surface form found; de-duplicated with case folding */
  forms: string[];
}

export interface MaskResult {
  maskedText: string;
  /** every span, accepted or not, with its tag */
  spans: MaskSpan[];
  map: MaskMap;
  /** tag to client id, for tags that stand for a person on the list */
  clientByTag: Record<string, string>;
  /** accepted surface forms, de-duplicated, for the egress check and the reader redaction */
  surfaceForms: string[];
  /** every full name and other name on the list */
  listedNames: string[];
  /** the same names grouped by client, for the block line: one group is one person on the list (sixth review R2) */
  listedGroups?: string[][];
  /** listed values she chose to send: the full name and the surface forms of that value */
  sentOnPurpose: string[];
  /** one entry for each tag in the map; the count of masked values is a count of these (X2) */
  entries?: MaskEntry[];
}
