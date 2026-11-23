// Hosted cloud task 3 (R1.1, R3.1): the three cloud features get their model through cloudService().
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WRAPPERS = ["draftSdk", "rewriteSdk", "secondReaderSdk"] as const;
const src = (name: string) => readFileSync(`src/firebase/${name}.ts`, "utf8");

describe("the cloud wrappers", () => {
  for (const name of WRAPPERS) {
    it(`${name} uses cloudService() and starts nothing itself`, () => {
      const text = src(name);
      expect(text).toContain("cloudService()");
      expect(text).not.toMatch(/firebase\/app-check/);
      expect(text).not.toMatch(/import\(\s*["']firebase\/app["']\s*\)/);
      expect(text).not.toMatch(/initializeApp|initializeAppCheck|ReCaptcha|getAI\(|loadFirebaseConfig|debug-provider-placeholder|FIREBASE_APPCHECK_DEBUG_TOKEN/);
    });
  }

  it("the debug path lives in appCheckDebug.ts and in no other source file", () => {
    expect(src("appCheckDebug")).toContain("FIREBASE_APPCHECK_DEBUG_TOKEN");
    expect(src("appCheckDebug")).toContain("CustomProvider");
    expect(src("appCheckDebug")).not.toMatch(/ReCaptcha/);
    expect(src("appCheck")).not.toContain("FIREBASE_APPCHECK_DEBUG_TOKEN");
    expect(src("cloudService")).not.toContain("FIREBASE_APPCHECK_DEBUG_TOKEN");
  });

  it("the debug module is loaded only behind a check of the build mode", () => {
    const text = src("cloudService");
    expect(text).toMatch(/import\.meta\.env\.MODE\s*(===|!==)\s*["']production["']/);
    expect(text).toMatch(/import\(\s*["']\.\/appCheckDebug["']\s*\)/);
    expect(text).not.toMatch(/^import .* from ["']\.\/appCheckDebug["']/m);
  });

  it("production uses the Enterprise provider, and the per-call token option stays off", () => {
    const text = src("cloudService");
    expect(src("appCheck")).toContain("ReCaptchaEnterpriseProvider");
    expect(text).toContain("useLimitedUseAppCheckTokens");
    expect(text).toContain("limitedUse?.() === true");
    expect(text).not.toContain("const useLimitedUse = true");
    expect(text).not.toMatch(/production \? \{ useLimitedUseAppCheckTokens: true \}/);
    for (const t of [text, src("appCheck"), src("appCheckDebug")]) expect(t).not.toContain("ReCaptchaV3Provider");
  });
});
