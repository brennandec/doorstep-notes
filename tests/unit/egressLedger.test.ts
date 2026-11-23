import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeLedger, type LedgerEntry } from "../../src/egress/ledger";

const HASH = "a".repeat(64);
const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  at: "2026-11-12T21:00:00.000Z",
  sha256: [HASH],
  byteLengths: [120],
  listedChecked: 12,
  listedFound: 0,
  maskedChecked: 4,
  maskedFound: 0,
  onPurpose: 0,
  job: "draft",
  mode: "PREFER_IN_CLOUD",
  inferenceSource: "IN_CLOUD",
  connected: false,
  outcome: "answered",
  requests: [],
  ...over,
});

describe("ledger", () => {
  it("has append and all only", () => {
    expect(Object.keys(makeLedger()).sort()).toEqual(["all", "append"]);
  });

  it("keeps entries in the order they were added", () => {
    const l = makeLedger();
    l.append(entry({ at: "2026-11-12T21:00:00.000Z" }));
    l.append(entry({ at: "2026-11-12T21:05:00.000Z", job: "secondReader" }));
    expect(l.all().map((e) => e.job)).toEqual(["draft", "secondReader"]);
  });

  it("starts from what storage holds", () => {
    expect(makeLedger([entry()]).all()).toHaveLength(1);
  });

  it("cannot be changed through what all() returns", () => {
    const l = makeLedger();
    l.append(entry());
    const list = l.all() as LedgerEntry[];
    list.pop();
    list[0] && (list[0].listedFound = 9);
    expect(l.all()).toHaveLength(1);
    expect(l.all()[0]?.listedFound).toBe(0);
  });

  it("cannot be changed through the entry that was appended", () => {
    const l = makeLedger();
    const e = entry();
    l.append(e);
    e.listedFound = 5;
    expect(l.all()[0]?.listedFound).toBe(0);
  });

  it("refuses an entry that carries text or a name", () => {
    const l = makeLedger();
    const bad = { ...entry(), text: "Maria Okonkwo-Reyes" } as unknown as LedgerEntry;
    expect(() => l.append(bad)).toThrow(/extra field/);
    const alsoBad = { ...entry(), sha256: ["Maria Okonkwo-Reyes"] };
    expect(() => l.append(alsoBad)).toThrow(/SHA-256/);
    expect(l.all()).toHaveLength(0);
  });

  it("holds only counts, hashes, times and fixed words", () => {
    const l = makeLedger();
    l.append(entry());
    for (const [key, value] of Object.entries(l.all()[0]!)) {
      if (key === "at") expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      else if (key === "sha256") for (const h of value as string[]) expect(h).toMatch(/^[0-9a-f]{64}$/);
      else if (key === "byteLengths") for (const n of value as number[]) expect(Number.isInteger(n)).toBe(true);
      else if (key === "requests") {
        expect(Array.isArray(value)).toBe(true);
        for (const row of value as { host: string; bytes: number; carriesNote: boolean; preflight: boolean }[]) {
          expect(row.host).toMatch(/^[a-z0-9.-]+$/);
          expect(Number.isInteger(row.bytes)).toBe(true);
          expect(typeof row.carriesNote).toBe("boolean");
          expect(typeof row.preflight).toBe("boolean");
          expect(Object.keys(row).sort()).toEqual(["bytes", "carriesNote", "host", "preflight"]);
        }
      }
      else if (typeof value === "string") expect(["draft", "rewrite", "secondReader", "PREFER_IN_CLOUD", "PREFER_ON_DEVICE", "ONLY_ON_DEVICE", "ONLY_IN_CLOUD", "ON_DEVICE", "IN_CLOUD", "answered", "refused", "failed"]).toContain(value);
      else expect(["number", "boolean"]).toContain(typeof value);
    }
  });

  it("does not link one entry to the next", () => {
    const l = makeLedger();
    l.append(entry());
    l.append(entry());
    const [a, b] = l.all();
    expect(Object.keys(a!)).toEqual(Object.keys(b!));
    // Two entries with the same contents are the same: nothing from the first is carried into the second.
    expect(b).toEqual(a);
    const source = readFileSync("src/egress/ledger.ts", "utf8");
    expect(source).not.toMatch(/previous|prevHash|parent|signature|chain\(/i);
  });

  it("records a host, a byte count and whether the body held the sent text", () => {
    const l = makeLedger();
    l.append(entry({ requests: [{ host: "example.invalid", bytes: 12, carriesNote: false, preflight: false }] }));
    expect(l.all()[0]?.requests).toEqual([{ host: "example.invalid", bytes: 12, carriesNote: false, preflight: false }]);
    expect(() => l.append(entry({ requests: [{ host: "example.invalid", bytes: 12, carriesNote: false, preflight: false, text: "Maria" } as never] }))).toThrow(/extra field/);
    expect(() => l.append(entry({ requests: [{ host: "not a host", bytes: 1, carriesNote: false, preflight: false }] }))).toThrow(/host/);
    expect(() => l.append(entry({ requests: [{ host: "example.invalid", bytes: 1, carriesNote: false } as never] }))).toThrow(/preflight/);
  });
});
