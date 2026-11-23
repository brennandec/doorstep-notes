// H29: the device press must not be the first fetch of a Firebase module. The modules load at page start
// (preloadDeviceModules, deviceApp.ts). Each test builds its own module registry with vi.doMock after vi.resetModules().
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLanguageModel } from "../support/languageModelStandIn";

const net = { offline: false };
const created: { options: Record<string, unknown>; name: string | undefined }[] = [];
const apps: { name: string }[] = [];
const generateSpy = vi.fn(async () => ({ response: { text: () => "{}", inferenceSource: "on_device" } }));
const initSpy = vi.fn(async (cb: (f: number) => void) => cb(1));
let fetchSpy: ReturnType<typeof vi.fn>;

function guard(): void {
  if (net.offline) throw new TypeError("Failed to fetch dynamically imported module");
}

function mockModules(): void {
  vi.doMock("firebase/app", () => {
    guard();
    return {
      initializeApp: (options: Record<string, unknown>, name?: string) => {
        created.push({ options, name });
        const app = { name: name ?? "[DEFAULT]", options };
        apps.push(app);
        return app;
      },
      getApps: () => apps,
    };
  });
  vi.doMock("firebase/ai", () => {
    guard();
    return {
      GoogleAIBackend: class {},
      InferenceMode: { ONLY_ON_DEVICE: "only_on_device", PREFER_ON_DEVICE: "prefer_on_device", PREFER_IN_CLOUD: "prefer_in_cloud" },
      getAI: (app: unknown) => ({ app }),
      getGenerativeModel: () => ({ generateContent: generateSpy, initializeDeviceModel: initSpy }),
    };
  });
}

beforeEach(() => {
  net.offline = false;
  created.length = 0;
  apps.length = 0;
  generateSpy.mockClear();
  initSpy.mockClear();
  fetchSpy = vi.fn(() => Promise.reject(new TypeError("offline")));
  vi.stubGlobal("fetch", fetchSpy);
  vi.resetModules();
  stubLanguageModel();
  mockModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("firebase/app");
  vi.doUnmock("firebase/ai");
});

describe("the device press with the network refused", () => {
  it("makes its call after the modules were loaded at page start", async () => {
    const mod = await import("../../src/firebase/deviceApp");
    await (mod as { preloadDeviceModules?: () => Promise<unknown> }).preloadDeviceModules?.();
    net.offline = true;
    // The wrappers are imported after the network is off, as the registry would be on a page that loaded earlier.
    const { structureSdk } = await import("../../src/firebase/structureSdk");
    const { proposeSdk } = await import("../../src/firebase/proposeSdk");
    const { draftSdk } = await import("../../src/firebase/draftSdk");
    const { rewriteSdk } = await import("../../src/firebase/rewriteSdk");
    const { initializeDeviceModelFromPress } = await import("../../src/firebase/deviceInit");

    await structureSdk.generate({ mode: "ONLY_ON_DEVICE", createOptions: {} as never, promptOptions: {} as never, parts: [{ text: "x" }] } as never);
    expect(generateSpy).toHaveBeenCalledTimes(1);
    await proposeSdk.generate({ createOptions: {} as never, promptOptions: {} as never, parts: [{ text: "x" }] } as never);
    expect(generateSpy).toHaveBeenCalledTimes(2);
    await draftSdk.generate({ mode: "ONLY_ON_DEVICE", inCloudModel: "m", createOptions: {} as never, text: "x" } as never);
    expect(generateSpy).toHaveBeenCalledTimes(3);
    await rewriteSdk.generate({ mode: "ONLY_ON_DEVICE", inCloudModel: "m", createOptions: {} as never, text: "x" } as never);
    expect(generateSpy).toHaveBeenCalledTimes(4);
    await initializeDeviceModelFromPress(() => undefined);
    expect(initSpy).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failed preload", async () => {
    net.offline = true;
    const mod = await import("../../src/firebase/deviceApp");
    await expect(mod.preloadDeviceModules()).rejects.toThrow();
    net.offline = false;
    await expect(mod.preloadDeviceModules()).resolves.toBeDefined();
    const { structureSdk } = await import("../../src/firebase/structureSdk");
    await structureSdk.generate({ mode: "ONLY_ON_DEVICE", createOptions: {} as never, promptOptions: {} as never, parts: [{ text: "x" }] } as never);
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("makes no request and no app at preload; the first press makes the device-only app once", async () => {
    const mod = await import("../../src/firebase/deviceApp");
    await mod.preloadDeviceModules();
    await mod.preloadDeviceModules();
    expect(fetchSpy).toHaveBeenCalledTimes(0);
    expect(created).toHaveLength(0);
    const { structureSdk } = await import("../../src/firebase/structureSdk");
    await structureSdk.generate({ mode: "ONLY_ON_DEVICE", createOptions: {} as never, promptOptions: {} as never, parts: [{ text: "x" }] } as never);
    expect(created.map((c) => c.name)).toEqual(["device-only"]);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });
});

describe("where the preload is wired", () => {
  it("main.ts starts the preload before start(), swallows its failure and sets data-device-modules; cloudService is unchanged in kind", () => {
    const main = readFileSync("src/app/main.ts", "utf8");
    const at = main.indexOf("void preloadDeviceModules()");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(main.indexOf("void start();"));
    expect(main).toMatch(/preloadDeviceModules\(\)\.then\(\(\) => root\.setAttribute\("data-device-modules", "ready"\), \(\) => undefined\)/);
    const cloud = readFileSync("src/firebase/cloudService.ts", "utf8");
    expect(cloud).toContain('import("firebase/app-check")');
    const fromDevice = cloud.split("\n").filter((l) => /from "\.\/deviceApp"/.test(l));
    expect(fromDevice).toEqual(['import { DEVICE_APP_NAME } from "./deviceApp";']);
    expect(cloud).not.toContain("preloadDeviceModules");
  });
});

describe("the production build", () => {
  const OUT = "test-results/h29/dist";
  const filesUnder = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? filesUnder(p) : [p];
    });

  it("lists every chunk on the service worker and holds the attribute", () => {
    execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--outDir", OUT, "--emptyOutDir"], {
      stdio: "pipe",
      timeout: 120_000,
      env: { ...process.env, HOSTING_BUILD: "" },
    });
    const html = readFileSync(`${OUT}/index.html`, "utf8");
    const mainName = /src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
    expect(mainName).toBeDefined();
    const mainText = readFileSync(`${OUT}/assets/${mainName}`, "utf8");
    expect(mainText).toContain("data-device-modules");

    const sw = readFileSync(`${OUT}/sw.js`, "utf8");
    const listed = /const ALLOWED = (\[[^\]]*\])/.exec(sw)?.[1];
    expect(listed).toBeDefined();
    const allowed = JSON.parse(listed as string) as string[];
    const js = filesUnder(`${OUT}/assets`).filter((f) => f.endsWith(".js"));
    expect(js.length).toBeGreaterThan(1);
    for (const f of js) expect(allowed, f).toContain("/" + f.slice(OUT.length + 1));

    const named = [...mainText.matchAll(/import\(`?["'`]\.\/([^"'`]+\.js)["'`]\)|from\s*["']\.\/([^"']+\.js)["']/g)].map((m) => m[1] ?? m[2]);
    for (const n of named) expect(allowed, n).toContain(`/assets/${n}`);

    expect(sw).not.toContain("firebase.config.local.json");
    expect(existsSync(`${OUT}/firebase.config.local.json`)).toBe(false);
    const aiChunks = js.filter((f) => readFileSync(f, "utf8").includes("@firebase/ai"));
    expect(aiChunks.length).toBeGreaterThan(0);
    for (const f of aiChunks) expect(allowed).toContain("/" + f.slice(OUT.length + 1));
  }, 240_000);
});
