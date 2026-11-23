import { describe, expect, it } from "vitest";
import { standingStatements } from "../../src/app/standing";
import { strings } from "../../src/app/strings";

const none = () => undefined;
const partBPass = (name: string) => (name === "h2-part-b" ? { status: "pass" as const } : undefined);
const partBFail = (name: string) => (name === "h2-part-b" ? { status: "fail" as const } : undefined);

describe("standing statements", () => {
  it("always carries the writing-aid line", () => {
    const s = standingStatements({ results: none, aiServiceEnabled: false, tier: "no-cost" });
    expect(s.writingAid).toBe("A writing aid with an egress check on listed names. Unlisted details can still identify a person.");
  });

  it("says not yet checked against the real service without a part B file", () => {
    const s = standingStatements({ results: none, aiServiceEnabled: false, tier: "no-cost" });
    expect(s.h2Line).toBe("Not yet checked against the real service.");
  });

  it("keeps the line when part B failed, drops it when part B passed", () => {
    expect(standingStatements({ results: partBFail, aiServiceEnabled: false, tier: "no-cost" }).h2Line).not.toBeNull();
    expect(standingStatements({ results: partBPass, aiServiceEnabled: false, tier: "no-cost" }).h2Line).toBeNull();
  });

  it("says the cloud is off while the service is off, and the no-cost warning only on the no-cost tier", () => {
    const paid = standingStatements({ results: none, aiServiceEnabled: false, tier: "paid" });
    expect(paid.cloudLines).toEqual([strings.standing.cloudNotConnected]);
    const noCost = standingStatements({ results: none, aiServiceEnabled: false, tier: "no-cost" });
    expect(noCost.cloudLines).toContain(strings.standing.cloudNotConnected);
    expect(noCost.cloudLines).toContain(strings.standing.tierNoCostWarning);
  });

  it("shows the tier once the service is enabled", () => {
    const noCost = standingStatements({ results: none, aiServiceEnabled: true, tier: "no-cost" });
    expect(noCost.cloudLines[0]).toBe("Cloud tier: no-cost.");
    expect(noCost.cloudLines).toContain(strings.standing.tierNoCostWarning);
    expect(noCost.cloudLines).not.toContain(strings.standing.cloudNotConnected);
    const paid = standingStatements({ results: none, aiServiceEnabled: true, tier: "paid" });
    expect(paid.cloudLines).toEqual(["Cloud tier: paid."]);
  });
});
