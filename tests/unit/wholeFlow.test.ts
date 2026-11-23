// @vitest-environment happy-dom
// The whole flow at unit level, with the test doubles and invented people only:
// press the invented-visit control, make the record by hand, exact masking (and the
// near match), the preview, send, the egress check line, the draft, names restored.
// Every step is one press, through the screen's own controls.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
import type { DeviceModelState } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const text = (root: ParentNode, sel: string) => q(root, sel)?.textContent ?? "";

afterEach(() => vi.unstubAllGlobals());

function setup(deviceState: DeviceModelState) {
  const root = document.createElement("div");
  document.body.append(root);
  // No request may be made by any step. The probe has its own stub.
  const fetchSpy = vi.fn(async () => { throw new Error("no request expected"); });
  vi.stubGlobal("fetch", fetchSpy);
  const draft = { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) };
  const ledger = makeLedger();
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => deviceState, create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    proposeMasks: () => proposeMasksDouble,
    drafting: {
      draftFor: () => draft as never,
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  });
  return { root, c, draft, ledger, fetchSpy };
}

async function press(root: HTMLElement, sel: string) {
  if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  const b = q<HTMLButtonElement>(root, sel);
  expect(b, `control ${sel}`).not.toBeNull();
  expect(b.disabled, `control ${sel} is enabled`).toBe(false);
  b.click();
  await settle();
  // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it, and then goes on.
  for (let i = 0; sel === "#draft" && i < 5 && root.querySelector("[data-keep-likely]"); i++) {
    (root.querySelector("[data-keep-likely]") as HTMLElement).click();
    await settle();
  }
}
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Zone 1 by hand: the date, three people, and the lines the invented visit holds. */
async function fillRecordByHand(root: HTMLElement) {
  await press(root, "#start-by-hand");
  type(q(root, "#record-date"), "2026-11-12");
  for (const [label, role] of [["Maria Okonkwo-Reyes", "client"], ["Bea", "other"], ["Dana Whitfield", "worker"]] as const) {
    type(q(root, "#tag-label"), label);
    q<HTMLSelectElement>(root, "#tag-role").value = role;
    await press(root, "#add-tag");
  }
  type(q(root, "#record-seen"), "Mould in the back bedroom, worse by the window.\nLetter about the benefits form on the table.");
  type(q(root, "#record-agreed"), "Worker rings the landlord on Monday.\nMaria posts the form on Friday.\nTomas Brandvald offered to help with the form.");
  type(q(root, "#record-risks"), "Rent arrears if the form is late.");
  type(q(root, "#record-nextSteps"), "Revisit on 26/11.");
}

describe.each<[string, DeviceModelState]>([
  ["a device model is present, and she fills in the record by hand", "available"],
  ["no device model on this computer, and she fills in the record by hand", "unavailable"],
])("the whole flow: %s", (_name, deviceState) => {
  it("goes from the invented visit to the restored finished note, one press per step", async () => {
    const { root, c, draft, ledger, fetchSpy } = setup(deviceState);
    await c.start();

    // 1. The page opens on the cold screen. The invented visit is one of the two controls.
    expect(q(root, '[data-zone="note"]')).toBeNull();
    expect(text(root, "h1")).toBe("Listed names stay on this device.");
    expect(q<HTMLButtonElement>(root, "#try-example").textContent).toBe("Try an invented visit");
    expect(q<HTMLButtonElement>(root, "#start-visit").textContent).toBe("Start a visit");
    await press(root, "#try-example");
    expect(q(root, '[data-zone="note"]')).not.toBeNull();
    // With the prepared record in place the note and the list are folded to one line each; open them to read them.
    if (c.state().record !== null) {
      await press(root, "#fold-note");
      await press(root, "#fold-list");
    }
    expect(q<HTMLTextAreaElement>(root, "#note").value).toBe(inventedVisit.note);
    expect(q<HTMLTextAreaElement>(root, "#client-list").value).toBe(inventedVisit.clientList);
    expect(text(root, "[data-mark]")).toBe("invented example");

    // 2. The record, by hand. With no device model the prepared record is already there;
    //    she clears it and fills it in herself, so this step is by hand in both cases.
    // Without the device model the first control opens hand entry with the prepared record (capture-and-record R13.3).
    expect(c.state().record).toBeNull();
    if (deviceState === "unavailable") {
      await press(root, "#make-record");
    } else {
      expect(q(root, "#start-by-hand")).not.toBeNull();
      await press(root, "#start-by-hand");
    }
    // With the invented example loaded, hand entry opens with its prepared record in both cases.
    expect(c.state().record).not.toBeNull();
    if (c.state().record !== null) {
      c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
      c.handlers.onRemoveTag?.(0);
      c.handlers.onRemoveTag?.(0);
      c.handlers.onRemoveTag?.(0);
    } else {
      expect(q(root, "#start-by-hand")).not.toBeNull();
    }
    if (c.state().record === null) await fillRecordByHand(root);
    else {
      // The prepared record is folded (shell-and-offline task 42): open the two fields this test edits.
      // A field with no text is already open, and then has no Edit control.
      root.querySelector<HTMLButtonElement>("#edit-record")?.click();
      for (const id of ["#fold-present", "#fold-agreed"]) if (root.querySelector(id)?.getAttribute("aria-expanded") === "false") await press(root, id);
      for (const [label, role] of [["Maria Okonkwo-Reyes", "client"], ["Bea", "other"], ["Dana Whitfield", "worker"]] as const) {
        type(q(root, "#tag-label"), label);
        q<HTMLSelectElement>(root, "#tag-role").value = role;
        await press(root, "#add-tag");
      }
      type(q(root, "#record-agreed"), "Worker rings the landlord on Monday.\nMaria posts the form on Friday.\nTomas Brandvald offered to help with the form.");
    }
    expect(c.state().record!.present.map((p) => p.label)).toEqual(["Maria Okonkwo-Reyes", "Bea", "Dana Whitfield"]);
    expect(c.state().recordAdded).toEqual([]);

    // 3. Masking: one press. Exact match masks the listed name; near match catches the
    //    spelling that is one letter off; both are chips, and every other word is a control.
    await press(root, "#mask");
    const chips = [...root.querySelectorAll("[data-mask-view] [data-chip]")];
    expect(chips.length).toBeGreaterThan(0);
    const kinds = new Set(chips.map((n) => n.getAttribute("data-chip")));
    expect(kinds.has("listed")).toBe(true);
    expect(kinds.has("near")).toBe(true);
    expect(text(root, "[data-mask-view]")).toContain("[Person 1]");
    expect(text(root, "[data-mask-view]")).not.toContain("Maria Okonkwo-Reyes");
    expect(root.querySelector("[data-mask-view] button.word")).not.toBeNull();
    expect(text(root, "[data-device-pass-line]")).not.toBe("");
    if (deviceState === "unavailable") {
      expect(text(root, "[data-device-pass-line]")).toBe(strings.masking.deviceAbsent);
      expect(root.querySelector('[data-mask-view] [data-chip="proposed"]')).toBeNull();
    } else {
      // The device pass adds proposals as dashed chips with their source; they are not masked until she accepts them.
      expect(root.querySelector('[data-mask-view] [data-chip="proposed"]')).not.toBeNull();
      expect(text(root, "[data-mask-section]")).toContain("off");
      expect(text(root, "[data-device-pass-line]")).toBe(strings.masking.deviceReady);
    }

    // 4. The preview: Draft shows the exact outgoing text before anything is sent.
    await press(root, "#draft");
    const preview = text(root, "pre.outgoing");
    expect(preview.startsWith(`Visit date: ${c.state().record!.visitDate}`)).toBe(true);
    expect(preview).toContain("[Person 1]");
    expect(preview).toContain("Instructions: Write exactly five paragraphs");
    for (const name of ["Maria", "Okonkwo", "Reyes", "Brandvald", "Brandvold", "Tomas"]) expect(preview).not.toContain(name);
    expect(text(root, "[data-send-notice]")).toMatch(/is off/i);
    expect(draft.run).not.toHaveBeenCalled();
    expect(text(root, "[data-egress-line]")).not.toMatch(/listed names in the text sent/);

    // 5. Send: the job is given the shown text and nothing else.
    await press(root, "#send");
    expect(draft.run).toHaveBeenCalledTimes(1);
    expect(draft.run.mock.calls[0]![1]).toEqual({ text: preview });
    expect(draft.run.mock.calls[0]![2]).toBe("PREFER_IN_CLOUD");

    // 6. The egress check line, computed from the bytes.
    const line = text(root, "[data-egress-line]");
    expect(line).toMatch(/No listed name left this device: 0 of \d+\./);
    expect(line).toContain("Near variants that were not masked are not checked.");
    expect(line).toMatch(/cloud off/);
    expect(q(root, "[data-egress-line]").classList.contains("failure")).toBe(false);
    expect(ledger.all()).toHaveLength(1);
    expect(ledger.all()[0]).toMatchObject({ job: "draft", listedFound: 0, maskedFound: 0, outcome: "answered", connected: false });

    // 7. The draft, with names restored on this device.
    const sheet = text(root, ".sheet-text");
    expect(sheet).toContain("Maria Okonkwo-Reyes");
    expect(sheet).toContain("Tomas Brandvold");
    expect(sheet).not.toMatch(/\[(Person|Place|Date|Detail) \d+\]/);
    expect(sheet).not.toMatch(/\{[A-Za-z]+:/);
    // Rewritten by drafting task 26 (sixth review R5): one mark while the cloud is off.
    expect(text(root, ".sheet")).not.toContain("in the cloud");
    expect(text(root, ".sheet")).toContain("fixed sample: cloud off");
    expect(q<HTMLButtonElement>(root, "#copy").disabled).toBe(false);

    // 8. No step made a request, and no block on the screen is empty.
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const zone of ["note", "leaves", "finished"]) {
      expect(text(root, `[data-zone="${zone}"]`).trim()).not.toBe("");
    }
    expect(text(root, "pre.outgoing")).not.toBe(strings.emptyOutgoing);
    expect(root.querySelector(".sheet-empty")).toBeNull();
    expect(c.state().error).toBeNull();
  });
});

describe("masking changes reach the outgoing text", () => {
  it("a word she masks with one press is a tag in the preview", async () => {
    const { root, c } = setup("unavailable");
    await c.start();
    await press(root, "#try-example");
    await press(root, "#make-record");
    await press(root, "#mask");
    const word = [...root.querySelectorAll<HTMLButtonElement>("[data-mask-view] button.word")].find((b) => b.textContent === "Mould")!;
    expect(word).toBeDefined();
    word.click();
    await settle();
    expect(text(root, "[data-live]")).toBe("Masked: Detail 1");
    await press(root, "#draft");
    expect(text(root, "pre.outgoing")).not.toContain("Mould");
    expect(text(root, "pre.outgoing")).toContain("[Detail 1]");
  });

  it("a listed chip she unmasks blocks the preview until she masks it again", async () => {
    const { root, c, draft } = setup("unavailable");
    await c.start();
    await press(root, "#try-example");
    await press(root, "#make-record");
    await press(root, "#mask");
    const chip = q<HTMLButtonElement>(root, '[data-mask-view] [data-chip="listed"]');
    chip.click();
    await settle();
    await press(root, "#draft");
    expect(text(root, "[data-egress-line]")).toMatch(/Found in the text that would leave: Maria Okonkwo-Reyes/);
    expect(q<HTMLButtonElement>(root, "#send").disabled).toBe(true);
    expect(draft.run).not.toHaveBeenCalled();
    q<HTMLButtonElement>(root, '[data-mask-view] [data-chip="off"]').click();
    await settle();
    await press(root, "#draft");
    expect(q<HTMLButtonElement>(root, "#send").disabled).toBe(false);
  });

  it("a change to the record puts the mask view back to a fresh start", async () => {
    const { root, c } = setup("unavailable");
    await c.start();
    await press(root, "#try-example");
    await press(root, "#make-record");
    await press(root, "#mask");
    expect(q(root, "[data-mask-view]")).not.toBeNull();
    await press(root, "#fold-risks");
    type(q(root, "#record-risks"), "Rent arrears if the form is late, and a second letter.");
    c.render();
    expect(q(root, "[data-mask-view]")).toBeNull();
  });
});
