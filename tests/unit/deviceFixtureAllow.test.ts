// measurement R17 (session H15): the recorder of the DEVICE MODEL fixture takes an allow list.
// Two hosts pass, App Check script loads pass as GETs with no body, everything else is aborted and listed.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyLedger, readLedger } from "../e2e/fixtures/cloudCalls";
import { ALLOWED_HOSTS, allowedOutside, describeRequest, findInWire, installRecorder, openDevice, redactedPath, type RecordedRequest } from "../e2e/fixtures/deviceModel";
import { CLOUD_MODEL_HOST } from "../../src/constants";

const ORIGIN = "http://localhost:4311";

describe("allowedOutside", () => {
  it("passes the App Check exchange host and the cloud model host", () => {
    expect(allowedOutside("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", "POST", true)).toBe("host");
    expect(allowedOutside("https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent", "POST", true)).toBe("host");
  });

  it("passes a GET with no body under the two recaptcha script paths, and says it is an App Check script", () => {
    expect(allowedOutside("https://www.google.com/recaptcha/enterprise.js?render=x", "GET", false)).toBe("App Check script");
    expect(allowedOutside("https://www.gstatic.com/recaptcha/releases/v1/recaptcha__en.js", "GET", false)).toBe("App Check script");
  });

  it("refuses a recaptcha address that has a body or is not a GET", () => {
    expect(allowedOutside("https://www.google.com/recaptcha/api2/reload", "POST", true)).toBeNull();
    expect(allowedOutside("https://www.google.com/recaptcha/enterprise.js", "GET", true)).toBeNull();
  });

  it("passes a POST to the enterprise reload path only when recaptcha calls are allowed", () => {
    expect(allowedOutside("https://www.google.com/recaptcha/enterprise/reload", "POST", true)).toBeNull();
    expect(allowedOutside("https://www.google.com/recaptcha/enterprise/reload", "POST", true, { recaptchaCalls: true })).toBe("reCAPTCHA call");
  });

  it("refuses a POST to another recaptcha path or another host even when recaptcha calls are allowed", () => {
    expect(allowedOutside("https://www.google.com/recaptcha/api2/other", "POST", true, { recaptchaCalls: true })).toBeNull();
    expect(allowedOutside("https://example.invalid/recaptcha/enterprise/x", "POST", true, { recaptchaCalls: true })).toBeNull();
  });

  it("still passes the enterprise script GET as an App Check script when recaptcha calls are allowed", () => {
    expect(allowedOutside("https://www.google.com/recaptcha/enterprise.js", "GET", false, { recaptchaCalls: true })).toBe("App Check script");
  });

  it("does not change the two allowed hosts", () => {
    expect([...ALLOWED_HOSTS]).toEqual(["content-firebaseappcheck.googleapis.com", "firebasevertexai.googleapis.com"]);
  });

  it("rejects a hosted open that is also given a debug token or files", async () => {
    await expect(openDevice({ hostedOrigin: "https://example.test", debugToken: "x" })).rejects.toThrow();
    await expect(openDevice({ hostedOrigin: "https://example.test", files: {} })).rejects.toThrow();
  });

  it("refuses every other host, and a look-alike of an allowed one", () => {
    expect(allowedOutside("https://example.invalid/", "GET", false)).toBeNull();
    expect(allowedOutside("https://www.google.com/search?q=x", "GET", false)).toBeNull();
    expect(allowedOutside("https://www.gstatic.com/other/x.js", "GET", false)).toBeNull();
    expect(allowedOutside("https://firebasevertexai.googleapis.com.example.invalid/x", "POST", true)).toBeNull();
    expect(allowedOutside("not an address", "GET", false)).toBeNull();
  });
});

describe("the recorder with the allow list", () => {
  type Handler = (route: unknown) => Promise<unknown>;
  function fakeContext() {
    let handler: Handler | undefined;
    const listeners: Record<string, ((x: unknown) => void)[]> = {};
    return {
      context: {
        route: async (_p: string, h: Handler) => void (handler = h),
        on: (name: string, fn: (x: unknown) => void) => void (listeners[name] = [...(listeners[name] ?? []), fn]),
      },
      fire: (name: string, x: unknown) => (listeners[name] ?? []).forEach((f) => f(x)),
      visit: async (url: string, method = "GET", body?: string) => {
        const calls: string[] = [];
        const request = { url: () => url, method: () => method, postData: () => body ?? null, postDataBuffer: () => (body ? Buffer.from(body) : null) };
        await handler!({ request: () => request, abort: async () => void calls.push("abort"), continue: async () => void calls.push("continue"), fulfill: async () => void calls.push("fulfill") });
        return { calls, request };
      },
    };
  }

  const withTempLedger = async (fn: (ledgerFile: string) => Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), "allow-ledger-"));
    try {
      await fn(join(dir, "ledger.json"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("continues an allowed host and aborts and lists any other", async () => {
    await withTempLedger(async (ledgerFile) => {
      const f = fakeContext();
      const rec = await installRecorder(f.context as never, ORIGIN, {}, { allowOutside: true, cloudLedger: { file: ledgerFile } });
      const a = await f.visit("https://content-firebaseappcheck.googleapis.com/v1/x", "POST", "{}");
      const b = await f.visit("https://example.invalid/track", "GET");
      const c = await f.visit(`${ORIGIN}/index.html`);
      expect(a.calls).toEqual(["continue"]);
      expect(b.calls).toEqual(["abort"]);
      expect(c.calls).toEqual(["continue"]);
      expect(rec.requests.map((r) => r.refused)).toEqual([false, true, false]);
      expect(rec.requests[0]!.allowedBy).toBe("host");
      expect(rec.requests[1]!.status).toBe("refused by the recorder");
    });
  });

  it("stops the cloud model call after the cap, lists it and counts App Check apart", async () => {
    await withTempLedger(async (ledgerFile) => {
      const f = fakeContext();
      const rec = await installRecorder(f.context as never, ORIGIN, {}, { allowOutside: true, generateContentCap: 1, cloudLedger: { file: ledgerFile } });
      const gen = "https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent";
      const exchange = await f.visit("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", "POST", "{}");
      const first = await f.visit(gen, "POST", "{}");
      const second = await f.visit(gen, "POST", "{}");
      expect(exchange.calls).toEqual(["continue"]);
      expect(first.calls).toEqual(["continue"]);
      expect(second.calls).toEqual(["abort"]);
      expect(rec.generateContentCount()).toBe(1);
      expect(rec.appCheckCount()).toBe(1);
      expect(rec.stoppedAtCap()).toBe(true);
      expect(rec.requests[2]!.status).toBe("refused by the recorder");
    });
  });

  it("without the option, aborts every outside host as before", async () => {
    const f = fakeContext();
    await installRecorder(f.context as never, ORIGIN);
    const a = await f.visit("https://firebasevertexai.googleapis.com/v1beta/x", "POST", "{}");
    expect(a.calls).toEqual(["abort"]);
  });

  it("records the status of an answer and no answer for a failed request", async () => {
    await withTempLedger(async (ledgerFile) => {
      const f = fakeContext();
      const rec = await installRecorder(f.context as never, ORIGIN, {}, { allowOutside: true, cloudLedger: { file: ledgerFile } });
      const a = await f.visit("https://firebasevertexai.googleapis.com/v1beta/x", "POST", "{}");
      f.fire("requestfailed", a.request);
      const b = await f.visit("https://firebasevertexai.googleapis.com/v1beta/y", "POST", "{}");
      f.fire("response", { request: () => b.request, status: () => 200 });
      expect(rec.requests.map((r) => r.status)).toEqual(["no answer", 200]);
    });
  });
});

describe("the hosted run's reCAPTCHA calls (H28b)", () => {
  const enterprise = "https://www.google.com/recaptcha/enterprise/reload?k=x";
  it("refuses a POST under the enterprise path without the option and passes it as a reCAPTCHA call with it", () => {
    expect(allowedOutside(enterprise, "POST", true)).toBeNull();
    expect(allowedOutside(enterprise, "POST", true, { recaptchaCalls: true })).toBe("reCAPTCHA call");
    expect(allowedOutside(enterprise, "POST", true, {})).toBeNull();
  });

  it("refuses a POST elsewhere under recaptcha or on another host, even with the option", () => {
    expect(allowedOutside("https://www.google.com/recaptcha/api2/other", "POST", true, { recaptchaCalls: true })).toBeNull();
    expect(allowedOutside("https://example.invalid/recaptcha/enterprise/reload", "POST", true, { recaptchaCalls: true })).toBeNull();
    expect(allowedOutside("https://www.google.com/search", "POST", true, { recaptchaCalls: true })).toBeNull();
  });

  it("still passes the enterprise script as an App Check script, and the host list is unchanged", () => {
    expect(allowedOutside("https://www.google.com/recaptcha/enterprise.js", "GET", false, { recaptchaCalls: true })).toBe("App Check script");
    expect(allowedOutside("https://www.google.com/recaptcha/enterprise.js", "GET", false)).toBe("App Check script");
    expect([...ALLOWED_HOSTS]).toEqual(["content-firebaseappcheck.googleapis.com", CLOUD_MODEL_HOST]);
  });

  it("openDevice rejects a hosted origin given with a debug token or with files", async () => {
    await expect(openDevice({ hostedOrigin: "https://example.invalid", debugToken: "x" })).rejects.toThrow();
    await expect(openDevice({ hostedOrigin: "https://example.invalid", files: {} })).rejects.toThrow();
  });
});

describe("what a record may hold about a request", () => {
  const key = "fixture-query-key-for-this-unit-test";
  const exchange: RecordedRequest = {
    url: `https://content-firebaseappcheck.googleapis.com/v1/projects/doorstep-demo/apps/1:123:web:abc:exchangeDebugToken?key=${key}`,
    method: "POST",
    bodyBytes: 2,
    refused: false,
    allowedBy: "host",
    status: 200,
    body: Buffer.from("{}"),
  };

  it("drops the query, replaces the project and app ids and holds no full address", () => {
    const d = describeRequest(exchange, ORIGIN);
    expect(d.path).toBe("/v1/projects/<project>/apps/<app>:exchangeDebugToken");
    expect(JSON.stringify(d)).not.toContain(key);
    expect(JSON.stringify(d)).not.toContain("doorstep-demo");
    expect(JSON.stringify(d)).not.toContain("https://");
    expect(d.host).toBe("content-firebaseappcheck.googleapis.com");
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(d.status).toBe(200);
    expect(d.passedBy).toBe("host");
  });

  it("redactedPath keeps the model name of a generateContent address", () => {
    expect(redactedPath("https://firebasevertexai.googleapis.com/v1beta/projects/doorstep-demo/locations/global/publishers/google/models/gemini-x:generateContent")).toBe(
      "/v1beta/projects/<project>/locations/global/publishers/google/models/gemini-x:generateContent",
    );
  });

  it("finds a value in an address or a body, ignoring case", () => {
    const r: RecordedRequest = { url: "https://example.invalid/a", method: "POST", bodyBytes: 9, refused: false, body: Buffer.from("hello BEA") };
    expect(findInWire([r], ["bea", "Maria"])).toEqual(["bea"]);
    expect(findInWire([r], [""])).toEqual([]);
  });
});

describe("daily cloud-call ledger cap enforcement on device/cloud/hosted paths (H42b)", () => {
  it("installRecorder blocks :generateContent when daily ledger is at/over 40 with 0 network calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cap-block-"));
    const ledgerFile = join(dir, "ledger.json");
    writeFileSync(
      ledgerFile,
      JSON.stringify({ ...emptyLedger(), total: 40, stoppedAtBudget: false }, null, 2),
      "utf8",
    );
    try {
      const routes: ((route: unknown) => Promise<void>)[] = [];
      const context = {
        route: async (_pat: string, handler: (route: unknown) => Promise<void>) => {
          routes.push(handler);
        },
        on: () => undefined,
      };
      const rec = await installRecorder(context as never, "http://127.0.0.1:4311/", {}, {
        allowOutside: true,
        generateContentCap: 10,
        cloudLedger: { file: ledgerFile, spec: "capBlockSpec", title: "cap block test" },
      });
      const actions: string[] = [];
      await routes[0]!({
        request: () => ({
          url: () => "https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent",
          method: () => "POST",
          postDataBuffer: () => Buffer.from("{}"),
          postData: () => "{}",
        }),
        abort: async () => {
          actions.push("abort");
        },
        continue: async () => {
          actions.push("continue");
        },
      });
      expect(actions).toEqual(["abort"]);
      expect(rec.generateContentCount()).toBe(0);
      expect(rec.stoppedAtCap()).toBe(true);
      expect(readLedger(ledgerFile).stoppedAtBudget).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("openDevice refuses before launching Chrome when daily ledger is already at or over 40", async () => {
    const dir = mkdtempSync(join(tmpdir(), "open-cap-block-"));
    const ledgerFile = join(dir, "ledger.json");
    writeFileSync(
      ledgerFile,
      JSON.stringify({ ...emptyLedger(), total: 51, stoppedAtBudget: true }, null, 2),
      "utf8",
    );
    try {
      const out = await openDevice({
        allowOutside: true,
        generateContentCap: 14,
        cloudLedger: { file: ledgerFile, spec: "measureN3CloudDrafts.ts", title: "cap test" },
      });
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.reason).toContain("51/40");
        expect(out.reason).toContain("0 network calls");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
