// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { makeController } from "../../src/app/controller";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { inventedVisit } from "../../src/app/example/inventedVisit";

function setup(opts: { availability: string[]; init?: (cb: (f: number) => void, snapshot: () => string) => Promise<void>; offline?: boolean }) {
  const root = document.createElement("div");
  document.body.append(root);
  const calls: string[] = [];
  let i = 0;
  const device = makeDeviceModel({
    languageModel: {
      availability: async () => { calls.push("availability"); return opts.availability[Math.min(i++, opts.availability.length - 1)]!; },
      create: async () => { calls.push("create"); return { prompt: async () => '{"ok":true}', destroy() {} }; },
    },
    initializeDeviceModel: opts.init
      ? async (cb) => { calls.push("initialize"); await opts.init!(cb, () => root.querySelector(".model-progress")?.textContent ?? ""); }
      : undefined,
  });
  const c = makeController({
    root, device, aiServiceEnabled: false, tier: "no-cost", results: () => undefined,
    isOffline: async () => opts.offline === true,
  });
  return { root, c, calls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("controller", () => {
  it("renders the screen at start and reads availability without initializing", async () => {
    const { c, calls, root } = setup({ availability: ["downloadable"], init: async () => {} });
    await c.start();
    expect(calls).toEqual(["availability"]);
    expect(root.querySelector("#try-example")).not.toBeNull();
    expect(root.querySelector("#get-model")).toBeNull();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(root.querySelector("#get-model")).not.toBeNull();
  });

  it("calls initialize only from the press, shows progress, then re-reads availability", async () => {
    const snapshots: string[] = [];
    const { c, calls, root } = setup({
      availability: ["downloadable", "available"],
      init: async (cb, snapshot) => { cb(0.5); snapshots.push(snapshot()); cb(1); },
    });
    await c.start();
    expect(calls).not.toContain("initialize");
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    (root.querySelector("#get-model") as HTMLButtonElement).click();
    await tick(); await tick();
    expect(calls).toEqual(["availability", "initialize", "create", "availability"]);
    expect(snapshots).toEqual(["downloading, 50%"]);
    expect(c.state().device.state).toBe("available");
    expect(root.querySelector("#get-model")).toBeNull();
  });

  it("shows an error with words and an icon when the start fails, and offers the press again", async () => {
    const { c, root } = setup({ availability: ["downloadable"], init: async () => { throw new Error("x"); } });
    await c.start();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    (root.querySelector("#get-model") as HTMLButtonElement).click();
    await tick(); await tick();
    const err = root.querySelector(".error")!;
    expect(err.textContent).toContain("The device model could not be started");
    expect(err.querySelector("svg")).not.toBeNull();
    expect(root.querySelector("#get-model")).not.toBeNull();
  });

  // Rewritten by capture-and-record task 28: the example no longer fills the record by itself; the first
  // control opens hand entry with the prepared record in one press.
  it("loads the invented visit, opens hand entry with the prepared record when there is no device model, and removes it", async () => {
    const { c, root } = setup({ availability: ["unavailable"] });
    await c.start();
    (root.querySelector("#try-example") as HTMLButtonElement).click();
    expect(c.state().noteText).toBe(inventedVisit.note);
    expect(c.state().clientList).toBe(inventedVisit.clientList);
    expect(c.state().record).toBeNull();
    (root.querySelector("#make-record") as HTMLButtonElement).click();
    expect(c.state().record).toEqual(inventedVisit.preparedRecord);
    // The mark stands once, on the folded note line (shell task 68, fifth review N5).
    expect(root.querySelectorAll("[data-mark]")).toHaveLength(1);
    (root.querySelector("#edit-record") as HTMLButtonElement).click();
    (root.querySelector("#remove-example") as HTMLButtonElement).click();
    expect(c.state().noteText).toBe("");
    expect(root.querySelector("[data-mark]")).toBeNull();
    expect(root.querySelector("#try-example")).not.toBeNull();
  });

  it("does not fill the prepared record when the device model is available", async () => {
    const { c, root } = setup({ availability: ["available"] });
    await c.start();
    (root.querySelector("#try-example") as HTMLButtonElement).click();
    expect(c.state().record).toBeNull();
  });

  it("keeps typed text in state without a re-render", async () => {
    const { c, root } = setup({ availability: ["unavailable"] });
    await c.start();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    // The first control depends on whether a note exists (capture-and-record R13.4), so the very first
    // character draws it again. After that, typing does not re-render and the cursor stays.
    const first = root.querySelector("#note") as HTMLTextAreaElement;
    first.value = "t";
    first.dispatchEvent(new Event("input"));
    const note = root.querySelector("#note") as HTMLTextAreaElement;
    note.value = "typed";
    note.dispatchEvent(new Event("input"));
    expect(c.state().noteText).toBe("typed");
    expect(root.querySelector("#note")).toBe(note);
  });

  it("goes offline when the probe says so", async () => {
    const { c, root } = setup({ availability: ["unavailable"], offline: true });
    await c.start();
    expect(c.state().network).toBe("offline");
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(root.textContent).toContain("You are offline.");
  });
});
