// H11 item 2 (shell-and-offline R41): every bundled spec ran with the cloud switch on.
// Reads results/e2e-cloud-on-2026-11-14.json, written by the bundled run (the fixture counts each
// call to the cloud model; the reporter adds each spec's outcome). The unit test checks the file
// against the specs on disk, so a new spec with no outcome, a failing spec, or a spec that makes
// a call it does not name, fails here.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_SERVICE_ENABLED } from "../../src/constants";
import { CLOUD_CALL_BUDGET, CLOUD_PATH_SPECS, countCall, emptyLedger } from "../e2e/fixtures/cloudCalls";

const FILE = "results/e2e-cloud-on-2026-11-14.json";
// Specs added after the file was written. The file is kept as it was (H12 rule: no results file is edited), so these are not
// required in it. Each one is a no-cloud or stand-in spec; the check below keeps them out of the cloud-path list.
const ADDED_AFTER_THE_FILE = ["hitTest.spec.ts", "recordMissing.spec.ts", "h35aFlow.spec.ts", "h35bViewports.spec.ts", "h36aPageHonesty.spec.ts", "h40NoModelWalk.spec.ts", "h42SecondReaderAndFaults.spec.ts", "h43Offline.spec.ts", "h45OnlyOnDevice.spec.ts", "h52RefusalVisible.spec.ts"];
// Cloud-path specs added after the file (session H14). They count their own calls in their own results file, so the
// file of H11 is not changed, and the cap of that session's order is kept by the spec itself.
const CLOUD_ADDED_AFTER_THE_FILE = ["secondReaderLoop.spec.ts"];
// Cloud-path spec added by R17 session B item 5. It makes one call and names its count in its own file.
const CLOUD_ADDED_BY_H51G = ["h51gCloudAfterDevice.spec.ts"];
// WO-10. Stand-in, no model call. The frozen results file is not edited. The source names the model host only to abort it.
const ADDED_BY_WO10 = ["remoteConfigDefaults.spec.ts"];
const specs = readdirSync("tests/e2e/bundled").filter(
  (f) => f.endsWith(".spec.ts") && !ADDED_AFTER_THE_FILE.includes(f) && !CLOUD_ADDED_AFTER_THE_FILE.includes(f) && !CLOUD_ADDED_BY_H51G.includes(f) && !ADDED_BY_WO10.includes(f),
);
const file = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as ReturnType<typeof emptyLedger>) : null;
const src = (spec: string) => readFileSync(`tests/e2e/bundled/${spec}`, "utf8");

describe("the cloud switch is on for the run (R41.1)", () => {
  it("AI_SERVICE_ENABLED is true", () => {
    expect(AI_SERVICE_ENABLED).toBe(true);
  });
});

describe("the call counter (R41.3)", () => {
  it("a spec added after the file is not a cloud-path spec", () => {
    for (const s of ADDED_AFTER_THE_FILE) {
      expect(CLOUD_PATH_SPECS).not.toContain(s);
      expect(src(s)).not.toMatch(/firebasevertexai|generateContent/);
    }
  });

  it("counts each call against its spec and test, and refuses at the budget", () => {
    let l = emptyLedger();
    for (let i = 0; i < CLOUD_CALL_BUDGET; i++) {
      const r = countCall(l, "a.spec.ts", "t");
      expect(r.allowed).toBe(true);
      l = r.ledger;
    }
    expect(l.total).toBe(CLOUD_CALL_BUDGET);
    expect(l.specs["a.spec.ts"]!.calls).toBe(CLOUD_CALL_BUDGET);
    const over = countCall(l, "a.spec.ts", "t");
    expect(over.allowed).toBe(false);
    expect(over.ledger.total).toBe(CLOUD_CALL_BUDGET);
    expect(over.ledger.stoppedAtBudget).toBe(true);
  });

  it("the loop spec added by H14 counts its own calls and stops at its cap", () => {
    for (const s of CLOUD_ADDED_AFTER_THE_FILE) {
      expect(CLOUD_PATH_SPECS).not.toContain(s);
      expect(src(s)).toMatch(/generateContentCalls/);
      expect(src(s)).toMatch(/CALLS_THIS_RUN\s*=\s*2/);
    }
  });

  it("the H51g spec counts its own call, stops at one and never passes without the config", () => {
    for (const s of CLOUD_ADDED_BY_H51G) {
      expect(CLOUD_PATH_SPECS).not.toContain(s);
      expect(src(s)).toMatch(/generateContentCalls/);
      expect(src(s)).toMatch(/CALLS_THIS_RUN\s*=\s*1/);
      expect(src(s)).toMatch(/throw new Error\("The local Firebase config file is not in the project root\."\)/);
    }
  });

  it("the budget is the owner's forty", () => {
    expect(CLOUD_CALL_BUDGET).toBe(40);
  });

  it("the fetched-settings spec aborts the model host and spends no call", () => {
    for (const s of ADDED_BY_WO10) {
      expect(CLOUD_PATH_SPECS).not.toContain(s);
      expect(src(s)).toContain("useStandIn(");
      expect(src(s)).toContain('serveForFile("dist-e2e")');
      expect(src(s)).not.toMatch(/generateContent/);
      expect(src(s)).toMatch(/firebasevertexai/);
      expect(src(s)).toMatch(/route\.abort\(\)/);
    }
  });
});

describe("each bundled spec is in the results file with an outcome and a count (R41.4)", () => {
  it("the results file exists", () => {
    expect(file, `${FILE} is written by the bundled run`).not.toBeNull();
  });

  it("names every spec on disk, and every one passed", () => {
    expect(file).not.toBeNull();
    for (const spec of specs) {
      const entry = file!.specs[spec];
      expect(entry, `${spec} is not in the results file`).toBeDefined();
      expect(entry!.outcome, `${spec} did not pass`).toBe("passed");
      expect(typeof entry!.calls).toBe("number");
    }
  });

  it("the total is the sum of the specs, and is within the budget; the run was not stopped", () => {
    expect(file).not.toBeNull();
    const sum = Object.values(file!.specs).reduce((n, s) => n + s.calls, 0);
    expect(file!.total).toBe(sum);
    expect(file!.total).toBeLessThanOrEqual(CLOUD_CALL_BUDGET);
    expect(file!.budget).toBe(CLOUD_CALL_BUDGET);
    expect(file!.stoppedAtBudget).toBe(false);
  });

  it("a spec outside the cloud-path list made no call to the cloud model", () => {
    expect(file).not.toBeNull();
    for (const spec of specs) {
      if (CLOUD_PATH_SPECS.includes(spec)) continue;
      expect(file!.specs[spec]?.calls, `${spec} called the cloud model but is not a cloud-path spec`).toBe(0);
    }
  });

  it("a cloud-path spec made at least one call and says so in its own file", () => {
    expect(file).not.toBeNull();
    for (const spec of CLOUD_PATH_SPECS) {
      expect(specs).toContain(spec);
      expect(file!.specs[spec]!.calls, spec).toBeGreaterThan(0);
      expect(src(spec), `${spec} must read the count of its calls`).toMatch(/seen\.length|callCount|calls/);
    }
  });

  it("a spec that tests the stand-in sets it explicitly", () => {
    expect(file).not.toBeNull();
    for (const spec of specs) {
      const entry = file!.specs[spec]!;
      if (entry.kind === "stand-in") expect(src(spec), spec).toContain("useStandIn(");
      if (src(spec).includes("useStandIn(")) expect(entry.kind, spec).toBe("stand-in");
    }
  });
});
