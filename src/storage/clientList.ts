// The client list at rest, on this device only (masking R1.2, R1.3).
// The pasted text is kept as written so she can edit it.
import type { KeyValueBackend } from "./backend";

export interface ClientListStore {
  save(text: string): Promise<void>;
  load(): Promise<string>;
  /** "Remove the list": deletes it from storage. */
  remove(): Promise<void>;
}

const KEY = "clientList";

export function makeClientListStore(backend: KeyValueBackend): ClientListStore {
  return {
    async save(text) { await backend.set(KEY, text); },
    async load() {
      const v = await backend.get(KEY);
      return typeof v === "string" ? v : "";
    },
    async remove() { await backend.remove(KEY); },
  };
}
