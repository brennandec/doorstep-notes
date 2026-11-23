// Entry points for the measurement spec (masking R12.1, ruling 7).
// Headless (Node, no DOM, no model): runPasses().
// Browser (DEVICE MODEL): devicePass(), which runs the propose-masks job on the
// same raw note. Both read the raw text itself, never a masked copy.
import type { ClientEntry } from "./clientList";
import { coalesceAdjacent } from "./coalesce";
import { runDevicePass, type DevicePassResult, type ProposalJobLike } from "./devicePass";
import { findExact } from "./exact";
import { findNear } from "./near";
import type { MaskPolicy } from "./policy";
import type { MaskSpan } from "./types";

export interface Passes {
  /** the exact pass alone */
  exact: MaskSpan[];
  /** the near pass alone, on words the exact pass left */
  near: MaskSpan[];
  /** exact and near together, neighbouring words of one person joined */
  combined: MaskSpan[];
}

/** Headless entry: exact and near on a raw note, each reported separately and together. */
export function runPasses(rawNote: string, clients: ClientEntry[], policy: MaskPolicy): Passes {
  const exact = findExact(rawNote, clients, policy);
  const near = findNear(rawNote, clients, policy, exact);
  return { exact, near, combined: coalesceAdjacent(rawNote, [...exact, ...near]) };
}

/** Browser entry: the device pass on the same raw note, merged over the exact and near spans. */
export function devicePass(
  rawNote: string,
  clients: ClientEntry[],
  job: ProposalJobLike,
  policy: MaskPolicy,
): Promise<DevicePassResult> {
  return runDevicePass(rawNote, runPasses(rawNote, clients, policy).combined, job, policy);
}
