// Drafting task 4 (R1.2): the cloud model name is always set explicitly,
// with a default in code (sdk-facts 27, 28, difference 1).
import { describe, expect, it } from "vitest";
import { DEFAULT_CLOUD_MODEL } from "../../src/constants";
import { cloudModelName } from "../../src/inference/config";

describe("cloudModelName", () => {
  it("uses the value given, trimmed", () => {
    expect(cloudModelName({ cloudModel: " model-given " })).toBe("model-given");
  });

  it("falls back to the default for nothing, empty, blank or the wrong type", () => {
    for (const bad of [undefined, null, {}, { cloudModel: "" }, { cloudModel: "   " }, { cloudModel: 3 as never }]) {
      expect(cloudModelName(bad as never)).toBe(DEFAULT_CLOUD_MODEL);
    }
  });

  it("has a default that is the documented one", () => {
    expect(DEFAULT_CLOUD_MODEL).toBe("gemini-3.5-flash-lite");
  });
});
