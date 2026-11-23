// Drafting task 7 (R1.2, R1.3, R1.5): the real draft job, with a fake SDK.
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CLOUD_MODEL, DRAFT_SENTENCES_DEVICE, DRAFT_SENTENCES_DEVICE_MAX } from "../../src/constants";
import {
  DraftFailure,
  buildDraftCreateOptions,
  makeDraftJob,
  type DraftCall,
  type DraftSdk,
} from "../../src/inference/draft/draft.real";
import type { DeviceModelState } from "../../src/inference/types";

const ticket = {} as never;
const text = "Visit date: 2026-11-12\nPresent: [Person 1], worker\n\nInstructions: Write a formal case note.";

function sdkReturning(reply: { text: string; inferenceSource: string } | Error) {
  const calls: DraftCall[] = [];
  const sdk: DraftSdk = {
    async generate(call) {
      calls.push(call);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { sdk, calls };
}
const job = (sdk: DraftSdk, state: DeviceModelState = "available", cloudModel?: string) =>
  makeDraftJob({ sdk, state: async () => state, ...(cloudModel === undefined ? {} : { cloudModel: () => cloudModel }) });

describe("the device call (ONLY_ON_DEVICE)", () => {
  it("calls the SDK with ONLY_ON_DEVICE and the text it was given, unchanged", async () => {
    const { sdk, calls } = sdkReturning({ text: "Short note.", inferenceSource: "on_device" });
    const r = await job(sdk).run(ticket, { text }, "ONLY_ON_DEVICE");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.mode).toBe("ONLY_ON_DEVICE");
    expect(calls[0]!.text).toBe(text);
    expect(r).toEqual({ value: { text: "Short note.", short: true }, inferenceSource: "ON_DEVICE", connected: true });
  });

  it("is real whenever the model is available, with no cloud switch involved", async () => {
    const { sdk, calls } = sdkReturning({ text: "Short note.", inferenceSource: "on_device" });
    await job(sdk, "available").run(ticket, { text }, "ONLY_ON_DEVICE");
    expect(calls).toHaveLength(1);
  });

  it("asks for five to eight sentences in the system prompt, from constants", () => {
    const o = buildDraftCreateOptions();
    const prompt = o.initialPrompts[0]!.content[0]!.value;
    expect(prompt).toMatch(/five to eight sentences/);
    expect([DRAFT_SENTENCES_DEVICE, DRAFT_SENTENCES_DEVICE_MAX]).toEqual([5, 8]);
    expect(o.initialPrompts[0]!.role).toBe("system");
    expect(o.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(o.expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(prompt).toMatch(/\[Person 1\]/);
    expect(prompt).toMatch(/\{he:Person 1\}/);
  });

  it("states the exact output wanted (browser document, fact 5)", () => {
    expect(buildDraftCreateOptions().initialPrompts[0]!.content[0]!.value).toMatch(/Reply with the note only/);
  });

  it("refuses a model that is not on this computer", async () => {
    const { sdk, calls } = sdkReturning({ text: "x", inferenceSource: "on_device" });
    await expect(job(sdk, "unavailable").run(ticket, { text }, "ONLY_ON_DEVICE")).rejects.toMatchObject({ kind: "absent" });
    expect(calls).toHaveLength(0);
  });

  it("waits for a download in progress and says so once", async () => {
    const { sdk } = sdkReturning({ text: "Short note.", inferenceSource: "on_device" });
    const onWaiting = vi.fn();
    await makeDraftJob({ sdk, state: async () => "downloading", onWaiting }).run(ticket, { text }, "ONLY_ON_DEVICE");
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it("discards a cloud answer to an ONLY_ON_DEVICE call", async () => {
    const { sdk } = sdkReturning({ text: "x", inferenceSource: "in_cloud" });
    await expect(job(sdk).run(ticket, { text }, "ONLY_ON_DEVICE")).rejects.toMatchObject({ kind: "notOnDevice" });
  });
});

describe("the cloud call (PREFER_IN_CLOUD)", () => {
  it("always sets the cloud model name, from the default when nothing is configured", async () => {
    const { sdk, calls } = sdkReturning({ text: "Long note.", inferenceSource: "in_cloud" });
    await job(sdk, "unavailable").run(ticket, { text }, "PREFER_IN_CLOUD");
    expect(calls[0]!.mode).toBe("PREFER_IN_CLOUD");
    expect(calls[0]!.inCloudModel).toBe(DEFAULT_CLOUD_MODEL);
  });

  it("uses the given name when there is one, and the default when it is blank", async () => {
    const a = sdkReturning({ text: "n", inferenceSource: "in_cloud" });
    await job(a.sdk, "available", "model-given").run(ticket, { text }, "PREFER_IN_CLOUD");
    expect(a.calls[0]!.inCloudModel).toBe("model-given");
    const b = sdkReturning({ text: "n", inferenceSource: "in_cloud" });
    await job(b.sdk, "available", "  ").run(ticket, { text }, "PREFER_IN_CLOUD");
    expect(b.calls[0]!.inCloudModel).toBe(DEFAULT_CLOUD_MODEL);
  });

  it("does not wait for a device download (sdk-facts 12)", async () => {
    const { sdk } = sdkReturning({ text: "n", inferenceSource: "in_cloud" });
    const onWaiting = vi.fn();
    await makeDraftJob({ sdk, state: async () => "downloading", onWaiting }).run(ticket, { text }, "PREFER_IN_CLOUD");
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it("labels the answer from inferenceSource: in the cloud, not short", async () => {
    const { sdk } = sdkReturning({ text: "Long note.", inferenceSource: "in_cloud" });
    const r = await job(sdk).run(ticket, { text }, "PREFER_IN_CLOUD");
    expect(r).toEqual({ value: { text: "Long note.", short: false }, inferenceSource: "IN_CLOUD", connected: true });
  });

  it("labels a device answer to a cloud-first call as a device draft", async () => {
    const { sdk } = sdkReturning({ text: "Short note.", inferenceSource: "on_device" });
    const r = await job(sdk).run(ticket, { text }, "PREFER_IN_CLOUD");
    expect(r.inferenceSource).toBe("ON_DEVICE");
    expect(r.value.short).toBe(true);
  });
});

describe("failures", () => {
  it("turns a context overflow into the too-long line", async () => {
    const e = Object.assign(new Error("over"), { name: "QuotaExceededError" });
    await expect(job(sdkReturning(e).sdk).run(ticket, { text }, "ONLY_ON_DEVICE")).rejects.toMatchObject({ kind: "tooLong" });
  });

  it("turns any other error into the plain failure line, without the error text", async () => {
    const e = new Error("secret detail from the SDK");
    const err = await job(sdkReturning(e).sdk).run(ticket, { text }, "ONLY_ON_DEVICE").catch((x: unknown) => x);
    expect(err).toBeInstanceOf(DraftFailure);
    expect((err as DraftFailure).kind).toBe("failed");
    expect((err as DraftFailure).line).not.toContain("secret");
  });

  it("rejects an empty reply and an unknown source", async () => {
    await expect(job(sdkReturning({ text: "  ", inferenceSource: "on_device" }).sdk).run(ticket, { text }, "ONLY_ON_DEVICE")).rejects.toMatchObject({ kind: "failed" });
    await expect(job(sdkReturning({ text: "x", inferenceSource: "elsewhere" }).sdk).run(ticket, { text }, "PREFER_IN_CLOUD")).rejects.toMatchObject({ kind: "failed" });
  });
});
