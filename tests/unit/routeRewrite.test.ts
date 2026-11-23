// D-R8: device rewrite, fact check, masked cloud rewrite only on a fail, same check.
// The spelled-out note is shown only when both fail. A listed name never leaves.
import { describe, expect, it } from "vitest";
import { prepareRewrite, runRewrite } from "../../src/drafting/rewriteFlow";
import { makeLedger } from "../../src/egress/ledger";
import { expandShorthand } from "../../src/inference/rewrite/shorthand";
import { makeRewriteJob, type RewriteCall, type RewriteSdk } from "../../src/inference/rewrite/rewrite.real";

const NAME = "Priya Halloran";
const values = { listedNames: [NAME], surfaceForms: [], sentOnPurpose: [] };
const NOTE = "[Person 1] said the apt lock sticks.";

function scripted(replies: string[]) {
  const calls: RewriteCall[] = [];
  const sdk: RewriteSdk = {
    async generate(call) {
      calls.push(call);
      return { text: replies[Math.min(calls.length - 1, replies.length - 1)]!, inferenceSource: call.mode === "ONLY_ON_DEVICE" ? "on_device" : "in_cloud" };
    },
  };
  return { calls, sdk };
}

async function press(replies: string[], cloud = true) {
  const { calls, sdk } = scripted(replies);
  const ledger = makeLedger();
  const prep = prepareRewrite({ sentence: NOTE, kind: "shorter", cloud, values });
  const out = await runRewrite(prep, {
    rewrite: makeRewriteJob({ sdk, cloudEnabled: cloud, state: async () => "available" }),
    ledger,
    device: "available",
  });
  return { out, calls, ledger, prep };
}

describe("D-R8 verify then escalate", () => {
  it("shows the device reply and does not call the cloud when the fact check passes", async () => {
    const device = "[Person 1] said the apartment lock sticks.";
    const { out, calls } = await press([device, "The cloud should not be asked."]);
    expect(out).toMatchObject({ status: "rewritten", value: device, source: "ON_DEVICE" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.mode).toBe("ONLY_ON_DEVICE");
    expect(calls[0]!.text).not.toContain(NAME);
  });

  it("on a device fail, sends the masked note to the cloud and shows the cloud reply when that check passes", async () => {
    const cloud = "[Person 1] said the apartment lock sticks.";
    const { out, calls } = await press(["[Person 1] said the roof fell in.", cloud]);
    expect(out).toMatchObject({ status: "rewritten", value: cloud, source: "IN_CLOUD" });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.mode).toBe("ONLY_ON_DEVICE");
    expect(calls[1]!.mode).toBe("PREFER_ON_DEVICE");
    expect(calls[1]!.text).toContain("[Person 1]");
    expect(calls[1]!.text).toContain("apartment lock");
    expect(calls[1]!.text).not.toContain(NAME);
    expect(calls[1]!.text).not.toContain("roof");
  });

  it("shows the spelled-out note only when both replies fail the fact check", async () => {
    const { out, calls } = await press([
      "[Person 1] said the roof fell in.",
      "[Person 1] said the cellar flooded.",
    ]);
    expect(out).toMatchObject({ status: "rewritten", value: expandShorthand(NOTE) });
    expect(out.status === "rewritten" && out.value).not.toContain("roof");
    expect(out.status === "rewritten" && out.value).not.toContain("cellar");
    expect(calls).toHaveLength(2);
  });

  it("blocks a listed name before either model is asked", async () => {
    const prep = prepareRewrite({ sentence: `${NAME} said the apt lock sticks.`, kind: "shorter", cloud: true, values });
    expect(prep.preview.canSend).toBe(false);
    const { calls, sdk } = scripted(["unused"]);
    const out = await runRewrite(prep, {
      rewrite: makeRewriteJob({ sdk, cloudEnabled: true, state: async () => "available" }),
      ledger: makeLedger(),
      device: "available",
    });
    expect(out.status).toBe("blocked");
    expect(calls).toHaveLength(0);
  });
});
