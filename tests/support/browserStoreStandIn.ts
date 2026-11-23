// A stand-in for the browser's own store (IndexedDB), for unit tests only.
// It implements the same three methods as the real backend, keeps what it is given by copy (as the
// browser does), and can be told to fail to open or fail to write. It opens no connection of any kind.
import type { KeyValueBackend } from "../../src/storage/backend";

export interface BrowserStoreStandIn extends KeyValueBackend {
  /** the keys held now, in the order they were first written */
  keys(): string[];
  /** a copy of everything held, for a test to read */
  dump(): Record<string, unknown>;
  /** true when nothing at all is held */
  isEmpty(): boolean;
  /** from now on every call fails, as when the browser will not open its store */
  failToOpen(on?: boolean): void;
  /** from now on every write and remove fails, reads still work, as when the disk is full */
  failToWrite(on?: boolean): void;
  /** how many writes have been made, failed ones not counted */
  writes(): number;
}

export function browserStoreStandIn(): BrowserStoreStandIn {
  const held = new Map<string, unknown>();
  let openFails = false;
  let writeFails = false;
  let written = 0;
  const open = () => {
    if (openFails) throw new Error("The stand-in store would not open.");
  };
  const write = () => {
    open();
    if (writeFails) throw new Error("The stand-in store would not write.");
  };
  return {
    async get(key) {
      open();
      return held.has(key) ? structuredClone(held.get(key)) : undefined;
    },
    async set(key, value) {
      write();
      held.set(key, structuredClone(value));
      written += 1;
    },
    async remove(key) {
      write();
      held.delete(key);
      written += 1;
    },
    keys: () => [...held.keys()],
    dump: () => Object.fromEntries([...held.entries()].map(([k, v]) => [k, structuredClone(v)])),
    isEmpty: () => held.size === 0,
    failToOpen(on = true) { openFails = on; },
    failToWrite(on = true) { writeFails = on; },
    writes: () => written,
  };
}
