// The visit record at rest, on this device only. By itself it never leaves;
// only text built from the masked record is sent, and only through src/egress.
import { checkVisitRecord } from "../inference/structure/structure.schema";
import type { VisitRecord } from "../inference/types";
import type { KeyValueBackend } from "./backend";

export interface RecordStore {
  save(record: VisitRecord): Promise<void>;
  load(): Promise<VisitRecord | null>;
  clear(): Promise<void>;
}

export function makeRecordStore(backend: KeyValueBackend): RecordStore {
  return {
    async save(record) { await backend.set("record", record); },
    async load() {
      const check = checkVisitRecord(await backend.get("record"));
      return check.ok ? check.record : null;
    },
    async clear() { await backend.remove("record"); },
  };
}
