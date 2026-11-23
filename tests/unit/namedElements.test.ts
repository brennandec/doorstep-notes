import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { waitEnabled, waitForOneOf, waitVisible, type Probe } from "../e2e/device/named";

// Measurement R18 (session H18): a visibility check in the cut-call spec names its element, so a failure says what was missing.

const fake = (visible: boolean[], enabled: boolean[] = []): Probe => {
  let v = 0;
  let e = 0;
  return {
    isVisible: async () => visible[Math.min(v++, visible.length - 1)]!,
    isEnabled: async () => enabled[Math.min(e++, Math.max(enabled.length - 1, 0))] ?? false,
  };
};

describe("named waits (measurement R18)", () => {
  it("waitVisible resolves when the element shows", async () => {
    await expect(waitVisible(fake([false, true]), "the finished note", 500, 5)).resolves.toBeUndefined();
  });

  it("waitVisible names the element and the time when it never shows", async () => {
    await expect(waitVisible(fake([false]), "the finished note", 60, 5)).rejects.toThrow(/the finished note was not visible within 0\.06 s/);
  });

  it("waitEnabled names the element when it stays disabled", async () => {
    await expect(waitEnabled(fake([true], [false]), "the Send button", 60, 5)).rejects.toThrow(/the Send button was not enabled within 0\.06 s/);
  });

  it("waitEnabled resolves once enabled", async () => {
    await expect(waitEnabled(fake([true], [false, true]), "the Send button", 500, 5)).resolves.toBeUndefined();
  });

  it("waitForOneOf returns the name of the one that shows", async () => {
    const got = await waitForOneOf([{ name: "the finished note", locator: fake([false]) }, { name: "the error line", locator: fake([false, true]) }], 500, 5);
    expect(got).toBe("the error line");
  });

  it("waitForOneOf does not fail when two show at once; it returns the first listed", async () => {
    const got = await waitForOneOf([{ name: "the finished note", locator: fake([true]) }, { name: "the error line", locator: fake([true]) }], 500, 5);
    expect(got).toBe("the finished note");
  });

  it("waitForOneOf names every element when none shows", async () => {
    await expect(waitForOneOf([{ name: "the finished note", locator: fake([false]) }, { name: "the error line", locator: fake([false]) }], 60, 5)).rejects.toThrow(
      /none of: the finished note, the error line, was visible within 0\.06 s/,
    );
  });
});

describe("the cut-call spec uses the named waits (measurement R18)", () => {
  const source = readFileSync("tests/e2e/device/draftNetworkDrop.spec.ts", "utf8");
  it("has no bare toBeVisible or toBeEnabled", () => {
    expect(source).not.toMatch(/\.toBeVisible\(|\.toBeEnabled\(/);
  });
  it("uses the helpers", () => {
    expect(source).toMatch(/waitForOneOf\(/);
    expect(source).toMatch(/waitEnabled\(/);
  });
  it("catches an error without cutting its name off", () => {
    expect(source).not.toMatch(/split\("\\n"\)\[0\]/);
  });
});
