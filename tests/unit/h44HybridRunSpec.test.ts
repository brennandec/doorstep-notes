// H44 item 4: hybridRun.spec.ts masks each capital-letter guess, and its records take the next free name on every path.
// The spec itself is not run here (it opens a browser and spends cloud calls); its text and the naming rule are checked.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newRecordPath, nextRecordSuffix } from "../e2e/fixtures/records";

describe("hybridRun.spec.ts (H44 item 4)", () => {
  const spec = readFileSync("tests/e2e/device/hybridRun.spec.ts", "utf8");
  it("masks each capital-letter guess before Draft by pressing the page's own mask control", () => {
    expect(spec).toContain('page.locator("[data-likely-word]").first().click()');
    expect(spec.indexOf("[data-likely-word]")).toBeLessThan(spec.indexOf('await tap("#draft")'));
  });
  it("no path names a record from the fixed suffix alone: the miss path and the final write use the free name", () => {
    expect(spec).not.toMatch(/nextFreeRecord\([^)]*SUFFIX\)\.file|nextFreeRecord\("[^"]+", undefined, SUFFIX\)/);
    expect(spec.match(/freeRecord\(/g)?.length).toBe(4);
  });
  it("nextRecordSuffix skips an existing record: h20, then h20-2, then h20-3", () => {
    const root = mkdtempSync(join(tmpdir(), "h44-"));
    try {
      mkdirSync(join(root, "results"));
      expect(nextRecordSuffix("hybrid-run", "h20", root)).toBe("h20");
      writeFileSync(newRecordPath("hybrid-run", root, "h20"), "{}");
      expect(nextRecordSuffix("hybrid-run", "h20", root)).toBe("h20-2");
      writeFileSync(newRecordPath("hybrid-run", root, "h20-2"), "{}");
      expect(nextRecordSuffix("hybrid-run", "h20", root)).toBe("h20-3");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
