// @vitest-environment happy-dom
// One name gate for every path that can send text, the reader chip that says
// "masked by you", and a second Draft that must not erase a finished note.
import { describe, expect, it, vi } from "vitest";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DeviceModelState, Guess } from "../../src/inference/types";
import { selectableSentences } from "../../src/drafting/sentences";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { makeKeptStore } from "../../src/storage/kept";
import { browserStoreStandIn } from "../support/browserStoreStandIn";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const REASON = strings.masking.resolveBeforeDraft;

function setup(opts: { guesses?: Guess[]; kept?: boolean; device?: DeviceModelState } = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const draftRun = vi.fn((t, i, m) => draftDouble.run(t, i, m));
  const rewriteRun = vi.fn(async () => ({ value: "A shorter line.", inferenceSource: "ON_DEVICE" as const, connected: true }));
  const readerRun = vi.fn(async () => ({
    value: {
      guesses: opts.guesses ?? [{ who: "a sister", description: "a sister", why: "the record names her", kind: "name", evidence: ["Bea"] }],
      model: "invented-reader",
      bytes: 12,
    },
    inferenceSource: "IN_CLOUD" as const,
    connected: true,
  }));
  const backend = browserStoreStandIn();
  const kept = opts.kept ? makeKeptStore(backend) : null;
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => opts.device ?? "unavailable" } }),
    aiServiceEnabled: true,
    tier: "paid",
    results: () => undefined,
    isOffline: async () => false,
    ...(kept ? { kept } : {}),
    drafting: {
      draftFor: () => ({ run: draftRun }) as never,
      rewriteFor: () => ({ mode: "PREFER_ON_DEVICE" as const, run: rewriteRun }),
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
    secondReader: { readerFor: () => ({ run: readerRun }) as never },
  };
  const c = makeController(deps);
  return { root, c, draftRun, rewriteRun, readerRun, backend, kept };
}

async function ready(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(structuredClone(inventedVisit.preparedRecord));
  s.c.render();
  await settle();
}

async function press(root: HTMLElement, sel: string) {
  const b = root.querySelector(sel) as HTMLButtonElement | null;
  expect(b, sel).not.toBeNull();
  b!.click();
  await settle();
}

async function keepLikely(root: HTMLElement) {
  for (let i = 0; i < 6 && root.querySelector("[data-keep-likely]"); i++) await press(root, "[data-keep-likely]");
}

const outgoing = (root: HTMLElement) => root.querySelector("pre.outgoing")?.textContent ?? "";

describe("one name gate", () => {
  it("sends nothing while an unlisted name is unresolved, and says why and what to do", async () => {
    const s = setup();
    await ready(s);
    const record = structuredClone(inventedVisit.preparedRecord);
    record.seen = [...record.seen, "Then Glenda arrived."];
    s.c.handlers.onRecordEdit?.(record);
    s.c.render();
    await settle();
    await press(s.root, "#ask-reader");
    expect(s.readerRun).not.toHaveBeenCalled();
    expect(s.draftRun).not.toHaveBeenCalled();
    expect(s.c.state().outgoingText).toBe("");
    expect(outgoing(s.root)).toBe(strings.emptyOutgoing);
    expect(s.root.querySelector("[data-draft-reason]")?.textContent).toBe(REASON);
    expect(s.root.querySelector("[data-resolve-before-draft]")?.textContent).toBe(REASON);
    expect(s.root.querySelector('[data-likely-word="Glenda"]')).not.toBeNull();
    expect(s.root.querySelector('[data-keep-likely="Glenda"]')?.textContent).toBe("Keep Glenda");

    await press(s.root, "#send");
    expect(s.readerRun).not.toHaveBeenCalled();
    expect(s.draftRun).not.toHaveBeenCalled();
    expect(s.rewriteRun).not.toHaveBeenCalled();

    s.c.handlers.onRewrite?.("shorter");
    await settle();
    s.c.handlers.onDeviceDraft?.();
    await settle();
    expect(s.rewriteRun).not.toHaveBeenCalled();
    expect(s.draftRun).not.toHaveBeenCalled();
    expect(s.readerRun).not.toHaveBeenCalled();
    expect(s.root.querySelector("[data-draft-reason]")?.textContent).toBe(REASON);
  });

  it("does not send a rewrite or a prepared draft after a new unresolved name", async () => {
    const s = setup();
    await ready(s);
    await press(s.root, "#draft");
    await keepLikely(s.root);
    const range = selectableSentences(s.c.state().outgoingText)[0];
    expect(range).toBeDefined();
    s.c.handlers.onSelectSentence?.(range!.start);
    const record = structuredClone(inventedVisit.preparedRecord);
    record.seen = [...record.seen, "Then Quin arrived."];
    s.c.handlers.onRecordEdit?.(record);
    s.c.handlers.onRewrite?.("shorter");
    await settle();
    s.c.handlers.onSend?.();
    await settle();
    s.c.handlers.onAskReader?.();
    await settle();
    expect(s.rewriteRun).not.toHaveBeenCalled();
    expect(s.draftRun).not.toHaveBeenCalled();
    expect(s.readerRun).not.toHaveBeenCalled();
    expect(s.c.state().outgoingText).toBe("");
    expect(s.root.querySelector("[data-draft-reason]")?.textContent).toBe(REASON);
    expect(s.root.querySelector("[data-likely-word]")?.getAttribute("data-likely-word")).toMatch(/Quin|Bea/);
  });
});

describe("a reader chip marked masked by you", () => {
  it("masks that word in the record and clears the Draft gate", async () => {
    const s = setup({
      guesses: [{ who: "a neighbour", description: "a neighbour", why: "the record names her", kind: "name", evidence: ["Glenda"] }],
    });
    await ready(s);
    const record = structuredClone(inventedVisit.preparedRecord);
    record.seen = [...record.seen, "Then Glenda arrived."];
    s.c.handlers.onNoteInput?.(inventedVisit.note + "\nThen Glenda arrived.");
    s.c.handlers.onRecordEdit?.(record);
    s.c.render();
    await settle();
    await press(s.root, "#draft");
    await press(s.root, '[data-keep-likely="Glenda"]');
    await press(s.root, "#ask-reader");
    await press(s.root, "#send");
    expect(s.readerRun).toHaveBeenCalledTimes(1);
    expect(s.root.querySelector('[data-reader] [data-quote="Glenda"]')).not.toBeNull();

    s.c.handlers.onRecordEdit?.(structuredClone(record));
    await press(s.root, "#draft");
    expect(s.c.state().draftGate).toBe(true);
    expect(s.root.querySelector('[data-likely-word="Glenda"]')).not.toBeNull();

    await press(s.root, '[data-reader] [data-quote="Glenda"]');
    expect(s.root.querySelector('[data-reader] [data-quote="Glenda"]')?.getAttribute("data-chip")).toBe("manual");
    expect(s.root.querySelector('[data-reader] [data-quote="Glenda"] .chip-state')?.textContent).toBe("masked by you");
    const manual = s.c.state().mask?.spans.find((span) => span.kind === "manual" && span.surfaceForm === "Glenda");
    expect(manual?.accepted).toBe(true);
    expect(s.root.querySelector('[data-mask-view] [data-chip="manual"] .chip-state')?.textContent).toBe("masked by you");
    expect(s.root.querySelector("[data-mask-view]")?.textContent).not.toMatch(/\bGlenda\b/);
    expect(s.c.state().draftGate).toBe(false);
    expect(s.root.querySelector("[data-likely-word]")).toBeNull();
    expect(s.root.querySelector("[data-resolve-before-draft]")).toBeNull();
    expect(outgoing(s.root).startsWith("Visit date:")).toBe(true);
    expect(outgoing(s.root)).not.toMatch(/\bGlenda\b/);
    expect(outgoing(s.root)).not.toMatch(/\bBea\b/);
    expect(s.readerRun).toHaveBeenCalledTimes(1);
  });
});

describe("a second Draft", () => {
  it("keeps the finished note until she asks, including after a reload", async () => {
    const s = setup({ kept: true });
    await ready(s);
    await press(s.root, "#draft");
    await keepLikely(s.root);
    await press(s.root, "#send");
    const note = s.c.state().finished?.text ?? "";
    expect(note).not.toBe("");
    expect(s.draftRun).toHaveBeenCalledTimes(1);

    await press(s.root, "#draft");
    expect(s.draftRun).toHaveBeenCalledTimes(1);
    expect(s.c.state().finished?.text).toBe(note);
    expect(s.root.querySelector("[data-replace-ask]")?.textContent).toBe(strings.drafting.askReplace);
    expect(s.root.querySelector("#replace-yes")?.textContent).toBe(strings.drafting.replaceYes);
    expect(s.root.querySelector("#replace-no")?.textContent).toBe(strings.drafting.replaceNo);

    await s.kept?.flush();
    const root = document.createElement("div");
    document.body.append(root);
    const reloaded = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: true,
      tier: "paid",
      results: () => undefined,
      isOffline: async () => false,
      kept: makeKeptStore(s.backend),
      drafting: {
        draftFor: () => ({ run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) }) as never,
        ledger: makeLedger(),
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => undefined,
      },
    });
    await reloaded.start();
    expect(reloaded.state().finished?.text).toBe(note);

    await press(s.root, "#replace-no");
    expect(s.draftRun).toHaveBeenCalledTimes(1);
    expect(s.c.state().finished?.text).toBe(note);
    expect(s.root.querySelector("[data-replace-ask]")).toBeNull();

    await press(s.root, "#draft");
    await press(s.root, "#replace-yes");
    expect(s.c.state().finished?.text).toBe(note);
    await press(s.root, "#send");
    expect(s.draftRun).toHaveBeenCalledTimes(2);
    expect(s.c.state().finished).not.toBeNull();
  });
});
