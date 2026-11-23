import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLOUD_MODEL_HOST } from "../../src/constants";
import * as filmHelpers from "../e2e/device/filmHelpers";
import * as hybridSupport from "../e2e/device/hybridSupport";
import * as deviceModel from "../e2e/fixtures/deviceModel";
import type { RecordedRequest } from "../e2e/fixtures/deviceModel";

type WireFinding = {
  requestIndex: number;
  host: string;
  path: string;
  field: "address" | "body";
  byteOffset: number;
  runClass: string;
  runLength?: number;
  valueIndex: number;
  valueLength: number;
  beforeClass: string | null;
  afterClass: string | null;
  kind: "stop" | "observation";
};

type WireScanResult = {
  stops: WireFinding[];
  observations: WireFinding[];
};

const scanWireFn = (): ((requests: readonly RecordedRequest[], values: readonly string[], modelHost?: string) => WireScanResult) => {
  const fn = (deviceModel as Record<string, unknown>)["scanWire"];
  expect(typeof fn).toBe("function");
  return fn as (requests: readonly RecordedRequest[], values: readonly string[], modelHost?: string) => WireScanResult;
};

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

describe("H37c tightening: host allowlist, opaque token shape, address redaction, 23-row stop table, env raw dir, and post-pass slots", () => {
  it("item 1: opaque-token relaxation applies only to content-firebaseappcheck.googleapis.com and www.google.com (H37d removed www.gstatic.com)", () => {
    const allowlist = (deviceModel as Record<string, unknown>)["OPAQUE_TOKEN_HOST_ALLOWLIST"];
    expect(Array.isArray(allowlist)).toBe(true);
    expect(allowlist).toContain("content-firebaseappcheck.googleapis.com");
    expect(allowlist).toContain("www.google.com");
    expect(allowlist).not.toContain("www.gstatic.com");
    expect(allowlist).not.toContain(CLOUD_MODEL_HOST);

    const scanWire = scanWireFn();
    const realToken = "xKpL9qR2mN8vB4cZ7wY1-Tom_sT3uV5wX6yZ0aBcDeFgH"; // 45 chars, 4.4% seps, digits + both cases
    const body = Buffer.from(JSON.stringify({ token: realToken }), "utf8");

    for (const host of ["content-firebaseappcheck.googleapis.com", "www.google.com"]) {
      const allowedRes = scanWire(
        [{ url: `https://${host}/check`, method: "POST", bodyBytes: body.length, refused: false, body }],
        ["Tom"],
      );
      expect(allowedRes.stops).toHaveLength(0);
      expect(allowedRes.observations).toHaveLength(1);
      expect(allowedRes.observations[0]!.runClass).toBe("opaque");
    }

    // www.gstatic.com and non-allowlisted hosts MUST stop.
    for (const host of ["www.gstatic.com", "example.invalid"]) {
      const otherRes = scanWire(
        [{ url: `https://${host}/collect`, method: "POST", bodyBytes: body.length, refused: false, body }],
        ["Tom"],
      );
      expect(otherRes.stops).toHaveLength(1);
      expect(otherRes.stops[0]!.kind).toBe("stop");
      expect(otherRes.stops[0]!.runClass).toBe("body text");
      expect(otherRes.observations).toHaveLength(0);
    }
  });

  it("item 2: opaque run requires >=40 chars, <=8% separators (- _ / +), >=1 digit, and both letter cases; slugs and path-like strings stop", () => {
    const scanWire = scanWireFn();
    const postToAppCheck = (payload: string): RecordedRequest => ({
      url: "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/1:1:web:x:exchangeRecaptchaEnterpriseToken",
      method: "POST",
      bodyBytes: Buffer.byteLength(payload, "utf8"),
      refused: false,
      body: Buffer.from(payload, "utf8"),
    });

    // Slug from H37c §2.2 (>8% separators, no digits) MUST stop.
    const slugRes = scanWire([postToAppCheck('{"slug":"client-visit-notes-for-follow-up-Tom-and-sister-march"}')], ["Tom"]);
    expect(slugRes.stops).toHaveLength(1);
    expect(slugRes.stops[0]!.runClass).toBe("body text");
    expect(slugRes.observations).toHaveLength(0);

    // Path-like string with digits and mixed case (>8% separators) MUST stop.
    const pathLike = "v1/cases/Notes2026/Draft_Files/FollowUp/Tom_Summary"; // 51 chars, 7 seps = 13.7% > 8%
    expect(pathLike.length).toBeGreaterThanOrEqual(40);
    const pathRes = scanWire([postToAppCheck(JSON.stringify({ pathLike }))], ["Tom"]);
    expect(pathRes.stops).toHaveLength(1);
    expect(pathRes.stops[0]!.runClass).toBe("body text");
    expect(pathRes.observations).toHaveLength(0);

    // >=40 chars, <=8% seps, both cases, ZERO digits MUST stop.
    const noDigit = "AAAAAAAAAAAAAAAAAAAA-Tom_BBBBBBBBBBBBBBBBBBBB"; // 45 chars, 2/45 = 4.4% seps, 0 digits
    const noDigitRes = scanWire([postToAppCheck(JSON.stringify({ token: noDigit }))], ["Tom"]);
    expect(noDigitRes.stops).toHaveLength(1);
    expect(noDigitRes.stops[0]!.runClass).toBe("body text");
    expect(noDigitRes.observations).toHaveLength(0);

    // Missing uppercase OR missing lowercase MUST stop even with digits and <=8% separators.
    const lowerOnly = "aaaaaaaaaaaaaaaaaaaa9tom_bbbbbbbbbbbbbbbbbbbb2";
    const upperOnly = "AAAAAAAAAAAAAAAAAAAA9TOM_BBBBBBBBBBBBBBBBBBBB2";
    expect(scanWire([postToAppCheck(JSON.stringify({ token: lowerOnly }))], ["Tom"]).stops).toHaveLength(1);
    expect(scanWire([postToAppCheck(JSON.stringify({ token: upperOnly }))], ["Tom"]).stops).toHaveLength(1);

    // Boundary check: 5 separators in 50 chars = 10% > 8% stops; 4 separators in 50 chars = 8% is an observation.
    const tenPctSeps = "a1B2c3D4e5/f6G7-Tom_h8I9+j0K1-l2M3n4O5p6Q7r8S9t0Uv";
    expect(tenPctSeps.length).toBe(50);
    expect(scanWire([postToAppCheck(JSON.stringify({ token: tenPctSeps }))], ["Tom"]).stops).toHaveLength(1);

    const eightPctSeps = "a1B2c3D4e5/f6G7-Tom_h8I9+j0K1m2N3n4O5p6Q7r8S9t0UvW";
    expect(eightPctSeps.length).toBe(50);
    const okEightPct = scanWire([postToAppCheck(JSON.stringify({ token: eightPctSeps }))], ["Tom"]);
    expect(okEightPct.stops).toHaveLength(0);
    expect(okEightPct.observations).toHaveLength(1);
    expect(okEightPct.observations[0]!.runClass).toBe("opaque");
  });

  it("item 3: address findings redact every checked value in path with [value#<valueIndex>] so 0 checked names serialize", () => {
    const scanWire = scanWireFn();
    const req: RecordedRequest = {
      url: "https://example.invalid/patients/Maria/notes/Tom/detail?q=Bea",
      method: "GET",
      bodyBytes: 0,
      refused: false,
    };
    const res = scanWire([req], ["Maria", "Tom", "Bea"]);
    expect(res.stops).toHaveLength(3);
    for (const s of res.stops) {
      expect(s.field).toBe("address");
      expect(s.path).toBe("/patients/[value#0]/notes/[value#1]/detail");
    }
    const wireSerialized = JSON.stringify(res);
    expect(wireSerialized.toLowerCase()).not.toContain("maria");
    expect(wireSerialized.toLowerCase()).not.toContain("tom");
    expect(wireSerialized.toLowerCase()).not.toContain("bea");

    // Also verify full leakCheck + leakProblems output never leaks a checked name from a request path.
    const rawLineReq: RecordedRequest = {
      url: "https://example.invalid/records/Maria/Tom/Bea",
      method: "POST",
      bodyBytes: 120,
      refused: false,
      body: Buffer.from("Visit date: 12/11\nDOB on form 3/3/87.", "utf8"),
    };
    const leak = hybridSupport.leakCheck([rawLineReq], "Visit date: 12/11");
    const problems = hybridSupport.leakProblems(leak);
    const fullSerialized = JSON.stringify({ leak, problems });
    for (const term of ["Maria", "Tom", "Bea", "3/3/87"]) {
      expect(fullSerialized.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("item 4: OPEN-QUESTIONS.md adds Session H37c 23-row stop table with the 3 missing stops and true triggers instead of none", () => {
    const doc = readFileSync(".kiro/specs/OPEN-QUESTIONS.md", "utf8");
    const idx = doc.indexOf("## Session H37c");
    expect(idx).toBeGreaterThan(-1);
    const nextIdx = doc.indexOf("\n## ", idx + 1);
    const sec = nextIdx > -1 ? doc.slice(idx, nextIdx) : doc.slice(idx);
    const rows = sec
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("| spec ") && !l.startsWith("|---"));
    expect(rows).toHaveLength(23);

    const parsed = rows.map((row) =>
      row
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
    for (const cells of parsed) {
      expect(cells).toHaveLength(4);
      expect(["a", "b", "c", "d"]).toContain(cells[2]);
      expect(cells[3]!.length).toBeGreaterThan(0);
    }

    // The 3 newly added stops must be named explicitly: 2 test timeouts + final assertion.
    expect(parsed.some((c) => c[0]!.includes("filmRehearsal.spec.ts:128") || c[1]!.includes("320_000"))).toBe(true);
    expect(parsed.some((c) => c[0]!.includes("filmRun.spec.ts:247") || c[1]!.includes("280_000"))).toBe(true);
    expect(parsed.some((c) => c[0]!.includes("filmRun.spec.ts:1294") || c[1]!.includes("expect(problems).toEqual([])"))).toBe(true);

    // Rows 3, 12, 14, and 16 must NOT say "none" in column 4.
    expect(parsed[2]![3]).not.toBe("none");
    expect(parsed[11]![3]).not.toBe("none");
    expect(parsed[13]![3]).not.toBe("none");
    expect(parsed[15]![3]).not.toBe("none");

    // Bus-clean: no home dir, no banned words, no emojis.
    const homePrefix = ["", "Users", ""].join("/");
    expect(sec).not.toContain(homePrefix);
    expect(sec).not.toContain(homedir());
    expect(sec).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
    expect(sec).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u);
  });

  it("item 5: tests/ holds 0 home/machine paths, raw folder comes from DOORSTEP_FILM_RAW_DIR, and new records write relative video paths", () => {
    const home = homedir();
    const userRoot = ["", "Users", ""].join("/");
    const matches: string[] = [];
    for (const file of collectFiles("tests")) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.includes(home) || line.includes(userRoot)) {
          matches.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(matches).toEqual([]);

    const prev = process.env["DOORSTEP_FILM_RAW_DIR"];
    try {
      delete process.env["DOORSTEP_FILM_RAW_DIR"];
      const dir = mkdtempSync(join(tmpdir(), "h37c-noenv-"));
      try {
        expect(() => filmHelpers.selectH37TakeSuffix(dir, "2026-11-15")).toThrow(/DOORSTEP_FILM_RAW_DIR/);
        expect(() => filmHelpers.selectFilmTakeSuffix(dir, "2026-11-15")).toThrow(/DOORSTEP_FILM_RAW_DIR/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      if (prev === undefined) delete process.env["DOORSTEP_FILM_RAW_DIR"];
      else process.env["DOORSTEP_FILM_RAW_DIR"] = prev;
    }

    const filmRunSrc = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    const rehearsalSrc = readFileSync("tests/e2e/device/filmRehearsal.spec.ts", "utf8");
    expect(filmRunSrc).toContain("requireFilmRawRoot");
    expect(filmRunSrc).toContain("relative(rawRoot,");
    expect(rehearsalSrc).toContain("requireFilmRawRoot");
    expect(rehearsalSrc).toContain("relative(rawRoot,");
  });

  it("item 6: selectH37TakeSuffix covers h37-1..h37-4 and runs h37-2..h37-4 after a passing take", () => {
    const fh = filmHelpers as Record<string, unknown>;
    expect(fh["H37_TAKE_SUFFIXES"]).toEqual(["h37-1", "h37-2", "h37-3", "h37-4"]);
    const selectH37 = fh["selectH37TakeSuffix"] as (dir?: string, date?: string, rawRoot?: string) => { suffix: string; rawDir: string };

    const dir = mkdtempSync(join(tmpdir(), "h37c-slots-"));
    const rawRoot = resolve(tmpdir(), "h37c-raw-root");
    try {
      writeFileSync(join(dir, "film-run-2026-11-15-h36-8.json"), JSON.stringify({ status: "pass" }));
      writeFileSync(join(dir, "film-run-2026-11-15-h37-1.json"), JSON.stringify({ status: "pass" }));

      const slot2 = selectH37(dir, "2026-11-15", rawRoot);
      expect(slot2.suffix).toBe("h37-2");
      expect(basename(slot2.rawDir)).toBe("raw-h37-2");
      expect(slot2.rawDir).toBe(join(rawRoot, "raw-h37-2"));

      writeFileSync(join(dir, "film-run-2026-11-15-h37-2.json"), JSON.stringify({ status: "pass" }));
      expect(selectH37(dir, "2026-11-15", rawRoot).suffix).toBe("h37-3");

      writeFileSync(join(dir, "film-run-2026-11-15-h37-3.json"), JSON.stringify({ status: "fail" }));
      expect(selectH37(dir, "2026-11-15", rawRoot).suffix).toBe("h37-4");

      writeFileSync(join(dir, "film-run-2026-11-15-h37-4.json"), JSON.stringify({ status: "pass" }));
      expect(() => selectH37(dir, "2026-11-15", rawRoot)).toThrow(/cap of 4/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
