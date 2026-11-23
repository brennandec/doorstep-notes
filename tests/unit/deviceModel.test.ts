import { describe, expect, it, vi } from "vitest";
import { AVAILABILITY_OPTIONS, makeDeviceModel } from "../../src/inference/deviceModel";

const session = async () => ({ prompt: async () => '{"ok":true}', destroy() {} });

describe("device model wrapper", () => {
  it("returns each of the four states the browser reports, available only once a session has been made", async () => {
    for (const s of ["unavailable", "downloadable", "downloading", "available"] as const) {
      const m = makeDeviceModel({ languageModel: { availability: async () => s, create: session } });
      expect(await m.state()).toBe(s);
    }
  });
  it("reports the browser's available as downloadable when no session can be made (H35a D3)", async () => {
    const none = makeDeviceModel({ languageModel: { availability: async () => "available" } });
    expect(await none.state()).toBe("downloadable");
    const quota = Object.assign(new Error("no room"), { name: "QuotaExceededError" });
    const throws = makeDeviceModel({ languageModel: { availability: async () => "available", create: async () => { throw quota; } } });
    expect(await throws.state()).toBe("downloadable");
  });
  it("makes one session when the browser says available, destroys it, and answers available from then on", async () => {
    const destroy = vi.fn();
    const create = vi.fn(async () => ({ prompt: async () => '{"ok":true}', destroy }));
    const m = makeDeviceModel({ languageModel: { availability: async () => "available", create } });
    expect(await m.state()).toBe("available");
    expect(await m.state()).toBe("available");
    expect(create).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it("makes no session for any state but available, so a page load starts no download (A6)", async () => {
    for (const s of ["unavailable", "downloadable", "downloading"] as const) {
      const create = vi.fn(session);
      await makeDeviceModel({ languageModel: { availability: async () => s, create } }).state();
      expect(create).not.toHaveBeenCalled();
    }
  });
  it("passes the prompt's options to availability", async () => {
    const availability = vi.fn(async () => "available");
    await makeDeviceModel({ languageModel: { availability, create: session } }).state();
    expect(availability).toHaveBeenCalledWith(AVAILABILITY_OPTIONS);
    expect(AVAILABILITY_OPTIONS.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
  });
  it("is unavailable with no LanguageModel, an odd answer, a throw or a timeout", async () => {
    expect(await makeDeviceModel({ languageModel: undefined }).state()).toBe("unavailable");
    expect(await makeDeviceModel({ languageModel: { availability: async () => "maybe" } }).state()).toBe("unavailable");
    expect(await makeDeviceModel({ languageModel: { availability: async () => { throw new Error("x"); } } }).state()).toBe("unavailable");
    expect(await makeDeviceModel({ languageModel: { availability: () => new Promise(() => {}) }, timeoutMs: 20 }).state()).toBe("unavailable");
  });
  it("starts nothing until initialize is called, then passes the progress callback and makes a session", async () => {
    const init = vi.fn(async (cb: (f: number) => void) => { cb(0.5); });
    const create = vi.fn(session);
    const m = makeDeviceModel({ languageModel: { availability: async () => "downloadable", create }, initializeDeviceModel: init });
    expect(init).not.toHaveBeenCalled();
    const seen: number[] = [];
    await m.initialize((f) => seen.push(f));
    expect(init).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([0.5]);
  });
  it("rejects initialize, and stays not ready, when no session can be made afterwards (H35a D3)", async () => {
    const init = vi.fn(async () => undefined);
    const noCreate = makeDeviceModel({ languageModel: { availability: async () => "available" }, initializeDeviceModel: init });
    await expect(noCreate.initialize(() => {})).rejects.toThrow();
    expect(await noCreate.state()).toBe("downloadable");
    const failing = makeDeviceModel({
      languageModel: { availability: async () => "available", create: async () => { throw Object.assign(new Error("x"), { name: "NotSupportedError" }); } },
      initializeDeviceModel: init,
    });
    await expect(failing.initialize(() => {})).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(await failing.state()).toBe("downloadable");
  });
  it("refuses to initialize when it is not wired", async () => {
    const m = makeDeviceModel({ languageModel: undefined });
    expect(m.canInitialize()).toBe(false);
    await expect(m.initialize(() => {})).rejects.toThrow();
  });
});

describe("device model wrapper, call order and options (capture-and-record R6)", () => {
  it("asks about text and image when a photo is attached", async () => {
    const availability = vi.fn(async (_o?: unknown) => "available");
    await makeDeviceModel({ languageModel: { availability, create: session } }).state({ hasPhoto: true });
    expect(availability.mock.calls[0]![0]).toEqual({
      expectedInputs: [{ type: "text", languages: ["en"] }, { type: "image" }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
  });
  it("never starts the model when only asked for the state", async () => {
    const calls: string[] = [];
    const m = makeDeviceModel({
      languageModel: { availability: async () => { calls.push("availability"); return "downloadable"; } },
      initializeDeviceModel: async () => { calls.push("initialize"); },
    });
    await m.state();
    await m.state({ hasPhoto: true });
    expect(calls).toEqual(["availability", "availability"]);
  });
  it("reads the state, then initializes only when initialize is called, then reads the state again", async () => {
    const calls: string[] = [];
    let current = "downloadable";
    const m = makeDeviceModel({
      languageModel: {
        availability: async () => { calls.push(`availability:${current}`); return current; },
        create: async () => { calls.push("create"); return { prompt: async () => '{"ok":true}', destroy() {} }; },
      },
      initializeDeviceModel: async (cb) => { calls.push("initialize"); cb(1); current = "available"; },
    });
    expect(await m.state()).toBe("downloadable");
    await m.initialize(() => {});
    expect(await m.state()).toBe("available");
    expect(calls).toEqual(["availability:downloadable", "initialize", "create", "availability:available"]);
  });
});
