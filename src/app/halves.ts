// The two halves, in one sentence each (shell-and-offline R29, fourth review K5).
// The cloud half is read from the build flag, the cloud probe file and the second reader's loop record; it is never typed.
import type { ResultsLookup } from "./figures";
import { fill, strings } from "./strings";

/** The results file the cloud half is read from, without folder or extension. */
export const PROBE_FILE = "cloud-probe-2026-11-13";

/** A named file, not the newest loop (judges-see-true R8.2 exception, OPEN-QUESTIONS H23): a failed later loop must not blank the header. */
export const READER_FILE = "second-reader-loop-2026-11-14";

export interface Halves {
  device: string;
  cloud: string;
}

export interface HalvesInput {
  /** AI_SERVICE_ENABLED */
  aiServiceEnabled: boolean;
  results: ResultsLookup;
  /** True while the browser / probe says offline, so the cloud half is not shown as connected. */
  offline?: boolean;
  /** True when the cloud refused this browser, so the cloud half is not shown as connected. */
  cloudRefused?: boolean;
  /** True when the last cloud request failed, so the cloud half is not shown as connected. */
  cloudFailed?: boolean;
}

/** The model the probe file records calls to, or null when the file or the address is not there. */
function probedModel(results: ResultsLookup): string | null {
  const file = results(PROBE_FILE);
  if (file === undefined) return null;
  for (const [key, run] of Object.entries(file)) {
    if (!key.startsWith("run_") || typeof run !== "object" || run === null) continue;
    const requests = (run as { requests?: unknown }).requests;
    if (!Array.isArray(requests)) continue;
    for (const r of requests) {
      const url = typeof r === "object" && r !== null ? (r as { url?: unknown }).url : undefined;
      const m = typeof url === "string" ? /\/models\/([^/:?]+):/.exec(url) : null;
      if (m !== null) return m[1]!;
    }
  }
  return null;
}

/** The model of the first answered pass (status 200) in the second reader's loop file, or null. */
function readerModel(results: ResultsLookup): string | null {
  const file = results(READER_FILE);
  if (file === undefined || file["job"] !== "second reader") return null;
  const passes = file["passes"];
  if (!Array.isArray(passes)) return null;
  for (const p of passes) {
    if (typeof p !== "object" || p === null) continue;
    const { status, model } = p as { status?: unknown; model?: unknown };
    if (status === 200 && typeof model === "string" && model !== "") return model;
  }
  return null;
}

export function halvesSentences(input: HalvesInput): Halves {
  const h = strings.halves;
  if (!input.aiServiceEnabled) return { device: h.device, cloud: h.cloudOff };
  if (input.offline) return { device: h.device, cloud: h.cloudOffline };
  if (input.cloudRefused) return { device: h.device, cloud: h.cloudRefused };
  if (input.cloudFailed) return { device: h.device, cloud: h.cloudFailed };
  const draft = probedModel(input.results);
  const reader = readerModel(input.results);
  if (draft === null && reader === null) return { device: h.device, cloud: h.cloudOnUnnamed };
  return { device: h.device, cloud: fill(h.cloudOn, { draft: draft ?? h.modelUnnamed, reader: reader ?? h.modelUnnamed }) };
}
