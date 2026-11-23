// H03: the handwriting fixture and its printed twin. Invented people only.
// The unit tests cover the files and the shape of the call through src/firebase/structureSdk.ts.
// What the device model does with them is the real-browser check tests/e2e/device/handwriting.spec.ts.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubLanguageModel } from "../support/languageModelStandIn";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeStructureJob, type StructureCall } from "../../src/inference/structure/structure.real";

const DIR = "tests/fixtures/handwriting";

interface FixtureEntry { file: string; mimeType: string; width: number; height: number; sha256: string; how: string }
interface Manifest {
  invented: boolean;
  note: string;
  people: string[];
  lines: string[];
  handwriting: FixtureEntry;
  printed: FixtureEntry;
}

const manifest = JSON.parse(readFileSync(`${DIR}/manifest.json`, "utf8")) as Manifest;
const bytes = (e: FixtureEntry) => readFileSync(`${DIR}/${e.file}`);

/** Width and height from the IHDR chunk, and whether the chunks end with IEND. */
function readPng(b: Buffer): { signature: boolean; width: number; height: number; endsWithIend: boolean; firstChunk: string } {
  const signature = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return {
    signature,
    firstChunk: b.subarray(12, 16).toString("ascii"),
    width: b.readUInt32BE(16),
    height: b.readUInt32BE(20),
    endsWithIend: b.subarray(b.length - 8, b.length - 4).toString("ascii") === "IEND",
  };
}

describe("the manifest", () => {
  it("says the people are invented and lists the words on the page", () => {
    expect(manifest.invented).toBe(true);
    expect(manifest.people.length).toBeGreaterThanOrEqual(2);
    expect(manifest.lines.length).toBeGreaterThanOrEqual(4);
    expect(manifest.note).toBe(manifest.lines.join("\n"));
  });

  it("names nobody who is on the invented visit's client list", () => {
    const list = inventedVisit.clientList.toLowerCase();
    for (const person of manifest.people) {
      for (const part of person.split(/[\s-]+/)) expect(list.includes(part.toLowerCase()), `${part} is on the invented visit's list`).toBe(false);
    }
  });

  it("writes every invented person's name on the page", () => {
    for (const person of manifest.people) expect(manifest.note).toContain(person);
  });

  it("holds no year, so the page gives the model nothing to complete", () => {
    expect(manifest.note).not.toMatch(/\b(19|20)\d{2}\b/);
  });

  it("describes the handwriting file as a handwriting typeface and does not call it a person's own hand", () => {
    expect(manifest.handwriting.how).toMatch(/typeface/i);
    expect(manifest.handwriting.how).toMatch(/not a person's own hand/i);
  });
});

describe("the two picture files", () => {
  for (const kind of ["handwriting", "printed"] as const) {
    it(`${kind}: a valid PNG of the size the manifest gives, with the hash the manifest gives`, () => {
      const entry = manifest[kind];
      const b = bytes(entry);
      const png = readPng(b);
      expect(entry.mimeType).toBe("image/png");
      expect(png.signature).toBe(true);
      expect(png.firstChunk).toBe("IHDR");
      expect(png.endsWithIend).toBe(true);
      expect(png.width).toBe(entry.width);
      expect(png.height).toBe(entry.height);
      expect(createHash("sha256").update(b).digest("hex")).toBe(entry.sha256);
    });

    it(`${kind}: small enough to sit inside the device model's context window with the schema`, () => {
      // The token limit file measured one 900 by 260 picture. These pages are of the same order.
      expect(bytes(manifest[kind]).length).toBeLessThan(400_000);
      expect(bytes(manifest[kind]).length).toBeGreaterThan(5_000);
    });
  }

  it("the handwriting is not the printed page: different bytes, different hash, same words", () => {
    expect(manifest.handwriting.sha256).not.toBe(manifest.printed.sha256);
    expect(bytes(manifest.handwriting).equals(bytes(manifest.printed))).toBe(false);
    expect(manifest.handwriting.file).not.toBe(manifest.printed.file);
    expect(manifest.printed.how).toMatch(/printed/i);
    expect(manifest.printed.how).not.toMatch(/handwriting typeface/i);
  });

  it("both pictures are the same size, so only the hand differs", () => {
    expect([manifest.handwriting.width, manifest.handwriting.height]).toEqual([manifest.printed.width, manifest.printed.height]);
  });
});

// ---- the call through src/firebase/structureSdk.ts ---------------------------------------------------------

const seen: { options: Record<string, unknown>; parts: unknown[] }[] = [];
let sourceToReturn = "on_device";

vi.mock("firebase/app", () => ({ initializeApp: (o: unknown, name?: string) => ({ name, options: o }), getApps: () => [] }));
vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  InferenceMode: { ONLY_ON_DEVICE: "only_on_device", PREFER_ON_DEVICE: "prefer_on_device" },
  getAI: (app: unknown) => ({ app }),
  getGenerativeModel: (_service: unknown, options: Record<string, unknown>) => ({
    generateContent: async (parts: unknown[]) => {
      seen.push({ options, parts });
      return { response: { text: () => JSON.stringify({ visitDate: "", present: [], seen: [], agreed: [], risks: [], nextSteps: [] }), inferenceSource: sourceToReturn } };
    },
  }),
}));

describe("the handwriting fixture through the photo path of structureSdk", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    seen.length = 0;
    sourceToReturn = "on_device";
    fetchSpy = vi.fn(() => Promise.reject(new TypeError("no network in this test")));
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    stubLanguageModel();
  });

  async function run(kind: "handwriting" | "printed") {
    const { structureSdk } = await import("../../src/firebase/structureSdk");
    const calls: StructureCall[] = [];
    const sdk = { generate: (c: StructureCall) => (calls.push(c), structureSdk.generate(c)) };
    const job = makeStructureJob({ sdk, state: async () => "available" });
    const base64 = bytes(manifest[kind]).toString("base64");
    const result = await job.run({ noteText: "", photo: { mimeType: "image/png", base64 } });
    return { result, call: calls[0]!, base64 };
  }

  it("sends the file's own bytes as one inline PNG part, after the task text, ONLY_ON_DEVICE", async () => {
    const { call, base64 } = await run("handwriting");
    expect(call.mode).toBe("ONLY_ON_DEVICE");
    expect(call.parts).toHaveLength(2);
    expect(call.parts[0]).toHaveProperty("text");
    expect(call.parts[1]).toEqual({ inlineData: { data: base64, mimeType: "image/png" } });
    // What the SDK received is the same two parts and the device-only mode.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.options["mode"]).toBe("only_on_device");
    expect(seen[0]!.parts[1]).toEqual({ inlineData: { data: base64, mimeType: "image/png" } });
    expect(JSON.stringify(seen[0]!.parts)).not.toMatch(/"url"|fileData/);
  });

  it("declares image input in the create options, because a photo is attached", async () => {
    await run("handwriting");
    const create = (seen[0]!.options["onDeviceParams"] as { createOptions: { expectedInputs: { type: string }[] } }).createOptions;
    expect(create.expectedInputs.map((i) => i.type)).toEqual(["text", "image"]);
  });

  it("the handwriting and the printed page reach the SDK as different image data", async () => {
    const a = await run("handwriting");
    seen.length = 0;
    const b = await run("printed");
    expect(a.base64).not.toBe(b.base64);
    expect((a.call.parts[1] as { inlineData: { data: string } }).inlineData.data).toBe(a.base64);
    expect((b.call.parts[1] as { inlineData: { data: string } }).inlineData.data).toBe(b.base64);
  });

  it("a record from the device is labelled ON_DEVICE, and one the SDK says came from the cloud is discarded", async () => {
    const ok = await run("handwriting");
    expect(ok.result.inferenceSource).toBe("ON_DEVICE");
    sourceToReturn = "in_cloud";
    await expect(run("handwriting")).rejects.toMatchObject({ kind: "notOnDevice" });
  });

  it("makes no request of its own", async () => {
    await run("handwriting");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
