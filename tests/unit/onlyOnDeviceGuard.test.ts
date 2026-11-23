// H45: Firebase JS SDK issue #10635. Without globalThis.LanguageModel the SDK builds no on-device adapter and
// sends an ONLY_ON_DEVICE call to the cloud. These tests run the REAL firebase/app and firebase/ai (no mock of
// either) and watch fetch: every ONLY_ON_DEVICE wrapper must refuse before the SDK is reached.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceModelAbsentError } from "../../src/inference";
import { makeDraftJob, DraftFailure } from "../../src/inference/draft/draft.real";
import { makeProposeMasksJob, ProposeFailure } from "../../src/inference/proposeMasks/proposeMasks.real";
import { makeStructureJob, StructureFailure } from "../../src/inference/structure/structure.real";
import { stubLanguageModel } from "../support/languageModelStandIn";

const NOTE = "Visit 12/11. Maria Patel said the back lock is broken.";
const CREATE = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }], initialPrompts: [] } as never;

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response("{}", { status: 400 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

/** Every ONLY_ON_DEVICE wrapper, called the way its job calls it. */
async function wrappers() {
  const { structureSdk } = await import("../../src/firebase/structureSdk");
  const { proposeSdk } = await import("../../src/firebase/proposeSdk");
  const { draftSdk } = await import("../../src/firebase/draftSdk");
  const { rewriteSdk } = await import("../../src/firebase/rewriteSdk");
  return {
    structure: () => structureSdk.generate({ mode: "ONLY_ON_DEVICE", createOptions: CREATE, promptOptions: {} as never, parts: [{ text: NOTE }] }),
    propose: () => proposeSdk.generate({ mode: "ONLY_ON_DEVICE", createOptions: CREATE, promptOptions: {} as never, parts: [{ text: NOTE }] } as never),
    draft: () => draftSdk.generate({ mode: "ONLY_ON_DEVICE", inCloudModel: "m", createOptions: CREATE, text: NOTE }),
    rewrite: () => rewriteSdk.generate({ mode: "ONLY_ON_DEVICE", inCloudModel: "m", createOptions: CREATE, text: NOTE }),
  };
}

describe("the control: the real SDK itself, with no LanguageModel (the defect behind #10635)", () => {
  it("sends an ONLY_ON_DEVICE generateContent to the network when nothing guards it", async () => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
    const app = await import("firebase/app");
    const ai = await import("firebase/ai");
    const a = app.initializeApp({ apiKey: "k", projectId: "p", appId: "1:0:web:x" }, "control");
    const model = ai.getGenerativeModel(ai.getAI(a, { backend: new ai.GoogleAIBackend() }), { mode: ai.InferenceMode.ONLY_ON_DEVICE });
    await model.generateContent(NOTE).catch(() => undefined);
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    const [url, init] = fetchSpy.mock.calls[0] as [string | Request, RequestInit | undefined];
    expect(String(url instanceof Request ? url.url : url)).toContain("googleapis.com");
    expect(String(init?.body)).toContain("Maria Patel");
  });
});

describe("with globalThis.LanguageModel deleted, every ONLY_ON_DEVICE wrapper refuses and no request is made", () => {
  for (const name of ["structure", "propose", "draft", "rewrite"] as const) {
    it(`${name}: DeviceModelAbsentError, zero fetch calls`, async () => {
      delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
      expect("LanguageModel" in globalThis).toBe(false);
      const w = await wrappers();
      await expect(w[name]()).rejects.toBeInstanceOf(DeviceModelAbsentError);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});

describe("with LanguageModel present but not usable, the same", () => {
  const cases: Array<[string, () => void]> = [
    ["availability() says unavailable", () => void stubLanguageModel("unavailable")],
    ["availability() says a word it does not know", () => void stubLanguageModel("maybe")],
    ["availability() rejects", () => void vi.stubGlobal("LanguageModel", { availability: async () => Promise.reject(new Error("boom")) })],
    ["availability is missing", () => void vi.stubGlobal("LanguageModel", {})],
    ["LanguageModel is set to undefined", () => void vi.stubGlobal("LanguageModel", undefined)],
  ];
  for (const [label, setup] of cases) {
    for (const name of ["structure", "propose", "draft", "rewrite"] as const) {
      it(`${label}: ${name} refuses, zero fetch calls`, async () => {
        setup();
        const w = await wrappers();
        await expect(w[name]()).rejects.toBeInstanceOf(DeviceModelAbsentError);
        expect(fetchSpy).not.toHaveBeenCalled();
      });
    }
  }

  it("availability() that never answers is refused at the time limit, zero fetch calls", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("LanguageModel", { availability: () => new Promise(() => undefined) });
      const w = await wrappers();
      const out = expect(w.propose()).rejects.toBeInstanceOf(DeviceModelAbsentError);
      await vi.advanceTimersByTimeAsync(20_000);
      await out;
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the jobs, with a stale 'available' from the page and the API gone at call time", () => {
  const stale = async () => "available" as const;

  it("structure, propose-masks and the device draft end in their 'absent' failure; no request", async () => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
    const { structureSdk } = await import("../../src/firebase/structureSdk");
    const { proposeSdk } = await import("../../src/firebase/proposeSdk");
    const { draftSdk } = await import("../../src/firebase/draftSdk");
    const structure = makeStructureJob({ sdk: structureSdk, state: stale });
    const propose = makeProposeMasksJob({ sdk: proposeSdk, state: stale });
    const draft = makeDraftJob({ sdk: draftSdk, state: stale });
    await expect(structure.run({ noteText: NOTE })).rejects.toMatchObject({ kind: "absent" });
    await expect(structure.run({ noteText: NOTE })).rejects.toBeInstanceOf(StructureFailure);
    await expect(propose.run(NOTE)).rejects.toMatchObject({ kind: "absent" });
    await expect(propose.run(NOTE)).rejects.toBeInstanceOf(ProposeFailure);
    await expect(draft.run({} as never, { text: NOTE }, "ONLY_ON_DEVICE")).rejects.toMatchObject({ kind: "absent" });
    await expect(draft.run({} as never, { text: NOTE }, "ONLY_ON_DEVICE")).rejects.toBeInstanceOf(DraftFailure);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("countTokens", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx|js|mjs)$/.test(n) ? [p] : [];
    });
  }

  it("has no call site in src/: the SDK would send it to the cloud with no LanguageModel, so a new one needs assertDeviceUsable() first", () => {
    const hits = sourceFiles(join(__dirname, "../../src")).filter((f) => /\.countTokens\s*\(/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("the guard lets a usable device through (the device-available path)", () => {
  for (const state of ["available", "downloadable", "downloading"]) {
    it(`${state}: the guard resolves and passes the call's own expected inputs`, async () => {
      const lm = stubLanguageModel(state);
      const { assertDeviceUsable } = await import("../../src/firebase/deviceGuard");
      await expect(assertDeviceUsable(CREATE)).resolves.toBeUndefined();
      expect(lm.availability).toHaveBeenCalledWith({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  }
});
