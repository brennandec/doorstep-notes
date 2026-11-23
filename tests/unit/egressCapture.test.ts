import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureBusyError, captureRunning, withCapture } from "../../src/egress/capture";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

function stubFetch() {
  const fake = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", fake);
  return fake;
}
afterEach(() => vi.unstubAllGlobals());

describe("withCapture", () => {
  it("records the URL and the body bytes of a string body", async () => {
    const fake = stubFetch();
    const out = await withCapture(async () => {
      await fetch("https://example.invalid/v1/generate", { method: "POST", body: '{"text":"caf\u00e9 [Person 1]"}' });
      return 7;
    });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value).toBe(7);
    expect(out.captured).toHaveLength(1);
    expect(out.captured[0]!.url).toBe("https://example.invalid/v1/generate");
    expect(text(out.captured[0]!.body)).toBe('{"text":"caf\u00e9 [Person 1]"}');
    expect(out.captured[0]!.body).toEqual(new TextEncoder().encode('{"text":"caf\u00e9 [Person 1]"}'));
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("records every request made during the call", async () => {
    stubFetch();
    const out = await withCapture(async () => {
      await fetch("https://example.invalid/a", { method: "POST", body: "one" });
      await fetch(new URL("https://example.invalid/b"), { method: "POST", body: new Uint8Array([116, 119, 111]) });
      await fetch("https://example.invalid/c");
    });
    expect(out.captured.map((c) => c.url)).toEqual(["https://example.invalid/a", "https://example.invalid/b", "https://example.invalid/c"]);
    expect(out.captured.map((c) => text(c.body))).toEqual(["one", "two", ""]);
  });

  it("records a Request object, a Blob and a stream", async () => {
    stubFetch();
    const out = await withCapture(async () => {
      await fetch(new Request("https://example.invalid/r", { method: "POST", body: "from request" }));
      await fetch("https://example.invalid/b", { method: "POST", body: new Blob(["from blob"]) });
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode("from stream"));
          c.close();
        },
      });
      await fetch("https://example.invalid/s", { method: "POST", body: stream });
    });
    expect(out.captured.map((c) => text(c.body))).toEqual(["from request", "from blob", "from stream"]);
  });

  it("passes the same body on to the real fetch", async () => {
    const fake = stubFetch();
    await withCapture(async () => {
      await fetch("https://example.invalid/a", { method: "POST", body: "same" });
    });
    const call = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe("https://example.invalid/a");
    expect(call[1].body).toBe("same");
  });

  it("restores fetch afterwards", async () => {
    const fake = stubFetch();
    await withCapture(async () => {
      expect(globalThis.fetch).not.toBe(fake);
    });
    expect(globalThis.fetch).toBe(fake);
    expect(captureRunning()).toBe(false);
  });

  it("restores fetch and reports the error when the call throws", async () => {
    const fake = stubFetch();
    const boom = new Error("model refused");
    const out = await withCapture(async () => {
      await fetch("https://example.invalid/a", { method: "POST", body: "before the error" });
      throw boom;
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toBe(boom);
    expect(text(out.captured[0]!.body)).toBe("before the error");
    expect(globalThis.fetch).toBe(fake);
    expect(captureRunning()).toBe(false);
  });

  it("records a request whose fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const out = await withCapture(async () => {
      await fetch("https://example.invalid/a", { method: "POST", body: "tried" });
    });
    expect(out.ok).toBe(false);
    expect(text(out.captured[0]!.body)).toBe("tried");
  });

  it("refuses a second send while one runs, and leaves the first alone", async () => {
    const fake = stubFetch();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = withCapture(async () => {
      await gate;
      await fetch("https://example.invalid/first", { method: "POST", body: "first" });
    });
    expect(captureRunning()).toBe(true);
    await expect(withCapture(async () => undefined)).rejects.toBeInstanceOf(CaptureBusyError);
    release();
    const out = await first;
    expect(out.ok).toBe(true);
    expect(out.captured).toHaveLength(1);
    expect(globalThis.fetch).toBe(fake);
    // A new one may start once the first has ended.
    const again = await withCapture(async () => 1);
    expect(again.ok).toBe(true);
  });

  it("records nothing when the call makes no request", async () => {
    stubFetch();
    const out = await withCapture(async () => "local only");
    expect(out.captured).toEqual([]);
  });

  it("stores a preflight bit from the call, and does not store header values", async () => {
    stubFetch();
    const out = await withCapture(async () => {
      await fetch("https://example.invalid/plain", { method: "POST", body: "{\"a\":1}" });
      await fetch("https://example.invalid/json", {
        method: "POST",
        body: "{\"a\":1}",
        headers: { "content-type": "application/json" },
      });
      await fetch("https://example.invalid/key", {
        method: "POST",
        body: "x",
        headers: { "x-goog-api-key": "not-a-key" },
      });
      await fetch("https://example.invalid/get");
      await fetch(new Request("https://example.invalid/req", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      }));
    });
    expect(out.captured.map((c) => c.preflight)).toEqual([false, true, true, false, true]);
    const dumped = JSON.stringify(out.captured.map((c) => ({
      url: c.url,
      preflight: c.preflight,
      bytes: c.body.byteLength,
    })));
    expect(dumped).not.toContain("not-a-key");
    expect(out.captured.every((c) => !("headers" in c))).toBe(true);
  });
});
