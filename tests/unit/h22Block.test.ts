// @vitest-environment happy-dom
// Session H22a: the block chip masks the listed client in whatever form the record wrote her.
// Invented people only. Written before the change to onMaskBlocked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DraftJob } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const q = (root: ParentNode, sel: string) => root.querySelector(sel) as HTMLElement | null;
const press = async (root: HTMLElement, sel: string) => {
  (root.querySelector(sel) as HTMLElement).click();
  await settle();
};

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const draft: DraftJob = { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) } as never;
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => draft,
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  };
  return { root, c: makeController(deps) };
}

async function withPresent(s: ReturnType<typeof setup>, label: string) {
  await s.c.start();
  s.c.handlers.onTryExample();
  const record = structuredClone(inventedVisit.preparedRecord);
  record.present[0] = { ...record.present[0]!, label };
  s.c.handlers.onRecordEdit?.(record);
  s.c.render();
}

async function blockThenPress(label: string, maskViewOpen: boolean) {
  const s = setup();
  await withPresent(s, label);
  if (maskViewOpen) {
    s.c.handlers.onMask?.();
    await settle();
  }
  await press(s.root, "#draft");
  // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it.
  for (let i = 0; i < 5 && q(s.root, "[data-keep-likely]"); i++) await press(s.root, "[data-keep-likely]");
  const before = q(s.root, "[data-outgoing]")!.textContent;
  await press(s.root, "#try-listed");
  expect(q(s.root, "[data-block-line]")).not.toBeNull();
  expect(s.root.querySelectorAll("[data-block-chip] button.mask-chip, button[data-block-chip]").length).toBeGreaterThan(0);
  await press(s.root, "[data-block-chip] button.mask-chip");
  return { s, before };
}

function expectCleared({ s, before }: Awaited<ReturnType<typeof blockThenPress>>) {
  expect(q(s.root, "[data-block-line]")).toBeNull();
  expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(false);
  expect(q(s.root, "[data-outgoing]")!.textContent).toBe(before);
}

afterEach(() => vi.restoreAllMocks());

describe("H22a: the block chip masks the client in the form the record wrote", () => {
  it("Maria O-R with the mask view closed: the line goes, Send is back, the text is as before", async () => {
    expectCleared(await blockThenPress("Maria O-R", false));
  });

  it("Maria O-R with the mask view open: the line goes, Send is back, the text is as before", async () => {
    expectCleared(await blockThenPress("Maria O-R", true));
  });

  it("control: Present[0] is Maria Okonkwo-Reyes", async () => {
    expectCleared(await blockThenPress("Maria Okonkwo-Reyes", false));
  });

  it("control: Present[0] is Maria", async () => {
    expectCleared(await blockThenPress("Maria", false));
  });

  it("control: Present[0] is Okonkwo-Reyes", async () => {
    expectCleared(await blockThenPress("Okonkwo-Reyes", false));
  });

  it("a chip with no client behind it keeps today's result", async () => {
    const s = setup();
    await withPresent(s, "Maria Okonkwo-Reyes");
    s.c.handlers.onMask?.();
    await settle();
    const before = JSON.stringify(s.c.state().mask?.spans);
    s.c.handlers.onMaskBlocked?.("Nobody Known");
    await settle();
    expect(JSON.stringify(s.c.state().mask?.spans)).toBe(before);
  });
});
