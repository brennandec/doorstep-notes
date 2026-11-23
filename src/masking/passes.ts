// The headless path: exact and near passes on a raw text, no model, no DOM
// (masking R12.1). The measurement spec calls this on the synthetic notes.
import type { ClientEntry } from "./clientList";
import { coalesceAdjacent } from "./coalesce";
import { findExact } from "./exact";
import { findNear } from "./near";
import type { MaskPolicy } from "./policy";
import type { MaskSpan } from "./types";

/** Exact pass, then near pass on the same raw text, joined where one person's words touch. */
export function exactAndNear(raw: string, clients: ClientEntry[], policy: MaskPolicy): MaskSpan[] {
  const exact = findExact(raw, clients, policy);
  const near = findNear(raw, clients, policy, exact);
  return coalesceAdjacent(raw, [...exact, ...near]);
}
