// H50b: on the device path, a reply the product cannot use is asked for once more; the cloud path never is.
// Invented people only.
import { describe, expect, it } from "vitest";
import { DEVICE_RETRIES, prepareRewrite, runRewrite } from "../../src/drafting/rewriteFlow";
import { makeLedger } from "../../src/egress/ledger";
import { makeRewriteJob, type RewriteCall, type RewriteSdk } from "../../src/inference/rewrite/rewrite.real";

const values = { listedNames: ["Maria Okonkwo-Reyes"], surfaceForms: [], sentOnPurpose: [] };
const SENTENCE = "[Person 1] posts the form on Friday, and [Person 2] offered to help.";
const SHORT = "[Person 1] posts the form Friday; [Person 2] helps.";
const LONGER = "[Person 1] will post the benefits form on Friday, and [Person 2] has kindly offered to help.";

function scripted(replies: string[], source = "on_device") {
  const calls: RewriteCall[] = [];
  const sdk: RewriteSdk = {
    async generate(call) {
      calls.push(call);
      return { text: replies[Math.min(calls.length - 1, replies.length - 1)]!, inferenceSource: source };
    },
  };
  return { calls, sdk };
}

async function press(replies: string[], opts: { cloud: boolean; source?: string }) {
  const { calls, sdk } = scripted(replies, opts.source);
  const ledger = makeLedger();
  const prep = prepareRewrite({ sentence: SENTENCE, kind: "shorter", cloud: opts.cloud, values });
  const out = await runRewrite(prep, { rewrite: makeRewriteJob({ sdk, cloudEnabled: opts.cloud, state: async () => "available" }), ledger, device: "available" });
  return { out, calls, ledger };
}

describe("H50b: one retry on the device", () => {
  it("retries exactly once", () => {
    expect(DEVICE_RETRIES).toBe(1);
  });

  it("a longer device reply is asked for once more, and the shorter second reply is used; both calls are in the ledger", async () => {
    const { out, calls, ledger } = await press([LONGER, SHORT], { cloud: false });
    expect(out).toMatchObject({ status: "rewritten", value: SHORT, source: "ON_DEVICE" });
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.mode === "ONLY_ON_DEVICE")).toBe(true);
    expect(ledger.all()).toHaveLength(2);
    expect(ledger.all().every((e) => e.mode === "ONLY_ON_DEVICE")).toBe(true);
  });

  it("two longer device replies end in the not-shorter line after exactly two calls", async () => {
    const { out, calls } = await press([LONGER, LONGER, SHORT], { cloud: false });
    expect(out).toMatchObject({ status: "refused", line: "The rewrite was not shorter, so it was not used. The sentence is unchanged." });
    expect(calls).toHaveLength(2);
  });

  it("a device reply that is two sentences or changes a tag is asked for once more", async () => {
    expect((await press(["[Person 1] posts it. [Person 2] helps.", SHORT], { cloud: false })).out.status).toBe("rewritten");
    expect((await press(["[Person 3] posts the form Friday.", SHORT], { cloud: false })).out.status).toBe("rewritten");
  });

  it("a usable first reply makes one call only", async () => {
    const { out, calls } = await press([SHORT, LONGER], { cloud: false });
    expect(out.status).toBe("rewritten");
    expect(calls).toHaveLength(1);
  });

  it("with the cloud in play, a longer reply is refused after one call: nothing is sent twice", async () => {
    const { out, calls } = await press([LONGER, SHORT], { cloud: true, source: "in_cloud" });
    expect(out.status).toBe("refused");
    expect(calls).toHaveLength(1);
  });
});
