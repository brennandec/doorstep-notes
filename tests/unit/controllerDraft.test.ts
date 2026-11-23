// @vitest-environment happy-dom
// The draft flow on the screen: Draft, Send, Copy, offline and blocked cases.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DeviceModelState, DraftJob } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

function setup(opts: {
  device: DeviceModelState;
  online: boolean;
  cloud?: boolean;
  draft?: DraftJob;
  record?: boolean;
  findNames?: (draft: string) => Promise<{ text: string; kind: "name" | "place" | "dob" | "phrase" }[]>;
}) {
  const root = document.createElement("div");
  document.body.append(root);
  const copied: string[] = [];
  const draft: DraftJob = opts.draft ?? { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) } as never;
  const ledger = makeLedger();
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => opts.device, create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
    aiServiceEnabled: opts.cloud ?? false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => !opts.online,
    drafting: {
      draftFor: () => draft,
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => opts.online, fetch: async () => ({ ok: opts.online }), now: () => 1 },
      copy: async (text) => void copied.push(text),
      ...(opts.findNames ? { findNames: opts.findNames } : {}),
    },
  };
  const c = makeController(deps);
  return { root, c, copied, draft, ledger };
}
async function withExample(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  // With the device model available the example record is not prefilled; give it one.
  s.c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
  s.c.render();
}
const press = async (root: HTMLElement, id: string) => {
  (root.querySelector(`#${id}`) as HTMLButtonElement).click();
  await settle();
};
const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent ?? "";
// H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it, and then goes on.
const pressDraft = async (root: HTMLElement) => {
  await press(root, "draft");
  for (let i = 0; i < 5 && root.querySelector("[data-keep-likely]"); i++) {
    (root.querySelector("[data-keep-likely]") as HTMLElement).click();
    await settle();
  }
};

describe("online", () => {
  it("Draft shows the whole outgoing text and the notice, and waits for Send", async () => {
    const s = setup({ device: "unavailable", online: true });
    await withExample(s);
    await pressDraft(s.root);
    const shown = text(s.root, "pre.outgoing");
    expect(shown).toMatch(/^Visit date: 12\/11/);
    expect(shown).toContain("Instructions: Write exactly five paragraphs");
    expect(shown).not.toMatch(/Maria|Okonkwo|Brandvold/);
    expect(text(s.root, "[data-send-notice]")).toMatch(/is off/i);
    expect(s.draft.run).not.toHaveBeenCalled();
    expect((s.root.querySelector("#send") as HTMLButtonElement).disabled).toBe(false);
    expect(s.c.state().finished).toBeNull();
  });

  it("Send runs the draft on the same text, restores names and labels it in the cloud, not connected", async () => {
    const s = setup({ device: "unavailable", online: true });
    await withExample(s);
    await pressDraft(s.root);
    const shown = text(s.root, "pre.outgoing");
    await press(s.root, "send");
    expect(s.draft.run).toHaveBeenCalledTimes(1);
    expect((s.draft.run as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ text: shown });
    expect((s.draft.run as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toBe("PREFER_IN_CLOUD");
    const sheet = text(s.root, ".sheet");
    expect(sheet).toContain("Maria Okonkwo-Reyes");
    // Rewritten by drafting task 26 (sixth review R5): one mark while the cloud is off.
    expect(sheet).not.toContain("in the cloud");
    expect(sheet).toContain("fixed sample: cloud off");
    expect(text(s.root, "[data-egress-line]")).toMatch(/No listed name left this device: 0 of \d+\./);
    expect(s.ledger.all()).toHaveLength(1);
    expect(s.ledger.all()[0]!.job).toBe("draft");
  });

  it("Copy puts the restored note on the clipboard", async () => {
    const s = setup({ device: "unavailable", online: true });
    await withExample(s);
    await pressDraft(s.root);
    await press(s.root, "send");
    await press(s.root, "copy");
    expect(s.copied).toHaveLength(1);
    expect(s.copied[0]).toContain("Maria Okonkwo-Reyes");
  });
});

describe("offline", () => {
  it("with the device model: the device draft is made at once and labelled", async () => {
    const device: DraftJob = {
      run: vi.fn(async () => ({ value: { text: "Short note for [Person 1].", short: true }, inferenceSource: "ON_DEVICE" as const, connected: true })),
    } as never;
    const s = setup({ device: "available", online: false, draft: device });
    await withExample(s);
    await pressDraft(s.root);
    expect(device.run).toHaveBeenCalledTimes(1);
    expect((device.run as ReturnType<typeof vi.fn>).mock.calls[0]![2]).toBe("ONLY_ON_DEVICE");
    expect(text(s.root, ".sheet")).toContain("Short note for Maria Okonkwo-Reyes.");
    expect(text(s.root, ".sheet")).toContain("on this device");
    expect(text(s.root, "[data-short-draft]")).toBe("Shorter draft made on this device.");
    expect(text(s.root, "[data-egress-line]")).toMatch(/Nothing went to the cloud: 0 of \d+ listed names/);
  });

  it("without the device model: the plain line, and the masked record can be copied", async () => {
    const s = setup({ device: "unavailable", online: false });
    await withExample(s);
    await pressDraft(s.root);
    expect(text(s.root, "[data-no-draft]")).toBe("No draft can be made right now. Your masked record is kept.");
    expect(s.draft.run).not.toHaveBeenCalled();
    await press(s.root, "copy-masked");
    expect(s.copied).toHaveLength(1);
    expect(s.copied[0]).toMatch(/^Visit date: 12\/11/);
    expect(s.copied[0]).not.toMatch(/Maria|Okonkwo/);
    expect(s.copied[0]).not.toContain("Instructions:");
  });
});

describe("failures", () => {
  it("shows the plain failure line when the job fails, and keeps the outgoing text", async () => {
    const failing: DraftJob = { run: vi.fn(async () => { throw new Error("internal detail"); }) } as never;
    const s = setup({ device: "unavailable", online: true, draft: failing });
    await withExample(s);
    await pressDraft(s.root);
    await press(s.root, "send");
    expect(text(s.root, ".error")).toContain("The draft could not be made. Your masked record is kept.");
    expect(text(s.root, ".error")).not.toContain("internal");
    expect(text(s.root, "pre.outgoing")).toMatch(/^Visit date/);
  });

  it("does nothing without a record", async () => {
    const s = setup({ device: "unavailable", online: true });
    await s.c.start();
    s.c.handlers.onDraft?.();
    await settle();
    expect(s.c.state().outgoingText).toBe("");
  });
});

// Rewritten by drafting task 23 (third review, X1): "Priya Halloran" is on the client list, so the
// finished note restores her. The name that stays marked is one that is in neither the note nor the list.
describe("a name the model added (ruling 24)", () => {
  const adding: DraftJob = {
    run: vi.fn(async () => ({
      value: { text: "[Person 1] agreed. Glenda Pruitt also rang.", short: false },
      inferenceSource: "IN_CLOUD" as const,
      connected: true,
    })),
  } as never;

  it("is shown as a tag with a note, and put back only by a press", async () => {
    const s = setup({ device: "unavailable", online: true, draft: adding, findNames: async () => [{ text: "Glenda Pruitt", kind: "name" }] });
    await withExample(s);
    await pressDraft(s.root);
    await press(s.root, "send");
    const sheet = () => text(s.root, ".sheet-text");
    expect(sheet()).toContain("Maria Okonkwo-Reyes agreed.");
    expect(sheet()).not.toContain("Glenda");
    expect(text(s.root, "[data-note]")).toMatch(/Added by the model: a name/);
    expect(sheet()).toContain("(name not put back) also rang.");
    expect(sheet()).not.toMatch(/[[\]{}]/);
    expect((s.root.querySelector("#copy") as HTMLButtonElement).disabled).toBe(true);
    const back = s.root.querySelector("[data-put-back]") as HTMLButtonElement;
    expect(back).not.toBeNull();
    expect(back.textContent).toContain("Glenda Pruitt");
    back.click();
    await settle();
    expect(sheet()).toContain("Glenda Pruitt also rang.");
    expect((s.root.querySelector("#copy") as HTMLButtonElement).disabled).toBe(false);
    expect(s.root.querySelector("[data-put-back]")).toBeNull();
    expect(text(s.root, "[data-note]")).not.toMatch(/Added by the model/);
  });

  it("puts back a name from the client list with no press and no mark", async () => {
    const listed: DraftJob = {
      run: vi.fn(async () => ({ value: { text: "[Person 1] agreed. Priya Halloran also rang.", short: false }, inferenceSource: "IN_CLOUD" as const, connected: true })),
    } as never;
    const s = setup({ device: "unavailable", online: true, draft: listed });
    await withExample(s);
    await pressDraft(s.root);
    await press(s.root, "send");
    expect(text(s.root, ".sheet-text")).toContain("Priya Halloran also rang.");
    expect(s.root.querySelector("[data-put-back]")).toBeNull();
    expect(text(s.root, "[data-note]")).not.toMatch(/Added by the model/);
  });

  it("asks the device for other names in the draft when a finder is given", async () => {
    const plain: DraftJob = {
      run: vi.fn(async () => ({ value: { text: "[Person 1] agreed. Daniel Okafor visited.", short: false }, inferenceSource: "IN_CLOUD" as const, connected: true })),
    } as never;
    const s = setup({ device: "available", online: true, draft: plain, findNames: async () => [{ text: "Daniel Okafor", kind: "name" }] });
    await withExample(s);
    await pressDraft(s.root);
    await press(s.root, "send");
    expect(text(s.root, ".sheet-text")).not.toContain("Daniel");
    expect(text(s.root, "[data-note]")).toMatch(/Added by the model/);
  });
});
