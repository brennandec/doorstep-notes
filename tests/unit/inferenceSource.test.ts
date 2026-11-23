import { InferenceSource } from "firebase/ai";
import { describe, expect, it } from "vitest";
import { SDK_SOURCE } from "../../src/inference/source";
import { SYSTEM_PROMPT } from "../../src/inference/structure/createOptions";
import { TASK_TEXT } from "../../src/inference/structure/structure.real";
import { makeProposeMasksJob } from "../../src/inference/proposeMasks/proposeMasks.real";
import { normaliseSource } from "../../src/inference/source";
import { makeStructureJob } from "../../src/inference/structure/structure.real";
import { inventedVisit } from "../../src/app/example/inventedVisit";

describe("normaliseSource (browser document, fact 1; capture-and-record task 21)", () => {
  it("compares against the SDK's own export", () => {
    expect(SDK_SOURCE).toEqual(InferenceSource);
    expect(normaliseSource(InferenceSource.ON_DEVICE)).toBe("ON_DEVICE");
    expect(normaliseSource(InferenceSource.IN_CLOUD)).toBe("IN_CLOUD");
  });
  it("does not accept upper-case text the SDK never sends", () => {
    expect(normaliseSource("ON_DEVICE")).toBeNull();
    expect(normaliseSource("IN_CLOUD")).toBeNull();
  });
  it("returns null for anything else", () => {
    expect(normaliseSource("elsewhere")).toBeNull();
    expect(normaliseSource(undefined)).toBeNull();
    expect(normaliseSource(3)).toBeNull();
  });
});

describe("the structuring prompt states the exact output wanted (browser fact 5)", () => {
  const fields = ["visitDate", "present", "seen", "agreed", "risks", "nextSteps"];
  it("system prompt names every field and asks for JSON only", () => {
    for (const f of fields) expect(SYSTEM_PROMPT).toContain(f);
    expect(SYSTEM_PROMPT).toMatch(/JSON only/);
  });
  it("the task text repeats the output wanted, so a bare request never goes to the model", () => {
    expect(TASK_TEXT).toMatch(/JSON/);
    expect(TASK_TEXT).toMatch(/only the record/i);
    for (const f of fields) expect(TASK_TEXT).toContain(f);
  });
});

describe("device jobs accept the SDK's real source string", () => {
  const available = async () => "available" as const;
  it("structure job", async () => {
    const job = makeStructureJob({
      sdk: { generate: async () => ({ text: JSON.stringify(inventedVisit.preparedRecord), inferenceSource: "on_device" }) },
      state: available,
    });
    expect((await job.run({ noteText: "x" })).inferenceSource).toBe("ON_DEVICE");
  });
  it("propose-masks job", async () => {
    const job = makeProposeMasksJob({
      sdk: { generate: async () => ({ text: JSON.stringify({ candidates: [] }), inferenceSource: "on_device" }) },
      state: available,
    });
    expect((await job.run("x")).inferenceSource).toBe("ON_DEVICE");
  });
  it("still discards a cloud answer", async () => {
    const job = makeStructureJob({
      sdk: { generate: async () => ({ text: "{}", inferenceSource: "in_cloud" }) },
      state: available,
    });
    await expect(job.run({ noteText: "x" })).rejects.toMatchObject({ kind: "notOnDevice" });
  });
});
