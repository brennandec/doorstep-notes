// Device jobs work with the network off (H1, drafting H4 offline). Their SDK wrappers must not
// need the project's config: ONLY_ON_DEVICE makes no call to the project (browser document,
// ruling 23), and the config file is fetched from the network, which is gone when offline.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLanguageModel } from "../support/languageModelStandIn";

const created: { options: Record<string, unknown>; name: string | undefined }[] = [];
const apps: { name: string }[] = [];

vi.mock("firebase/app", () => ({
  initializeApp: (options: Record<string, unknown>, name?: string) => {
    created.push({ options, name });
    const app = { name: name ?? "[DEFAULT]", options };
    apps.push(app);
    return app;
  },
  getApps: () => apps,
}));
vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  InferenceMode: { ONLY_ON_DEVICE: "only_on_device", PREFER_ON_DEVICE: "prefer_on_device", PREFER_IN_CLOUD: "prefer_in_cloud" },
  getAI: (app: unknown) => ({ app }),
  getGenerativeModel: () => ({
    generateContent: async () => ({ response: { text: () => "{}", inferenceSource: "on_device" } }),
    initializeDeviceModel: async (cb: (f: number) => void) => cb(1),
  }),
}));

describe("device jobs need no project config", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    created.length = 0;
    apps.length = 0;
    fetchSpy = vi.fn(() => Promise.reject(new TypeError("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    stubLanguageModel();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("the structure wrapper answers with the network off and asks for no config", async () => {
    const { structureSdk } = await import("../../src/firebase/structureSdk");
    const out = await structureSdk.generate({ mode: "ONLY_ON_DEVICE", createOptions: {} as never, promptOptions: {} as never, parts: [{ text: "x" }] });
    expect(out.inferenceSource).toBe("on_device");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(created.map((c) => c.name)).toEqual(["device-only"]);
  });

  it("the propose wrapper, the device draft and the device start do the same", async () => {
    const { proposeSdk } = await import("../../src/firebase/proposeSdk");
    const { draftSdk } = await import("../../src/firebase/draftSdk");
    const { initializeDeviceModelFromPress } = await import("../../src/firebase/deviceInit");
    await proposeSdk.generate({ createOptions: {} as never, promptOptions: {} as never, parts: [{ text: "x" }] } as never);
    await draftSdk.generate({ mode: "ONLY_ON_DEVICE", inCloudModel: "m", createOptions: {} as never, text: "x" });
    await initializeDeviceModelFromPress(() => undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    // One shared device-only app, made once.
    expect(created.map((c) => c.name)).toEqual(["device-only"]);
  });

  it("the device-only app holds no key and no project: invented placeholders only", async () => {
    const { DEVICE_ONLY_CONFIG } = await import("../../src/firebase/deviceApp");
    expect(JSON.stringify(DEVICE_ONLY_CONFIG)).toMatch(/device-only/);
    expect(Object.values(DEVICE_ONLY_CONFIG).every((v) => /device-only|0/.test(String(v)))).toBe(true);
  });

  it("a cloud draft goes through cloudService(), which needs the real config, and is not given the device-only app", () => {
    const text = readFileSync("src/firebase/draftSdk.ts", "utf8");
    expect(text).toMatch(/cloudService\(\)/);
    expect(text).toMatch(/call\.mode === "ONLY_ON_DEVICE"/);
    expect(readFileSync("src/firebase/cloudService.ts", "utf8")).toMatch(/loadConfig\(\)/);
  });

  it("no cloud wrapper takes the device-only app as its own", () => {
    const service = readFileSync("src/firebase/cloudService.ts", "utf8");
    expect(service).not.toMatch(/getApps\(\)\[0\]/);
    expect(service).toMatch(/a\.name !== DEVICE_APP_NAME/);
    for (const f of ["draftSdk", "rewriteSdk", "secondReaderSdk"]) {
      const text = readFileSync(`src/firebase/${f}.ts`, "utf8");
      expect(text, f).not.toMatch(/getApps\(\)\[0\]/);
    }
  });
});
