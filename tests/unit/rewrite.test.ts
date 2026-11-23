// Drafting task 11 (R7): rewrite one masked sentence. Interface, double, real job and flow.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { prepareRewrite, runRewrite, REWRITE_INSTRUCTIONS } from "../../src/drafting/rewriteFlow";
import { makeLedger } from "../../src/egress/ledger";
import { rewriteDouble } from "../../src/inference/rewrite/rewrite.double";
import * as doubles from "../../src/inference/doubles";
import {
  RewriteFailure,
  makeRewriteJob,
  type RewriteCall,
  type RewriteSdk,
} from "../../src/inference/rewrite/rewrite.real";
import type { DeviceModelState, RewriteJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { CLOUD_MODEL_HOST, DEFAULT_CLOUD_MODEL } from "../../src/constants";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { DEFAULT_POLICY } from "../../src/masking/policy";

afterEach(() => vi.unstubAllGlobals());

const ticket = {} as never;
const clients = parseClientList(inventedVisit.clientList).entries;
const values = {
  listedNames: [...new Set(clients.flatMap((c) => [c.fullName, ...c.otherNames]))],
  surfaceForms: ["Alder Court"],
  sentOnPurpose: [],
};
const SENTENCE = "[Person 1] posts the form on Friday, and [Person 2] offered to help.";

function fakeSdk(reply: string | Error, source = "on_device") {
  const calls: RewriteCall[] = [];
  const sdk: RewriteSdk = {
    async generate(call) {
      calls.push(call);
      if (reply instanceof Error) throw reply;
      return { text: reply, inferenceSource: source };
    },
  };
  return { sdk, calls };
}
const job = (sdk: RewriteSdk, cloudEnabled: boolean, state: DeviceModelState = "available") =>
  makeRewriteJob({ sdk, cloudEnabled, state: async () => state });

describe("the rewrite job", () => {
  it("is PREFER_ON_DEVICE", () => {
    expect(job(fakeSdk("x").sdk, true).mode).toBe("PREFER_ON_DEVICE");
    expect(rewriteDouble.mode).toBe("PREFER_ON_DEVICE");
  });

  it("calls the SDK with PREFER_ON_DEVICE when the cloud service is enabled", async () => {
    const { sdk, calls } = fakeSdk("[Person 1] posts the form Friday; [Person 2] helps.");
    await job(sdk, true).run(ticket, { text: `${REWRITE_INSTRUCTIONS.shorter}\n\nSentence: ${SENTENCE}`, tags: ["[Person 1]", "[Person 2]"] });
    expect(calls[0]!.mode).toBe("PREFER_ON_DEVICE");
    expect(calls[0]!.inCloudModel).toBe(DEFAULT_CLOUD_MODEL);
  });

  it("never lets the SDK fall back to the cloud while the cloud service is off", async () => {
    const { sdk, calls } = fakeSdk("[Person 1] posts the form Friday; [Person 2] helps.");
    await job(sdk, false).run(ticket, { text: `x\n\nSentence: ${SENTENCE}`, tags: ["[Person 1]", "[Person 2]"] });
    expect(calls[0]!.mode).toBe("ONLY_ON_DEVICE");
  });

  it("hands the SDK the text unchanged and labels the answer from inferenceSource", async () => {
    const text = `${REWRITE_INSTRUCTIONS.plainer}\n\nSentence: ${SENTENCE}`;
    const device = fakeSdk("[Person 1] will post the form on Friday and [Person 2] will help.");
    const r = await job(device.sdk, true).run(ticket, { text, tags: ["[Person 1]", "[Person 2]"] });
    expect(device.calls[0]!.text).toBe(text);
    expect(r).toEqual({ value: "[Person 1] will post the form on Friday and [Person 2] will help.", inferenceSource: "ON_DEVICE", connected: true });
    const cloud = fakeSdk("[Person 1] posts the form on Friday and [Person 2] helps.", "in_cloud");
    const c = await job(cloud.sdk, true).run(ticket, { text, tags: ["[Person 1]", "[Person 2]"] });
    expect(c.inferenceSource).toBe("IN_CLOUD");
  });

  it("refuses a changed tag with the exact line", async () => {
    const input = { text: `x\n\nSentence: ${SENTENCE}`, tags: ["[Person 1]", "[Person 2]"] };
    for (const bad of [
      "[Person 3] posts the form and [Person 2] helps.",
      "[person 1] posts the form and [Person 2] helps.",
      "[Person 1 posts the form and [Person 2] helps.",
      "[Person 1] posts the form and Tomas helps.",
      "[Person 1] posts the form.",
      "[Person 1] posts the form and [Person 2] helps at [Place 1].",
    ]) {
      const err = await job(fakeSdk(bad).sdk, true).run(ticket, input).catch((e: unknown) => e);
      expect(err, bad).toBeInstanceOf(RewriteFailure);
      expect((err as RewriteFailure).kind).toBe("tagChanged");
      expect((err as RewriteFailure).line).toBe("The rewrite changed a tag, so it was not used.");
    }
    expect(strings.drafting.rewriteTagChanged).toBe("The rewrite changed a tag, so it was not used.");
  });

  it("keeps a tag that appears twice, and accepts a sentence that uses a tag once", async () => {
    const r = await job(fakeSdk("[Person 1] posts the form and [Person 2] helps [Person 1].").sdk, true).run(ticket, {
      text: "x",
      tags: ["[Person 1]", "[Person 2]"],
    });
    expect(r.value).toContain("[Person 2]");
  });

  it("refuses an answer that did not come from the device when the cloud service is off", async () => {
    const e = await job(fakeSdk("[Person 1] posts.", "in_cloud").sdk, false).run(ticket, { text: "x", tags: ["[Person 1]"] }).catch((x: unknown) => x);
    expect((e as RewriteFailure).kind).toBe("notOnDevice");
  });

  it("turns an SDK error into a plain line without the error text", async () => {
    const e = await job(fakeSdk(new Error("internal detail")).sdk, true).run(ticket, { text: "x", tags: [] }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(RewriteFailure);
    expect((e as RewriteFailure).kind).toBe("failed");
    expect((e as RewriteFailure).line).not.toContain("internal");
  });
});

describe("the rewrite double", () => {
  it("returns the sentence unchanged, in the cloud, not connected, with no request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await rewriteDouble.run(ticket, { text: `${REWRITE_INSTRUCTIONS.shorter}\n\nSentence: ${SENTENCE}`, tags: ["[Person 1]", "[Person 2]"] });
    expect(r).toEqual({ value: SENTENCE, inferenceSource: "IN_CLOUD", connected: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(doubles.rewriteDouble).toBe(rewriteDouble);
  });
});

describe("the rewrite flow (R7.2, R7.3)", () => {
  it("builds the input from the one sentence and the fixed instructions, and nothing else", () => {
    const p = prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: false, values });
    expect(p.text).toBe(`${REWRITE_INSTRUCTIONS.shorter}\n\nSentence: ${SENTENCE}`);
    expect(p.tags).toEqual(["[Person 1]", "[Person 2]"]);
    expect(REWRITE_INSTRUCTIONS.shorter).toMatch(/exactly one/);
    expect(REWRITE_INSTRUCTIONS.plainer).toMatch(/exactly one/);
    expect(prepareRewrite({ sentence: SENTENCE, kind: "plainer", cloud: false, values }).text).toContain(REWRITE_INSTRUCTIONS.plainer);
  });

  it("waits for Send, with the notice, when the cloud service is enabled", () => {
    expect(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: true, values }).requiresSend).toBe(true);
  });

  it("does not wait when the cloud service is off", () => {
    expect(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: false, values }).requiresSend).toBe(false);
  });

  it("applies the preview check: a listed name in the sentence blocks it", async () => {
    const p = prepareRewrite({ sentence: "Priya Halloran will call.", kind: "shorter", cloud: true, values });
    expect(p.preview.canSend).toBe(false);
    const run = vi.fn();
    const out = await runRewrite(p, { rewrite: { mode: "PREFER_ON_DEVICE", run } as unknown as RewriteJob, ledger: makeLedger(), device: "available" });
    expect(out.status).toBe("blocked");
    expect(run).not.toHaveBeenCalled();
  });

  it("goes through send(): the request is captured, the ledger has job rewrite", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    const cloudJob: RewriteJob = {
      mode: "PREFER_ON_DEVICE",
      async run(_t, input) {
        await fetch(`https://${CLOUD_MODEL_HOST}/v1beta/x:generateContent`, { method: "POST", body: JSON.stringify({ text: input.text }) });
        return { value: "[Person 1] posts the form and [Person 2] helps.", inferenceSource: "IN_CLOUD", connected: true };
      },
    };
    const ledger = makeLedger();
    const p = prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: true, values });
    const out = await runRewrite(p, { rewrite: cloudJob, ledger, device: "available" });
    expect(out.status).toBe("rewritten");
    if (out.status !== "rewritten") return;
    expect(out.captured).toHaveLength(1);
    expect(out.value).toBe("[Person 1] posts the form and [Person 2] helps.");
    expect(out.source).toBe("IN_CLOUD");
    expect(ledger.all()[0]).toMatchObject({ job: "rewrite", mode: "PREFER_ON_DEVICE", inferenceSource: "IN_CLOUD", connected: true });
  });

  it("with the cloud off and the double answering, says the cloud is off", async () => {
    const p = prepareRewrite({ sentence: SENTENCE, kind: "plainer", cloud: false, values });
    const out = await runRewrite(p, { rewrite: rewriteDouble, ledger: makeLedger(), device: "unavailable" });
    expect(out.status).toBe("rewritten");
    if (out.status !== "rewritten") return;
    expect(out.connected).toBe(false);
    expect(out.lines.rows[2]!.value).toMatch(/cloud off/);
  });

  it("records ONLY_ON_DEVICE in the ledger when the cloud is off and the device answers", async () => {
    const real = job(fakeSdk("[Person 1] posts the form and [Person 2] helps.").sdk, false);
    const ledger = makeLedger();
    const out = await runRewrite(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: false, values }), { rewrite: real, ledger, device: "available" });
    expect(out.status).toBe("rewritten");
    expect(ledger.all()[0]).toMatchObject({ job: "rewrite", mode: "ONLY_ON_DEVICE", inferenceSource: "ON_DEVICE", connected: true });
  });

  it("reports a changed tag with the exact line and writes the ledger", async () => {
    const real = job(fakeSdk("[Person 3] posts the form.").sdk, true);
    const ledger = makeLedger();
    const out = await runRewrite(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: true, values }), { rewrite: real, ledger, device: "available" });
    expect(out.status).toBe("refused");
    if (out.status === "refused") expect(out.line).toBe("The rewrite changed a tag, so it was not used.");
    expect(ledger.all()).toHaveLength(1);
  });
});

describe("a rewrite passes through the masker too (ruling 24)", () => {
  const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
  const screen = { outgoing, clients, policy: DEFAULT_POLICY };
  const answering = (reply: string): RewriteJob => ({
    mode: "PREFER_ON_DEVICE",
    run: async () => ({ value: reply, inferenceSource: "ON_DEVICE", connected: true }),
  });
  const rewrite = async (reply: string) =>
    runRewrite(prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: false, values, screen }), {
      rewrite: answering(reply),
      ledger: makeLedger(),
      device: "available",
    });

  it("refuses a rewrite that added a name, and says so", async () => {
    const out = await rewrite("[Person 1] posts the form and [Person 2] helps Priya Halloran.");
    expect(out.status).toBe("refused");
    if (out.status === "refused") expect(out.line).toBe("The rewrite added a name, so it was not used.");
    expect(strings.drafting.rewriteAddedName).toBe("The rewrite added a name, so it was not used.");
  });

  it("turns a listed name that already has a tag back into the tag", async () => {
    const out = await rewrite("Maria Okonkwo-Reyes posts the form and [Person 2] helps.");
    // The tag [Person 1] is not in the answer as a tag, so the job-level tag check is the one that decides;
    // here the answering job skips it, and screening must still return tags only.
    expect(out.status).toBe("rewritten");
    if (out.status === "rewritten") expect(out.value).toBe("[Person 1] posts the form and [Person 2] helps.");
  });

  it("passes a clean rewrite through unchanged", async () => {
    const out = await rewrite("[Person 1] posts the form and [Person 2] helps.");
    expect(out.status).toBe("rewritten");
    if (out.status === "rewritten") expect(out.value).toBe("[Person 1] posts the form and [Person 2] helps.");
  });
});

describe("Shorter must return fewer characters than it was given", () => {
  const run = (reply: string, kind: "shorter" | "plainer" = "shorter", sentence = SENTENCE) =>
    runRewrite(prepareRewrite({ sentence, kind, cloud: false, values }), {
      rewrite: job(fakeSdk(reply).sdk, false),
      ledger: makeLedger(),
      device: "available",
    });

  it("uses a reply with fewer characters than the sentence sent", async () => {
    const out = await run("[Person 1] posts the form Friday; [Person 2] helps.");
    expect(out.status).toBe("rewritten");
    if (out.status === "rewritten") expect(out.value.length).toBeLessThan(SENTENCE.length);
  });

  it("refuses a longer reply and says so; nothing is returned to put on the screen", async () => {
    const longer = "[Person 1] posts the form on Friday, as agreed, and [Person 2] very kindly offered to help.";
    expect(longer.length).toBeGreaterThan(SENTENCE.length);
    const out = await run(longer);
    expect(out.status).toBe("refused");
    if (out.status === "refused") expect(out.line).toBe(strings.drafting.rewriteNotShorter);
    expect(strings.drafting.rewriteNotShorter).toBe("The rewrite was not shorter, so it was not used. The sentence is unchanged.");
  });

  it("refuses a reply of the same length", async () => {
    const out = await run(SENTENCE);
    expect(out.status).toBe("refused");
  });

  it("does not apply the rule to Plainer", async () => {
    const out = await run("[Person 1] posts the form on Friday, and [Person 2] very kindly offered to help.", "plainer");
    expect(out.status).toBe("rewritten");
  });

  it("asks for a light edit that keeps every fact", () => {
    expect(REWRITE_INSTRUCTIONS.shorter).toMatch(/light edit/);
    expect(REWRITE_INSTRUCTIONS.shorter).toMatch(/Keep every fact/);
    expect(REWRITE_INSTRUCTIONS.plainer).toMatch(/light edit/);
  });
});
