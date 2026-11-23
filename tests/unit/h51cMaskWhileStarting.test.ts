// @vitest-environment happy-dom
// H51c: H51 holds the first control while the device check is starting, but hand entry stays open. A judge who
// opens hand entry in those 8 to 10 seconds and presses Mask was told "The device pass is not on this computer"
// on a computer that has it, and the device pass never ran once the check answered (first-visit audit 2026-11-19,
// Not proven, item 3). The masking step now waits for the answer, then shows its line and runs the pass.
import { describe, expect, it } from "vitest";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
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
  let asked = 0;
  const c = makeController({
    root, aiServiceEnabled: false, tier: "no-cost", results: () => undefined, isOffline: async () => false, device,
    proposeMasks: () => { asked++; return proposeMasksDouble; },
  } as ControllerDeps);
  return { root, c, asked: () => asked };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const settled = async () => { for (let i = 0; i < 5; i++) await tick(); };

async function maskWhileStarting() {
  const d = pendingDevice();
  const m = mount(d.device);
  void m.c.start();
  await tick();
  m.c.handlers.onTryExample();
  m.c.handlers.onStartByHand!();
  m.c.handlers.onMask!();
  return { ...d, ...m };
}

describe("H51c: Mask pressed while the device check is starting", () => {
  it("does not say the device pass is not on this computer", async () => {
    const { c, root } = await maskWhileStarting();
    expect(c.state().device.starting).toBe(true);
    expect(c.state().mask?.line).not.toBe(strings.masking.deviceAbsent);
    expect(c.state().mask?.line).toBe(strings.masking.deviceStarting);
    // Neither the masking line nor the note zone's model lines say the model is absent before the check answers.
    expect(root.textContent).not.toContain("not on this computer");
    expect(root.querySelector("[data-model-line]")).toBeNull();
  });

  it("runs the device pass when the check answers available", async () => {
    const t = await maskWhileStarting();
    expect(t.asked()).toBe(0);
    t.settle("available");
    await settled();
    expect(t.asked()).toBe(1);
    expect(t.c.state().mask?.line).toBe(strings.masking.deviceReady);
    expect(t.c.state().mask?.proposals).not.toBeNull();
  });

  it("shows the absent line, and runs no pass, when the check answers that the model is not there", async () => {
    const t = await maskWhileStarting();
    t.settle("unavailable");
    await settled();
    expect(t.asked()).toBe(0);
    expect(t.c.state().mask?.line).toBe(strings.masking.deviceAbsent);
    expect(t.c.state().device.starting).not.toBe(true);
    t.c.handlers.onOpenRecord?.();
    expect(t.root.querySelector("[data-model-line]")).not.toBeNull();
  });

  it("the first screen does not say the model is not on this computer while the check is starting", async () => {
    const d = pendingDevice();
    const m = mount(d.device);
    void m.c.start();
    await tick();
    expect(m.root.querySelector("[data-model-line]")).toBeNull();
    expect(m.root.textContent).not.toContain("not on this computer");
    d.settle("downloadable");
    await settled();
    expect(m.root.querySelector("[data-model-line]")).toBeNull();
    expect(m.root.textContent).toContain(strings.status.deviceDownloadable);
    (m.root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(m.root.querySelector("[data-model-line]")).not.toBeNull();
  });

  it("after the check has answered, Mask behaves as before", async () => {
    const d = pendingDevice();
    const m = mount(d.device);
    void m.c.start();
    await tick();
    d.settle("downloadable");
    await settled();
    m.c.handlers.onTryExample();
    m.c.handlers.onStartByHand!();
    m.c.handlers.onMask!();
    expect(m.c.state().mask?.line).toBe(strings.masking.deviceAbsent);
    expect(m.asked()).toBe(0);
  });
});
