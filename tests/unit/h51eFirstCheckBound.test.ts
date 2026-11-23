// @vitest-environment happy-dom
// H51e: H51b holds the first control while the device check is starting. The refuter (@deepseek, RULING 08:40Z)
// found that wait had no bound in the controller: a check that never answers left the first control disabled for good.
// The first check now ends after FIRST_DEVICE_CHECK_LIMIT_MS (35 s); the page then says the device model did not
// answer and takes the path it takes with no device model.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { statesOf } from "../../src/app/statusBar";
import { FIRST_DEVICE_CHECK_LIMIT_MS } from "../../src/constants";
import { planDevicePass } from "../../src/masking/deviceState";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
import type { DeviceModelState } from "../../src/inference/types";
import { makeDeviceModel } from "../../src/inference/deviceModel";

function neverDevice(): ControllerDeps["device"] {
  return { state: () => new Promise<DeviceModelState>(() => {}), initialize: async () => {}, canInitialize: () => false } as unknown as ControllerDeps["device"];
}

function mount(device: ControllerDeps["device"], extra: Partial<ControllerDeps> = {}) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  let asked = 0;
  const c = makeController({
    root, aiServiceEnabled: false, tier: "no-cost", results: () => undefined, isOffline: async () => false, device,
    proposeMasks: () => { asked++; return proposeMasksDouble; },
    ...extra,
  } as ControllerDeps);
  return { root, c, asked: () => asked };
}

const first = (root: HTMLElement) => root.querySelector<HTMLButtonElement>("#make-record");

afterEach(() => vi.useRealTimers());

describe("H51e: the first device check has a bound", () => {
  it("the bound is 35 seconds and is above the device model's own limits (15 s availability + 15 s probe)", () => {
    expect(FIRST_DEVICE_CHECK_LIMIT_MS).toBe(35_000);
  });

  it("a check that never answers ends at the bound; the first control then opens the no-model path", async () => {
    vi.useFakeTimers();
    const { c, root } = mount(neverDevice());
    void c.start();
    await vi.advanceTimersByTimeAsync(0);
    c.handlers.onTryExample();
    expect(c.state().device.starting).toBe(true);
    expect(first(root)?.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(FIRST_DEVICE_CHECK_LIMIT_MS - 1);
    expect(c.state().device.starting).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(c.state().device.starting).not.toBe(true);
    expect(c.state().device.state).toBe("unavailable");
    expect(c.state().device.noAnswer).toBe(true);
    expect(first(root)?.disabled).toBe(false);
    expect(first(root)?.textContent).toContain(strings.actions.useExampleRecord);
    // The control opens the no-model path: the example's own record, made by hand, no device call.
    first(root)!.click();
    expect(c.state().record).not.toBeNull();
    expect(c.state().device.state).toBe("unavailable");
  });

  it("when the bound ends the wait, the page says the model did not answer, never that it is not on this computer", async () => {
    vi.useFakeTimers();
    const { c, root } = mount(neverDevice());
    void c.start();
    await vi.advanceTimersByTimeAsync(FIRST_DEVICE_CHECK_LIMIT_MS);
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(root.querySelector("[data-model-no-answer]")?.textContent).toBe(strings.deviceModelNoAnswer);
    expect(root.querySelector("[data-model-way-forward]")).not.toBeNull();
    expect(root.textContent).not.toContain("not on this computer");
    expect(root.querySelector('[data-state="device"]')?.textContent).toContain(strings.status.deviceNoAnswer);
    expect(statesOf({ ...c.state(), cloud: false } as never).find((v) => v.key === "device")?.words).toBe(strings.status.deviceNoAnswer);
  });

  it("Mask after the bound says the device pass did not run because the model did not answer, and runs no pass", async () => {
    vi.useFakeTimers();
    const t = mount(neverDevice());
    void t.c.start();
    await vi.advanceTimersByTimeAsync(0);
    t.c.handlers.onTryExample();
    t.c.handlers.onStartByHand!();
    t.c.handlers.onMask!();
    expect(t.c.state().mask?.line).toBe(strings.masking.deviceStarting);
    await vi.advanceTimersByTimeAsync(FIRST_DEVICE_CHECK_LIMIT_MS);
    expect(t.c.state().mask?.line).toBe(strings.masking.deviceNoAnswer);
    expect(t.asked()).toBe(0);
    expect(planDevicePass("unavailable", 0, false, true).line).toBe(strings.masking.deviceNoAnswer);
  });

  it("an answer that comes after the bound does not change the page; the page stays on the no-model path", async () => {
    vi.useFakeTimers();
    let settle: (s: DeviceModelState) => void = () => {};
    const device = { state: () => new Promise<DeviceModelState>((r) => (settle = r)), initialize: async () => {}, canInitialize: () => false } as unknown as ControllerDeps["device"];
    const { c } = mount(device);
    void c.start();
    await vi.advanceTimersByTimeAsync(FIRST_DEVICE_CHECK_LIMIT_MS);
    settle("available");
    await vi.advanceTimersByTimeAsync(0);
    expect(c.state().device.state).toBe("unavailable");
    expect(c.state().device.noAnswer).toBe(true);
  });

  it("a check that rejects is treated as no answer, without waiting for the bound", async () => {
    const device = { state: () => Promise.reject(new Error("boom")), initialize: async () => {}, canInitialize: () => false } as unknown as ControllerDeps["device"];
    const { c } = mount(device);
    await c.start();
    expect(c.state().device.starting).not.toBe(true);
    expect(c.state().device.noAnswer).toBe(true);
  });

  it("an answer before the bound is used as before, and the bound does not fire later", async () => {
    vi.useFakeTimers();
    const device = { state: async () => "available" as DeviceModelState, initialize: async () => {}, canInitialize: () => false } as unknown as ControllerDeps["device"];
    const { c } = mount(device);
    void c.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.state().device.state).toBe("available");
    await vi.advanceTimersByTimeAsync(FIRST_DEVICE_CHECK_LIMIT_MS * 2);
    expect(c.state().device.state).toBe("available");
    expect(c.state().device.noAnswer).not.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the device model's own availability limit ending without an answer is reported as no answer", async () => {
    vi.useFakeTimers();
    const hung = makeDeviceModel({ languageModel: { availability: () => new Promise(() => {}) }, timeoutMs: 15_000 } as never);
    const p = hung.state();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await p).toBe("unavailable");
    expect(hung.noAnswer?.()).toBe(true);
    const absent = makeDeviceModel({ languageModel: { availability: async () => "unavailable" }, timeoutMs: 15_000 } as never);
    expect(await absent.state()).toBe("unavailable");
    expect(absent.noAnswer?.()).toBe(false);
  });

  it("the page shows the no-answer line, not the absent line, when the device model's limit ended the check", async () => {
    const device = { state: async () => "unavailable" as DeviceModelState, noAnswer: () => true, initialize: async () => {}, canInitialize: () => false } as unknown as ControllerDeps["device"];
    const { c, root } = mount(device);
    await c.start();
    expect(c.state().device.noAnswer).toBe(true);
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(root.querySelector("[data-model-no-answer]")).not.toBeNull();
    expect(root.textContent).not.toContain("not on this computer");
  });

  it("a model that answers absent still gets the absent line", async () => {
    const device = { state: async () => "unavailable" as DeviceModelState, noAnswer: () => false, initialize: async () => {}, canInitialize: () => false } as unknown as ControllerDeps["device"];
    const { c, root } = mount(device);
    await c.start();
    expect(c.state().device.noAnswer).not.toBe(true);
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(root.querySelector("[data-model-line]")?.textContent).toContain("It is not on this computer.");
  });

  it("one model instance: a timed-out read, then an answered absent read clears the flag; a rejected read counts as no answer", async () => {
    vi.useFakeTimers();
    let mode: "hang" | "absent" | "reject" = "hang";
    const lm = { availability: () => (mode === "hang" ? new Promise(() => {}) : mode === "absent" ? Promise.resolve("unavailable") : Promise.reject(new Error("x"))) };
    const dm = makeDeviceModel({ languageModel: lm, timeoutMs: 15_000 } as never);
    const p = dm.state();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await p).toBe("unavailable");
    expect(dm.noAnswer?.()).toBe(true);
    mode = "absent";
    expect(await dm.state()).toBe("unavailable");
    expect(dm.noAnswer?.()).toBe(false);
    mode = "reject";
    expect(await dm.state()).toBe("unavailable");
    expect(dm.noAnswer?.()).toBe(true);
  });

  it("the real device model with a hung availability read, through the page: did not answer at 15 s, never absent", async () => {
    vi.useFakeTimers();
    const dm = makeDeviceModel({ languageModel: { availability: () => new Promise(() => {}) }, timeoutMs: 15_000 } as never);
    const { c, root } = mount(dm);
    void c.start();
    await vi.advanceTimersByTimeAsync(0);
    c.handlers.onTryExample();
    expect(first(root)?.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(c.state().device.noAnswer).toBe(true);
    expect(first(root)?.disabled).toBe(false);
    expect(root.querySelector('[data-state="device"]')?.textContent).toContain(strings.status.deviceNoAnswer);
    expect(root.querySelector("[data-model-no-answer]")).not.toBeNull();
    expect(root.textContent).not.toContain("not on this computer");
  });
});

// Chain R17 session A, item 2 (capture-and-record R20): added cases only. The two values and the cases above are unchanged.
describe("R20: a hanging availability check leaves the first control usable", () => {
  it("the real device model with a hung availability read: after 15 s the control is enabled, and pressing it opens the no-model path with no device call", async () => {
    vi.useFakeTimers();
    let created = 0;
    const lm = { availability: () => new Promise(() => {}), create: async () => { created++; return {}; } };
    const dm = makeDeviceModel({ languageModel: lm, timeoutMs: 15_000 } as never);
    const t = mount(dm);
    void t.c.start();
    await vi.advanceTimersByTimeAsync(0);
    t.c.handlers.onTryExample();
    expect(first(t.root)?.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(first(t.root)?.disabled).toBe(false);
    expect(first(t.root)?.textContent).toContain(strings.actions.useExampleRecord);
    first(t.root)!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.c.state().record).not.toBeNull();
    expect(t.c.state().device.state).toBe("unavailable");
    expect(t.c.state().device.noAnswer).toBe(true);
    expect(t.asked()).toBe(0);
    expect(created).toBe(0);
  });

  it("with a check that never answers at all, the control is usable at the page's own bound and no download is started by the press", async () => {
    vi.useFakeTimers();
    let initialized = 0;
    const device = {
      state: () => new Promise<DeviceModelState>(() => {}),
      initialize: async () => { initialized++; },
      canInitialize: () => false,
    } as unknown as ControllerDeps["device"];
    const t = mount(device);
    void t.c.start();
    await vi.advanceTimersByTimeAsync(0);
    t.c.handlers.onTryExample();
    await vi.advanceTimersByTimeAsync(FIRST_DEVICE_CHECK_LIMIT_MS);
    expect(first(t.root)?.disabled).toBe(false);
    first(t.root)!.click();
    expect(t.c.state().record).not.toBeNull();
    expect(initialized).toBe(0);
    expect(t.asked()).toBe(0);
  });
});
