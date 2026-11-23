// H43c c4: cloudService state follows the final outcome of the call.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudStatusView } from "../../src/app/cloudStatus";
import { makeCloudService, type CloudModules } from "../../src/firebase/cloudService";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const APP_CHECK_URL = "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken";

function serviceWith(generateContent: () => Promise<{ response: { text(): string; inferenceSource?: unknown } }>) {
  return makeCloudService({
    production: false,
    loadConfig: async () => ({
      ok: true,
      config: { apiKey: "k", authDomain: "a", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "i" },
    }),
    loadDebug: async () => ({ startDebugAppCheck: () => undefined }),
    loadModules: async () =>
      ({
        app: { getApps: () => [], initializeApp: () => ({ name: "x" }) },
        ai: {
          GoogleAIBackend: class {},
          InferenceMode: { PREFER_IN_CLOUD: "prefer_in_cloud", ONLY_IN_CLOUD: "only_in_cloud" },
          getAI: () => ({}),
          getGenerativeModel: () => ({ generateContent }),
        },
        appCheck: {},
      }) as unknown as CloudModules,
  });
}

describe("H43c c4 cloudService final-outcome state", () => {
  it("c4-2 (3): refused, then a cloud answer, cleared (even when a 403 was seen on the way)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("content-firebaseappcheck.googleapis.com")
          ? new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 })
          : new Response("{}", { status: 200 }),
      ),
    );
    let mode: "throw403" | "cloud" = "throw403";
    const svc = serviceWith(async () => {
      await fetch(APP_CHECK_URL, { method: "POST" });
      if (mode === "throw403") throw Object.assign(new Error("HTTP status: 403"), { code: "appCheck/fetch-status-error" });
      return { response: { text: () => "Cloud draft.", inferenceSource: "IN_CLOUD" } };
    });
    await svc.configure();
    await expect(svc.generate((() => ({})) as never, "reader")).rejects.toThrow();
    expect(svc.state()).toEqual({ kind: "refused" });

    mode = "cloud";
    const out = await svc.generate((() => ({})) as never, "draft");
    expect(out.inferenceSource).toBe("IN_CLOUD");
    expect(svc.state()).toEqual({ kind: "connected" });
    expect(cloudStatusView(svc.state()).words).toBe("connected");
  });

  it("c4-2 (1): cloud failure, then a device answer, the state and the words still say the cloud call failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    let mode: "fail" | "device" = "fail";
    const svc = serviceWith(async () => {
      if (mode === "fail") throw new Error("Failed to fetch");
      return { response: { text: () => "Device draft.", inferenceSource: "ON_DEVICE" } };
    });
    await svc.configure();
    await expect(svc.generate((() => ({})) as never, "draft")).rejects.toThrow("Failed to fetch");
    expect(svc.state().kind).toBe("failed");
    expect(cloudStatusView(svc.state()).words).toContain("last call failed");

    mode = "device";
    const out = await svc.generate((() => ({})) as never, "draft");
    expect(out.inferenceSource).toBe("ON_DEVICE");
    expect(svc.state()).toEqual({ kind: "failed", detail: "no status given" });
    expect(cloudStatusView(svc.state()).words).toBe("last call failed (no status given)");
    expect(cloudStatusView(svc.state()).words).not.toBe("connected");
  });

  it("c4-2 (2): refused, then a device answer with no 403, still refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("content-firebaseappcheck.googleapis.com")
          ? new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 })
          : new Response("{}", { status: 200 }),
      ),
    );
    let mode: "throw403" | "device" = "throw403";
    const svc = serviceWith(async () => {
      if (mode === "throw403") {
        await fetch(APP_CHECK_URL, { method: "POST" });
        throw Object.assign(new Error("HTTP status: 403"), { code: "appCheck/fetch-status-error" });
      }
      return { response: { text: () => "Device draft.", inferenceSource: "ON_DEVICE" } };
    });
    await svc.configure();
    await expect(svc.generate((() => ({})) as never, "draft")).rejects.toThrow();
    expect(svc.state()).toEqual({ kind: "refused" });

    mode = "device";
    const out = await svc.generate((() => ({})) as never, "draft");
    expect(out.inferenceSource).toBe("ON_DEVICE");
    expect(svc.state()).toEqual({ kind: "refused" });
    expect(cloudStatusView(svc.state()).words).toBe("the robot check refused this page");
  });
});
