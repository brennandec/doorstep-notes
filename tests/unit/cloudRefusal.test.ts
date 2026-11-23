// @vitest-environment happy-dom
// Shell-and-offline task 31: the cloud service refuses a request (HTTP 403, the
// recorded case: "The Gemini API free tier is not available for this project").
// The page says so in plain words, keeps the masked text, offers the device draft
// where a device model is present, and writes a ledger line that nothing was accepted.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { sendDraft, prepareDraft } from "../../src/drafting/draftFlow";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { makeDraftJob, DraftFailure, type DraftSdk } from "../../src/inference/draft/draft.real";
import { isCloudRefusal } from "../../src/inference/refusal";
import { makeRewriteJob } from "../../src/inference/rewrite/rewrite.real";
import { makeSecondReaderJob } from "../../src/inference/secondReader/secondReader.real";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { assertLedgerEntry } from "../../src/egress/ledger";
import type { EgressTicket } from "../../src/egress/ticket";

// The error text the SDK threw in the recorded run (results/cloud-probe-2026-11-13.json).
function recordedRefusal(): Error {
  const file = JSON.parse(readFileSync("results/cloud-probe-2026-11-13.json", "utf8")) as unknown;
  const hit = JSON.stringify(file).match(/AI: Error fetching from [^"]*free tier is not available[^"]*/);
  if (!hit) throw new Error("The recorded refusal text is not in the results file.");
  return new Error(JSON.parse(`"${hit[0]}"`) as string);
}

const ticket = {} as EgressTicket;
const clients = parseClientList(inventedVisit.clientList).entries;
const deviceReply = { text: "Short note for [Person 1].", inferenceSource: "on_device" };

describe("recognising a refusal", () => {
  it("knows the recorded text", () => {
    expect(isCloudRefusal(recordedRefusal())).toBe(true);
  });
  it("knows an SDK error that carries the status", () => {
    const e = Object.assign(new Error("AI: something"), { customErrorData: { status: 403 } });
    expect(isCloudRefusal(e)).toBe(true);
  });
  it("does not take other errors for a refusal", () => {
    expect(isCloudRefusal(new Error("AI: Error fetching from x: [500 Internal Server Error] oops"))).toBe(false);
    expect(isCloudRefusal(new Error("Failed to fetch"))).toBe(false);
    expect(isCloudRefusal("403")).toBe(false);
    expect(isCloudRefusal(null)).toBe(false);
  });
});

describe("the plain line", () => {
  it("says the cloud service is unavailable and that nothing was accepted, in plain words", () => {
    const line = strings.cloud.refused;
    // RULING 04:24:39Z: a model-endpoint 403 is "unavailable right now", never "this browser
    // was refused". The service did not reject the person; it could not be reached.
    expect(line).toMatch(/cloud service is unavailable/i);
    expect(line).toMatch(/nothing was accepted/i);
    expect(line).toMatch(/masked text is kept/i);
    expect(line).not.toMatch(/403|http|billing|tier/i);
    expect(line).not.toMatch(/browser/i);
  });
});

describe("the real jobs map a refusal", () => {
  it("draft", async () => {
    const sdk: DraftSdk = { generate: async () => { throw recordedRefusal(); } };
    const job = makeDraftJob({ sdk, state: async () => "available" });
    const err = await job.run(ticket, { text: "x" }, "PREFER_IN_CLOUD").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DraftFailure);
    expect(err).toMatchObject({ kind: "cloudRefused", line: strings.cloud.refused });
  });
  it("rewrite", async () => {
    const job = makeRewriteJob({ sdk: { generate: async () => { throw recordedRefusal(); } }, state: async () => "unavailable", cloudEnabled: true });
    const err = await job.run(ticket, { text: "x", tags: [] }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "cloudRefused", line: strings.cloud.refused });
  });
  it("second reader", async () => {
    const job = makeSecondReaderJob({ sdk: { generate: async () => { throw recordedRefusal(); } } });
    const err = await job.run(ticket, { text: "x" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "cloudRefused", line: strings.cloud.refused });
  });
});

describe("the ledger line", () => {
  const record = inventedVisit.preparedRecord;
  const refusing = makeDraftJob({ sdk: { generate: async () => { throw recordedRefusal(); } }, state: async () => "unavailable" });

  it("says nothing was accepted, with counts, hashes and times only", async () => {
    const ledger = makeLedger();
    const prep = prepareDraft({ record, clients, policy: DEFAULT_POLICY });
    const out = await sendDraft(prep, "PREFER_IN_CLOUD", { draft: refusing, ledger, clients });
    expect(out.status).toBe("failed");
    if (out.status !== "failed") return;
    expect(out.line).toBe(strings.cloud.refused);
    expect(out.refused).toBe(true);
    const entries = ledger.all();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.outcome).toBe("refused");
    expect(() => assertLedgerEntry(entries[0]!)).not.toThrow();
    expect(JSON.stringify(entries[0])).not.toMatch(/Maria|Okonkwo|Alder/);
  });

  it("an ordinary failure is written as failed, an answer as answered", async () => {
    const ledger = makeLedger();
    const prep = prepareDraft({ record, clients, policy: DEFAULT_POLICY });
    const broken = makeDraftJob({ sdk: { generate: async () => { throw new Error("Failed to fetch"); } }, state: async () => "unavailable" });
    const bad = await sendDraft(prep, "PREFER_IN_CLOUD", { draft: broken, ledger, clients });
    expect(bad.status === "failed" && bad.refused).toBe(false);
    const good = makeDraftJob({ sdk: { generate: async () => ({ text: "Note for [Person 1].", inferenceSource: "in_cloud" }) }, state: async () => "unavailable" });
    await sendDraft(prep, "PREFER_IN_CLOUD", { draft: good, ledger, clients });
    expect(ledger.all().map((e) => e.outcome)).toEqual(["failed", "answered"]);
  });

  it("refuses an outcome that is not one of the fixed words", () => {
    const entry = { ...makeEntry(), outcome: "nothing" as never };
    expect(() => assertLedgerEntry(entry)).toThrow();
  });
});

function makeEntry() {
  return {
    at: "2026-11-13T00:00:00.000Z",
    sha256: [],
    byteLengths: [],
    listedChecked: 0,
    listedFound: 0,
    maskedChecked: 0,
    maskedFound: 0,
    onPurpose: 0,
    job: "draft" as const,
    mode: "PREFER_IN_CLOUD" as const,
    inferenceSource: "IN_CLOUD" as const,
    connected: true,
    outcome: "answered" as const,
    requests: [],
  };
}

describe("on the screen", () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
  const press = async (root: HTMLElement, id: string) => {
    (root.querySelector(`#${id}`) as HTMLButtonElement).click();
    await settle();
  };
  const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent ?? "";

  async function start(device: "available" | "unavailable") {
    const root = document.createElement("div");
    document.body.append(root);
    const modes: string[] = [];
    const sdk: DraftSdk = {
      generate: vi.fn(async (call) => {
        modes.push(call.mode);
        if (call.mode === "ONLY_ON_DEVICE") return deviceReply;
        throw recordedRefusal();
      }),
    };
    const job = makeDraftJob({ sdk, state: async () => device });
    const ledger = makeLedger();
    const deps: ControllerDeps = {
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => device, create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
      aiServiceEnabled: true,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      drafting: {
        draftFor: () => job,
        ledger,
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => undefined,
      },
    };
    const c = makeController(deps);
    await c.start();
    c.handlers.onTryExample();
    c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
    c.render();
    await press(root, "draft");
    // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it, and then goes on.
    for (let i = 0; i < 5 && root.querySelector("[data-keep-likely]"); i++) {
      (root.querySelector("[data-keep-likely]") as HTMLElement).click();
      await settle();
    }
    return { root, c, ledger, modes };
  }

  it("with a device model: says it, keeps the masked text, offers the device draft, and the press makes it", async () => {
    const { root, ledger, modes } = await start("available");
    const shown = text(root, "pre.outgoing");
    await press(root, "send");
    expect(text(root, ".error")).toBe(strings.cloud.refused);
    expect(text(root, "pre.outgoing")).toBe(shown);
    expect(shown).toMatch(/^Visit date/);
    expect(ledger.all().map((e) => e.outcome)).toEqual(["refused"]);
    expect(root.querySelector(".sheet-text")).toBeNull();

    const offer = root.querySelector("#device-draft") as HTMLButtonElement;
    expect(offer).not.toBeNull();
    expect(offer.textContent).toBe(strings.cloud.deviceDraft);
    offer.click();
    await settle();
    expect(modes).toEqual(["PREFER_IN_CLOUD", "ONLY_ON_DEVICE"]);
    expect(text(root, ".sheet-text")).toContain("Short note for Maria Okonkwo-Reyes.");
    expect(text(root, ".sheet")).toContain("on this device");
    expect(text(root, "[data-short-draft]")).toBe(strings.drafting.shortDraft);
    expect(root.querySelector("#device-draft")).toBeNull();
    expect(root.querySelector(".error")).toBeNull();
    expect(ledger.all().map((e) => e.outcome)).toEqual(["refused", "answered"]);
  });

  it("without a device model: says it, keeps the text, offers the masked record to copy and no device draft", async () => {
    const { root, ledger } = await start("unavailable");
    await press(root, "send");
    expect(text(root, ".error")).toBe(strings.cloud.refused);
    expect(text(root, "pre.outgoing")).toMatch(/^Visit date/);
    expect(root.querySelector("#device-draft")).toBeNull();
    expect(root.querySelector("#copy-masked")).not.toBeNull();
    expect(ledger.all().map((e) => e.outcome)).toEqual(["refused"]);
  });
});
