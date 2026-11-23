// The ledger: a plain append-only list (egress-check R7, Rule 1).
// Two methods, `append` and `all`. An entry holds counts, hashes, times and fixed
// words. It never holds text, a name or a value, and it does not point at another
// entry: no receipt format and no links between entries.
// The entry type has no text field.
// Each off-page request keeps its host, its byte count, and whether the body held the text that was
// sent. The text itself is not stored.

export interface LedgerRequest {
  host: string;
  bytes: number;
  carriesNote: boolean;
  /** The browser sends an OPTIONS preflight for this row. The page does not see that call. */
  preflight: boolean;
}

export interface LedgerEntry {
  at: string;
  sha256: string[];
  byteLengths: number[];
  listedChecked: number;
  listedFound: number;
  maskedChecked: number;
  maskedFound: number;
  onPurpose: number;
  job: "draft" | "rewrite" | "secondReader";
  mode: "PREFER_IN_CLOUD" | "PREFER_ON_DEVICE" | "ONLY_ON_DEVICE" | "ONLY_IN_CLOUD";
  inferenceSource: "ON_DEVICE" | "IN_CLOUD";
  connected: boolean;
  /** answered: the service answered; refused: it refused the request and accepted nothing; failed: any other fault */
  outcome: "answered" | "refused" | "failed";
  /** one row per off-page request this send captured */
  requests: LedgerRequest[];
}

export const OUTCOMES = ["answered", "refused", "failed"] as const;

export const LEDGER_KEYS = [
  "at", "sha256", "byteLengths", "listedChecked", "listedFound", "maskedChecked", "maskedFound",
  "onPurpose", "job", "mode", "inferenceSource", "connected", "outcome", "requests",
] as const;

const REQUEST_KEYS = ["host", "bytes", "carriesNote", "preflight"] as const;
const HOST = /^[a-z0-9.-]{1,253}$/i;

const HASH = /^[0-9a-f]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

/** Throws on an unknown key or a value that is not a count, hash, time or fixed word. */
export function assertLedgerEntry(entry: LedgerEntry): void {
  const keys = Object.keys(entry);
  for (const k of keys) if (!(LEDGER_KEYS as readonly string[]).includes(k)) throw new Error(`Ledger entry has an extra field: ${k}`);
  for (const k of LEDGER_KEYS) if (!(k in entry)) throw new Error(`Ledger entry is missing: ${k}`);
  if (!(OUTCOMES as readonly string[]).includes(entry.outcome)) throw new Error("Ledger outcome is not one of the fixed words.");
  if (!TIME.test(entry.at)) throw new Error("Ledger time is not an ISO time.");
  if (!entry.sha256.every((h) => HASH.test(h))) throw new Error("Ledger hash is not a SHA-256 hex string.");
  for (const n of [...entry.byteLengths, entry.listedChecked, entry.listedFound, entry.maskedChecked, entry.maskedFound, entry.onPurpose]) {
    if (!Number.isInteger(n) || n < 0) throw new Error("Ledger count is not a whole number.");
  }
  if (!Array.isArray(entry.requests)) throw new Error("Ledger requests are missing.");
  for (const row of entry.requests) {
    const keys = Object.keys(row);
    for (const k of keys) if (!(REQUEST_KEYS as readonly string[]).includes(k)) throw new Error(`Ledger request has an extra field: ${k}`);
    for (const k of REQUEST_KEYS) if (!(k in row)) throw new Error(`Ledger request is missing: ${k}`);
    if (!HOST.test(row.host)) throw new Error("Ledger host is not a host name.");
    if (!Number.isInteger(row.bytes) || row.bytes < 0) throw new Error("Ledger request bytes are not a whole number.");
    if (typeof row.carriesNote !== "boolean") throw new Error("Ledger request note flag is not yes or no.");
    if (typeof row.preflight !== "boolean") throw new Error("Ledger request preflight flag is not yes or no.");
  }
}

export interface Ledger {
  append(e: LedgerEntry): void;
  all(): readonly LedgerEntry[];
}

/** An in-memory list. `initial` is what storage already holds. */
export function makeLedger(initial: readonly LedgerEntry[] = []): Ledger {
  const entries: LedgerEntry[] = initial.map((e) => structuredClone(e));
  return {
    append(e) {
      // Refuses an extra field, so no text or name can be added to an entry.
      assertLedgerEntry(e);
      entries.push(structuredClone(e));
    },
    all() {
      return entries.map((e) => structuredClone(e));
    },
  };
}
