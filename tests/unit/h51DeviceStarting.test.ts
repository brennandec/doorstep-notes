// @vitest-environment happy-dom
// H51: in the 8 to 10 seconds after load while Chrome's model is checked (status bar "starting"),
// the first control must not open the no-model path. Found by the first-visit audit 2026-11-19: a press
// in that window opened hand entry with the example's record, and Mask then said the device pass
// "is not on this computer" on a computer that has it.
import { describe, expect, it } from "vitest";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import type { DeviceModelState } from "../../src/inference/types";

function pendingDevice() {
  let settle: (s: DeviceModelState) => void = () => {};
  const answer = new Promise<DeviceModelState>((r) => (settle = r));
  const device = { state: () => answer, initialize: async () => {}, canInitialize: () => false } as unknown as ControllerDeps["device"];
  return { device, settle: (s: DeviceModelState) => settle(s) };
}

function mount(device: ControllerDeps["device"]) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const c = makeController({ root, aiServiceEnabled: false, tier: "no-cost", results: () => undefined, isOffline: async () => false, device } as ControllerDeps);
  return { root, c };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const first = (root: HTMLElement) => root.querySelector("#make-record") as HTMLButtonElement;

describe("H51: the first control while the device model is starting", () => {
  it("waits: it is disabled, says the model is starting, and does not open the example's record", async () => {
    const d = pendingDevice();
    const { root, c } = mount(d.device);
    void c.start();
    await tick();
    c.handlers.onTryExample();
    expect(first(root).textContent).not.toContain(strings.actions.useExampleRecord);
    expect(first(root).disabled).toBe(true);
    expect(root.textContent).toContain(strings.firstRun.startingModel);
    first(root).click();
    expect(c.state().record).toBeNull();
  });

  it("becomes Make the record once the model answers available", async () => {
    const d = pendingDevice();
    const { root, c } = mount(d.device);
    void c.start();
    await tick();
    c.handlers.onTryExample();
    d.settle("available");
    await tick();
    expect(first(root).textContent).toContain(strings.actions.makeRecord);
  });

  it("still opens the example's record at once when the model is not there", async () => {
    const d = pendingDevice();
    const { root, c } = mount(d.device);
    void c.start();
    await tick();
    d.settle("downloadable");
    await tick();
    c.handlers.onTryExample();
    expect(first(root).textContent).toContain(strings.actions.useExampleRecord);
    expect(first(root).disabled).toBe(false);
  });

  it("a check that answers unavailable (as a timed-out check does) clears the wait and opens the example's record", async () => {
    const d = pendingDevice();
    const { root, c } = mount(d.device);
    void c.start();
    await tick();
    c.handlers.onTryExample();
    expect(first(root).disabled).toBe(true);
    d.settle("unavailable");
    await tick();
    expect(c.state().device.starting).not.toBe(true);
    expect(first(root).textContent).toContain(strings.actions.useExampleRecord);
    expect(first(root).disabled).toBe(false);
  });
});
