// WO-10. Defaults on timeout and on abort. Config and installations bodies carry no note text.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AI_SERVICE_ENABLED, DEFAULT_CLOUD_MODEL, READER_CLOUD_MODEL, REMOTE_CONFIG_FETCH_TIMEOUT_MS, SESSION_CLOUD_CAP } from "../../src/constants";
import { halvesSentences } from "../../src/app/halves";
import { strings } from "../../src/app/strings";
import { aboutLines, isAboutPath } from "../../src/app/aboutView";
import { makeCloudService, SessionCloudCapError } from "../../src/firebase/cloudService";
import {
  applyFetchBudget,
  cloudPermit,
  compiledDefaults,
  installationsBody,
  loadPageSettings,
  loadRemoteSettings,
  parseRemoteValues,
  postConfigFetches,
  remoteConfigBody,
  type ConfigFetchIds,
} from "../../src/firebase/remoteConfig";
import { mergeProposals } from "../../src/masking/merge";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const NOW = "2026-11-21T08:10:00.000Z";
const NOTE = "Bea at Harbour Lane owes the rent";
const IDS: ConfigFetchIds = {
  installationId: "fid-test",
  installationToken: "token-test",
  appId: "1:1:web:test",
  sdkVersion: "13.4.0",
  projectId: "doorstep-notes",
};

describe("fetched settings", () => {
  it("uses the compiled defaults when the fetch times out", async () => {
    const settings = await loadRemoteSettings({
      timeoutMs: 30,
      now: () => NOW,
      fetchValues: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("abort")));
      }),
    });
    expect(settings.source).toBe("defaults");
    expect(settings.draftModel).toBe(DEFAULT_CLOUD_MODEL);
    expect(settings.readerModel).toBe(READER_CLOUD_MODEL);
    expect(settings.cloudEnabled).toBe(AI_SERVICE_ENABLED);
    expect(settings.sessionCloudCap).toBe(SESSION_CLOUD_CAP);
    expect(settings.appCheckLimitedUse).toBe(false);
    expect(settings.policy.name).toBe("compiled");
    expect(settings.policy.version).toBe(1);
  });

  it("uses the compiled defaults when the caller aborts", async () => {
    const ac = new AbortController();
    ac.abort();
    let called = 0;
    const settings = await loadRemoteSettings({
      now: () => NOW,
      signal: ac.signal,
      fetchValues: () => {
        called += 1;
        return Promise.resolve({ draft_model: "other" });
      },
    });
    expect(called).toBe(0);
    expect(settings).toEqual(compiledDefaults(NOW));
  });

  it("posts no note bytes to the config service or the installations service", async () => {
    const seen: { url: string; body: string }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    });
    await postConfigFetches(fetchImpl as unknown as typeof fetch, IDS, new AbortController().signal);
    expect(seen).toHaveLength(2);
    expect(seen[0]!.url).toContain("firebaseinstallations.googleapis.com");
    expect(seen[1]!.url).toContain("firebaseremoteconfig.googleapis.com");
    for (const hit of seen) {
      expect(hit.body).not.toContain(NOTE);
      expect(hit.body).not.toContain("Harbour");
      expect(hit.body).not.toContain("Bea");
    }
    expect(JSON.parse(installationsBody(IDS))).toEqual({
      fid: IDS.installationId,
      authVersion: "FIS_v2",
      appId: IDS.appId,
      sdkVersion: IDS.sdkVersion,
    });
    expect(JSON.parse(remoteConfigBody(IDS))).toEqual({
      sdk_version: IDS.sdkVersion,
      app_instance_id: IDS.installationId,
      app_instance_id_token: IDS.installationToken,
      app_id: IDS.appId,
    });
  });

  it("turns the cloud steps off when cloud_enabled is false", () => {
    const settings = parseRemoteValues({ cloud_enabled: "false" }, NOW, true);
    expect(settings.cloudEnabled).toBe(false);
    expect(cloudPermit(true, true, settings)).toBe(false);
    expect(halvesSentences({ aiServiceEnabled: cloudPermit(true, true, settings), results: () => undefined }).cloud).toBe(strings.halves.cloudOff);
  });

  it("keeps a stable name and rejects a preview suffix", () => {
    const settings = parseRemoteValues({ draft_model: "gemini-3.5-flash-lite-preview", reader_model: READER_CLOUD_MODEL }, NOW, true);
    expect(settings.draftModel).toBe(DEFAULT_CLOUD_MODEL);
    expect(settings.readerModel).toBe(READER_CLOUD_MODEL);
  });

  it("sets the fetch budget to the compiled timeout", () => {
    const rc = { settings: { fetchTimeoutMillis: 0 }, defaultConfig: {} as Record<string, string> };
    applyFetchBudget(rc, compiledDefaults(NOW));
    expect(rc.settings.fetchTimeoutMillis).toBe(REMOTE_CONFIG_FETCH_TIMEOUT_MS);
    expect(rc.settings.fetchTimeoutMillis).toBe(5000);
    expect(rc.defaultConfig["draft_model"]).toBe(DEFAULT_CLOUD_MODEL);
    expect(rc.defaultConfig["appcheck_limited_use"]).toBe("false");
  });

  it("stops the model call once the session cap is spent", async () => {
    const generateContent = vi.fn(async (text: string) => ({ response: { text: () => "answer", inferenceSource: "IN_CLOUD" }, echoed: text }));
    const apps: { name: string }[] = [];
    const svc = makeCloudService({
      production: false,
      loadConfig: async () => ({ ok: true, config: { apiKey: "k", authDomain: "a", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "i" } }),
      loadModules: async () => ({
        app: { getApps: () => apps, initializeApp: () => { const a = { name: "[DEFAULT]" }; apps.push(a); return a; } },
        ai: {
          GoogleAIBackend: class {},
          InferenceMode: { PREFER_IN_CLOUD: "PREFER_IN_CLOUD" },
          getAI: () => ({ service: true }),
          getGenerativeModel: () => ({ generateContent }),
        },
        appCheck: {},
      }),
      loadDebug: async () => ({ startDebugAppCheck: () => undefined }),
      sessionCap: () => 1,
    });
    await svc.generate((ai) => ({ mode: ai.InferenceMode["PREFER_IN_CLOUD"] }), "one");
    await expect(svc.generate((ai) => ({ mode: ai.InferenceMode["PREFER_IN_CLOUD"] }), NOTE)).rejects.toBeInstanceOf(SessionCloudCapError);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0]?.[0]).toBe("one");
  });

  it("makes no model call when the cap is zero", async () => {
    const generateContent = vi.fn();
    const svc = makeCloudService({
      production: false,
      loadConfig: async () => ({ ok: false, reason: "not found" }),
      loadModules: async () => { throw new Error("modules"); },
      sessionCap: () => 0,
    });
    await expect(svc.generate(() => ({}), NOTE)).rejects.toBeInstanceOf(SessionCloudCapError);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("falls back when the page fetch does not settle in time", async () => {
    const settings = await loadPageSettings({
      timeoutMs: 20,
      now: () => NOW,
      loadConfig: async () => ({ ok: true }),
      activate: (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("abort")));
      }),
    });
    expect(settings.source).toBe("defaults");
    expect(settings.fetchTime).toBe(NOW);
  });

  it("drops a device proposal whose kind the policy leaves out", () => {
    const policy = { ...DEFAULT_POLICY, categories: ["name"] as const };
    const merged = mergeProposals("the harbour", [], [{ text: "harbour", kind: "place" }], policy);
    expect(merged.spans).toEqual([]);
    expect(merged.dropped).toEqual([]);
  });

  it("shows the policy name, version and fetch time", () => {
    const settings = compiledDefaults(NOW);
    expect(isAboutPath("/about")).toBe(true);
    expect(isAboutPath("/about/")).toBe(true);
    expect(aboutLines(settings)).toEqual({ name: "compiled", version: "1", fetchTime: NOW });
  });

  it("matches the template file to the compiled defaults", () => {
    const template = JSON.parse(readFileSync("remoteconfig.template.json", "utf8")) as {
      parameters: Record<string, { defaultValue: { value: string } }>;
    };
    expect(template.parameters["draft_model"]!.defaultValue.value).toBe(DEFAULT_CLOUD_MODEL);
    expect(template.parameters["reader_model"]!.defaultValue.value).toBe(READER_CLOUD_MODEL);
    expect(template.parameters["cloud_enabled"]!.defaultValue.value).toBe("true");
    expect(template.parameters["session_cloud_cap"]!.defaultValue.value).toBe(String(SESSION_CLOUD_CAP));
    expect(template.parameters["appcheck_limited_use"]!.defaultValue.value).toBe("false");
    const policy = JSON.parse(template.parameters["mask_policy"]!.defaultValue.value) as { name: string; version: number };
    expect(policy.name).toBe("compiled");
    expect(policy.version).toBe(1);
  });
});
