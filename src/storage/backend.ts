// The one place browser storage is opened. Everything at rest on this device
// goes through here (structure rule: nothing outside src/storage touches it).
// No network code in this folder.

export interface KeyValueBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In memory, for unit tests and for a browser that refuses storage. */
export function memoryBackend(): KeyValueBackend {
  const map = new Map<string, unknown>();
  return {
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : undefined; },
    async set(key, value) { map.set(key, structuredClone(value)); },
    async remove(key) { map.delete(key); },
  };
}

const DB_NAME = "doorstep-notes";
const STORE = "kv";

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("Storage failed."));
  });
}

/** IndexedDB on this device. Not exercised by the unit tests (Node has none); the BUNDLED browser checks use it. */
export function indexedDbBackend(): KeyValueBackend {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error("Storage failed."));
    });
    return opened;
  };
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    async get(key) { return request((await store("readonly")).get(key)); },
    async set(key, value) { await request((await store("readwrite")).put(value, key)); },
    async remove(key) { await request((await store("readwrite")).delete(key)); },
  };
}

/** For a browser that has no IndexedDB: every call fails, so the page says that nothing is kept (shell-and-offline R27.6). */
export function unavailableBackend(): KeyValueBackend {
  const refuse = async (): Promise<never> => { throw new Error("This browser has no store."); };
  return { get: refuse, set: refuse, remove: refuse };
}

/** The store for what the page keeps: IndexedDB, or one that refuses when the browser has none. */
export function keptBackend(): KeyValueBackend {
  return typeof indexedDB === "undefined" ? unavailableBackend() : indexedDbBackend();
}

/** IndexedDB where the browser has it, memory otherwise. */
export function defaultBackend(): KeyValueBackend {
  return typeof indexedDB === "undefined" ? memoryBackend() : indexedDbBackend();
}
