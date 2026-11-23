import { describe, expect, it } from "vitest";
import { MIN_NAME_PART_LENGTH } from "../../src/constants";
import { DEFAULT_POLICY } from "../../src/masking/policy";

describe("masking policy (masking task 12)", () => {
  it("has the defaults of the spec: near on, parts of 3 letters, proposals not accepted", () => {
    expect(DEFAULT_POLICY).toEqual({ nearMatch: true, minPartLength: 3, proposalsStartAccepted: false, source: "default" });
    expect(MIN_NAME_PART_LENGTH).toBe(3);
  });
});
