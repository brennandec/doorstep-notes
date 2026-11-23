// @vitest-environment happy-dom
// Drafting task 24 (third review, X3 and Y2): one text. The outgoing box shows the very string
// that Send gives the job, built again after every press, also after Draft and before Send.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { guardSend } from "../../src/drafting/oneText";
import { sha256Hex } from "../../src/egress/hash";
import { makeLedger } from "../../src/egress/ledger";
import { bodyForDouble } from "../../src/egress/send";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DraftJob } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { maskText } from "../../src/masking/toggle";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const ledger = makeLedger();
  const draft = { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) } as unknown as DraftJob & { run: ReturnType<typeof vi.fn> };
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => draft,
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  };
  return { root, c: makeController(deps), draft, ledger };
}
const press = async (root: HTMLElement, id: string) => {
  (root.querySelector(`#${id}`) as HTMLButtonElement).click();
  await settle();
};
const box = (root: HTMLElement) => root.querySelector("pre.outgoing")?.textContent ?? "";
// H35a D8: Draft stops while a word that looks like an unlisted name (Bea) is unresolved. She keeps it, and Draft goes on.
const draft = async (s: { root: HTMLElement }) => {
  await press(s.root, "draft");
  for (let i = 0; i < 5 && s.root.querySelector("[data-keep-likely]"); i++) {
    (s.root.querySelector("[data-keep-likely]") as HTMLElement).click();
    await settle();
  }
};

async function toMasks() {
  const s = setup();
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
  s.c.render();
  s.c.handlers.onMask?.();
  await settle();
  return s;
}

/** She masks one more word by hand, as a press on a chip or on a suggestion would. */
function maskWord(s: Awaited<ReturnType<typeof toMasks>>, word: string) {
  const m = s.c.state().mask!;
  s.c.handlers.onMaskChange?.(maskText(m.raw, m.spans, word).spans);
}

describe("the box and the string Send gives the job", () => {
  it("are the same string, byte for byte, when a press comes after Draft and before Send", async () => {
    const s = await toMasks();
    await draft(s);
    const first = box(s.root);
    expect(first).not.toMatch(/\bBea\b/);
    expect(first).toContain("Mould");
    maskWord(s, "Mould");
    const second = box(s.root);
    expect(second).not.toBe(first);
    expect(second).not.toContain("Mould");
    expect(second).not.toMatch(/\bBea\b/);
    await press(s.root, "send");
    expect(s.draft.run).toHaveBeenCalledTimes(1);
    const given = (s.draft.run.mock.calls[0]![1] as { text: string }).text;
    expect(given).toBe(box(s.root));
    expect(new TextEncoder().encode(given)).toEqual(new TextEncoder().encode(second));
  });

  it("are the same as the body the send path built: its hash is the hash of the box text", async () => {
    const s = await toMasks();
    await draft(s);
    maskWord(s, "Bea");
    const shown = box(s.root);
    await press(s.root, "send");
    expect(s.ledger.all()).toHaveLength(1);
    expect(s.ledger.all()[0]!.sha256).toEqual([await sha256Hex(bodyForDouble(shown))]);
  });

  it("keeps the box empty before Draft, then builds it from the masks as they are (H35a D2)", async () => {
    const s = await toMasks();
    expect(box(s.root)).toBe("Nothing to send yet.");
    maskWord(s, "Bea");
    expect(box(s.root)).toBe("Nothing to send yet.");
    await draft(s);
    expect(box(s.root)).not.toContain("Bea");
    await press(s.root, "send");
    expect((s.draft.run.mock.calls[0]![1] as { text: string }).text).toBe(box(s.root));
  });

  it("follows a mask changed after Draft more than once", async () => {
    const s = await toMasks();
    await draft(s);
    maskWord(s, "Bea");
    maskWord(s, "mould");
    await press(s.root, "send");
    const given = (s.draft.run.mock.calls[0]![1] as { text: string }).text;
    expect(given).toBe(box(s.root));
    expect(given).not.toMatch(/Bea|mould/i);
  });

  it("keeps the shown text after a send (what was sent stays on screen)", async () => {
    const s = await toMasks();
    await draft(s);
    await press(s.root, "send");
    const sent = box(s.root);
    maskWord(s, "Bea");
    expect(box(s.root)).toBe(sent);
  });
});

describe("guardSend (R12.3)", () => {
  it("allows a send when the held string and the box are equal", () => {
    expect(guardSend("abc", "abc")).toEqual({ ok: true });
  });
  it("refuses when they differ and gives the string the box must show", () => {
    expect(guardSend("old", "new")).toEqual({ ok: false, redraw: "new" });
  });
  it("is exact: a difference in one character, or in white space, refuses", () => {
    expect(guardSend("a b", "a  b").ok).toBe(false);
    expect(guardSend("a", "a\n").ok).toBe(false);
  });
});
