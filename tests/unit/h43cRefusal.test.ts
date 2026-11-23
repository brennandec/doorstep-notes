// H43c c5: attach403Watcher (via watchAppCheck403) never double-wraps and always restores
// the fetch it found, also when something else swapped fetch in the window.
import { afterEach, describe, expect, it, vi } from "vitest";
import { watchAppCheck403 } from "../../src/inference/refusal";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("H43c c5 fetch wrapper swap safety", () => {
  it("swaps fetch in the window and then attaches twice: one wrapper at most, the original back afterwards", async () => {
    const original = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", original);
    expect(globalThis.fetch).toBe(original);

    const swapped = vi.fn(async () => new Response("{}", { status: 200 }));
    let fetchSeenBySecondAttach: typeof fetch | undefined;

    const outer = watchAppCheck403(async () => {
      // The watcher wrapped the original exactly once.
      expect(globalThis.fetch).not.toBe(original);
      const wrapper = globalThis.fetch;
      // Something else swaps fetch in the window.
      globalThis.fetch = swapped as typeof fetch;
      const inner = watchAppCheck403(async () => {
        fetchSeenBySecondAttach = globalThis.fetch;
        return "inner";
      });
      const innerResult = await inner;
      expect(innerResult).toEqual({ ok: true, value: "inner", saw403: false });
      // The second attach did not wrap again: fetch is still the swapped one, not a new wrapper.
      expect(fetchSeenBySecondAttach).toBe(swapped);
      expect(globalThis.fetch).toBe(swapped);
      void wrapper;
      return "outer";
    });

    const outerResult = await outer;
    expect(outerResult).toEqual({ ok: true, value: "outer", saw403: false });
    // After both scopes end, the fetch the first watcher found is back, not the swapped one.
    expect(globalThis.fetch).toBe(original);

    // A later attach wraps the original once, and restores it again.
    const again = await watchAppCheck403(async () => {
      expect(globalThis.fetch).not.toBe(original);
      expect(globalThis.fetch).not.toBe(swapped);
      return "again";
    });
    expect(again.ok).toBe(true);
    expect(globalThis.fetch).toBe(original);
  });
});
