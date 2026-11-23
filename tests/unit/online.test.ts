import { describe, expect, it, vi } from "vitest";
import { isOffline, probeUrl, type OnlineDeps } from "../../src/net/online";

function deps(over: Partial<OnlineDeps> = {}): OnlineDeps {
  return { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1700000000000, timeoutMs: 50, ...over };
}

describe("isOffline", () => {
  it("is offline when the browser says offline, without probing", async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    expect(await isOffline(deps({ navigatorOnLine: () => false, fetch }))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is online when the browser says online and the probe answers", async () => {
    expect(await isOffline(deps())).toBe(false);
  });

  it("is offline when the probe fails", async () => {
    expect(await isOffline(deps({ fetch: async () => { throw new TypeError("network"); } }))).toBe(true);
    expect(await isOffline(deps({ fetch: async () => ({ ok: false }) }))).toBe(true);
  });

  it("is offline when the probe times out", async () => {
    expect(await isOffline(deps({ fetch: () => new Promise(() => {}) }))).toBe(true);
  });

  it("sends one GET of /probe.txt with no body, no store and only a time stamp in the query", async () => {
    const calls: [string, RequestInit][] = [];
    await isOffline(deps({ fetch: async (u, i) => { calls.push([u, i]); return { ok: true }; } }));
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe(probeUrl(1700000000000));
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe("/probe.txt");
    expect([...parsed.searchParams.keys()]).toEqual(["t"]);
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(init.body).toBeUndefined();
  });
});
