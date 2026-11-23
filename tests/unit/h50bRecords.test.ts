// H50b: hybridRun's records never take a name another spec wrote earlier in the same run (h4Offline writes h4),
// and the two run-on-purpose device checks skip with their reason in a whole-suite run instead of failing.
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newRecordPath, nextRecordSuffix, writeNewRecord, writeRecord } from "../e2e/fixtures/records";

describe("H50b record names", () => {
  it("a record written earlier in this run is free for writeRecord, and not free when the caller asks for a fresh name", () => {
    const root = mkdtempSync(join(tmpdir(), "h50b-"));
    try {
      mkdirSync(join(root, "results"));
      writeRecord("h4", { status: "pass" }, root, "h20");
      expect(nextRecordSuffix("h4", "h20", root)).toBe("h20");
      expect(nextRecordSuffix("h4", "h20", root, true)).toBe("h20-2");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the fresh name can be written with writeNewRecord, where the old name throws", () => {
    const root = mkdtempSync(join(tmpdir(), "h50b-"));
    try {
      mkdirSync(join(root, "results"));
      writeRecord("h4", { status: "pass" }, root, "h20");
      expect(() => writeNewRecord(newRecordPath("h4", root, nextRecordSuffix("h4", "h20", root)), { status: "miss" })).toThrow(/never overwritten/);
      expect(() => writeNewRecord(newRecordPath("h4", root, nextRecordSuffix("h4", "h20", root, true)), { status: "miss" })).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("hybridRun asks for fresh names", () => {
    expect(readFileSync("tests/e2e/device/hybridRun.spec.ts", "utf8")).toContain("nextRecordSuffix(name, SUFFIX, undefined, true)");
  });

  it("offlinePress and filmStoryTake skip, with the input they need, when it is not set", () => {
    expect(readFileSync("tests/e2e/device/offlinePress.spec.ts", "utf8")).toMatch(/test\.skip\(run === undefined \|\| run === "", 'H29_RUN is not set/);
    expect(readFileSync("tests/e2e/device/filmStoryTake.spec.ts", "utf8")).toMatch(/test\.skip\(!\(process\.env\["DOORSTEP_FILM_RAW_DIR"\] \?\? ""\)\.trim\(\), "DOORSTEP_FILM_RAW_DIR is not set/);
  });
});
