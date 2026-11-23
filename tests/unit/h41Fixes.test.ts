// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { renderNoteZone } from "../../src/app/zones/note";
import { fetchNetworkEntryScript, verifyLoadedRelease } from "../e2e/fixtures/records";

interface CachePutCall {
  key: string;
  response: unknown;
}

function loadSwSandbox(opts: {
  fetchImpl: (req: unknown, init?: { signal?: AbortSignal }) => Promise<unknown>;
  cached?: Record<string, unknown>;
  scope?: string;
  locationHref?: string;
}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const puts: CachePutCall[] = [];
  const cachedMap = new Map<string, unknown>(Object.entries(opts.cached ?? {}));
  const scope = opts.scope ?? "https://doorstep-notes.web.app/";
  const locationHref = opts.locationHref ?? `${scope}sw.js`;

  const cacheObj = {
    async addAll() {},
    async put(key: unknown, response: unknown) {
      const k = typeof key === "string" ? key : (key as { url: string }).url;
      puts.push({ key: k, response });
      cachedMap.set(k, response);
    },
    async match(key: unknown) {
      const k = typeof key === "string" ? key : new URL((key as { url: string }).url).pathname;
      return cachedMap.get(k);
    },
  };

  const sandbox: Record<string, unknown> = {
    URL,
    Headers,
    Response,
    AbortController,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: opts.fetchImpl,
    caches: {
      async open() {
        return cacheObj;
      },
      async keys() {
        return [];
      },
      async delete() {
        return true;
      },
      async match(key: unknown) {
        return cacheObj.match(key);
      },
    },
    self: {
      location: new URL(locationHref),
      registration: { scope },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
      addEventListener(type: string, fn: (event: unknown) => void) {
        listeners.set(type, fn);
      },
    },
  };

  const code = readFileSync("public/sw.js", "utf8");
  vm.runInNewContext(code, sandbox, { filename: "public/sw.js" });

  const dispatchNavigate = async (url: string, optsReq: { method?: string; mode?: string } = {}) => {
    const handler = listeners.get("fetch");
    if (!handler) throw new Error("fetch listener not registered in public/sw.js");
    let responsePromise: Promise<unknown> | undefined;
    const waitPromises: Promise<unknown>[] = [];
    const req = { url, method: optsReq.method ?? "GET", mode: optsReq.mode ?? "navigate" };
    handler({
      request: req,
      respondWith(p: Promise<unknown>) {
        responsePromise = Promise.resolve(p);
      },
      waitUntil(p: Promise<unknown>) {
        waitPromises.push(Promise.resolve(p));
      },
    });
    return { responsePromise, waitPromises };
  };

  return { dispatchNavigate, puts, cachedMap };
}

function fakeResponse(opts: {
  ok?: boolean;
  status?: number;
  redirected?: boolean;
  contentType?: string;
  body?: string;
}) {
  const body = opts.body ?? "<html><script type='module' src='/assets/index-new.js'></script></html>";
  const headers = new Headers();
  if (opts.contentType !== undefined) headers.set("content-type", opts.contentType);
  const res = {
    ok: opts.ok ?? true,
    status: opts.status ?? ((opts.ok ?? true) ? 200 : 500),
    redirected: opts.redirected ?? false,
    headers,
    async text() {
      return body;
    },
    clone() {
      return fakeResponse(opts);
    },
  };
  return res;
}

describe("H41 Item 1 & Item 2: service worker navigate timeout (~3 s) and shell cache guard", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Item 1: aborted stalled navigate network at ~3,000 ms serves cached shell cleanly", async () => {
    vi.useFakeTimers();
    let seenSignal: AbortSignal | undefined;
    const staleCached = fakeResponse({ contentType: "text/html", body: "<html>cached-shell</html>" });
    const { dispatchNavigate } = loadSwSandbox({
      cached: { "/index.html": staleCached },
      fetchImpl: (_req, init) => {
        seenSignal = init?.signal;
        return new Promise(() => {
          // Intentionally never settles to simulate a hung network connection.
        });
      },
    });

    const { responsePromise } = await dispatchNavigate("https://doorstep-notes.web.app/");
    expect(responsePromise).toBeDefined();

    let settled = false;
    let resolved: unknown;
    void responsePromise!.then((r) => {
      settled = true;
      resolved = r;
    });

    await vi.advanceTimersByTimeAsync(2900);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
    expect(resolved).toBe(staleCached);
    expect(seenSignal?.aborted).toBe(true);
  });

  it("Item 1: stalled navigate with empty cache does not leave respondWith undefined", async () => {
    vi.useFakeTimers();
    const { dispatchNavigate } = loadSwSandbox({
      cached: {},
      fetchImpl: () => new Promise(() => {}),
    });

    const { responsePromise } = await dispatchNavigate("https://doorstep-notes.web.app/");
    expect(responsePromise).toBeDefined();
    await vi.advanceTimersByTimeAsync(3100);
    const res = await responsePromise!;
    expect(res).toBeDefined();
  });

  it("Item 2: stores shell for / and /index.html only when ok, not redirected, and text/html; rejects 3+ bad paths & invalid responses", async () => {
    for (const goodPath of ["/", "/index.html"]) {
      const { dispatchNavigate, puts } = loadSwSandbox({
        fetchImpl: async () => fakeResponse({ ok: true, redirected: false, contentType: "text/html; charset=utf-8" }),
      });
      const { responsePromise, waitPromises } = await dispatchNavigate(`https://doorstep-notes.web.app${goodPath}`);
      await responsePromise;
      await Promise.all(waitPromises);
      expect(puts.map((p) => p.key), goodPath).toEqual(["/index.html"]);
    }

    const rejectedCases = [
      { path: "/manifest.webmanifest", res: fakeResponse({ ok: true, redirected: false, contentType: "text/html" }) },
      { path: "/assets/index-abc.js", res: fakeResponse({ ok: true, redirected: false, contentType: "text/html" }) },
      { path: "/other-route", res: fakeResponse({ ok: true, redirected: false, contentType: "text/html" }) },
      { path: "/", res: fakeResponse({ ok: false, status: 503, redirected: false, contentType: "text/html" }) },
      { path: "/", res: fakeResponse({ ok: true, redirected: true, contentType: "text/html" }) },
      { path: "/", res: fakeResponse({ ok: true, redirected: false, contentType: "application/json" }) },
    ];

    for (const c of rejectedCases) {
      const { dispatchNavigate, puts } = loadSwSandbox({
        fetchImpl: async () => c.res,
      });
      const { responsePromise, waitPromises } = await dispatchNavigate(`https://doorstep-notes.web.app${c.path}`);
      await responsePromise;
      await Promise.all(waitPromises);
      expect(puts, `must not cache ${c.path} (ok=${c.res.ok}, redirected=${c.res.redirected}, ct=${c.res.headers.get("content-type")})`).toEqual([]);
    }
  });
});

describe("H41 Item 3 & Item 4: no-model copy and Finished zone deduplication", () => {
  it("Item 3: no-model way-forward copy says from a note to a sent draft and never the full flow", () => {
    expect(strings.deviceModelWayForward).toContain("from a note to a sent draft");
    expect(strings.deviceModelWayForward.toLowerCase()).not.toContain("the full flow");

    const zone = renderNoteZone(emptyState(), {} as Handlers);
    const wayForward = zone.querySelector('[data-model-way-forward]')?.textContent?.trim() ?? "";
    expect(wayForward).toContain("from a note to a sent draft");
    expect(wayForward.toLowerCase()).not.toContain("the full flow");
  });

  it("Item 4: Finished zone renders The finished note appears here. only once when finished is null", () => {
    const emptyZone = renderFinishedZone(emptyState());
    const emptyText = emptyZone.textContent ?? "";
    expect(emptyText.split("The finished note appears here.").length - 1).toBe(1);

    const recordState = emptyState({
      noteText: "Visit note",
      record: { visitDate: "2026-11-15", present: [], seen: ["Something"], agreed: [], risks: [], nextSteps: [] },
    });
    const recZone = renderFinishedZone(recordState);
    const recText = recZone.textContent ?? "";
    expect(recText.split("The finished note appears here.").length - 1).toBe(1);
  });
});

describe("H41 Item 5: loaded-release check, 1 reload then stop, both names, and stop table", () => {
  it("fetchNetworkEntryScript requests index.html with no-cache/no-store outside page SW", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const entry = await fetchNetworkEntryScript("https://doorstep-notes.web.app/", async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response('<html><script type="module" crossorigin src="/assets/index-NewHash1.js"></script></html>', {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    expect(capturedUrl).toBe("https://doorstep-notes.web.app/index.html");
    expect(capturedInit?.cache).toBe("no-store");
    expect(new Headers(capturedInit?.headers).get("cache-control")).toMatch(/no-store/i);
    expect(entry).toBe("assets/index-NewHash1.js");
  });

  it("verifyLoadedRelease passes without reload when matching, recovers after 1 reload, and stops cleanly if mismatch persists", async () => {
    // 1. Matching immediately -> 0 reloads.
    let reloads = 0;
    const passImmediate = await verifyLoadedRelease({
      readLoadedScript: async () => "/assets/index-Rel11.js",
      readNetworkScript: async () => "assets/index-Rel11.js",
      reload: async () => {
        reloads++;
      },
    });
    expect(reloads).toBe(0);
    expect(passImmediate).toEqual({
      loadedScript: "assets/index-Rel11.js",
      networkScript: "assets/index-Rel11.js",
      reloaded: false,
      matches: true,
    });

    // 2. Old on first load, fresh after 1 reload -> 1 reload, passes.
    reloads = 0;
    const passAfterReload = await verifyLoadedRelease({
      readLoadedScript: async () => (reloads === 0 ? "assets/index-Old10.js" : "assets/index-Rel11.js"),
      readNetworkScript: async () => "assets/index-Rel11.js",
      reload: async () => {
        reloads++;
      },
    });
    expect(reloads).toBe(1);
    expect(passAfterReload).toEqual({
      loadedScript: "assets/index-Rel11.js",
      networkScript: "assets/index-Rel11.js",
      reloaded: true,
      matches: true,
    });

    // 3. Stays mismatched after 1 reload -> exact 1 reload, stops, preserves both names.
    reloads = 0;
    const failAfterReload = await verifyLoadedRelease({
      readLoadedScript: async () => "assets/index-Old10.js",
      readNetworkScript: async () => "assets/index-Rel11.js",
      reload: async () => {
        reloads++;
      },
    });
    expect(reloads).toBe(1);
    expect(failAfterReload).toEqual({
      loadedScript: "assets/index-Old10.js",
      networkScript: "assets/index-Rel11.js",
      reloaded: true,
      matches: false,
    });
  });

  it("hostedRun.spec.ts and filmRun.spec.ts run verifyLoadedRelease and record both loadedScript and networkScript", () => {
    for (const file of ["tests/e2e/device/hostedRun.spec.ts", "tests/e2e/device/filmRun.spec.ts"]) {
      const code = readFileSync(file, "utf8");
      expect(code, file).toContain("verifyLoadedRelease");
      expect(code, file).toContain("fetchNetworkEntryScript");
      expect(code, file).toContain("loadedScript");
      expect(code, file).toContain("networkScript");
    }
  });

  it("OPEN-QUESTIONS.md adds the loaded-release stop row under Session H41", () => {
    const doc = readFileSync(".kiro/specs/OPEN-QUESTIONS.md", "utf8");
    const idx = doc.indexOf("## Session H41");
    expect(idx).toBeGreaterThan(-1);
    const sec = doc.slice(idx);
    const rows = sec
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("| spec ") && !l.startsWith("|---"));
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const joined = rows.join("\n");
    expect(joined).toContain("hostedRun.spec.ts");
    expect(joined).toContain("filmRun.spec.ts");
    expect(joined).toContain("loadedScript");
    expect(joined).toContain("networkScript");
  });
});
