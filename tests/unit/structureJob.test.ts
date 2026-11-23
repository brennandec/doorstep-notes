import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeKit, type FirebaseDeps } from "../../src/inference";
import { makeStructureJob, StructureFailure, TASK_TEXT, type StructureCall, type StructureSdk } from "../../src/inference/structure/structure.real";
import { VISIT_RECORD_SCHEMA } from "../../src/inference/structure/structure.schema";
import { strings } from "../../src/app/strings";

const record = inventedVisit.preparedRecord;
const good = (over: Partial<{ text: string; inferenceSource: string }> = {}) =>
  ({ text: JSON.stringify(record), inferenceSource: "on_device", ...over });

function fakeSdk(reply: () => Promise<{ text: string; inferenceSource: string }>) {
  const generate = vi.fn((_call: StructureCall) => reply());
  return { sdk: { generate } as StructureSdk, generate };
}
const available = async () => "available" as const;

describe("structure job, real implementation", () => {
  it("is ONLY_ON_DEVICE and asks the SDK for that mode with the schema as the response constraint", async () => {
    const { sdk, generate } = fakeSdk(async () => good());
    const job = makeStructureJob({ sdk, state: available });
    expect(job.mode).toBe("ONLY_ON_DEVICE");
    const r = await job.run({ noteText: inventedVisit.note });
    expect(r.inferenceSource).toBe("ON_DEVICE");
    expect(r.connected).toBe(true);
    expect(r.value).toEqual(record);
    const call = generate.mock.calls[0]![0];
    expect(call.mode).toBe("ONLY_ON_DEVICE");
    expect(call.promptOptions).toEqual({ responseConstraint: VISIT_RECORD_SCHEMA });
    expect(call.createOptions.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(call.parts).toEqual([{ text: expect.stringContaining("Maria O-R") }]);
  });
  it("sends a photo as an inline part after the text, and declares image input", async () => {
    const { sdk, generate } = fakeSdk(async () => good());
    await makeStructureJob({ sdk, state: available }).run({
      noteText: "",
      photo: { mimeType: "image/png", base64: "iVBORw==" },
    });
    const call = generate.mock.calls[0]![0];
    expect(call.createOptions.expectedInputs).toEqual([{ type: "text", languages: ["en"] }, { type: "image" }]);
    expect(call.parts[1]).toEqual({ inlineData: { data: "iVBORw==", mimeType: "image/png" } });
    expect(typeof (call.parts[0] as { text: string }).text).toBe("string");
  });
  it("discards an IN_CLOUD result and says so", async () => {
    const { sdk } = fakeSdk(async () => good({ inferenceSource: "in_cloud" }));
    const err = await makeStructureJob({ sdk, state: available }).run({ noteText: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(StructureFailure);
    expect(err.kind).toBe("notOnDevice");
    expect(err.line).toBe(strings.record.notOnDevice);
    expect(err.partial).toBeUndefined();
  });
  it("keeps partial text and says the record was not clean when the reply fails the check", async () => {
    const { sdk } = fakeSdk(async () => ({ text: JSON.stringify({ visitDate: "2026-11-12", seen: "not a list" }), inferenceSource: "on_device" }));
    const err = await makeStructureJob({ sdk, state: available }).run({ noteText: "x" }).catch((e) => e);
    expect(err.kind).toBe("notClean");
    expect(err.line).toBe("The device could not make a clean record. You can edit it by hand.");
    expect(err.partial).toEqual({ visitDate: "2026-11-12" });
  });
  it("treats a reply that is not JSON as not clean", async () => {
    const { sdk } = fakeSdk(async () => ({ text: "Sorry, I cannot.", inferenceSource: "on_device" }));
    const err = await makeStructureJob({ sdk, state: available }).run({ noteText: "x" }).catch((e) => e);
    expect(err.kind).toBe("notClean");
  });
  it("maps the model's length error to the length line", async () => {
    const quota = Object.assign(new Error("too much"), { name: "QuotaExceededError", requested: 12000, contextWindow: 9216 });
    const { sdk } = fakeSdk(async () => { throw quota; });
    const err = await makeStructureJob({ sdk, state: available }).run({ noteText: "x" }).catch((e) => e);
    expect(err.kind).toBe("tooLong");
    expect(err.line).toBe("This note is too long for the device model. Split it into two parts.");
  });
  it("reports another SDK error as a failed record, not as a length problem", async () => {
    const { sdk } = fakeSdk(async () => { throw new Error("boom"); });
    const err = await makeStructureJob({ sdk, state: available }).run({ noteText: "x" }).catch((e) => e);
    expect(err.kind).toBe("failed");
    expect(err.line).toBe(strings.record.failed);
  });
  it("does not call the SDK when the model is unavailable", async () => {
    const { sdk, generate } = fakeSdk(async () => good());
    const err = await makeStructureJob({ sdk, state: async () => "unavailable" }).run({ noteText: "x" }).catch((e) => e);
    expect(err.kind).toBe("absent");
    expect(generate).not.toHaveBeenCalled();
  });
  it("waits while the model downloads, reports waiting, and is not a failure", async () => {
    let finish!: (v: { text: string; inferenceSource: string }) => void;
    const { sdk, generate } = fakeSdk(() => new Promise((r) => { finish = r; }));
    const waiting = vi.fn();
    const settled = vi.fn();
    const p = makeStructureJob({ sdk, state: async () => "downloading", onWaiting: waiting }).run({ noteText: "x" });
    void p.then(settled, settled);
    await new Promise((r) => setTimeout(r, 10));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(waiting).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    finish(good());
    expect((await p).value).toEqual(record);
  });
});

describe("the job is chosen by the device state alone (ruling 23)", () => {
  const real = { structure: makeStructureJob({ sdk: { generate: async () => good() }, state: available }) } as unknown as FirebaseDeps["real"];
  const deps: FirebaseDeps = { real };
  it("is real when the device is available and the cloud switch is off", () => {
    const kit = makeKit({ device: "available", cloud: false }, deps);
    expect(kit.plan.structure).toBe("real");
    expect(kit.structure).toBe(real.structure);
  });
  it("is absent, not a double, in every other state", () => {
    for (const device of ["unavailable", "downloadable", "downloading"] as const) {
      for (const cloud of [false, true]) {
        const kit = makeKit({ device, cloud }, deps);
        expect(kit.plan.structure).toBe("absent");
        expect(kit.structure).not.toBe(real.structure);
      }
    }
  });
});

describe("the structure job marks a record that came from the model (H24)", () => {
  it("resolves with fromModel true on a clean reply", async () => {
    const { sdk } = fakeSdk(async () => good());
    const r = await makeStructureJob({ sdk, state: available }).run({ noteText: inventedVisit.note });
    expect((r as { fromModel?: true }).fromModel).toBe(true);
    expect(r.value).toEqual(record);
  });
  it("still throws on every failure path", async () => {
    const kinds: [string, () => Promise<{ text: string; inferenceSource: string }>][] = [
      ["notOnDevice", async () => good({ inferenceSource: "in_cloud" })],
      ["notClean", async () => ({ text: "Sorry, I cannot.", inferenceSource: "on_device" })],
      ["failed", async () => { throw new Error("boom"); }],
    ];
    for (const [kind, reply] of kinds) {
      const { sdk } = fakeSdk(reply);
      const err = await makeStructureJob({ sdk, state: available }).run({ noteText: "x" }).catch((e) => e);
      expect(err, kind).toBeInstanceOf(StructureFailure);
      expect(err.kind).toBe(kind);
    }
    const { sdk } = fakeSdk(async () => good());
    const absent = await makeStructureJob({ sdk, state: async () => "unavailable" as const }).run({ noteText: "x" }).catch((e) => e);
    expect(absent.kind).toBe("absent");
  });
  it("sends the task text and the note as the one part, as before", async () => {
    const { sdk, generate } = fakeSdk(async () => good());
    await makeStructureJob({ sdk, state: available }).run({ noteText: inventedVisit.note });
    expect(generate.mock.calls[0]![0].parts).toEqual([{ text: TASK_TEXT + inventedVisit.note }]);
  });

  it("drops absent clients and front-desk contacts from present on missed-visit / no-answer notes (H42b)", async () => {
    const missedReply = JSON.stringify({
      visitDate: "06/01",
      present: [
        { label: "Beatrice Delacroix", role: "client" },
        { label: "Marta Adeyemi", role: "other" },
      ],
      seen: ["Flat 25, curtains shut"],
      agreed: [],
      risks: [],
      nextSteps: ["Rang twice, no answer", "Left a card"],
    });
    const missedNote =
      "Missed appt 06/01. Client: Beatrice Delacroix.\n" +
      "Beatrice Delacroix did not attend. Rang twice, no answer.\n" +
      "Went to Flat 25, curtains shut, left a card.\n" +
      "Spoke to Marta Adeyemi at the front desk.";
    const { sdk } = fakeSdk(async () => ({ text: missedReply, inferenceSource: "on_device" }));
    const r = await makeStructureJob({ sdk, state: available }).run({ noteText: missedNote });
    expect(r.value.present).toEqual([]);
  });

  it("drops front-desk contacts from present even when only Missed appt and curtains shut cues appear (H42b)", async () => {
    const missedReply = JSON.stringify({
      visitDate: "13/06",
      present: [{ label: "Eilidh", role: "other" }],
      seen: [],
      agreed: [],
      risks: [],
      nextSteps: ["Missed appt", "Went to Flat 23, curtains shut, left a card"],
    });
    const missedNote =
      "Missed appt 13/06. Client: Nicolas Ashworth.\n" +
      "Spoke to Eilidh at the front desk.\n" +
      "Went to Flat 23, curtains shut, left a card.";
    const { sdk } = fakeSdk(async () => ({ text: missedReply, inferenceSource: "on_device" }));
    const r = await makeStructureJob({ sdk, state: available }).run({ noteText: missedNote });
    expect(r.value.present).toEqual([]);
  });
});
