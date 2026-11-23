import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { indexedDbBackend } from "../../src/storage/backend";
import { makeLedgerStorage, openPersistentLedger } from "../../src/storage/ledger";
import type { LedgerEntry } from "../../src/egress/ledger";
import { KEPT_VERSION } from "../../src/constants";

// A very small fake of the part of IndexedDB that src/storage/backend.ts uses.
function installFakeIndexedDb() {
  const data = new Map<string, unknown>();
  const request = <T>(run: () => T) => {
    const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
    queueMicrotask(() => {
      r.result = run();
      r.onsuccess?.();
    });
    return r;
  };
  const objectStore = {
    get: (k: string) => request(() => (data.has(k) ? structuredClone(data.get(k)) : undefined)),
    put: (v: unknown, k: string) => request(() => void data.set(k, structuredClone(v))),
    delete: (k: string) => request(() => void data.delete(k)),
  };
  const db = { transaction: () => ({ objectStore: () => objectStore }), createObjectStore: () => objectStore };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const r: { result: typeof db; onupgradeneeded?: () => void; onsuccess?: () => void } = { result: db };
      queueMicrotask(() => {
        r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  });
  return data;
}

const entry = (job: LedgerEntry["job"] = "draft"): LedgerEntry => ({
  at: "2026-11-12T21:00:00.000Z",
  sha256: ["b".repeat(64)],
  byteLengths: [200],
  listedChecked: 12,
  listedFound: 0,
  maskedChecked: 3,
  maskedFound: 0,
  onPurpose: 0,
  job,
  mode: "PREFER_IN_CLOUD",
  inferenceSource: "IN_CLOUD",
  connected: false,
  outcome: "answered",
  requests: [],
});

describe("ledger storage with a fake IndexedDB", () => {
  let data: Map<string, unknown>;
  beforeEach(() => {
    data = installFakeIndexedDb();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads empty when nothing was saved", async () => {
    expect(await makeLedgerStorage(indexedDbBackend()).load()).toEqual([]);
  });

  it("appends and reads back in order", async () => {
    const s = makeLedgerStorage(indexedDbBackend());
    await s.append(entry("draft"));
    await s.append(entry("rewrite"));
    expect((await s.load()).map((e) => e.job)).toEqual(["draft", "rewrite"]);
  });

  it("keeps two quick appends", async () => {
    const s = makeLedgerStorage(indexedDbBackend());
    await Promise.all([s.append(entry("draft")), s.append(entry("secondReader"))]);
    expect(await s.load()).toHaveLength(2);
  });

  it("stores no text: only counts, hashes, times and fixed words", async () => {
    const s = makeLedgerStorage(indexedDbBackend());
    await s.append(entry());
    const stored = JSON.stringify([...data.values()]);
    expect(stored).not.toMatch(/Maria|Brandvold|Alder/);
    expect(Object.keys((data.get("ledger") as { entries: LedgerEntry[] }).entries[0]!).sort()).toEqual(
      [
        "at", "byteLengths", "connected", "inferenceSource", "job", "listedChecked", "listedFound", "outcome",
        "maskedChecked", "maskedFound", "mode", "onPurpose", "requests", "sha256",
      ].sort(),
    );
  });

  it("refuses an entry with an extra field", async () => {
    const s = makeLedgerStorage(indexedDbBackend());
    expect(() => s.append({ ...entry(), text: "x" } as unknown as LedgerEntry)).toThrow();
  });

  it("does not read back something that is not a ledger entry", async () => {
    data.set("ledger", [entry(), { at: "x", note: "Maria Okonkwo-Reyes" }, "text"]);
    expect(await makeLedgerStorage(indexedDbBackend()).load()).toHaveLength(1);
  });

  it("writes the entries with the version of the kept document, and reads an unversioned list from an earlier build", async () => {
    const s = makeLedgerStorage(indexedDbBackend());
    await s.append(entry("draft"));
    expect((data.get("ledger") as { version: number }).version).toBe(KEPT_VERSION);
    data.set("ledger", [entry("rewrite")]);
    expect((await s.load()).map((e) => e.job)).toEqual(["rewrite"]);
  });

  it("does not read entries of a version it does not know", async () => {
    data.set("ledger", { version: KEPT_VERSION + 1, entries: [entry()] });
    expect(await makeLedgerStorage(indexedDbBackend()).load()).toEqual([]);
  });

  it("clear removes the stored entries and empties an opened ledger", async () => {
    const s = makeLedgerStorage(indexedDbBackend());
    await s.append(entry("draft"));
    const ledger = await openPersistentLedger(s);
    await ledger.clear();
    expect(ledger.all()).toEqual([]);
    expect(data.has("ledger")).toBe(false);
    ledger.append(entry("rewrite"));
    await vi.waitFor(async () => expect((await s.load()).map((e) => e.job)).toEqual(["rewrite"]));
  });

  it("an opened ledger starts from storage and writes each append", async () => {
    const s = makeLedgerStorage(indexedDbBackend());
    await s.append(entry("draft"));
    const ledger = await openPersistentLedger(s);
    expect(ledger.all()).toHaveLength(1);
    ledger.append(entry("secondReader"));
    expect(ledger.all()).toHaveLength(2);
    await vi.waitFor(async () => expect(await s.load()).toHaveLength(2));
  });
});
