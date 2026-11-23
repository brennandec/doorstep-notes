import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkClaims, loadDisk, numberTokens, type Claim } from "../../scripts/claimsCheck";

describe("claims check", () => {
  it("is green on the pages and red on a planted number", () => {
    const disk = loadDisk(false);
    const base = checkClaims(disk.input);
    expect(base.missing).toEqual([]);
    expect(base.bad).toEqual([]);
    const first = disk.input.claims[0] as Claim;
    const content = createHash("sha256").update(readFileSync(first.runFile)).digest("hex");
    expect(first.sourceTreeHash).toBe(content);
    expect(first.sourceTreeHash).toHaveLength(64);
    const claims = [{ ...first, sourceTreeHash: "a".repeat(40) }, ...disk.input.claims.slice(1)];
    expect(checkClaims({ ...disk.input, claims }).bad).toContain(`${first.value}: hash`);
    const planted = checkClaims(loadDisk(true).input);
    expect(planted.missing).toEqual(["999001"]);
    expect(planted.bad).toEqual([]);
  });

  it("rejects an entry whose run file does not hold the value", () => {
    const disk = loadDisk(false);
    const first = disk.input.claims[0] as Claim;
    const claims = [{ ...first, value: "999001", unit: "count" }, ...disk.input.claims];
    const result = checkClaims({ ...disk.input, claims });
    expect(result.bad).toContain("999001: not in run file");
  });

  it("keeps a thousands separator from splitting a figure", () => {
    expect(numberTokens("509 of 1,141")).toEqual(["509", "1141"]);
  });
});
