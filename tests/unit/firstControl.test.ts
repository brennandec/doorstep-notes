// @vitest-environment happy-dom
// capture-and-record task 28 (R13, U8): the first control, as a state table.
import { describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderScreen } from "../../src/app/screen";
import { emptyState, nextStep, type AppState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import type { DeviceModelState } from "../../src/inference/types";

const handlers = (over: Partial<Handlers> = {}): Handlers => ({
  onNoteInput: vi.fn(), onListInput: vi.fn(), onTryExample: vi.fn(), onRemoveExample: vi.fn(), onGetModel: vi.fn(), onMakeRecord: vi.fn(),
  onStartByHand: vi.fn(), ...over,
});
const mount = (s: AppState, h = handlers()) => {
  const root = document.createElement("div");
  root.append(...renderScreen(s, h));
  document.body.replaceChildren(root);
  return root;
};
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const zone1 = (root: HTMLElement) => q(root, '[data-zone="note"]');
const filled = (root: HTMLElement) => [...zone1(root).querySelectorAll<HTMLButtonElement>("button.btn")].filter((b) => b.classList.contains("primary") && !b.disabled);

const withNote = (device: DeviceModelState, over: Partial<AppState> = {}) =>
  emptyState({ device: { state: device }, noteText: "12/11 home visit", ...over });

describe("a note is waiting and the device model can make the record (R13.1, R13.2)", () => {
  for (const device of ["available", "downloading"] as const) {
    it(`${device}: 'Make the record' is the filled, enabled primary control`, () => {
      const root = mount(withNote(device));
      const b = q<HTMLButtonElement>(root, "#make-record");
      expect(b.textContent).toBe("Make the record");
      expect(b.getAttribute("data-kind")).toBe("primary");
      expect(b.classList.contains("primary")).toBe(true);
      expect(b.disabled).toBe(false);
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
      expect(b.getAttribute("style") ?? "").not.toMatch(/opacity/);
    });
    it(`${device}: it is the only filled control in zone 1`, () => {
      const root = mount(withNote(device));
      expect(filled(root).map((b) => b.id)).toEqual(["make-record"]);
      for (const b of zone1(root).querySelectorAll("button.btn")) {
        if (b.id !== "make-record") expect(b.getAttribute("data-kind") ?? "secondary", b.id).not.toBe("primary");
      }
    });
    it(`${device}: a press asks for the record to be made`, () => {
      const h = handlers();
      q<HTMLButtonElement>(mount(withNote(device), h), "#make-record").click();
      expect(h.onMakeRecord).toHaveBeenCalledTimes(1);
      expect(h.onStartByHand).not.toHaveBeenCalled();
    });
  }
});

describe("a note is waiting and there is no device model (R13.3)", () => {
  for (const device of ["unavailable", "downloadable"] as const) {
    it(`${device}: the same control reads 'Enter the record by hand', filled and enabled`, () => {
      const root = mount(withNote(device));
      const b = q<HTMLButtonElement>(root, "#make-record");
      expect(b.textContent).toBe("Enter the record by hand");
      expect(strings.actions.enterByHand).toBe("Enter the record by hand");
      expect(b.classList.contains("primary")).toBe(true);
      expect(b.disabled).toBe(false);
      expect(b.hasAttribute("aria-disabled")).toBe(false);
      expect(filled(root).map((x) => x.id)).toEqual(["make-record"]);
    });
    it(`${device}: a press opens hand entry, not the model`, () => {
      const h = handlers();
      q<HTMLButtonElement>(mount(withNote(device), h), "#make-record").click();
      expect(h.onStartByHand).toHaveBeenCalledTimes(1);
      expect(h.onMakeRecord).not.toHaveBeenCalled();
    });
  }

  it("downloadable: 'Get the device model' stays as a second, outlined control", () => {
    const root = mount(withNote("downloadable"));
    const get = q<HTMLButtonElement>(root, "#get-model");
    expect(get.getAttribute("data-kind")).toBe("secondary");
    expect(get.disabled).toBe(false);
    expect(filled(root).map((x) => x.id)).toEqual(["make-record"]);
  });

  it("unavailable: there is no 'Get the device model' control", () => {
    expect(mount(withNote("unavailable")).querySelector("#get-model")).toBeNull();
  });
});

describe("no note yet (R13.4)", () => {
  for (const device of ["available", "downloading", "downloadable", "unavailable"] as const) {
    it(`${device}: the control is outlined, disabled, and says why in words`, () => {
      const root = mount(emptyState({ started: true, device: { state: device } }));
      const b = q<HTMLButtonElement>(root, "#make-record");
      expect(b.getAttribute("data-kind")).toBe("secondary");
      expect(b.disabled).toBe(true);
      expect(filled(root).map((x) => x.id)).toEqual(["try-example"]);
      expect(q(root, "[data-first-reason]").textContent).toBe("Add a note first.");
      expect(strings.addNoteFirst).toBe("Add a note first.");
      expect(b.title).toBe("Add a note first.");
    });
  }

  it("a photo counts as a note", () => {
    const root = mount(emptyState({ device: { state: "available" }, photo: { mimeType: "image/png", base64: "AA==" } }));
    expect(q<HTMLButtonElement>(root, "#make-record").disabled).toBe(false);
    expect(root.querySelector("[data-first-reason]")).toBeNull();
  });

  it("spaces only is no note", () => {
    const root = mount(emptyState({ device: { state: "available" }, noteText: "  \n " }));
    expect(q<HTMLButtonElement>(root, "#make-record").disabled).toBe(true);
  });
});

describe("once a record exists", () => {
  it("the control is outlined and the Mask control takes the fill", () => {
    const root = mount(withNote("available", { record: inventedVisit.preparedRecord }));
    expect(q(root, "#make-record").getAttribute("data-kind")).toBe("secondary");
    expect(filled(root).map((b) => b.id)).toEqual(["mask"]);
  });
});

describe("nextStep agrees with the control", () => {
  it("names the first step when a note waits, with or without a model", () => {
    for (const d of ["available", "downloading", "downloadable", "unavailable"] as const) expect(nextStep(withNote(d)), d).toBe("makeRecord");
    expect(nextStep(emptyState())).toBeNull();
  });
});

describe("hand entry from the first control (R13.3)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));
  function setup(device: DeviceModelState) {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => device } }),
      aiServiceEnabled: false,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
    });
    return { root, c };
  }

  it("opens an empty record with the cursor in the first field when the note is her own", async () => {
    const { root, c } = setup("unavailable");
    await c.start();
    c.handlers.onNoteInput("my own note");
    c.render();
    q<HTMLButtonElement>(root, "#make-record").click();
    await tick();
    expect(c.state().record).toEqual({ visitDate: "", present: [], seen: [], agreed: [], risks: [], nextSteps: [] });
    q<HTMLButtonElement>(root, "#edit-record").click();
    expect(document.activeElement?.id).toBe("record-date");
    expect(root.querySelector('[data-mark="record"]')).toBeNull();
  });

  it("opens with the prepared invented record, marked, when the example is loaded", async () => {
    const { root, c } = setup("unavailable");
    await c.start();
    q<HTMLButtonElement>(root, "#try-example").click();
    // The example no longer fills the record by itself: the first control does, in one press.
    expect(c.state().record).toBeNull();
    expect(q(root, "#make-record").textContent).toBe("Use the example's record");
    expect(q(root, "[data-example-record-origin]").textContent).toBe(strings.firstRun.exampleRecordOrigin);
    expect(filled(root).map((b) => b.id)).toEqual(["make-record"]);
    q<HTMLButtonElement>(root, "#make-record").click();
    await tick();
    expect(c.state().record).toEqual(inventedVisit.preparedRecord);
    // Rewritten by shell-and-offline task 68 (N5): the record title carries no mark; the mark stands once, beside the note.
    expect(root.querySelector('[data-mark="record"]')).toBeNull();
    expect([...root.querySelectorAll("[data-mark]")].map((m) => m.textContent)).toEqual(["invented example"]);
    // Rewritten by shell-and-offline task 42 (R24.4): the prepared record is folded, so the cursor goes to the Edit control of the date line.
    q<HTMLButtonElement>(root, "#edit-record").click();
    expect(document.activeElement?.id).toBe("fold-date");
    // The prepared record is a copy: editing it does not change the example.
    expect(c.state().record).not.toBe(inventedVisit.preparedRecord);
  });

  it("does not fill the record on its own for the example, with or without a model", async () => {
    for (const d of ["available", "unavailable", "downloadable"] as const) {
      const { root, c } = setup(d);
      await c.start();
      q<HTMLButtonElement>(root, "#try-example").click();
      expect(c.state().record, d).toBeNull();
    }
  });
});
