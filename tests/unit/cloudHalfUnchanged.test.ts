// Shell-and-offline task 37 (R22.1 to R22.3, direction U11): the cloud half and the targets are unchanged,
// and the new words of the second review are in the string table, where the word, emoji and number audits read.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as constants from "../../src/constants";
import { flattenStrings, strings } from "../../src/app/strings";

describe("the cloud switch (R22.1)", () => {
  it("is on only while a result file records a real cloud call with status 200", () => {
    const ok = existsSync("results/cloud-draft-2026-11-14.json") && (JSON.parse(readFileSync("results/cloud-draft-2026-11-14.json", "utf8")) as { status?: number }).status === 200;
    if (constants.AI_SERVICE_ENABLED) expect(ok, "AI_SERVICE_ENABLED is true with no status 200 on file").toBe(true);
  });
  it("is on now, and no billing step was taken by a build session", () => {
    expect(constants.AI_SERVICE_ENABLED).toBe(true);
    expect(existsSync("docs/decisions") && readdirSync("docs/decisions").some((n) => /billing/i.test(n))).toBe(false);
  });
});

describe("no target changes (R22.2)", () => {
  it("keeps the four values", () => {
    expect(constants.COLD_START_LIMIT_S).toBe(60);
    expect(constants.DEVICE_TOKEN_LIMIT).toBe(9216);
    expect(constants.SYNTHETIC_SET_SIZE).toBe(200);
    expect(constants.INVENTED_LIST_SIZE).toBe(12);
  });
  it("changes the device time box only, by the owner's V7", () => {
    expect(constants.DEVICE_MEASURE_LIMIT_MIN).toBe(15);
    expect(constants.CONSTANT_SOURCES["DEVICE_MEASURE_LIMIT_MIN"]).toMatch(/V7/);
  });
});

describe("the new words are in the string table (R22.3)", () => {
  const all = flattenStrings(strings).join("\n");
  it("holds the words the second review allows and checks", () => {
    for (const word of ["assumed", "confirmed by you", "set by you", "not in your note", "guess by capital letters", "Scanned"]) {
      expect(all, word).toContain(word);
    }
  });
  it("holds the new figure lines, the two-run line and the control names", () => {
    for (const word of ["her list alone found", "not needed", "first run", "second run", "Shorter", "Plainer", "Send this name on purpose"]) {
      expect(all, word).toContain(word);
    }
  });
  it("has no digit, emoji or banned word in the figure strings", () => {
    const text = flattenStrings(strings.figures).join("\n");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(text).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
  });
  it("says 'off' for the cloud", () => {
    expect(all).toMatch(/cloud is off/i);
  });
});
