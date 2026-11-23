// What the page keeps in this browser, in one versioned document (shell-and-offline R27, fourth
// review K1). The client list, the note in progress, the record, the masks, the outgoing text, the
// finished note, the step and the parts she opened are saved as she works and read back when the
// page loads. The store is the browser's own (IndexedDB) through ./backend. This page does not
// encrypt it (R28). Nothing here makes a network request, and nothing outside src/app/controller.ts
// and src/app/main.ts imports it (R27.7).
import { KEPT_KEY, KEPT_VERSION } from "../constants";
import type { AppState } from "../app/state";
import { checkVisitRecord } from "../inference/structure/structure.schema";
import type { KeyValueBackend } from "./backend";

/** The parts of a visit that go with the note. "Clear this visit" empties all of them. */
export interface KeptVisit {
  noteText: string;
  photo: AppState["photo"];
  record: AppState["record"];
  recordSource: AppState["recordSource"];
  /** true when the record came from the device model for a typed note, so it is checked against the note */
  recordChecked?: true;
  /** the masks as she left them; whether a device pass is running is not kept */
  mask: { raw: string; spans: NonNullable<AppState["mask"]>["spans"]; line: string; proposals: NonNullable<AppState["mask"]>["proposals"] } | null;
  outgoingText: string;
  previewOnly: boolean;
  rewrites: AppState["rewrites"];
  dateChoice: AppState["dateChoice"];
  dateFlags: string[];
  dateLine: string | null;
  finished: AppState["finished"];
  /** the step she is on, as `currentStep` names it */
  step: string;
}

export interface KeptData {
  /** the invented example is loaded */
  example: boolean;
  clientList: string;
  /** which foldable parts she opened */
  opened: AppState["unfolded"] & Record<string, boolean>;
  visit: KeptVisit;
}

export type KeptLoad =
  | { status: "empty" }
  | { status: "ok"; data: KeptData }
  | { status: "unreadable"; reason: "version" | "shape" }
  /** the browser would not open its store */
  | { status: "failed" };

export interface KeptStore {
  load(): Promise<KeptLoad>;
  /** Written in order; when several are waiting only the last is written. Rejects if the store would not write. */
  save(data: KeptData): Promise<void>;
  /** Removes the note, photo, record, masks, outgoing text, finished note and step. Keeps the list and the opened parts. */
  clearVisit(): Promise<void>;
  /** Removes the client list only. */
  clearList(): Promise<void>;
  /** Removes everything this page keeps, the ledger and the keys of earlier builds too. */
  clearAll(): Promise<void>;
  /** Resolves when every save made so far has been written or has failed. */
  flush(): Promise<void>;
}

/** Keys that earlier builds wrote, and the ledger. "Clear everything" removes them with the kept document. */
const OTHER_KEYS = ["ledger", "note", "photo", "record", "clientList", "maskState"];

export function emptyVisit(): KeptVisit {
  return {
    noteText: "", photo: null, record: null, recordSource: null, mask: null, outgoingText: "", previewOnly: false,
    rewrites: [], dateChoice: null, dateFlags: [], dateLine: null, finished: null, step: "note",
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isSource = (v: unknown) => v === "ON_DEVICE" || v === "IN_CLOUD";

function validVisit(v: unknown): v is KeptVisit {
  if (!isObject(v)) return false;
  if (!isText(v.noteText) || !isText(v.outgoingText) || !isText(v.step) || typeof v.previewOnly !== "boolean") return false;
  if (v.photo !== null && !(isObject(v.photo) && (v.photo.mimeType === "image/jpeg" || v.photo.mimeType === "image/png") && isText(v.photo.base64))) return false;
  if (v.record !== null && !checkVisitRecord(v.record).ok) return false;
  if (v.recordSource !== null && !isSource(v.recordSource)) return false;
  if (v.mask !== null) {
    const m = v.mask;
    if (!isObject(m) || !isText(m.raw) || !isText(m.line) || !Array.isArray(m.spans)) return false;
    if (!m.spans.every((s) => isObject(s) && typeof s.start === "number" && typeof s.end === "number" && isText(s.surfaceForm) && isText(s.tag) && isText(s.kind))) return false;
    if (m.proposals !== null && !(isObject(m.proposals) && isSource(m.proposals.source) && typeof m.proposals.connected === "boolean")) return false;
  }
  if (!Array.isArray(v.rewrites) || !v.rewrites.every((r) => isObject(r) && isText(r.from) && isText(r.to) && typeof r.nth === "number")) return false;
  if (v.dateChoice !== null && !(isObject(v.dateChoice) && isText(v.dateChoice.words) && isText(v.dateChoice.mode))) return false;
  if (!Array.isArray(v.dateFlags) || !v.dateFlags.every(isText)) return false;
  if (v.dateLine !== null && !isText(v.dateLine)) return false;
  if (v.finished !== null && !(isObject(v.finished) && isText(v.finished.text) && isSource(v.finished.source) && typeof v.finished.connected === "boolean")) return false;
  if (v.recordChecked !== undefined && v.recordChecked !== true) return false;
  return true;
}

function validData(d: unknown): d is KeptData {
  if (!isObject(d)) return false;
  if (typeof d.example !== "boolean" || !isText(d.clientList)) return false;
  if (!isObject(d.opened) || !Object.values(d.opened).every((x) => typeof x === "boolean")) return false;
  return validVisit(d.visit);
}

function visitIsBlank(v: KeptVisit): boolean {
  return (
    v.noteText === "" && v.photo === null && v.record === null && v.mask === null && v.outgoingText === "" &&
    v.rewrites.length === 0 && v.dateChoice === null && v.finished === null
  );
}

/** Nothing worth keeping: no list, no visit, nothing opened. A blank document is not written; the key is removed. */
export function isBlank(d: KeptData): boolean {
  return !d.example && d.clientList === "" && visitIsBlank(d.visit) && !Object.values(d.opened).some(Boolean);
}

export function makeKeptStore(backend: KeyValueBackend): KeptStore {
  let chain: Promise<unknown> = Promise.resolve();
  let latest: KeptData | null = null;
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const run = chain.then(job);
    chain = run.catch(() => undefined);
    return run;
  };

  async function read(): Promise<KeptLoad> {
    let raw: unknown;
    try {
      raw = await backend.get(KEPT_KEY);
    } catch {
      return { status: "failed" };
    }
    if (raw === undefined) return { status: "empty" };
    if (!isObject(raw)) return { status: "unreadable", reason: "shape" };
    if (raw.version !== KEPT_VERSION) return { status: "unreadable", reason: "version" };
    return validData(raw.data) ? { status: "ok", data: raw.data } : { status: "unreadable", reason: "shape" };
  }

  async function write(data: KeptData): Promise<void> {
    if (isBlank(data)) await backend.remove(KEPT_KEY);
    else await backend.set(KEPT_KEY, { version: KEPT_VERSION, data });
  }

  return {
    load: () => read(),
    save(data) {
      latest = data;
      return enqueue(async () => {
        // A newer save is waiting behind this one; it will write instead.
        if (latest !== data) return;
        await write(data);
      });
    },
    clearVisit() {
      return enqueue(async () => {
        const now = await read();
        if (now.status !== "ok") return;
        await write({ ...now.data, visit: emptyVisit() });
      });
    },
    clearList() {
      return enqueue(async () => {
        const now = await read();
        if (now.status !== "ok") return;
        const example = now.data.example && visitIsBlank(now.data.visit) ? false : now.data.example;
        await write({ ...now.data, clientList: "", example });
      });
    },
    clearAll() {
      return enqueue(async () => {
        latest = null;
        await backend.remove(KEPT_KEY);
        for (const key of OTHER_KEYS) await backend.remove(key);
      });
    },
    async flush() {
      await chain;
    },
  };
}
