// @vitest-environment happy-dom
// R19 (capture-and-record): the "Get the device model" press has a bound, DEVICE_INITIALIZE_TIMEOUT_MS.
import { afterEach, describe, expect, it, vi } from "vitest";

let initialize: (onProgress: (f: number) => void) => Promise<void> = async () => {};
vi.mock("../../src/firebase/deviceApp", () => ({
  deviceOnlyService: async () => ({
    ai: { getGenerativeModel: () => ({ initializeDeviceModel: (p: (f: number) => void) => initialize(p) }), InferenceMode: { ONLY_ON_DEVICE: "only_on_device" } },
    service: {},
  }),
}));

import { initializeDeviceModelFromPress } from "../../src/firebase/deviceInit";
import { DEVICE_INITIALIZE_TIMEOUT_MS, CONSTANT_SOURCES } from "../../src/constants";
import { DeviceModelAbsentError } from "../../src/inference/deviceAbsentError";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";

afterEach(() => vi.useRealTimers());

describe("R19: the download press is bounded", () => {
  it("the bound is 120000 ms and has a source line", () => {
    expect(DEVICE_INITIALIZE_TIMEOUT_MS).toBe(120_000);
    expect(CONSTANT_SOURCES.DEVICE_INITIALIZE_TIMEOUT_MS).toBeTruthy();
  });

  it("a call that never settles rejects at the bound with a DeviceModelAbsentError", async () => {
    vi.useFakeTimers();
    initialize = () => new Promise<void>(() => {});
    let caught: unknown;
    const p = initializeDeviceModelFromPress(() => {}).catch((e: unknown) => { caught = e; });
    await vi.advanceTimersByTimeAsync(DEVICE_INITIALIZE_TIMEOUT_MS - 1);
    expect(caught).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect((caught as Error).name).toBe("DeviceModelAbsentError");
    expect(caught).toBeInstanceOf(DeviceModelAbsentError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a call that settles resolves and leaves no timer on the queue", async () => {
    vi.useFakeTimers();
    initialize = async (onProgress) => { onProgress(1); };
    await expect(initializeDeviceModelFromPress(() => {})).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a call that fails is passed on as it was, and leaves no timer", async () => {
    vi.useFakeTimers();
    initialize = async () => { throw Object.assign(new Error("x"), { name: "NotAllowedError" }); };
    await expect(initializeDeviceModelFromPress(() => {})).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the rejection lands on the existing didNotStart path with errorHand true, and adds no state field", async () => {
    vi.useFakeTimers();
    initialize = () => new Promise<void>(() => {});
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const device = {
      state: async () => "downloadable",
      initialize: (p: (f: number) => void) => initializeDeviceModelFromPress(p),
      canInitialize: () => true,
    } as unknown as ControllerDeps["device"];
    const c = makeController({
      root, aiServiceEnabled: false, tier: "no-cost", results: () => undefined, isOffline: async () => false, device,
      proposeMasks: () => proposeMasksDouble,
    } as ControllerDeps);
    await c.start();
    const keysBefore = Object.keys(c.state()).sort();
    const deviceKeysBefore = Object.keys(c.state().device);
    c.handlers.onGetModel();
    expect(c.state().device.starting).toBe(true);
    await vi.advanceTimersByTimeAsync(DEVICE_INITIALIZE_TIMEOUT_MS);
    expect(c.state().device.starting).not.toBe(true);
    expect(c.state().device.state).toBe("downloadable");
    expect(c.state().device.didNotStart).toBe(true);
    expect(c.state().errorHand).toBe(true);
    expect(c.state().error).toContain("DeviceModelAbsentError");
    expect(Object.keys(c.state()).sort()).toEqual(keysBefore);
    expect(Object.keys(c.state().device).every((k) => [...deviceKeysBefore, "state", "didNotStart"].includes(k))).toBe(true);
  });
});
