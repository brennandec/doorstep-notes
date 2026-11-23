// The ledger at rest, on this device (egress-check R7.4). IndexedDB through the
// one storage backend. Counts, hashes and times only; see src/egress/ledger.ts.
import { KEPT_VERSION } from "../constants";
import { assertLedgerEntry, makeLedger, type Ledger, type LedgerEntry } from "../egress/ledger";
import type { KeyValueBackend } from "./backend";

const KEY = "ledger";

export interface LedgerStorage {
  load(): Promise<LedgerEntry[]>;
  append(entry: LedgerEntry): Promise<void>;
  /** "Clear everything this page keeps": removes the stored entries (shell-and-offline R27.4). */
  clear(): Promise<void>;
}

export function makeLedgerStorage(backend: KeyValueBackend): LedgerStorage {
  // One write at a time, so two quick sends cannot overwrite each other.
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<LedgerEntry[]> {
    const stored = await backend.get(KEY);
    // The entries carry the version of the kept document. An unversioned list is from an earlier build
    // and is read; a version this code does not know is not read (R27.5).
    const raw = Array.isArray(stored)
      ? stored
      : typeof stored === "object" && stored !== null && (stored as { version?: unknown }).version === KEPT_VERSION
        ? (stored as { entries?: unknown }).entries
        : undefined;
    if (!Array.isArray(raw)) return [];
    const kept: LedgerEntry[] = [];
    for (const e of raw as LedgerEntry[]) {
      try {
        assertLedgerEntry(e);
        kept.push(e);
      } catch {
        // An entry that is not a ledger entry is not read back.
      }
    }
    return kept;
  }

  return {
    load,
    append(entry) {
      assertLedgerEntry(entry);
      const next = queue.then(async () => {
        const all = await load();
        all.push(entry);
        await backend.set(KEY, { version: KEPT_VERSION, entries: all });
      });
      queue = next.catch(() => undefined);
      return next;
    },
    clear() {
      const next = queue.then(() => backend.remove(KEY));
      queue = next.catch(() => undefined);
      return next;
    },
  };
}

/** The append-only list, loaded from this device; each append is also written to it. */
export type PersistentLedger = Ledger & { clear(): Promise<void> };

export async function openPersistentLedger(storage: LedgerStorage, onError: (e: unknown) => void = () => {}): Promise<PersistentLedger> {
  let inner = makeLedger(await storage.load());
  return {
    append(e) {
      inner.append(e);
      storage.append(e).catch(onError);
    },
    all: () => inner.all(),
    // Only the "Clear everything" press calls this. The list is append-only otherwise.
    async clear() {
      inner = makeLedger([]);
      await storage.clear();
    },
  };
}
