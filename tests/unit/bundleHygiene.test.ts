// H49: the built site carries committed results only and no local user path.
// Builds the production bundle into test-results/h49-prod (git ignores it) and reads every text file in it.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { blobId, bundledNames, utf8, driftRefusal, leaveOut, localPathIn, localPathsUnder, resultsDrift, resultsRefusal } from "../../scripts/bundleHygiene.ts";

const PROD = "test-results/h49-prod";
const VITE = "node_modules/vite/bin/vite.js";
// Built from parts so this file holds no machine path itself (H37c item 5 reads tests/ for them).
const MAC = ["", "Users", "someone"].join("/");
const LIN = ["", "home", "dev"].join("/");
const WIN = ["C:", "Users", "dev"].join("\\");

describe("H49 bundle hygiene", () => {
  beforeAll(() => {
    execFileSync(process.execPath, [VITE, "build", "--outDir", PROD, "--emptyOutDir"], { stdio: "pipe", timeout: 120_000, env: { ...process.env, HOSTING_BUILD: "" } });
  }, 180_000);

  it("no built file contains a local user path", () => {
    expect(localPathsUnder(PROD)).toEqual([]);
  });

  it("the scan finds a planted path, so an empty result above means something", () => {
    const dir = mkdtempSync(join(tmpdir(), "h49-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "x.js"), `const v="${MAC}/src/run.webm";`);
    expect(localPathsUnder(dir)).toEqual([`assets/x.js: ${MAC}`]);
  });

  it("knows the home folders of macOS, Linux and Windows, and leaves ordinary paths alone", () => {
    expect(localPathIn(`${MAC}/b`)).toBe(MAC);
    expect(localPathIn(`${LIN}/x`)).toBe(LIN);
    expect(localPathIn(`"${LIN}"`)).toBe(LIN);
    expect(localPathIn(`${WIN}\\x`)).toBe(WIN);
    expect(localPathIn("<local>/doorstep-film-h/raw.webm /assets/index.js /results/x.json")).toBeNull();
  });

  it("refuses a results file that is not committed or whose bytes differ from the commit", () => {
    const a = Buffer.from('{"status":"pass"}\n');
    const committed = new Map([["results/a.json", blobId(a)]]);
    expect(resultsRefusal("results/a.json", a, committed)).toBeNull();
    expect(resultsRefusal("results/b.json", a, committed)).toMatch(/not committed/);
    expect(resultsRefusal("results/a.json", Buffer.from('{"status":"fail"}\n'), committed)).toMatch(/differs/);
  });

  it("computes the same blob id as git", () => {
    const bytes = Buffer.from("hello\n");
    expect(blobId(bytes)).toBe(execFileSync("git", ["hash-object", "--stdin"], { input: bytes, encoding: "utf8" }).trim());
  });

  it("H49b: catches a home folder written with a tilde, and not a tilde inside a word or a URL", () => {
    expect(localPathIn("raw at ~/src/fieldnotes/take.webm")).toBe("~/src");
    expect(localPathIn('"dir":"~dev/src/x"')).toBe("~dev/src");
    expect(localPathIn(`C:${["", "Users", "dev", "src"].join("/")}`)).toBe(`C:${["", "Users", "dev"].join("/")}`);
    expect(localPathIn("a~/b https://x.example/~/a x.y~/z")).toBeNull();
  });

  it("H49b: reads only the names the figures glob reads", () => {
    expect(bundledNames(["a.json", "synthetic-set.json", "misses.json", "real-browser-1.json", "notes.md", "b.json"])).toEqual(["results/a.json", "results/b.json"]);
  });

  it("H49b: untracked records are left out, and every committed file that drifts is named in one refusal", () => {
    const a = Buffer.from('{"a":1}\n');
    const b = Buffer.from('{"b":1}\n');
    const c = Buffer.from('{"c":1}\n');
    const committed = new Map([["results/a.json", blobId(a)], ["results/b.json", blobId(b)], ["results/c.json", blobId(c)], ["results/misses.json", "x"]]);
    const disk: Record<string, Buffer> = { "results/a.json": a, "results/b.json": Buffer.from('{"b":2}\n'), "results/new-1.json": a, "results/new-2.json": b };
    const d = resultsDrift(Object.keys(disk).sort(), committed, (r) => disk[r]!);
    expect(d.untracked).toEqual(["results/new-1.json", "results/new-2.json"]);
    expect(d.offenders).toEqual(["results/b.json differs from the committed file", "results/c.json is committed but missing on disk"]);
    expect(driftRefusal(d.offenders)).toMatch(/^H49b: 2 results files .*b\.json differs.*c\.json is committed but missing/);
    const clean = resultsDrift(["results/a.json", "results/b.json", "results/c.json", "results/new-1.json"], committed, (r) => ({ ...disk, "results/b.json": b, "results/c.json": c })[r]!);
    expect(clean.offenders).toEqual([]);
  });

  it("H49b: an untracked name the glob cannot negate is refused, not shipped", () => {
    expect(resultsDrift(["results/x[1].json"], new Map(), () => Buffer.from("{}")).offenders).toEqual(["results/x[1].json is not committed and its name cannot be left out of the glob"]);
  });

  it("H49b: the figures glob gets one negation per untracked record, and a moved glob stops the build", () => {
    const src = readFileSync("src/app/figures.ts", "utf8");
    const out = leaveOut(src, ["results/new-1.json", "results/new-2.json"]);
    expect(out).toContain('"/results/*.json", "!/results/new-1.json", "!/results/new-2.json",');
    expect(leaveOut(src, [])).toBe(src);
    expect(() => leaveOut(src.replace('"/results/*.json",', '"/results/**/*.json",'), ["results/n.json"])).toThrow(/H49b: src\/app\/figures.ts no longer holds/);
  });

  it("H49b: bytes that are not valid UTF-8 are told apart, so the bundled text is always the checked bytes", () => {
    expect(utf8(Buffer.from([0x22, 0xff, 0x22]))).toBeNull();
    const ok = Buffer.from('{"v":"caf\u00e9"}');
    expect(Buffer.from(utf8(ok)!, "utf8").equals(ok)).toBe(true);
  });
});
