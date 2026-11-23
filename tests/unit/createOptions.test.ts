import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, buildAvailabilityOptions, buildCreateOptions } from "../../src/inference/structure/createOptions";

describe("create options", () => {
  it("declares text only for a typed note", () => {
    const o = buildCreateOptions({ hasPhoto: false });
    expect(o.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(JSON.stringify(o)).not.toContain("image");
  });
  it("declares text and image only when a photo is attached", () => {
    const o = buildCreateOptions({ hasPhoto: true });
    expect(o.expectedInputs).toEqual([{ type: "text", languages: ["en"] }, { type: "image" }]);
  });
  it("states English text out", () => {
    expect(buildCreateOptions({ hasPhoto: false }).expectedOutputs).toEqual([{ type: "text", languages: ["en"] }]);
  });
  it("carries the system prompt as an initialPrompts entry with role system", () => {
    const o = buildCreateOptions({ hasPhoto: false });
    expect(o.initialPrompts).toEqual([{ role: "system", content: [{ type: "text", value: SYSTEM_PROMPT }] }]);
  });
  it("asks the system prompt to leave out anything not in the note", () => {
    expect(SYSTEM_PROMPT).toMatch(/not in the note/i);
  });
  it("gives availability the same inputs and outputs as the prompt", () => {
    for (const hasPhoto of [false, true]) {
      const a = buildAvailabilityOptions({ hasPhoto });
      const c = buildCreateOptions({ hasPhoto });
      expect(a).toEqual({ expectedInputs: c.expectedInputs, expectedOutputs: c.expectedOutputs });
    }
  });
});
