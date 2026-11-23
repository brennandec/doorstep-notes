// The device pass on the raw text (masking R4, ruling 6). The job is passed in,
// so this file imports no inference module. It runs only on this device: the
// job it is given must be the ONLY_ON_DEVICE propose-masks job.
import { allowsCategory, type MaskPolicy } from "./policy";
import { mergeProposals, type Proposal } from "./merge";
import type { MaskSpan } from "./types";

export interface ProposalJobLike {
  readonly mode: "ONLY_ON_DEVICE";
  run(rawText: string): Promise<{
    value: Proposal[];
    inferenceSource: "ON_DEVICE" | "IN_CLOUD";
    connected: boolean;
  }>;
}

export interface DevicePassResult {
  /** exact and near spans plus the proposed ones, in text order */
  spans: MaskSpan[];
  dropped: Proposal[];
  /** the label shown with the proposals, from inferenceSource */
  inferenceSource: "ON_DEVICE" | "IN_CLOUD";
  connected: boolean;
}

export interface DevicePassOptions {
  /** also propose each unlisted name on the "Present:" line, whatever the model returns (masking R21). Off for the measurement. */
  presentLine?: boolean;
}

/**
 * The people on a "Present:" line of the record text that the model need not find: a capitalised item that is
 * not "I", not the worker and not "none". Mask merging drops one that is already masked.
 */
export function presentLineNames(raw: string): Proposal[] {
  const out: Proposal[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    const m = /^\s*Present:\s*(.*)$/i.exec(line);
    if (!m) continue;
    for (const item of m[1]!.split(",")) {
      const name = item.trim().replace(/[.;]+$/, "");
      if (name === "" || !/^\p{Lu}/u.test(name) || name === "I" || name.toLowerCase() === "worker") continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: name, kind: "name" });
    }
  }
  return out;
}

/** Browser entry point: runs the device job on the same raw text the exact pass read. */
export async function runDevicePass(
  raw: string,
  base: MaskSpan[],
  job: ProposalJobLike,
  policy: MaskPolicy,
  options: DevicePassOptions = {},
): Promise<DevicePassResult> {
  const reply = await job.run(raw);
  const proposed = options.presentLine ? [...reply.value, ...presentLineNames(raw)] : reply.value;
  const candidates = proposed.filter((c) => allowsCategory(policy, c.kind));
  const merged = mergeProposals(raw, base, candidates, policy);
  return { spans: merged.spans, dropped: merged.dropped, inferenceSource: reply.inferenceSource, connected: reply.connected };
}
