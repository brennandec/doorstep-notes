// Masking policy: defaults in code (masking R9).
// This file imports no Firebase and no inference module.
import { MIN_NAME_PART_LENGTH } from "../constants";

/** Identifier kinds an agency policy may name. The masker and the device pass both read this list. */
export const IDENTIFIER_CATEGORIES = ["name", "place", "dob", "phrase"] as const;
export type IdentifierCategory = (typeof IDENTIFIER_CATEGORIES)[number];

export interface MaskPolicy {
  nearMatch: boolean;
  minPartLength: number;
  proposalsStartAccepted: boolean;
  source: "default" | "remote";
  /** Shown on /about. Absent on the compiled masker default. */
  name?: string;
  /** Shown on /about. Absent on the compiled masker default. */
  version?: number;
  /**
   * When set, a kind missing from this list is not masked by the exact pass,
   * the near pass, or the device pass. Absent means every kind.
   */
  categories?: readonly IdentifierCategory[];
}

/** True when the policy allows this identifier kind. An absent list allows every kind. */
export function allowsCategory(policy: MaskPolicy, kind: IdentifierCategory): boolean {
  return policy.categories === undefined || policy.categories.includes(kind);
}

export const DEFAULT_POLICY: MaskPolicy = {
  nearMatch: true,
  minPartLength: MIN_NAME_PART_LENGTH,
  proposalsStartAccepted: false,
  source: "default",
};
