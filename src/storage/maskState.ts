// The mask map, the spans and the surface forms at rest, on this device only
// (masking R6.3, R11.1). They are removed together and never synced (ruling 18).
import type { MaskMap, MaskSpan } from "../masking/types";
import type { KeyValueBackend } from "./backend";

export interface StoredMaskState {
  spans: MaskSpan[];
  map: MaskMap;
  surfaceForms: string[];
}

export interface MaskStateStore {
  save(state: StoredMaskState): Promise<void>;
  load(): Promise<StoredMaskState | null>;
  clear(): Promise<void>;
}

const KEY = "maskState";

function isState(v: unknown): v is StoredMaskState {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Partial<StoredMaskState>;
  return (
    Array.isArray(s.spans) &&
    typeof s.map === "object" && s.map !== null &&
    Array.isArray(s.surfaceForms) && s.surfaceForms.every((f) => typeof f === "string")
  );
}

export function makeMaskStateStore(backend: KeyValueBackend): MaskStateStore {
  return {
    async save(state) { await backend.set(KEY, state); },
    async load() {
      const v = await backend.get(KEY);
      return isState(v) ? v : null;
    },
    async clear() { await backend.remove(KEY); },
  };
}
