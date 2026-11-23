// H20 R8 and R9: a real-browser check never overwrites a recorded result and never writes a screen it was not given.
// Reads the sources of the checks; runs no browser. Invented people only.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { screensProblems } from "../../scripts/screens";
import { newRecordPath, readNewestRecord, writeRecord } from "../e2e/fixtures/records";
import { CLOUD_CALLS_FILE } from "../e2e/fixtures/cloudCalls";

const specs = ["bundled", "device"].flatMap((d) => readdirSync(`tests/e2e/${d}`).filter((f) => f.endsWith(".spec.ts")).map((f) => `tests/e2e/${d}/${f}`));
const src = (f: string) => readFileSync(f, "utf8");
const noComments = (t: string) => t.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("no check writes a fixed results file (H20 R8)", () => {
  it("has specs to look at", () => {
    expect(specs.length).toBeGreaterThan(20);
  });

  for (const f of specs) {
    it(`${f} names no fixed results file`, () => {
      const code = noComments(src(f));
      // A literal results/<name>.json, with or without a date, is a fixed name. A dated name is made by newRecordPath.
      expect(code.match(/["'`]results\/[a-z0-9-]+\.json["'`]/g) ?? []).toEqual([]);
      expect(code).not.toMatch(/writeFileSync\(\s*(RESULT_FILE|FILE)\b/);
    });
  }

  it("writeResult writes a new dated record and never an existing file", () => {
    const code = noComments(src("tests/e2e/fixtures/deviceModel.ts"));
    expect(code).not.toMatch(/join\(dir, `\$\{name\}\.json`\)/);
    expect(code).toMatch(/writeRecord\(/);
  });

  it("the ledger of real cloud calls is not the file of an earlier session", () => {
    expect(CLOUD_CALLS_FILE).not.toBe("results/e2e-cloud-on-2026-11-14.json");
    expect(CLOUD_CALLS_FILE).not.toBe("results/e2e-cloud-on-2026-11-14-h20.json");
    expect(CLOUD_CALLS_FILE).toMatch(/^results\/e2e-cloud-on-\d{4}-\d{2}-\d{2}-h23\.json$/);
  });

  it("results/h2-part-a.json is byte for byte as committed", () => {
    let committed: Buffer | null = null;
    try {
      committed = execFileSync("git", ["show", "HEAD:results/h2-part-a.json"], { maxBuffer: 1 << 24 });
    } catch {
      committed = null;
    }
    if (committed === null) return;
    expect(readFileSync("results/h2-part-a.json").equals(committed)).toBe(true);
  });
});

describe("the record helper (H20 R8)", () => {
  const root = mkdtempSync(join(tmpdir(), "doorstep-records-"));
  mkdirSync(join(root, "results"));

  it("names results/<name>-<date>-h20.json", () => {
    expect(newRecordPath("h2-part-a", root)).toMatch(/results\/h2-part-a-\d{4}-\d{2}-\d{2}-h20\.json$/);
  });

  it("refuses a file that is there, and replaces its own earlier write in the same run", () => {
    const existing = newRecordPath("one", root);
    writeFileSync(existing, "{}\n");
    expect(() => writeRecord("one", { a: 1 }, root)).toThrow(/never overwritten/);
    expect(readFileSync(existing, "utf8")).toBe("{}\n");
    const file = writeRecord("two", { a: 1 }, root);
    writeRecord("two", { a: 2 }, root);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ a: 2 });
  });

  it("reads the newest record of a kind, the old undated one when there is no dated one", () => {
    writeFileSync(join(root, "results", "kind.json"), JSON.stringify({ v: "old" }));
    expect(readNewestRecord("kind", root)).toEqual({ v: "old" });
    writeFileSync(join(root, "results", "kind-2026-11-14.json"), JSON.stringify({ v: "dated" }));
    expect(readNewestRecord("kind", root)).toEqual({ v: "dated" });
    writeFileSync(join(root, "results", "kind-2026-11-14-h20.json"), JSON.stringify({ v: "session" }));
    expect(readNewestRecord("kind", root)).toEqual({ v: "session" });
    expect(readNewestRecord("none", root)).toEqual({});
    rmSync(root, { recursive: true, force: true });
  });
});

describe("screens (H20 R9)", () => {
  const cloudSpecs = ["cloudDraft", "secondReaderReal"].map((n) => `tests/e2e/bundled/${n}.spec.ts`);

  for (const f of cloudSpecs) {
    it(`${f} writes no screen`, () => {
      const code = noComments(src(f));
      expect(code).not.toMatch(/takeScreen\(|holdScreen\(|docs\/screens/);
    });
  }

  const holdOnly = (file: string, names: string[]) => {
    const code = noComments(src(file));
    const held = [...code.matchAll(/holdScreen\(\s*page\s*,\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(held)).toEqual(new Set(names));
    for (const n of names) expect(code).toContain(`includes("${n}")`);
    expect(code).toContain("RETAKE_SCREENS");
    expect(code).not.toMatch(/page\.screenshot\(\s*\{\s*path|takeScreen\(|writeFileSync\([^)]*docs\/screens/);
  };

  it("shorterReal holds only screen 16, through holdScreen, guarded by RETAKE_SCREENS", () => {
    holdOnly("tests/e2e/bundled/shorterReal.spec.ts", ["16-shorter-real-service"]);
  });

  it("secondReaderLoop holds only screen 18, through holdScreen, guarded by RETAKE_SCREENS", () => {
    holdOnly("tests/e2e/bundled/secondReaderLoop.spec.ts", ["18-second-reader-ask-again"]);
  });

  it("h1 holds only screens 08 and 09, through holdScreen, guarded by RETAKE_SCREENS", () => {
    const code = noComments(src("tests/e2e/device/h1.spec.ts"));
    const held = [...code.matchAll(/holdScreen\(\s*page\s*,\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(held)).toEqual(new Set(["08-device-record", "09-device-masks"]));
    expect(code).toContain("RETAKE_SCREENS");
    expect(code).not.toMatch(/page\.screenshot\(|takeScreen\(|writeFileSync\([^)]*docs\/screens/);
  });

  it("screens.spec.ts holds no screenshot and names no docs/screens", () => {
    const code = noComments(src("tests/e2e/bundled/screens.spec.ts"));
    expect(code).not.toMatch(/page\.screenshot\(|docs\/screens/);
  });

  it("the hybrid run holds only screens 05 and 17, through holdScreen, guarded by RETAKE_SCREENS", () => {
    const code = noComments(src("tests/e2e/device/hybridRun.spec.ts"));
    const names = [...code.matchAll(/holdScreen\(\s*page\s*,\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(["05-finished-note", "17-second-reader-real-service"]));
    expect(code).toContain("RETAKE_SCREENS");
    for (const n of names) expect(code).toContain(`includes("${n}")`);
    expect(code).not.toMatch(/page\.screenshot\(\s*\{\s*path|writeFileSync\([^)]*docs\/screens/);
  });

  it("handwriting.spec.ts guards screen 15 with RETAKE_SCREENS", () => {
    const code = noComments(src("tests/e2e/device/handwriting.spec.ts"));
    expect(code).toContain("RETAKE_SCREENS");
    expect(code).toContain('includes("15-handwriting-record")');
  });

  it("results/screens.json may hold screens 16, 17 and 18 and still refuses an unknown name", () => {
    const entry = { date: "2030-01-01T00:00:00.000Z", browser: "Invented Chrome 1", viewport: { width: 1440, height: 900 }, scrollY: 0 };
    for (const n of ["17-second-reader-real-service", "16-shorter-real-service", "18-second-reader-ask-again"]) {
      expect(screensProblems({ screens: { [n]: entry } })).toEqual([]);
    }
    expect(screensProblems({ screens: { "99-extra": entry } })).toHaveLength(1);
  });

  it("the screens file exists", () => {
    expect(existsSync("results/screens.json")).toBe(true);
  });
});
