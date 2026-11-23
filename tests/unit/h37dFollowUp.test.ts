import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

const decodeSafe = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

describe("H37d follow-up tightening", () => {
  it("item 1: www.gstatic.com is removed from OPAQUE_TOKEN_HOST_ALLOWLIST and stops on wire tokens", () => {
    const allowlist = (deviceModel as Record<string, unknown>)["OPAQUE_TOKEN_HOST_ALLOWLIST"] as string[];
    expect(allowlist).toContain("content-firebaseappcheck.googleapis.com");
    expect(allowlist).toContain("www.google.com");
    expect(allowlist).not.toContain("www.gstatic.com");
    expect(allowlist).not.toContain(CLOUD_MODEL_HOST);

    const scanWire = scanWireFn();
    const token = "xKpL9qR2mN8vB4cZ7wY1-Tom_sT3uV5wX6yZ0aBcDeFgH";
    const body = Buffer.from(JSON.stringify({ token }), "utf8");
    const res = scanWire(
      [{ url: "https://www.gstatic.com/recaptcha/api2/payload", method: "POST", bodyBytes: body.length, refused: false, body }],
      ["Tom"],
    );
    expect(res.stops).toHaveLength(1);
    expect(res.stops[0]!.kind).toBe("stop");
    expect(res.stops[0]!.host).toBe("www.gstatic.com");
    expect(res.observations).toHaveLength(0);
  });

  it("item 2: short (<5-letter) values touching digits or letters inside allowlisted opaque runs emit observations instead of silent drop", () => {
    const scanWire = scanWireFn();
    const cases = [
      { name: "digit-flanked", token: "xKpL9qR2mN8vB4cZ7wY19Tom2sT3uV5wX6yZ0aBcDeFgH", beforeClass: "D", afterClass: "D" },
      { name: "digit-symbol", token: "xKpL9qR2mN8vB4cZ7wY19Tom_sT3uV5wX6yZ0aBcDeFgH", beforeClass: "D", afterClass: "S" },
      { name: "letter-digit", token: "xKpL9qR2mN8vB4cZ7wY1aTom2sT3uV5wX6yZ0aBcDeFgH", beforeClass: "L", afterClass: "D" },
      { name: "letter-flanked", token: "xKpL9qR2mN8vB4cZ7wY1xTomYsT3uV5wX6yZ0aBcDeFgH", beforeClass: "L", afterClass: "L" },
    ] as const;

    for (const c of cases) {
      const payload = JSON.stringify({ token: c.token });
      const body = Buffer.from(payload, "utf8");
      const req: RecordedRequest = {
        url: "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/1:1:web:x:exchangeRecaptchaEnterpriseToken",
        method: "POST",
        bodyBytes: body.length,
        refused: false,
        body,
      };
      const res = scanWire([req], ["Tom", "Maria"]);
      expect(res.stops, c.name).toHaveLength(0);
      expect(res.observations, c.name).toHaveLength(1);
      const obs = res.observations[0]!;
      expect(obs.kind).toBe("observation");
      expect(obs.requestIndex).toBe(0);
      expect(obs.host).toBe("content-firebaseappcheck.googleapis.com");
      expect(obs.path).toBe("/v1/projects/<project>/apps/<app>:exchangeRecaptchaEnterpriseToken");
      expect(obs.field).toBe("body");
      expect(obs.runClass).toBe("opaque");
      expect(obs.runLength).toBe(c.token.length);
      expect(obs.byteOffset).toBe(payload.indexOf(c.token) + c.token.indexOf("Tom"));
      expect(obs.valueIndex).toBe(0);
      expect(obs.valueLength).toBe(3);
      expect(obs.beforeClass).toBe(c.beforeClass);
      expect(obs.afterClass).toBe(c.afterClass);

      const reqWithAddrLeak: RecordedRequest = {
        ...req,
        url: "https://content-firebaseappcheck.googleapis.com/check/Maria/token",
      };
      const resWithAddr = scanWire([reqWithAddrLeak], ["Tom", "Maria"]);
      expect(resWithAddr.stops, c.name).toHaveLength(1);
      expect(resWithAddr.observations, c.name).toHaveLength(1);
      expect(resWithAddr.observations[0]!.path).toBe("/check/[value#1]/token");

      const leak = hybridSupport.leakCheck([req], "Visit date: 12/11");
      expect(hybridSupport.leakProblems(leak)).toEqual([]);
      expect((leak as unknown as { observations: WireFinding[] }).observations.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(leak).toLowerCase()).not.toContain("tom");
    }

    // Prose short-value word-boundary safety must remain intact outside opaque runs.
    const proseBody = Buffer.from(JSON.stringify({ msg: "tomorrow is a custom day because we rest" }), "utf8");
    const proseRes = scanWire(
      [{ url: "https://www.google.com/recaptcha/enterprise/reload", method: "POST", bodyBytes: proseBody.length, refused: false, body: proseBody }],
      ["Tom", "Bea"],
    );
    expect(proseRes.stops).toHaveLength(0);
    expect(proseRes.observations).toHaveLength(0);
  });

  it("item 3: percent-decodes paths before redaction and scans raw, percent-decoded, and +-decoded addresses and bodies", () => {
    const scanWire = scanWireFn();
    const checked = ["14 Alder Court", "Maria Okonkwo-Reyes", "Priya Halloran", "Maria O-R", "José", "Maria", "3/3/87"];

    // Mixed partial percent encoding with longer match beating shorter "Maria", plus malformed % sequence safety.
    const partialPathReq: RecordedRequest = {
      url: "https://example.invalid/visit/bad%E0%A4%A/Maria%20Okonkwo%2DReyes/summary",
      method: "GET",
      bodyBytes: 0,
      refused: false,
    };
    const plusPathReq: RecordedRequest = {
      url: "https://example.invalid/visit/maria+o-r/note",
      method: "GET",
      bodyBytes: 0,
      refused: false,
    };
    const encodedBody = Buffer.from("note=14%20Alder%20Court&who=Pr%69ya%20Halloran&dob=3%2F3%2F87&u=Jos%C3%A9", "utf8");
    const encodedBodyReq: RecordedRequest = {
      url: "https://example.invalid/submit",
      method: "POST",
      bodyBytes: encodedBody.length,
      refused: false,
      body: encodedBody,
    };
    const plusBody = Buffer.from("place=14+Alder+Court&person=Maria+O-R", "utf8");
    const plusBodyReq: RecordedRequest = {
      url: "https://example.invalid/form",
      method: "POST",
      bodyBytes: plusBody.length,
      refused: false,
      body: plusBody,
    };

    const res = scanWire([partialPathReq, plusPathReq, encodedBodyReq, plusBodyReq], checked);
    const req0Stops = res.stops.filter((s) => s.requestIndex === 0);
    expect(req0Stops.length).toBeGreaterThanOrEqual(1);
    expect(req0Stops.every((s) => s.path === "/visit/bad%E0%A4%A/[value#1]/summary")).toBe(true);

    const req1Stops = res.stops.filter((s) => s.requestIndex === 1);
    expect(req1Stops.length).toBeGreaterThanOrEqual(1);
    expect(req1Stops.every((s) => s.path === "/visit/[value#3]/note")).toBe(true);

    const req2Stops = res.stops.filter((s) => s.requestIndex === 2 && s.field === "body");
    expect(req2Stops.map((s) => s.valueIndex)).toEqual(expect.arrayContaining([0, 2, 4, 6]));
    const alderHit = req2Stops.find((s) => s.valueIndex === 0)!;
    expect(alderHit.byteOffset).toBe(Buffer.byteLength("note=", "utf8"));

    const req3Stops = res.stops.filter((s) => s.requestIndex === 3 && s.field === "body");
    expect(req3Stops.map((s) => s.valueIndex)).toEqual(expect.arrayContaining([0, 3]));
    expect(req3Stops.find((s) => s.valueIndex === 0)!.byteOffset).toBe(Buffer.byteLength("place=", "utf8"));

    const wireSerialized = JSON.stringify(res);
    const wireDecoded = decodeSafe(wireSerialized);
    for (const term of ["Alder", "Okonkwo", "Reyes", "Halloran", "Priya", "Maria", "José", "3/3/87", "%2DReyes", "%20Alder"]) {
      expect(wireSerialized.toLowerCase()).not.toContain(term.toLowerCase());
      expect(wireDecoded.toLowerCase()).not.toContain(term.toLowerCase());
    }

    // noteLinesFound scans BOTH raw and percent- / +-decoded address AND body, and redacts [line#idx].
    const line0 = hybridSupport.NOTE_LINES[0]!;
    const line2 = hybridSupport.NOTE_LINES[2]!;
    const bodyPctLine = Buffer.from(`line=${encodeURIComponent(line0)}`, "utf8");
    const bodyPlusLine = Buffer.from(`line=${encodeURIComponent(line2).replace(/%20/g, "+")}`, "utf8");
    const lineReqs: RecordedRequest[] = [
      { url: `https://example.invalid/note/${encodeURIComponent(line0)}`, method: "GET", bodyBytes: 0, refused: false },
      { url: `https://example.invalid/note/${encodeURIComponent(line0).replace(/%20/g, "+")}`, method: "GET", bodyBytes: 0, refused: false },
      { url: "https://example.invalid/note-body", method: "POST", bodyBytes: bodyPctLine.length, refused: false, body: bodyPctLine },
      { url: "https://example.invalid/note-form", method: "POST", bodyBytes: bodyPlusLine.length, refused: false, body: bodyPlusLine },
    ];
    for (const [idx, req] of lineReqs.entries()) {
      const leak = hybridSupport.leakCheck([req], "");
      const problems = hybridSupport.leakProblems(leak);
      expect(leak.noteLinesFound.length, `req ${idx}`).toBeGreaterThanOrEqual(1);
      expect(problems.length, `req ${idx}`).toBeGreaterThanOrEqual(1);
      if (idx < 2) {
        expect(leak.noteLinesFound[0]!.field).toBe("address");
        expect(leak.noteLinesFound[0]!.path).toBe("/note/[line#0]");
      } else {
        expect(leak.noteLinesFound[0]!.field).toBe("body");
        expect(leak.noteLinesFound[0]!.byteOffset).toBe(5);
      }
      const serialized = JSON.stringify({ leak, problems });
      const decoded = decodeSafe(serialized);
      for (const frag of [line0.slice(0, 12), line2.slice(0, 12), "Maria", "Bea", "3/3/87", "Alder"]) {
        expect(serialized.toLowerCase()).not.toContain(frag.toLowerCase());
        expect(decoded.toLowerCase()).not.toContain(frag.toLowerCase());
      }
    }
  });

  it("item 4: OPEN-QUESTIONS.md stop table updates cap-on-cloud-calls triggers, ledger-claim triggers, and audits every none cell", () => {
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

    // Row 10 (Wire-value stop) must reflect removal of www.gstatic.com and observation emission.
    const row10Stop = parsed[9]![1]!;
    const row10Trigger = parsed[9]![3]!;
    expect(row10Stop).not.toContain("www.gstatic.com");
    expect(row10Stop).toContain("observation");
    expect(row10Trigger).not.toBe("none");

    // Row 19 (ledgerClaimStopProblems): names all 4 modes and their triggers (probe timeout, unavailable device, preview block, ledger/UI failure).
    const row19Trigger = parsed[18]![3]!;
    expect(row19Trigger).not.toBe("none");
    for (const token of ["ONLY_ON_DEVICE", "PREFER_ON_DEVICE", "PREFER_IN_CLOUD", "ONLY_IN_CLOUD", "/probe.txt"]) {
      expect(row19Trigger).toContain(token);
    }

    // Row 20 (walkCompletionStopProblems including cap on cloud calls): explicitly names CAP / stoppedAtCap triggers!
    const row20Stop = parsed[19]![1]!;
    const row20Trigger = parsed[19]![3]!;
    expect(row20Stop).toContain("stoppedAtCap");
    expect(row20Trigger).not.toBe("none");
    expect(row20Trigger).toMatch(/PREFER_ON_DEVICE/i);
    expect(row20Trigger).toMatch(/Shot C\.4.*retry|Pass 1 retry/i);
    expect(row20Trigger).toMatch(/CAP|stoppedAtCap/i);

    // Only pre-browser setup/slot/raw-note-or-image/offline-rehearsal-breach rows (0, 3, 6, 7, 10) may legitimately stay "none".
    const allowedNoneIndices = new Set([0, 3, 6, 7, 10]);
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i]![3] === "none") {
        expect(allowedNoneIndices.has(i), `row ${i + 1} should not be "none"`).toBe(true);
      }
    }

    // Bus-clean check.
    const homePrefix = ["", "Users", ""].join("/");
    expect(sec).not.toContain(homePrefix);
    expect(sec).not.toContain(homedir());
    expect(sec).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
    expect(sec).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u);
  });

  it("item 5: requireFilmRawRoot resolves symlinks (existing, subdir under symlink, and dangling link) so inside-repo targets are refused", () => {
    const tmp = mkdtempSync(join(tmpdir(), "h37d-symlink-"));
    try {
      const repoReal = realpathSync(process.cwd());
      const repoLink = join(tmp, "repo-link");
      symlinkSync(repoReal, repoLink);
      const subLink = join(tmp, "results-link");
      symlinkSync(join(repoReal, "results"), subLink);
      const danglingInRepo = join(tmp, "dangling-link");
      symlinkSync(join(repoReal, "nonexistent-raw-subdir-h37d"), danglingInRepo);
      const externalTarget = mkdtempSync(join(tmpdir(), "h37d-external-"));
      const externalLink = join(tmp, "external-link");
      symlinkSync(externalTarget, externalLink);

      try {
        expect(() => filmHelpers.requireFilmRawRoot({ DOORSTEP_FILM_RAW_DIR: repoLink })).toThrow(/outside the repo/);
        expect(() => filmHelpers.requireFilmRawRoot({ DOORSTEP_FILM_RAW_DIR: join(repoLink, "raw-child-new") })).toThrow(/outside the repo/);
        expect(() => filmHelpers.requireFilmRawRoot({ DOORSTEP_FILM_RAW_DIR: subLink })).toThrow(/outside the repo/);
        expect(() => filmHelpers.requireFilmRawRoot({ DOORSTEP_FILM_RAW_DIR: danglingInRepo })).toThrow(/outside the repo/);

        expect(filmHelpers.requireFilmRawRoot({ DOORSTEP_FILM_RAW_DIR: externalLink })).toBe(resolve(externalLink));
      } finally {
        rmSync(externalTarget, { recursive: true, force: true });
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
