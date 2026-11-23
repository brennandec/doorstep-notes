// @vitest-environment happy-dom
// The screen against the look-and-layout document (docs/decisions/2026-11-13-look-and-layout.md):
// the primary control is the next open step and is filled with the accent; the path with no
// device model never dead-ends; no result block is empty when the invented visit is loaded.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeController } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DeviceModelState } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const css = readFileSync("src/app/styles/app.css", "utf8");
const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const text = (root: ParentNode, sel: string) => root.querySelector(sel)?.textContent ?? "";

function setup(device: DeviceModelState) {
  const root = document.createElement("div");
  document.body.append(root);
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => device, create: async () => ({ destroy() {} }) } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    structure: { mode: "ONLY_ON_DEVICE", run: async () => { throw new Error("not used"); } },
    drafting: {
      draftFor: () => draftDouble,
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  });
  return { root, c };
}
const primaries = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('button[data-kind="primary"]')];
const press = async (root: HTMLElement, id: string) => {
  if (!root.querySelector(`#${id}`)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  const b = root.querySelector<HTMLButtonElement>(`#${id}`)!;
  expect(b.disabled, id).toBe(false);
  b.click();
  await settle();
};
// H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it, and then goes on.
const keepLikely = async (root: HTMLElement) => {
  for (let i = 0; i < 5 && root.querySelector("[data-keep-likely]"); i++) {
    (root.querySelector("[data-keep-likely]") as HTMLElement).click();
    await settle();
  }
};

describe("the primary control", () => {
  it("is drawn filled with the accent, in a style rule", () => {
    expect(css).toMatch(/\.btn\.primary\s*\{[^}]*background:\s*var\(--accent\)/);
  });

  it("is one control at a time, enabled, and moves along the path with no device model", async () => {
    const { root, c } = setup("unavailable");
    await c.start();
    await press(root, "try-example");
    const path: [string, string][] = [["make-record", "Use the example's record"], ["mask", "Mask"], ["draft", "Draft"], ["send", "Send"], ["copy", "Copy"]];
    for (const [id, label] of path) {
      if (!root.querySelector(`#${id}`)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
      const p = primaries(root).filter((b) => !b.disabled);
      expect(p.map((b) => b.id), `before ${label}`).toEqual([id]);
      expect(text(p[0]!, "span")).toBe(label);
      if (id !== "copy") await press(root, id);
      if (id === "draft") await keepLikely(root);
    }
  });

  it("is Make the record when a device model is ready and a note is typed", async () => {
    const { root, c } = setup("available");
    await c.start();
    await press(root, "try-example");
    expect(primaries(root).filter((b) => !b.disabled).map((b) => b.id)).toEqual(["make-record"]);
  });
});

describe("the path with no device model never dead-ends", () => {
  it("says what the model would add, and every step is open with one press", async () => {
    const { root, c } = setup("unavailable");
    await c.start();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(text(root, "[data-model-line]")).toBe(strings.deviceModelAbsent);
    await press(root, "try-example");
    await press(root, "make-record");
    await press(root, "mask");
    await press(root, "draft");
    await keepLikely(root);
    await press(root, "send");
    await press(root, "copy");
    expect(c.state().error).toBeNull();
    expect(text(root, ".sheet-text")).toContain("Maria Okonkwo-Reyes");
  });
});

describe("no result block is empty when the invented visit is loaded", () => {
  for (const device of ["unavailable", "available"] as const) {
    it(`device ${device}: note, record zone, outgoing text and finished note zone all say something real`, async () => {
      const { root, c } = setup(device);
      await c.start();
      await press(root, "try-example");
      // With a record the note folds to one line (shell task 33); the note itself is still held.
      expect(c.state().noteText.length).toBeGreaterThan(0);
      expect(root.querySelector("#note") ?? root.querySelector('[data-fold="note"]')).not.toBeNull();
      // Zone 1: a record, or the control that makes one.
      expect(root.querySelector("[data-record]") ?? root.querySelector("#make-record, #start-by-hand")).not.toBeNull();
      // Zone 2: with a record, nothing until Draft is pressed (H35a D2); with none yet, the plain line.
      if (c.state().record !== null) {
        expect(text(root, "pre.outgoing")).toBe(strings.emptyOutgoing);
        expect((root.querySelector("#send") as HTMLButtonElement).disabled).toBe(true);
      }
      // Zone 3: a line that names the next step.
      expect(text(root, '[data-zone="finished"] .sheet').trim()).not.toBe("");
      if (c.state().record !== null) expect(text(root, ".sheet-empty")).toBe(strings.finishedNext);
    });
  }
});
