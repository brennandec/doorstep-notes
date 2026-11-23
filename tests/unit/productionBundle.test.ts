// Hosted cloud task 4 (R1.2, R1.3, R1.4): the production bundle holds no App Check debug path.
// It builds the production bundle and the e2e bundle into folders under test-results/ (git ignores them).
// The local debug token value is compared against the output and never printed.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PROD = "test-results/h19-prod";
const E2E = "test-results/h19-e2e";
const VITE = "node_modules/vite/bin/vite.js";

function build(outDir: string, mode?: string): void {
  const args = [VITE, "build", "--outDir", outDir, "--emptyOutDir", ...(mode ? ["--mode", mode] : [])];
  execFileSync(process.execPath, args, { stdio: "pipe", timeout: 120_000, env: { ...process.env, HOSTING_BUILD: "" } });
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

const textOf = (dir: string): string => filesUnder(dir).map((f) => (/\.(js|html|css|json|txt|webmanifest)$/.test(f) ? readFileSync(f, "utf8") : "")).join("\n");

describe("the production bundle", () => {
  let prod = "";
  let e2e = "";
  beforeAll(() => {
    build(PROD);
    build(E2E, "e2e");
    prod = textOf(PROD);
    e2e = textOf(E2E);
  }, 240_000);

  it("holds no debug token name, so a token set on a hosted page does nothing", () => {
    expect(prod.includes("FIREBASE_APPCHECK_DEBUG_TOKEN")).toBe(false);
  });

  it("holds no placeholder provider", () => {
    expect(prod.includes("debug-provider-placeholder")).toBe(false);
  });

  it("holds no debug module of this project (appCheckDebug)", () => {
    expect(prod.includes("No App Check token without the registered debug token")).toBe(false);
    expect(prod.includes("initAppCheckDebug")).toBe(false);
  });

  it("holds the local debug token value nowhere (compared, never printed)", () => {
    const file = "appcheck-debug-token.local";
    if (!existsSync(file)) return;
    const value = readFileSync(file, "utf8").trim();
    if (value.length < 8) return;
    expect(prod.includes(value), "the production bundle holds the local debug token value").toBe(false);
  });

  it("still holds the reCAPTCHA Enterprise provider and the limited-use setting", () => {
    expect(prod).toContain("ReCaptchaEnterpriseProvider");
    expect(prod).toContain("useLimitedUseAppCheckTokens");
  });

  it("the e2e bundle keeps the debug path the specs rely on", () => {
    expect(e2e.includes("FIREBASE_APPCHECK_DEBUG_TOKEN")).toBe(true);
    expect(e2e.includes("debug-provider-placeholder")).toBe(false);
  });
});
