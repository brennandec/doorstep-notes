// @vitest-environment happy-dom
// H20 R1: a value she masked from the second reader's quotes reaches the next text that is built:
// the preview before Draft, the text Draft holds for Send, and the base a rewrite press builds from.
// Invented people only.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { selectableSentences } from "../../src/drafting/sentences";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const QUOTE = "Mould in the back bedroom";
const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};
const outgoing = (root: HTMLElement) => root.querySelector("pre.outgoing")?.textContent ?? "";

function setup(cloud: boolean) {
  const root = document.createElement("div");
  document.body.append(root);
  const draftRun = vi.fn((t, i, m) => draftDouble.run(t, i, m));
  const rewriteRun = vi.fn(async () => ({ value: "A shorter line.", inferenceSource: "ON_DEVICE" as const, connected: true }));
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: cloud,
    tier: "paid",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => ({ run: draftRun }) as never,
      rewriteFor: () => ({ mode: "PREFER_ON_DEVICE" as const, run: rewriteRun }),
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  };
  const c = makeController(deps);
  return { root, c, draftRun, rewriteRun };
}

async function withExample(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
  s.c.render();
  await settle();
}

// H35a D8: Draft stops while a word that looks like an unlisted name (Bea) is unresolved. She keeps it, and Draft goes on.
async function draft(s: { root: HTMLElement }) {
  (s.root.querySelector("#draft") as HTMLButtonElement).click();
  await settle();
  for (let i = 0; i < 5 && s.root.querySelector("[data-keep-likely]"); i++) {
    (s.root.querySelector("[data-keep-likely]") as HTMLElement).click();
    await settle();
  }
}

describe("a mask from the second reader reaches the next text (H20 R1)", () => {
  it("is in the text after Draft and gone after the mask; nothing is shown before Draft (H35a D2)", async () => {
    const s = setup(false);
    await withExample(s);
    expect(outgoing(s.root)).toBe("Nothing to send yet.");
    await draft(s);
    expect(outgoing(s.root)).toContain(QUOTE);
    s.c.handlers.onMaskQuote?.(QUOTE);
    s.c.render();
    await settle();
    expect(outgoing(s.root)).not.toContain(QUOTE);
  });

  it("is masked in the text Draft holds for Send, and in the text the draft job is given", async () => {
    const s = setup(true);
    await withExample(s);
    s.c.handlers.onMaskQuote?.(QUOTE);
    await draft(s);
    expect(outgoing(s.root)).not.toContain(QUOTE);
    const send = s.root.querySelector("#send") as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    send.click();
    await settle();
    expect(s.draftRun).toHaveBeenCalledTimes(1);
    const given = String(s.draftRun.mock.calls[0]?.[0] ?? "");
    expect(given).not.toContain(QUOTE);
  });

  it("is masked in the text after a rewrite press, with the sentence replaced", async () => {
    const s = setup(false);
    await withExample(s);
    await draft(s);
    s.c.handlers.onMaskQuote?.(QUOTE);
    s.c.render();
    await settle();
    // A sentence that does not hold the quote, so the replaced sentence cannot hide the check.
    const other = selectableSentences(s.c.state().outgoingText).find((r) => /landlord/.test(r.text) && !r.text.includes(QUOTE))!;
    expect(other).toBeDefined();
    s.c.handlers.onSelectSentence?.(other.start);
    await settle();
    (s.root.querySelector("#rewrite-shorter") as HTMLButtonElement).click();
    await settle();
    expect(s.rewriteRun).toHaveBeenCalledTimes(1);
    expect(s.c.state().rewrites).toHaveLength(1);
    expect(outgoing(s.root)).not.toContain(QUOTE);
  });
});
