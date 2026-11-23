// H45b: with the page's cloud switch off no rewrite may reach cloudService(), whatever the device state.
// Real rewriteSdk, real firebase/app and firebase/ai, a fetch spy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strings } from "../../src/app/strings";
import { makeRewriteJob, rewriteCallMode, RewriteFailure } from "../../src/inference/rewrite/rewrite.real";
import { rewriteSdk } from "../../src/firebase/rewriteSdk";
import * as cloudServiceMod from "../../src/firebase/cloudService";
import { stubLanguageModel } from "../support/languageModelStandIn";

const input = { text: "Make this shorter: [Person 1] checked the lock.", tags: ["[Person 1]"] };
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response("{}", { status: 400 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

describe("rewriteCallMode", () => {
  it("is ONLY_ON_DEVICE whenever the switch is off, whatever the device says", () => {
    for (const device of ["unavailable", "downloadable", "downloading", "available"] as const) {
      expect(rewriteCallMode({ cloudEnabled: false, device })).toBe("ONLY_ON_DEVICE");
      expect(rewriteCallMode({ cloudEnabled: true, device })).toBe("PREFER_ON_DEVICE");
    }
  });
});

describe("(1) switch off, device unavailable: device-absent, zero fetches, cloudService never reached", () => {
  for (const scenario of ["no LanguageModel", "LanguageModel unavailable", "page says unavailable, API gone"] as const) {
    it(scenario, async () => {
      const cs = vi.spyOn(cloudServiceMod, "cloudService");
      let state: "unavailable" | "available" = "unavailable";
      if (scenario === "LanguageModel unavailable") stubLanguageModel("unavailable");
      if (scenario === "page says unavailable, API gone") state = "available"; // stale page state, API deleted: the guard refuses
      const job = makeRewriteJob({ sdk: rewriteSdk, state: async () => state, cloudEnabled: false });
      await expect(job.run({} as never, input)).rejects.toMatchObject({ kind: "absent", line: strings.deviceModelAbsent });
      await expect(job.run({} as never, input)).rejects.toBeInstanceOf(RewriteFailure);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(cs).not.toHaveBeenCalled();
    });
  }

  it("a press made with the cloud on but the page offline (deviceOnly) is the same", async () => {
    const cs = vi.spyOn(cloudServiceMod, "cloudService");
    const job = makeRewriteJob({ sdk: rewriteSdk, state: async () => "unavailable", cloudEnabled: true });
    await expect(job.run({} as never, { ...input, deviceOnly: true })).rejects.toMatchObject({ kind: "absent" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cs).not.toHaveBeenCalled();
  });
});

describe("(2) switch off, device available: on-device as before", () => {
  it("passes ONLY_ON_DEVICE to the SDK", async () => {
    const generate = vi.fn(async (_c: unknown) => ({ text: "[Person 1] checked the lock.", inferenceSource: "on_device" }));
    const job = makeRewriteJob({ sdk: { generate }, state: async () => "available", cloudEnabled: false });
    const out = await job.run({} as never, input);
    expect(out.inferenceSource).toBe("ON_DEVICE");
    expect((generate.mock.calls as unknown[][])[0]![0]).toMatchObject({ mode: "ONLY_ON_DEVICE" });
  });
});

describe("(3) switch on: unchanged", () => {
  it("goes through cloudService() with PREFER_ON_DEVICE and the same call body", async () => {
    const generate = vi.fn(async (_p: unknown, _t: string) => ({ text: "[Person 1] checked the lock.", inferenceSource: "in_cloud" }));
    vi.spyOn(cloudServiceMod, "cloudService").mockReturnValue({ generate } as never);
    const job = makeRewriteJob({ sdk: rewriteSdk, state: async () => "unavailable", cloudEnabled: true });
    const out = await job.run({} as never, input);
    expect(out.inferenceSource).toBe("IN_CLOUD");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![1]).toBe(input.text);
    const params = (generate.mock.calls[0]![0] as (ai: unknown) => unknown)({ InferenceMode: { PREFER_ON_DEVICE: "prefer_on_device" } });
    expect(params).toMatchObject({ mode: "prefer_on_device" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
