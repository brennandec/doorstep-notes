// H11 item 2 (shell-and-offline R41.2): a spec that tests the stand-in sets it explicitly.
// The hook exists only in a build made with mode e2e. In any other build it does nothing.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { E2E_MODE, cloudSwitchFrom } from "../../src/app/testHooks";

describe("cloudSwitchFrom", () => {
  it("leaves the switch as it is when the page sets nothing", () => {
    expect(cloudSwitchFrom(E2E_MODE, {}, true)).toBe(true);
    expect(cloudSwitchFrom(E2E_MODE, {}, false)).toBe(false);
  });

  it("in the e2e build, __cloudStandIn turns the cloud off so the test doubles answer", () => {
    expect(cloudSwitchFrom(E2E_MODE, { __cloudStandIn: true }, true)).toBe(false);
  });

  it("only the value true counts", () => {
    for (const v of ["true", 1, "yes", null, undefined, false]) expect(cloudSwitchFrom(E2E_MODE, { __cloudStandIn: v }, true)).toBe(true);
  });

  it("in any other build the hook does nothing", () => {
    for (const mode of ["production", "development", ""]) expect(cloudSwitchFrom(mode, { __cloudStandIn: true }, true)).toBe(true);
  });

  it("cannot turn the cloud on", () => {
    expect(cloudSwitchFrom(E2E_MODE, { __cloudStandIn: true }, false)).toBe(false);
  });
});

describe("the page reads the hook only behind the build mode, and the specs set it in one place", () => {
  it("main.ts reads the switch through the e2e-mode check", () => {
    const main = readFileSync("src/app/main.ts", "utf8");
    expect(main).toMatch(/import\.meta\.env\.MODE === E2E_MODE \? cloudSwitchFrom\(/);
  });

  it("every bundled spec that sets the stand-in does it with useStandIn on the e2e build", () => {
    for (const f of readdirSync("tests/e2e/bundled").filter((n) => n.endsWith(".spec.ts"))) {
      const text = readFileSync(`tests/e2e/bundled/${f}`, "utf8");
      if (!text.includes("useStandIn(")) continue;
      expect(text, `${f} sets the stand-in on a build that has no hook`).toContain('serveForFile("dist-e2e")');
    }
  });
});
