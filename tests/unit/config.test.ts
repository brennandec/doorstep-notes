import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_URL, loadFirebaseConfig } from "../../src/firebase/config";
import { writeHostingConfig } from "../../scripts/vitePlugins";

const invented = readFileSync("tests/fixtures/firebase.config.invented.json", "utf8");
const values = Object.values(JSON.parse(invented) as Record<string, string>);

afterEach(() => vi.restoreAllMocks());

describe("config loader", () => {
  it("loads the invented config and calls no console method with any value", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    const result = await loadFirebaseConfig(async (url) => {
      expect(url).toBe(CONFIG_URL);
      return { ok: true, text: async () => invented };
    });
    expect(result.ok).toBe(true);
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        const text = JSON.stringify(call);
        for (const value of values) expect(text).not.toContain(value);
      }
    }
  });

  it("reports not found for a missing file, a thrown fetch or an HTML answer", async () => {
    expect(await loadFirebaseConfig(async () => ({ ok: false, text: async () => "" }))).toEqual({ ok: false, reason: "not found" });
    expect(await loadFirebaseConfig(async () => { throw new Error("offline"); })).toEqual({ ok: false, reason: "not found" });
    expect(await loadFirebaseConfig(async () => ({ ok: true, text: async () => "<!doctype html>" }))).toEqual({ ok: false, reason: "not found" });
  });

  it("reports not valid when a key is missing", async () => {
    const partial = JSON.stringify({ apiKey: "x" });
    expect(await loadFirebaseConfig(async () => ({ ok: true, text: async () => partial }))).toEqual({ ok: false, reason: "not valid" });
  });

  it("has no import of the local config file", () => {
    const source = readFileSync("src/firebase/config.ts", "utf8");
    expect(source).not.toMatch(/^\s*import\s[^\n]*firebase\.config\.local/m);
    expect(source).not.toMatch(/from\s+["'][^"']*firebase\.config\.local/);
    expect(source).not.toMatch(/require\([^)]*firebase\.config\.local/);
    expect(source).not.toMatch(/import\([^)]*firebase\.config\.local/);
  });
});

describe("hosting injection", () => {
  it("writes only into a folder named dist", () => {
    const base = mkdtempSync(join(tmpdir(), "inject-"));
    expect(() => writeHostingConfig(join(base, "elsewhere"), { apiKey: "x" })).toThrow();
    expect(existsSync(join(base, "elsewhere"))).toBe(false);
    const target = writeHostingConfig(join(base, "dist"), JSON.parse(invented) as Record<string, string>);
    expect(target).toBe(join(base, "dist", "firebase.config.local.json"));
    expect(JSON.parse(readFileSync(target, "utf8"))).toEqual(JSON.parse(invented));
  });

  it("does nothing unless HOSTING_BUILD is 1", () => {
    expect(process.env["HOSTING_BUILD"]).not.toBe("1");
  });
});
