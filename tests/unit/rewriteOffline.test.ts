// @vitest-environment happy-dom
// H16, drafting R7 (offline Shorter). With the network off, Shorter takes the on-device path and does not wait
// for Send, whatever the cloud switch says. With the network on and the cloud switch on, it keeps the Send step.
// Invented people only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { prepareRewrite, runRewrite } from "../../src/drafting/rewriteFlow";
import { selectableSentences } from "../../src/drafting/sentences";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
import { makeRewriteJob, type RewriteCall, type RewriteSdk } from "../../src/inference/rewrite/rewrite.real";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { makeKeptStore } from "../../src/storage/kept";
import { browserStoreStandIn } from "../support/browserStoreStandIn";

afterEach(() => vi.unstubAllGlobals());

const clients = parseClientList(inventedVisit.clientList).entries;
const values = {
  listedNames: [...new Set(clients.flatMap((c) => [c.fullName, ...c.otherNames]))],
  surfaceForms: ["Alder Court"],
  sentOnPurpose: [],
};
const SENTENCE = "[Person 1] posts the form on Friday, and [Person 2] offered to help.";

describe("prepareRewrite and the network (H16 task 1)", () => {
  it("does not wait for Send when the network is off, even with the cloud switch on", () => {
    const p = prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: true, online: false, values });
    expect(p.requiresSend).toBe(false);
  });

  it("treats the call as on-device only when the network is off, so the ledger mode says so", async () => {
    const calls: RewriteCall[] = [];
    const sdk: RewriteSdk = {
      async generate(call) {
        calls.push(call);
        return { text: "[Person 1] posts the form and [Person 2] helps.", inferenceSource: "on_device" };
      },
    };
    const ledger = makeLedger();
    const p = prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: true, online: false, values });
    const out = await runRewrite(p, { rewrite: makeRewriteJob({ sdk, cloudEnabled: true, state: async () => "available" }), ledger, device: "available" });
    expect(out.status).toBe("rewritten");
    expect(ledger.all()[0]).toMatchObject({ job: "rewrite", mode: "ONLY_ON_DEVICE", inferenceSource: "ON_DEVICE" });
  });

  it("keeps the Send step when the network is on and the cloud switch is on", () => {
    expect(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: true, online: true, values }).requiresSend).toBe(true);
  });

  it("keeps the Send step when the caller does not say (online is the default)", () => {
    expect(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: true, values }).requiresSend).toBe(true);
  });

  it("does not wait with the cloud switch off, online or not", () => {
    expect(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: false, online: true, values }).requiresSend).toBe(false);
    expect(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: false, online: false, values }).requiresSend).toBe(false);
  });
});

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

function setup(offline: boolean) {
  const root = document.createElement("div");
  document.body.append(root);
  const fetchSpy = vi.fn(async () => { throw new Error("no request expected"); });
  vi.stubGlobal("fetch", fetchSpy);
  const rewriteRun = vi.fn(async () => ({ value: "A shorter line.", inferenceSource: "ON_DEVICE" as const, connected: true }));
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: true,
    tier: "paid",
    results: () => undefined,
    isOffline: async () => offline,
    kept: makeKeptStore(browserStoreStandIn()),
    proposeMasks: () => proposeMasksDouble,
    drafting: {
      draftFor: () => draftDouble as never,
      rewriteFor: () => ({ mode: "PREFER_ON_DEVICE" as const, run: rewriteRun }),
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => !offline, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
      clearLedger: async () => undefined,
    },
  });
  return { root, c, rewriteRun };
}

async function press(root: HTMLElement, sel: string) {
  if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  const b = q<HTMLButtonElement>(root, sel);
  expect(b, `control ${sel}`).not.toBeNull();
  expect(b.disabled, `control ${sel} is enabled`).toBe(false);
  b.click();
  await settle();
}

async function toRecord(s: ReturnType<typeof setup>) {
  await s.c.start();
  await s.c.refreshNetwork();
  await press(s.root, "#try-example");
  await press(s.root, "#make-record");
  // H35a D2 and D8: Zone 2 is empty until Draft, and Draft stops at an unlisted name-like word (Bea) until she keeps it.
  await press(s.root, "#draft");
  for (let i = 0; i < 5 && s.root.querySelector("[data-keep-likely]"); i++) await press(s.root, "[data-keep-likely]");
  const first = selectableSentences(s.c.state().outgoingText)[0]!;
  s.c.handlers.onSelectSentence?.(first.start);
  await settle();
}

describe("Shorter in the page (H16 task 1)", () => {
  it("runs on this device at once when the network is off and the cloud switch is on", async () => {
    const s = setup(true);
    await toRecord(s);
    expect(s.c.state().network).toBe("offline");
    expect(s.c.state().cloud).toBe(true);
    await press(s.root, "#rewrite-shorter");
    expect(s.rewriteRun).toHaveBeenCalledTimes(1);
    expect(s.c.state().rewrites).toHaveLength(1);
    expect(s.c.state().rewrite.pending ?? null).toBeNull();
  });

  it("waits for Send when the network is on and the cloud switch is on", async () => {
    const s = setup(false);
    await toRecord(s);
    expect(s.c.state().network).toBe("online");
    await press(s.root, "#rewrite-shorter");
    expect(s.rewriteRun).not.toHaveBeenCalled();
    expect(s.c.state().rewrite.pending).not.toBeNull();
  });
});

// ---- H17, drafting R16.7 and R16.8 (tasks 44 and 45) ----------------------------------------------------------

describe("the rewrite job offline (H17 task 44)", () => {
  it("asks the SDK for ONLY_ON_DEVICE when the page says nothing can leave, with the cloud switch on", async () => {
    const calls: RewriteCall[] = [];
    const sdk: RewriteSdk = {
      async generate(call) {
        calls.push(call);
        if (call.mode !== "ONLY_ON_DEVICE") throw new Error("offline: no config, no App Check");
        return { text: "[Person 1] posts the form and [Person 2] helps.", inferenceSource: "on_device" };
      },
    };
    const job = makeRewriteJob({ sdk, cloudEnabled: true, state: async () => "available" });
    const out = await job.run({} as never, { text: "x", tags: ["[Person 1]", "[Person 2]"], deviceOnly: true });
    expect(calls.map((c) => c.mode)).toEqual(["ONLY_ON_DEVICE"]);
    expect(out.inferenceSource).toBe("ON_DEVICE");
  });

  it("keeps PREFER_ON_DEVICE when the cloud may answer", async () => {
    const calls: RewriteCall[] = [];
    const sdk: RewriteSdk = {
      async generate(call) {
        calls.push(call);
        return { text: "[Person 1] posts the form and [Person 2] helps.", inferenceSource: "on_device" };
      },
    };
    const job = makeRewriteJob({ sdk, cloudEnabled: true, state: async () => "available" });
    await job.run({} as never, { text: "x", tags: ["[Person 1]", "[Person 2]"] });
    expect(calls.map((c) => c.mode)).toEqual(["PREFER_ON_DEVICE"]);
  });

  it("the page tells the job, offline, and shows the result labelled on this device", async () => {
    const s = setup(true);
    await toRecord(s);
    await press(s.root, "#rewrite-shorter");
    expect(s.rewriteRun).toHaveBeenCalledTimes(1);
    const input = (s.rewriteRun.mock.calls[0] as unknown as [unknown, { deviceOnly?: boolean }])[1];
    expect(input.deviceOnly).toBe(true);
    const label = q(s.root, "[data-rewrite-result] .source-label");
    expect(label.textContent?.trim()).toBe("on this device");
  });

  it("the page does not say so online", async () => {
    const s = setup(false);
    await toRecord(s);
    await press(s.root, "#rewrite-shorter");
    await press(s.root, "#send");
    const input = (s.rewriteRun.mock.calls[0] as unknown as [unknown, { deviceOnly?: boolean }])[1];
    expect(input.deviceOnly).toBe(false);
  });
});

describe("where a sentence can be selected (H17 task 45, the cause of the failed step after the ledger was saved)", () => {
  it("lets a second Shorter run between Draft and Send, and the draft still goes after it", async () => {
    const s = setup(false);
    await toRecord(s);
    await press(s.root, "#draft");
    const first = selectableSentences(s.c.state().outgoingText)[0]!;
    s.c.handlers.onSelectSentence?.(first.start);
    await settle();
    await press(s.root, "#rewrite-shorter");
    expect(s.c.state().rewrite.pending).not.toBeNull();
    await press(s.root, "#send");
    expect(s.rewriteRun).toHaveBeenCalledTimes(1);
    expect(s.root.querySelector("[data-rewrite-result] .source-label")?.textContent?.trim()).toBe("on this device");
    expect(s.c.state().finished).toBeNull();
    await press(s.root, "#send");
    expect(s.c.state().finished).not.toBeNull();
  });

  it("is possible between Draft and Send, and not once a finished note stands", async () => {
    const s = setup(false);
    await toRecord(s);
    expect(s.root.querySelectorAll("[data-sentence]").length).toBeGreaterThan(0);
    await press(s.root, "#draft");
    expect(s.c.state().finished).toBeNull();
    expect(s.root.querySelectorAll("[data-sentence]").length).toBeGreaterThan(0);
    await press(s.root, "#send");
    expect(s.c.state().finished).not.toBeNull();
    expect(s.root.querySelectorAll("[data-sentence]").length).toBe(0);
  });
});
