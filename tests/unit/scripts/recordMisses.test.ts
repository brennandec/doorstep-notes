// Measurement task 10: real-browser checks that could not run are written to results/ as
// misses, with their reason, by a script. A miss is never a pass.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MISSES, recordMisses } from "../../../scripts/recordMisses";
import { readResults } from "../../../scripts/results";

const dirs: string[] = [];
const root = () => {
  const d = mkdtempSync(join(tmpdir(), "dn-misses-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("recordMisses", () => {
  it("names H2 part B and the network-drop check", () => {
    expect(MISSES.map((m) => m.name).sort()).toEqual(["draft-network-drop", "h2-part-b"]);
  });

  it("writes each as a miss with the header fields, a reason and no pass", () => {
    const r = root();
    recordMisses(r, new Date("2026-11-13T09:00:00Z"));
    for (const m of MISSES) {
      const f = readResults(m.name, r)!;
      expect(f["status"]).toBe("miss");
      expect(f["date"]).toBe("2026-11-13T09:00:00.000Z");
      expect(f["script"]).toBe("scripts/recordMisses.ts");
      expect(typeof f["browser"]).toBe("string");
      expect(String(f["reason"]).length).toBeGreaterThan(40);
      expect(String(f["reason"])).toMatch(/billing/);
    }
  });

  it("uses plain words: no banned word and no emoji", () => {
    const r = root();
    recordMisses(r);
    for (const m of MISSES) {
      const text = readFileSync(join(r, "results", `${m.name}.json`), "utf8");
      expect(text).not.toMatch(/\b(safe|anonymi[sz]ed|guaranteed|cleared)\b|private by design/i);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("never overwrites a file that is not a miss", () => {
    const r = root();
    mkdirSync(join(r, "results"));
    writeFileSync(join(r, "results", "h2-part-b.json"), JSON.stringify({ status: "pass", browser: "x" }));
    const written = recordMisses(r);
    expect(readResults("h2-part-b", r)!["status"]).toBe("pass");
    expect(written).toEqual(["draft-network-drop"]);
  });
});
