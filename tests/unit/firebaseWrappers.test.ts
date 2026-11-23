import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initAppCheckDebug } from "../../src/firebase/appCheckDebug";
import { LEDGER_KEYS, assertLedgerEntry, type LedgerEntry } from "../../src/egress/ledger";

const entry = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  at: "2026-11-12T21:00:00.000Z",
  sha256: ["a".repeat(64)],
  byteLengths: [120],
  listedChecked: 12, listedFound: 0, maskedChecked: 5, maskedFound: 0, onPurpose: 0,
  job: "draft", mode: "PREFER_IN_CLOUD", inferenceSource: "IN_CLOUD", connected: false, outcome: "answered",
  requests: [],
  ...over,
});

describe("App Check", () => {
  it("sets the debug flag before initializing and writes no token", () => {
    const order: string[] = [];
    const scope: { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string } = {};
    initAppCheckDebug({ app: 1 }, {
      scope,
      makeProvider: () => ({ provider: true }),
      initializeAppCheck: (_a, o) => {
        order.push(`init:${String(scope.FIREBASE_APPCHECK_DEBUG_TOKEN)}:${o.isTokenAutoRefreshEnabled}`);
        return {};
      },
    });
    expect(order).toEqual(["init:true:true"]);
    expect(readFileSync("src/firebase/appCheckDebug.ts", "utf8")).not.toMatch(/writeFile|localStorage/);
  });
});

describe("ledger entry", () => {
  it("has no text field in its entry type or key list", () => {
    const source = readFileSync("src/egress/ledger.ts", "utf8");
    const type = source.match(/export interface LedgerEntry \{([^}]*)\}/s)![1]!;
    expect(type).not.toMatch(/\b(text|body|note|name|record|content|message)\b/i);
    expect(LEDGER_KEYS).not.toContain("text");
  });
  it("rejects an extra field and a non-hash", () => {
    expect(() => assertLedgerEntry({ ...entry(), text: "a name" } as LedgerEntry)).toThrow(/extra field/);
    expect(() => assertLedgerEntry(entry({ sha256: ["not a hash"] }))).toThrow(/SHA-256/);
    expect(() => assertLedgerEntry(entry({ listedFound: -1 }))).toThrow(/count/);
    expect(() => assertLedgerEntry(entry())).not.toThrow();
  });
});
