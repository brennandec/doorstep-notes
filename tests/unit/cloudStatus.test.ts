// @vitest-environment happy-dom
// Hosted cloud tasks 5 and 6 (R4): the status bar's cloud state is derived from the config and the last call.
// Invented values only. No request is made.
import { describe, expect, it, vi } from "vitest";
import { cloudStatusView } from "../../src/app/cloudStatus";
import { makeController } from "../../src/app/controller";
import { renderStatusBar, statesOf } from "../../src/app/statusBar";
import { strings } from "../../src/app/strings";
import { makeCloudService } from "../../src/firebase/cloudService";
import { makeDeviceModel } from "../../src/inference/deviceModel";

const bar = (cloudStatus?: ReturnType<typeof cloudStatusView>, cloud = true) =>
  renderStatusBar({ network: "online", device: { state: "unavailable" }, cloud, ...(cloudStatus ? { cloudStatus } : {}) });
const cloudWords = (el: HTMLElement) => el.querySelector('[data-state="cloud"] .state-words')?.textContent;

describe("the words of each cloud state", () => {
  it("not configured, connected and failed have their own words, in the string table", () => {
    expect(strings.status.cloudNotConfigured).toBe("not configured");
    expect(strings.status.cloudConnected).toBe("connected");
    expect(strings.status.cloudNotConnected).toBe("off");
    expect(cloudStatusView({ kind: "not-configured" })).toEqual({ kind: "not-configured", words: "not configured" });
    expect(cloudStatusView({ kind: "connected" })).toEqual({ kind: "connected", words: "connected" });
    expect(cloudStatusView({ kind: "failed", detail: "status 403" })).toEqual({ kind: "failed", words: "last call failed (status 403)" });
  });

  it("the bar shows each state in words, struck icon unless connected", () => {
    expect(cloudWords(bar(cloudStatusView({ kind: "not-configured" })))).toBe("not configured");
    expect(cloudWords(bar(cloudStatusView({ kind: "connected" })))).toBe("connected");
    expect(cloudWords(bar(cloudStatusView({ kind: "failed", detail: "status 403" })))).toBe("last call failed (status 403)");
    const struck = (s: ReturnType<typeof cloudStatusView>) => statesOf({ network: "online", device: { state: "unavailable" }, cloud: true, cloudStatus: s }).find((v) => v.key === "cloud")!.struck;
    expect(struck(cloudStatusView({ kind: "connected" }))).toBe(false);
    expect(struck(cloudStatusView({ kind: "not-configured" }))).toBe(true);
    expect(struck(cloudStatusView({ kind: "failed", detail: "x" }))).toBe(true);
  });

  it("with no derived state the older words stay: connected or off from the switch", () => {
    expect(cloudWords(bar(undefined, true))).toBe("connected");
    expect(cloudWords(bar(undefined, false))).toBe("off");
  });
});

describe("the state the cloud service derives", () => {
  function service(failWith?: unknown) {
    const deps = {
      production: false,
      loadConfig: async () => ({ ok: true as const, config: { apiKey: "k", authDomain: "a", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "i" } }),
      loadDebug: async () => ({ startDebugAppCheck: () => undefined }),
      loadModules: async () => ({
        app: { getApps: () => [] as { name: string }[], initializeApp: () => ({ name: "x" }) },
        ai: {
          GoogleAIBackend: class {},
          getAI: () => ({}),
          getGenerativeModel: () => ({
            generateContent: async () => {
              if (failWith !== undefined) throw failWith;
              return { response: { text: () => "t", inferenceSource: "IN_CLOUD" } };
            },
          }),
        },
        appCheck: {},
      }),
    };
    return makeCloudService(deps as never);
  }

  it("is READY once the config is read and before any call — never connected", async () => {
    // WO-02. "connected" is a claim that a call reached the cloud; before the first IN_CLOUD
    // answer the honest state is "ready, not used yet". This test used to assert the opposite,
    // and its old name — "is connected … before any call" — was the defect written down.
    const s = service();
    expect(await s.configure()).toEqual({ kind: "ready" });
  });

  it("a failed call shows the status the SDK gave, and a later answer shows connected again", async () => {
    let fail: unknown = Object.assign(new Error("refused"), { customErrorData: { status: 403 } });
    const s = makeCloudService({
      production: false,
      loadConfig: async () => ({ ok: true as const, config: {} as never }),
      loadDebug: async () => ({ startDebugAppCheck: () => undefined }),
      loadModules: async () =>
        ({
          app: { getApps: () => [], initializeApp: () => ({ name: "x" }) },
          ai: {
            GoogleAIBackend: class {},
            getAI: () => ({}),
            getGenerativeModel: () => ({
              generateContent: async () => {
                if (fail) throw fail;
                return { response: { text: () => "t", inferenceSource: "IN_CLOUD" } };
              },
            }),
          },
          appCheck: {},
        }) as never,
    });
    const seen: string[] = [];
    s.onChange((st) => seen.push(st.kind));
    await s.configure();
    await expect(s.generate((() => ({})) as never, "x")).rejects.toThrow();
    expect(s.state()).toEqual({ kind: "failed", detail: "status 403" });
    fail = undefined;
    await s.generate((() => ({})) as never, "x");
    expect(s.state()).toEqual({ kind: "connected" });
    // WO-02: the sequence opens on "ready", not "connected", because no IN_CLOUD answer has
    // arrived yet. Its later move to "connected" is the proof an answer was seen.
    expect(seen).toEqual(["ready", "failed", "connected"]);
  });

  it("a failure with no status says so, and never carries the message text", async () => {
    const s = service(new Error("a sentence about Priya Halloran"));
    await s.configure();
    await expect(s.generate((() => ({})) as never, "x")).rejects.toThrow();
    const st = s.state();
    expect(st.kind).toBe("failed");
    expect(JSON.stringify(st)).not.toContain("Priya");
  });

  it("not configured stays not configured after a refused call", async () => {
    const s = makeCloudService({ production: true, loadConfig: async () => ({ ok: true as const, config: {} as never }), loadModules: async () => ({}) as never });
    await expect(s.generate((() => ({})) as never, "x")).rejects.toThrow(/not configured/i);
    expect(s.state()).toEqual({ kind: "not-configured" });
  });
});

describe("the page", () => {
  it("shows the derived state and changes after refreshCloud()", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    let current = cloudStatusView({ kind: "not-configured" });
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: false,
      tier: "paid",
      results: () => undefined,
      isOffline: async () => false,
      cloudStatus: () => current,
    });
    await c.start();
    expect(cloudWords(root)).toBe("not configured");
    current = cloudStatusView({ kind: "failed", detail: "status 403" });
    c.refreshCloud();
    expect(cloudWords(root)).toBe("last call failed (status 403)");
    current = cloudStatusView({ kind: "connected" });
    c.refreshCloud();
    expect(cloudWords(root)).toBe("connected");
    vi.restoreAllMocks();
  });
});

describe("main.ts", () => {
  it("takes the cloud state from the service, not from a build constant", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync("src/app/main.ts", "utf8");
    expect(main).toContain("cloudService()");
    expect(main).toContain("cloudStatusView");
    expect(main).not.toMatch(/aiServiceEnabled:\s*AI_SERVICE_ENABLED/);
    expect(main).toMatch(/\.onChange\(/);
  });
});
