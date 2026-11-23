import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { CLOUD_MODEL_HOST } from "../../src/constants";
import { withCapture } from "../../src/egress/capture";
import { cloudModelRequests, isCloudModelUrl } from "../../src/egress/watch";
import { makeKit, type FirebaseDeps } from "../../src/inference";
import { makeProposeMasksJob } from "../../src/inference/proposeMasks/proposeMasks.real";
import { makeStructureJob } from "../../src/inference/structure/structure.real";

afterEach(() => vi.unstubAllGlobals());

const available = async () => "available" as const;
const record = inventedVisit.preparedRecord;
const ticket = {} as never;

describe("the recorder watches the cloud model host", () => {
  it("names the host from the browser document", () => {
    expect(CLOUD_MODEL_HOST).toBe("firebasevertexai.googleapis.com");
  });

  it("recognises a cloud model call and nothing else", () => {
    expect(isCloudModelUrl("https://firebasevertexai.googleapis.com/v1beta/projects/p/models/m:generateContent")).toBe(true);
    expect(isCloudModelUrl("https://example.invalid/firebasevertexai.googleapis.com")).toBe(false);
    expect(isCloudModelUrl("https://firebasevertexai.googleapis.com.example.invalid/")).toBe(false);
    expect(isCloudModelUrl("not a url")).toBe(false);
    const seen = [{ url: "https://example.invalid/a" }, { url: `https://${CLOUD_MODEL_HOST}/v1beta/x` }];
    expect(cloudModelRequests(seen)).toEqual([seen[1]]);
  });

  it("sees a request to the host made during a captured call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const out = await withCapture(async () => {
      await fetch(`https://${CLOUD_MODEL_HOST}/v1beta/projects/p/models/m:generateContent`, { method: "POST", body: "{}" });
    });
    expect(cloudModelRequests(out.captured)).toHaveLength(1);
  });
});

describe("device jobs produce no request at all", () => {
  it("the structure job, the propose-masks job and the device draft make no request", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);

    const structure = makeStructureJob({
      sdk: { generate: async () => ({ text: JSON.stringify(record), inferenceSource: "on_device" }) },
      state: available,
    });
    const propose = makeProposeMasksJob({
      sdk: { generate: async () => ({ text: JSON.stringify({ candidates: [{ text: "Bea", kind: "name" }] }), inferenceSource: "on_device" }) },
      state: available,
    });
    const deps: FirebaseDeps = {
      real: {
        structure,
        proposeMasks: propose,
        draft: { run: async (_t, input) => ({ value: { text: input.text, short: true }, inferenceSource: "ON_DEVICE", connected: true }) },
        rewrite: { mode: "PREFER_ON_DEVICE", run: async (_t, i) => ({ value: i.text, inferenceSource: "ON_DEVICE", connected: true }) },
        secondReader: { mode: "ONLY_IN_CLOUD", run: async () => ({ value: { guesses: [] }, inferenceSource: "IN_CLOUD", connected: true }) },
      },
    };
    const kit = makeKit({ device: "available", cloud: false }, deps);

    const out = await withCapture(async () => {
      await kit.structure.run({ noteText: inventedVisit.note });
      await kit.proposeMasks.run(inventedVisit.note);
      await kit.draft.run(ticket, { text: "[Person 1] was seen." }, "ONLY_ON_DEVICE");
    });

    expect(out.ok).toBe(true);
    expect(out.captured).toEqual([]);
    expect(cloudModelRequests(out.captured)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the device jobs are built with device-only modes", () => {
    const structure = makeStructureJob({ sdk: { generate: async () => ({ text: "", inferenceSource: "on_device" }) }, state: available });
    const propose = makeProposeMasksJob({ sdk: { generate: async () => ({ text: "", inferenceSource: "on_device" }) }, state: available });
    expect(structure.mode).toBe("ONLY_ON_DEVICE");
    expect(propose.mode).toBe("ONLY_ON_DEVICE");
  });
});
