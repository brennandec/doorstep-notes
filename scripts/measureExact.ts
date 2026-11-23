// Exact and near measure, in Node (measurement task 4, R2, R3, R5).
// Each pass reads the raw synthetic note on its own. No pass reads text that
// another pass has already masked. No model, no browser, no network.
//   exact          : the exact pass alone
//   near           : the near pass alone (nothing found by the exact pass is passed in)
//   exactAndNear   : both, joined the way the app joins them (src/masking/passes.ts)
// The device pass and the merge that includes it are written by the DEVICE MODEL
// script. Until then they read "not measured", with the reason.
import { join, resolve } from "node:path";
import { SYNTHETIC_SEED } from "../src/constants";
import { findExact } from "../src/masking/exact";
import { findNear } from "../src/masking/near";
import { exactAndNear } from "../src/masking/passes";
import { DEFAULT_POLICY, type MaskPolicy } from "../src/masking/policy";
import type { SyntheticNote } from "./buildSet";
import { makeHeader, measurementEqual, nodeRuntime, readResults, writeResults, type ResultsHeader } from "./results";
import { scorePass, type MissItem, type PassResult, type PassScore, type Span } from "./score";

export const SCRIPT_VERSION = "1";
export const SCRIPT_NAME = "scripts/measureExact.ts";

export const DEVICE_NOT_MEASURED_REASON =
  "The device pass has not been run. It runs in Google Chrome with the built-in model, through its own script.";

export interface ExactPasses {
  exact: PassResult;
  near: PassResult;
  exactAndNear: PassResult;
}

export function spansOf(notes: SyntheticNote[], find: (note: SyntheticNote) => Span[]): Map<string, Span[]> {
  return new Map(notes.map((n) => [n.id, find(n).map((s) => ({ start: s.start, end: s.end }))]));
}

export function measureExactPasses(notes: SyntheticNote[], policy: MaskPolicy = DEFAULT_POLICY): ExactPasses {
  return {
    exact: scorePass(notes, spansOf(notes, (n) => findExact(n.text, n.clientList, policy))),
    near: scorePass(notes, spansOf(notes, (n) => findNear(n.text, n.clientList, policy, []))),
    exactAndNear: scorePass(notes, spansOf(notes, (n) => exactAndNear(n.text, n.clientList, policy))),
  };
}

type NotMeasured = { status: "not measured"; reason: string };

export interface CatchRateFile extends ResultsHeader {
  setSize: number;
  seed: number;
  exact: PassScore;
  near: PassScore;
  exactAndNear: PassScore;
  device: unknown;
  merged: unknown;
}

export function buildCatchRate(
  passes: ExactPasses,
  seed: number,
  setSize: number,
  header: ResultsHeader,
  kept?: { device: unknown; merged: unknown },
): CatchRateFile {
  const notMeasured = (): NotMeasured => ({ status: "not measured", reason: DEVICE_NOT_MEASURED_REASON });
  return {
    ...header,
    setSize,
    seed,
    exact: passes.exact.score,
    near: passes.near.score,
    exactAndNear: passes.exactAndNear.score,
    device: kept?.device ?? notMeasured(),
    merged: kept?.merged ?? notMeasured(),
  };
}

export interface MissesFile extends ResultsHeader {
  exact: MissItem[];
  near: MissItem[];
  exactAndNear: MissItem[];
  device: MissItem[] | "not measured";
  merged: MissItem[] | "not measured";
  falseMasks: {
    exact: MissItem[];
    near: MissItem[];
    exactAndNear: MissItem[];
    device: MissItem[] | "not measured";
  };
}

export function buildMisses(
  passes: ExactPasses,
  header: ResultsHeader,
  kept?: Pick<MissesFile, "device" | "merged"> & { falseDevice: MissesFile["falseMasks"]["device"] },
): MissesFile {
  return {
    ...header,
    exact: passes.exact.misses,
    near: passes.near.misses,
    exactAndNear: passes.exactAndNear.misses,
    device: kept?.device ?? "not measured",
    merged: kept?.merged ?? "not measured",
    falseMasks: {
      exact: passes.exact.falseMaskItems,
      near: passes.near.falseMaskItems,
      exactAndNear: passes.exactAndNear.falseMaskItems,
      device: kept?.falseDevice ?? "not measured",
    },
  };
}

/**
 * The device and merged parts of an earlier catch-rate file, if they were measured on the
 * same set. A later run of this script must not wipe them.
 */
export function keepDeviceParts(
  earlier: Record<string, unknown> | undefined,
  seed: number,
  setSize: number,
): { device: unknown; merged: unknown } | undefined {
  if (!earlier || earlier["seed"] !== seed || earlier["setSize"] !== setSize) return undefined;
  const device = earlier["device"] as Record<string, unknown> | undefined;
  if (!device || typeof device !== "object" || device["status"] === "not measured") return undefined;
  return { device: earlier["device"], merged: earlier["merged"] };
}

function readSet(root: string): { seed: number; notes: SyntheticNote[] } {
  const file = readResults("synthetic-set", root);
  const notes = file?.["notes"];
  if (!file || !Array.isArray(notes)) {
    throw new Error("results/synthetic-set.json is missing or unreadable. Run npm run measure:set first.");
  }
  return { seed: Number(file["seed"]), notes: notes as SyntheticNote[] };
}

export function runMeasureExact(root = process.cwd()): { catchRate: string; misses: string } {
  const { seed, notes } = readSet(root);
  const passes = measureExactPasses(notes);
  const header = makeHeader({ browser: nodeRuntime(), script: SCRIPT_NAME, scriptVersion: SCRIPT_VERSION });
  const kept = keepDeviceParts(readResults("catch-rate", root), seed, notes.length);
  const earlierMisses = readResults("misses", root);
  const keptMisses =
    kept && earlierMisses
      ? {
          device: earlierMisses["device"] as MissesFile["device"],
          merged: earlierMisses["merged"] as MissesFile["merged"],
          falseDevice: (earlierMisses["falseMasks"] as MissesFile["falseMasks"] | undefined)?.device ?? "not measured",
        }
      : undefined;
  const catchBody = buildCatchRate(passes, seed, notes.length, header, kept);
  const missBody = buildMisses(passes, header, keptMisses);
  const earlierMiss = readResults("misses", root);
  const earlierMasks = earlierMiss?.["falseMasks"];
  const catchSame = measurementEqual(readResults("catch-rate", root), catchBody, ["setSize", "seed", "exact", "near", "exactAndNear"]);
  const missSame = measurementEqual(earlierMiss, missBody, ["exact", "near", "exactAndNear"])
    && measurementEqual(
      earlierMasks !== null && typeof earlierMasks === "object" && !Array.isArray(earlierMasks) ? earlierMasks as Record<string, unknown> : undefined,
      missBody.falseMasks,
      ["exact", "near", "exactAndNear", "device"],
    );
  if (catchSame && missSame) {
    return {
      catchRate: join(resolve(root, "results"), "catch-rate.json"),
      misses: join(resolve(root, "results"), "misses.json"),
    };
  }
  const catchRate = writeResults("catch-rate", header, catchBody, root);
  const misses = writeResults("misses", header, missBody, root);
  return { catchRate, misses };
}

export function main(): void {
  const { catchRate, misses } = runMeasureExact();
  const { notes } = readSet(process.cwd());
  const p = measureExactPasses(notes);
  const line = (name: string, r: PassResult) =>
    `${name}: ${r.score.caught} of ${r.score.total} identifiers caught, ${r.score.falseMasks} false masks`;
  console.log(`Wrote ${catchRate} and ${misses} (seed ${SYNTHETIC_SEED}).`);
  console.log([line("exact", p.exact), line("near", p.near), line("exact and near", p.exactAndNear)].join("\n"));
}
