// Shell-and-offline task 45 (R25.1 to R25.3, direction X7): the honesty rules are unchanged after the third review.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as constants from "../../src/constants";
import { flattenStrings, strings } from "../../src/app/strings";

describe("the cloud half is connected, with no billing step by a build session (R25.1, changed 2026-11-14)", () => {
  it("has AI_SERVICE_ENABLED on, only because a result file records status 200, and no billing decision file", () => {
    expect(constants.AI_SERVICE_ENABLED).toBe(true);
    expect((JSON.parse(readFileSync("results/cloud-draft-2026-11-14.json", "utf8")) as { status?: number }).status).toBe(200);
    const billing = existsSync("docs/decisions") && readdirSync("docs/decisions").some((n) => /billing/i.test(n));
    expect(billing).toBe(false);
  });
  it("still says 'off' for a cloud result", () => {
    const all = flattenStrings(strings).join("\n");
    expect(all).toContain("cloud off");
    expect(all).toMatch(/not yet checked against the real service/i);
  });
});

describe("the new screen text is in the string table (R25.2)", () => {
  const BANNED = /\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i;
  const all = flattenStrings(strings);
  it("holds the words the folded record fields use: Edit, Fold and the six field labels", () => {
    expect(strings.fold.edit).toBe("Edit");
    expect(strings.fold.close).toBe("Fold");
    expect(Object.values(strings.recordFields)).toEqual(["Date", "Present", "Seen", "Agreed", "Risks", "Next steps"]);
  });
  it("holds no banned word and no emoji", () => {
    for (const s of all) {
      expect(s).not.toMatch(BANNED);
      expect(/\p{Extended_Pictographic}/u.test(s)).toBe(false);
    }
  });
});

describe("no target changes (R25.3)", () => {
  it("keeps the fixed numbers", () => {
    expect(constants.COLD_START_LIMIT_S).toBe(60);
    expect(constants.DEVICE_TOKEN_LIMIT).toBe(9216);
    expect(constants.SYNTHETIC_SET_SIZE).toBe(200);
    expect(constants.INVENTED_LIST_SIZE).toBe(12);
    expect(constants.MIN_NAME_PART_LENGTH).toBe(3);
    expect(constants.NEAR_MATCH_MIN_LETTERS).toBe(5);
  });
});
