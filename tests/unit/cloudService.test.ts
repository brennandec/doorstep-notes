// Hosted cloud task 1 (R1.1, R2.1, R2.3, R3.1, R3.3): one cloudService(), with stubs for the SDK modules.
// Invented values only.
import { describe, expect, it, vi } from "vitest";
import { makeCloudService, type CloudServiceDeps } from "../../src/firebase/cloudService";

const CONFIG = { apiKey: "k", authDomain: "a", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "i" };

function stubs(over: { config?: unknown; production: boolean; siteKey?: string; withDebug?: boolean }) {
  const apps: { name: string }[] = [];
  const log: string[] = [];
  class Backend {}
  class Enterprise {
    constructor(readonly key: string) {
      log.push(`enterprise:${key}`);
    }
  }
  const generateContent = vi.fn(async () => ({ response: { text: () => "answer", inferenceSource: "IN_CLOUD" } }));
  const modules = {
    app: {
      getApps: () => apps,
      initializeApp: vi.fn((_c: unknown, name?: string) => {
        const a = { name: name ?? "[DEFAULT]" };
        apps.push(a);
        log.push("initializeApp");
        return a;
      }),
    },
    ai: {
      GoogleAIBackend: Backend,
      InferenceMode: { PREFER_IN_CLOUD: "PREFER_IN_CLOUD" },
      getAI: vi.fn((_app: unknown, options: unknown) => {
        log.push(`getAI:${JSON.stringify(options)}`);
        return { service: true };
      }),
      getGenerativeModel: vi.fn((_s: unknown, params: unknown) => {
        log.push(`model:${JSON.stringify(params)}`);
        return { generateContent };
      }),
    },
    appCheck: {
      initializeAppCheck: vi.fn((_a: unknown, o: { provider: unknown }) => {
        log.push(`appCheck:${o.provider instanceof Enterprise ? "enterprise" : "other"}`);
        return {};
      }),
      ReCaptchaEnterpriseProvider: Enterprise,
    },
  };
  const loadModules = vi.fn(async () => modules);
  const debugStart = vi.fn(() => log.push("debug"));
  const loadConfig = vi.fn(async () =>
    over.config !== undefined
      ? (over.config as never)
      : ({ ok: true, config: CONFIG, ...(over.siteKey !== undefined ? { siteKey: over.siteKey } : {}) } as never),
  );
  const deps: CloudServiceDeps = {
    production: over.production,
    loadConfig,
    loadModules: loadModules as never,
    ...(over.withDebug ? { loadDebug: async () => ({ startDebugAppCheck: debugStart }) } : {}),
  };
  return { deps, modules, loadModules, loadConfig, debugStart, log, generateContent };
}

const build = (ai: { InferenceMode: Record<string, unknown> }) => ({ mode: ai.InferenceMode["PREFER_IN_CLOUD"], inCloudParams: { model: "invented-model" } });

describe("cloudService", () => {
  it("starts the app, App Check and the AI service once for any number of calls", async () => {
    const s = stubs({ production: true, siteKey: "invented-site-key" });
    const svc = makeCloudService(s.deps);
    await svc.generate(build as never, "one");
    await svc.generate(build as never, "two");
    await svc.generate(build as never, "three");
    expect(s.modules.app.initializeApp).toHaveBeenCalledTimes(1);
    expect(s.modules.appCheck.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(s.modules.ai.getAI).toHaveBeenCalledTimes(1);
    expect(s.loadModules).toHaveBeenCalledTimes(1);
    expect(s.generateContent).toHaveBeenCalledTimes(3);
  });

  it("concurrent first calls still start once", async () => {
    const s = stubs({ production: true, siteKey: "invented-site-key" });
    const svc = makeCloudService(s.deps);
    await Promise.all([svc.generate(build as never, "a"), svc.generate(build as never, "b")]);
    expect(s.modules.app.initializeApp).toHaveBeenCalledTimes(1);
    expect(s.modules.appCheck.initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  it("production with a site key: reCAPTCHA Enterprise, limited-use tokens, no debug code loaded", async () => {
    const s = stubs({ production: true, siteKey: "invented-site-key", withDebug: true });
    const svc = makeCloudService(s.deps);
    const out = await svc.generate(build as never, "text");
    expect(out).toEqual({ text: "answer", inferenceSource: "IN_CLOUD" });
    expect(s.log).toContain("enterprise:invented-site-key");
    expect(s.log).toContain("appCheck:enterprise");
    // WO-02 reverses this. Limited-use means one robot check PER CALL, so a 3-call judge path
    // meets a refusal 1-(4/5)^3 = 49% of the time against about 20% with one cached token. The
    // production path now uses CACHED STANDARD tokens, so this option must be absent.
    expect(s.log.find((l) => l.startsWith("getAI:"))).not.toContain('"useLimitedUseAppCheckTokens":true');
    expect(s.debugStart).not.toHaveBeenCalled();
  });

  it("production without a site key: no start, no App Check, no module load, and the state says not configured", async () => {
    const s = stubs({ production: true });
    const svc = makeCloudService(s.deps);
    expect(await svc.configure()).toEqual({ kind: "not-configured" });
    await expect(svc.generate(build as never, "text")).rejects.toThrow(/not configured/i);
    expect(s.loadModules).not.toHaveBeenCalled();
    expect(s.modules.appCheck.initializeAppCheck).not.toHaveBeenCalled();
    expect(s.log).toEqual([]);
    expect(svc.state()).toEqual({ kind: "not-configured" });
  });

  it("production never makes a provider from a placeholder", async () => {
    const s = stubs({ production: true, siteKey: "<appCheckSiteKey>" });
    // the loader drops placeholders; a service handed one anyway still makes no provider
    const svc = makeCloudService(s.deps);
    await expect(svc.generate(build as never, "text")).rejects.toThrow(/not configured/i);
    expect(s.log).toEqual([]);
  });

  it("starts App Check when another module already created the default app", async () => {
    const debug = stubs({ production: false, withDebug: true });
    debug.modules.app.getApps = () => [{ name: "[DEFAULT]" }];
    await makeCloudService(debug.deps).generate(build as never, "text");
    expect(debug.modules.app.initializeApp).not.toHaveBeenCalled();
    expect(debug.debugStart).toHaveBeenCalledTimes(1);

    const prod = stubs({ production: true, siteKey: "invented-site-key" });
    prod.modules.app.getApps = () => [{ name: "[DEFAULT]" }];
    await makeCloudService(prod.deps).generate(build as never, "text");
    expect(prod.modules.app.initializeApp).not.toHaveBeenCalled();
    expect(prod.modules.appCheck.initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  it("a debug build with config uses the debug path, a plain provider is never an Enterprise one, and tokens are not limited-use", async () => {
    const s = stubs({ production: false, withDebug: true });
    const svc = makeCloudService(s.deps);
    await svc.generate(build as never, "text");
    expect(s.debugStart).toHaveBeenCalledTimes(1);
    expect(s.log.some((l) => l.startsWith("enterprise:"))).toBe(false);
    expect(s.modules.appCheck.initializeAppCheck).not.toHaveBeenCalled();
    expect(s.log.find((l) => l.startsWith("getAI:"))).not.toContain("useLimitedUseAppCheckTokens\":true");
  });

  it("no config at all: not configured, whatever the build", async () => {
    for (const production of [true, false]) {
      const s = stubs({ production, config: { ok: false, reason: "not found" }, withDebug: true });
      const svc = makeCloudService(s.deps);
      expect(await svc.configure()).toEqual({ kind: "not-configured" });
      await expect(svc.generate(build as never, "t")).rejects.toThrow(/not configured/i);
      expect(s.loadModules).not.toHaveBeenCalled();
    }
  });

  it("a failed start is not kept: the next call tries again", async () => {
    const s = stubs({ production: true, siteKey: "invented-site-key" });
    s.loadModules.mockRejectedValueOnce(new Error("module did not load"));
    const svc = makeCloudService(s.deps);
    await expect(svc.generate(build as never, "t")).rejects.toThrow("module did not load");
    await expect(svc.generate(build as never, "t")).resolves.toMatchObject({ text: "answer" });
    expect(s.loadModules).toHaveBeenCalledTimes(2);
  });

  it("fetches remote settings before App Check on a cloud call", async () => {
    const s = stubs({ production: true, siteKey: "invented-site-key" });
    s.deps.prepare = async () => {
      s.log.push("prepare");
    };
    const svc = makeCloudService(s.deps);
    await svc.generate(build as never, "one");
    expect(s.log[0]).toBe("prepare");
    expect(s.log.findIndex((line) => line.startsWith("appCheck:"))).toBeGreaterThan(0);
  });
});
