
// @vitest-environment happy-dom
// H17, masking R21 (task 31): a person on the "Present:" line who is not on her list is proposed on the device,
// whatever the model returns. Invented people only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing, recordBlock } from "../../src/drafting/buildOutgoing";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { parseClientList } from "../../src/masking/clientList";
import { runDevicePass, type ProposalJobLike } from "../../src/masking/devicePass";
import { runPasses } from "../../src/masking/entry";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { makeKeptStore } from "../../src/storage/kept";
import { browserStoreStandIn } from "../support/browserStoreStandIn";

afterEach(() => vi.unstubAllGlobals());

const clients = parseClientList(inventedVisit.clientList).entries;
const silent: ProposalJobLike = { mode: "ONLY_ON_DEVICE", run: async () => ({ value: [], inferenceSource: "ON_DEVICE", connected: true }) };

describe("the device pass and the Present line (R21.1)", () => {
  const raw = recordBlock(inventedVisit.preparedRecord);
  const base = runPasses(raw, clients, DEFAULT_POLICY).combined;

  it("proposes Bea, a name in the note that is not on her list, from a model that proposes nothing", async () => {
    const r = await runDevicePass(raw, base, silent, DEFAULT_POLICY, { presentLine: true });
    const proposed = r.spans.filter((s) => s.kind === "proposed");
    expect(proposed.map((s) => s.surfaceForm)).toEqual(["Bea"]);
    expect(proposed[0]!.tagKind).toBe("Person");
    expect(proposed[0]!.accepted).toBe(false);
  });

  it("proposes nothing extra when the page does not ask (the measurement path is unchanged, R21.3)", async () => {
    const r = await runDevicePass(raw, base, silent, DEFAULT_POLICY);
    expect(r.spans.filter((s) => s.kind === "proposed")).toEqual([]);
  });

  it("does not propose a listed name, the worker, 'none' or a lower-case item, and not 'I'", async () => {
    const text = "Visit date: 12/11\nPresent: Maria Okonkwo-Reyes, worker, I, none, a neighbour, Glenda\nSeen: Mould.";
    const spans = runPasses(text, clients, DEFAULT_POLICY).combined;
    const r = await runDevicePass(text, spans, silent, DEFAULT_POLICY, { presentLine: true });
    expect(r.spans.filter((s) => s.kind === "proposed").map((s) => s.surfaceForm)).toEqual(["Glenda"]);
  });

  it("marks every place the name stands once, and the same name from the model is not proposed twice", async () => {
    const text = "Visit date: 12/11\nPresent: Maria Okonkwo-Reyes, Bea\nSeen: Bea was there.";
    const spans = runPasses(text, clients, DEFAULT_POLICY).combined;
    const model: ProposalJobLike = { mode: "ONLY_ON_DEVICE", run: async () => ({ value: [{ text: "Bea", kind: "name" }], inferenceSource: "ON_DEVICE", connected: true }) };
    const r = await runDevicePass(text, spans, model, DEFAULT_POLICY, { presentLine: true });
    const proposed = r.spans.filter((s) => s.kind === "proposed");
    expect(proposed).toHaveLength(2);
    expect(new Set(proposed.map((s) => s.key)).size).toBe(1);
  });

  it("accepted, it masks Bea in the outgoing text", async () => {
    const r = await runDevicePass(raw, base, silent, DEFAULT_POLICY, { presentLine: true });
    const before = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY, spans: r.spans });
    expect(before.text).toContain("Bea");
    const accepted = r.spans.map((s) => (s.kind === "proposed" ? { ...s, accepted: true } : s));
    const after = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY, spans: accepted });
    expect(after.text).not.toMatch(/\bBea\b/);
    expect(after.maskedRecord).toMatch(/Present: \[Person 1\], \[Person 2\]/);
  });
});

describe("in the page (R21.2)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const settle = async () => {
    for (let i = 0; i < 10; i++) await tick();
  };

  it("offers Bea as a suggestion, does not accept it for her, and a press keeps Bea out of What leaves", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no request expected"); }));
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "available", create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
      aiServiceEnabled: false,
      tier: "paid",
      results: () => undefined,
      isOffline: async () => false,
      kept: makeKeptStore(browserStoreStandIn()),
      proposeMasks: () => silent as never,
      structure: { mode: "ONLY_ON_DEVICE", run: async () => ({ value: inventedVisit.preparedRecord, inferenceSource: "ON_DEVICE", connected: true }) } as never,
      drafting: {
        draftFor: () => draftDouble as never,
        ledger: makeLedger(),
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => undefined,
        clearLedger: async () => undefined,
      },
    });
    await c.start();
    const press = async (sel: string) => {
      if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
      const b = root.querySelector(sel) as HTMLButtonElement;
      expect(b, sel).not.toBeNull();
      expect(b.disabled, sel).toBe(false);
      b.click();
      await settle();
    };
    await press("#try-example");
    await press("#make-record");
    await press("#mask");
    const chip = root.querySelector('[data-mask-view] [data-chip="proposed"]') as HTMLElement;
    expect(chip, "a suggestion chip").not.toBeNull();
    expect(chip.textContent).toContain("Bea");
    expect(c.state().outgoingText).toBe("");
    chip.click();
    await settle();
    await press("#draft");
    expect(c.state().outgoingText).not.toBe("");
    expect(c.state().outgoingText).not.toMatch(/\bBea\b/);
  });
});
