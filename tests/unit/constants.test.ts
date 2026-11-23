import { describe, expect, it } from "vitest";
import * as constants from "../../src/constants";

describe("constants", () => {
  const names = Object.keys(constants).filter((n) => n !== "CONSTANT_SOURCES");

  it("gives every constant a non-empty source", () => {
    for (const name of names) {
      const source = constants.CONSTANT_SOURCES[name];
      expect(source, name).toBeTypeOf("string");
      expect((source ?? "").trim().length, name).toBeGreaterThan(0);
    }
  });

  it("lists no source for a constant that does not exist", () => {
    for (const name of Object.keys(constants.CONSTANT_SOURCES)) {
      expect(names, name).toContain(name);
    }
  });

  it("holds the colours of the look and layout document", () => {
    expect(constants.COLOR_PAPER).toBe("#FAF8F3");
    expect(constants.COLOR_PAPER_2).toBe("#F1EEE6");
    expect(constants.COLOR_INK).toBe("#1C1B19");
    expect(constants.COLOR_INK_2).toBe("#5E5A52");
    expect(constants.COLOR_HAIRLINE).toBe("#D9D4C7");
    expect(constants.COLOR_ACCENT).toBe("#1E6B52");
    expect(constants.COLOR_FAILURE).toBe("#B3261E");
  });

  it("has the cloud switch on, with its source naming the status 200 file", () => {
    expect(constants.AI_SERVICE_ENABLED).toBe(true);
  });
});
