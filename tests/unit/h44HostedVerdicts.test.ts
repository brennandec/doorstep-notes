// H44 item 5: both verdicts are written on every hosted run, pass, fail or miss, at the top level and inside `verdicts`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hostedVerdictFields, type HostedDeviceHalf, type HostedRobotCheck } from "../e2e/device/hostedVerdicts";

describe("hostedVerdictFields (H44 item 5)", () => {
  const robot: HostedRobotCheck[] = ["accepted", "refused", "not run"];
  const device: HostedDeviceHalf[] = ["pass", "fail", "miss"];
  for (const r of robot) for (const d of device) {
    it(`robot ${r}, device ${d}: both verdicts are in the record, twice`, () => {
      const f = hostedVerdictFields({ robotCheck: r, deviceHalf: d });
      expect(f.robotCheck).toBe(r);
      expect(f.deviceHalf).toBe(d);
      expect(f.verdicts).toEqual({ robotCheck: r, deviceHalf: d });
    });
  }
  it("the stored 2026-11-17 failing run held its verdicts at the top level; the spec now writes them in `verdicts` on the miss path and the full path", () => {
    const stored = JSON.parse(readFileSync("results/hosted-run-2026-11-17.json", "utf8")) as Record<string, unknown>;
    expect([stored["status"], stored["robotCheck"], stored["deviceHalf"]]).toEqual(["fail", "refused", "pass"]);
    expect("verdicts" in stored).toBe(false);
    const spec = readFileSync("tests/e2e/device/hostedRun.spec.ts", "utf8");
    expect(spec.match(/\.\.\.hostedVerdictFields\(/g)?.length).toBe(3);
  });
});
