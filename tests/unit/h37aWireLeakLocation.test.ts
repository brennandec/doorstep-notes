import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { CLOUD_MODEL_HOST } from "../../src/constants";
import * as deviceModel from "../e2e/fixtures/deviceModel";
import type { RecordedRequest } from "../e2e/fixtures/deviceModel";
import * as hybridSupport from "../e2e/device/hybridSupport";
import * as filmHelpers from "../e2e/device/filmHelpers";

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

describe("H37a: wire leak locations, zero-name/body record hygiene, and opaque-run rule", () => {
  it("row 1: every finding carries requestIndex, host, path without query, field, byteOffset, and runClass (+ runLength)", () => {
    const scanWire = scanWireFn();
    const token = "xA1bC2dE3fG4hI5jK6lM-Tom_nO7pQ8rS9tU0vW1xY2zA3"; // 46 base64url chars (digits + both cases)
    const bodyText = `{"café":"ok","token":"${token}"}`;
    const requests: RecordedRequest[] = [
      {
        url: "https://content-firebaseappcheck.googleapis.com/v1/projects/doorstep-demo/apps/1:99:web:abc:exchangeRecaptchaEnterpriseToken?key=SECRET&alt=json",
        method: "POST",
        bodyBytes: Buffer.byteLength(bodyText, "utf8"),
        refused: false,
        body: Buffer.from(bodyText, "utf8"),
      },
      {
        url: `https://${CLOUD_MODEL_HOST}/v1beta/projects/doorstep-demo/locations/global/publishers/google/models/gemini-x:generateContent?key=SECRET`,
        method: "POST",
        bodyBytes: 30,
        refused: false,
        body: Buffer.from("Model text with Tom inside", "utf8"),
      },
    ];
    const result = scanWire(requests, ["Maria", "Tom"]);
    expect(result.stops).toHaveLength(1);
    expect(result.observations).toHaveLength(1);

    const obs = result.observations[0]!;
    expect(obs.requestIndex).toBe(0);
    expect(obs.host).toBe("content-firebaseappcheck.googleapis.com");
    expect(obs.path).toBe("/v1/projects/<project>/apps/<app>:exchangeRecaptchaEnterpriseToken");
    expect(obs.path).not.toContain("SECRET");
    expect(obs.path).not.toContain("?");
    expect(obs.field).toBe("body");
    expect(obs.byteOffset).toBe(Buffer.byteLength(bodyText.slice(0, bodyText.indexOf("Tom")), "utf8"));
    expect(obs.runClass).toBe("opaque");
    expect(obs.runLength).toBe(token.length);

    const stop = result.stops[0]!;
    expect(stop.requestIndex).toBe(1);
    expect(stop.host).toBe(CLOUD_MODEL_HOST);
    expect(stop.path).toBe("/v1beta/projects/<project>/locations/global/publishers/google/models/gemini-x:generateContent");
    expect(stop.field).toBe("body");
    expect(stop.byteOffset).toBe("Model text with ".length);
    expect(stop.runClass).toBe("model text");
  });

  it("row 2: no listed name and no wire body appears in LeakResult, observations, or leakProblems", () => {
    const maskedBody = JSON.stringify({
      contents: [
        {
          text: "Agreed: I ring landlord Mon; [Person 1] posts form Fri; [Person 3] (neighbour, also on my list) offered to help with the form. DOB [Date 1].",
        },
      ],
    });
    const opaqueToken = "AbCdEfGhIjKlMnOpQrSt-Tom_UvWxYz0123456789AbCd";
    const reqs: RecordedRequest[] = [
      {
        url: `https://${CLOUD_MODEL_HOST}/v1beta/models/m:generateContent`,
        method: "POST",
        bodyBytes: Buffer.byteLength(maskedBody, "utf8"),
        refused: false,
        body: Buffer.from(maskedBody, "utf8"),
      },
      {
        url: "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/1:1:web:x:exchangeRecaptchaEnterpriseToken?key=K",
        method: "POST",
        bodyBytes: 100,
        refused: false,
        body: Buffer.from(JSON.stringify({ opaqueBodyFieldMarker: opaqueToken }), "utf8"),
      },
      {
        url: "https://example.invalid/bad?who=Bea",
        method: "POST",
        bodyBytes: 12,
        refused: false,
        body: Buffer.from("Tom offered.", "utf8"),
      },
    ];
    const leak = hybridSupport.leakCheck(reqs, "[Person 1] [Person 3] [Date 1]");
    const problems = hybridSupport.leakProblems(leak);
    const serialized = JSON.stringify({ leak, problems });

    const forbiddenValues = [
      "Maria",
      "Okonkwo",
      "Reyes",
      "Tomas",
      "Brandvold",
      "Brandvald",
      "Tom",
      "Bea",
      "Priya",
      "Halloran",
      "Alder Court",
      "3/3/87",
      "Mari",
      "offered to help with the form",
      "opaqueBodyFieldMarker",
      opaqueToken,
      "Tom offered",
    ];
    for (const term of forbiddenValues) {
      expect(serialized.toLowerCase()).not.toContain(term.toLowerCase());
    }

    // Even when a raw note line is found in a request body, neither the note text nor names appear in the record.
    const rawLineReq: RecordedRequest = {
      url: "https://example.invalid/raw-line",
      method: "POST",
      bodyBytes: 120,
      refused: false,
      body: Buffer.from(inventedVisit.note, "utf8"),
    };
    const rawLeak = hybridSupport.leakCheck([rawLineReq], inventedVisit.note);
    const rawProblems = hybridSupport.leakProblems(rawLeak);
    const rawSerialized = JSON.stringify({ rawLeak, rawProblems });
    for (const term of ["Alder Court", "landlord", "bedroom", "Mould", "Brandvald", "Bea", "Maria", "3/3/87"]) {
      expect(rawSerialized.toLowerCase()).not.toContain(term.toLowerCase());
    }
    expect(rawLeak.noteLinesFound.length).toBeGreaterThan(0);

    const r = leak as unknown as {
      stops?: WireFinding[];
      observations?: WireFinding[];
      maskedOriginalsCheckedCount?: number;
      checkedCount?: number;
    };
    expect(typeof r.checkedCount).toBe("number");
    expect(typeof r.maskedOriginalsCheckedCount).toBe("number");
    expect(Array.isArray(r.observations)).toBe(true);
    expect(Array.isArray(r.stops)).toBe(true);
    expect(r.observations).toHaveLength(1);
    const obs = r.observations![0]!;
    expect(obs.valueLength).toBe(3);
    expect(typeof obs.valueIndex).toBe("number");
    expect(obs.beforeClass).toBe("S");
    expect(obs.afterClass).toBe("S");
    for (const f of [...r.stops!, ...r.observations!]) {
      expect(["L", "D", "S", null]).toContain(f.beforeClass);
      expect(["L", "D", "S", null]).toContain(f.afterClass);
    }
  });

  it("row 3: opaque >=40 allowlisted run holding -Tom_, 9Tom2, or 9Tom_ emits 1 observation and 0 stops (H37d item 2)", () => {
    const tokenMinusTomUnderscore = "xKpL9qR2mN8vB4cZ7wY1-Tom_sT3uV5wX6yZ0aBcDeFgH"; // 45 chars
    const token9Tom2 = "xKpL9qR2mN8vB4cZ7wY19Tom2sT3uV5wX6yZ0aBcDeFgH";
    const token9TomUnderscore = "xKpL9qR2mN8vB4cZ7wY19Tom_sT3uV5wX6yZ0aBcDeFgH";

    const reqMinusTom: RecordedRequest = {
      url: "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/1:1:web:x:exchangeRecaptchaEnterpriseToken",
      method: "POST",
      bodyBytes: 80,
      refused: false,
      body: Buffer.from(JSON.stringify({ token: tokenMinusTomUnderscore }), "utf8"),
    };
    const req9Tom2: RecordedRequest = { ...reqMinusTom, body: Buffer.from(JSON.stringify({ token: token9Tom2 }), "utf8") };
    const req9TomUnderscore: RecordedRequest = { ...reqMinusTom, body: Buffer.from(JSON.stringify({ token: token9TomUnderscore }), "utf8") };

    // Red at 8eb6a08/1b86b8c: findInWire & leakProblems returned ["Tom"] and stopped; at HEAD: 0 stops.
    expect(deviceModel.findInWire([reqMinusTom], ["Tom"])).toEqual([]);
    expect(deviceModel.findInWire([req9Tom2], ["Tom"])).toEqual([]);

    const leakMinusTom = hybridSupport.leakCheck([reqMinusTom], inventedVisit.note);
    expect(hybridSupport.leakProblems(leakMinusTom)).toEqual([]);
    const leakObs = (leakMinusTom as unknown as { observations?: WireFinding[] }).observations;
    expect(leakObs).toHaveLength(1);
    expect(leakObs![0]!.runClass).toBe("opaque");
    expect(leakObs![0]!.runLength).toBe(tokenMinusTomUnderscore.length);
    expect(leakObs![0]!.beforeClass).toBe("S");
    expect(leakObs![0]!.afterClass).toBe("S");

    const leak9Tom2 = hybridSupport.leakCheck([req9Tom2], inventedVisit.note);
    expect(hybridSupport.leakProblems(leak9Tom2)).toEqual([]);
    const obs9Tom2 = (leak9Tom2 as unknown as { observations?: WireFinding[] }).observations!;
    expect(obs9Tom2).toHaveLength(1);
    expect(obs9Tom2[0]!.kind).toBe("observation");
    expect(obs9Tom2[0]!.runClass).toBe("opaque");
    expect(obs9Tom2[0]!.beforeClass).toBe("D");
    expect(obs9Tom2[0]!.afterClass).toBe("D");

    const leak9TomUnderscore = hybridSupport.leakCheck([req9TomUnderscore], inventedVisit.note);
    expect(hybridSupport.leakProblems(leak9TomUnderscore)).toEqual([]);
    const obs9TomUnderscore = (leak9TomUnderscore as unknown as { observations?: WireFinding[] }).observations!;
    expect(obs9TomUnderscore).toHaveLength(1);
    expect(obs9TomUnderscore[0]!.kind).toBe("observation");
    expect(obs9TomUnderscore[0]!.runClass).toBe("opaque");
    expect(obs9TomUnderscore[0]!.beforeClass).toBe("D");
    expect(obs9TomUnderscore[0]!.afterClass).toBe("S");
  });

  it("row 4: three strict stop cases still stop", () => {
    const scanWire = scanWireFn();
    // Case (i): <5-letter value in CLOUD_MODEL_HOST body keeps strict letter-only boundaries even inside a >=40 run with digits
    const reqModel: RecordedRequest = {
      url: `https://${CLOUD_MODEL_HOST}/v1beta/projects/p/locations/global/publishers/google/models/m:generateContent`,
      method: "POST",
      bodyBytes: 60,
      refused: false,
      body: Buffer.from("AAAAAAAAAAAAAAAAAAAA9Tom2BBBBBBBBBBBBBBBBBBBB", "utf8"),
    };
    const resModel = scanWire([reqModel], ["Tom"]);
    expect(resModel.stops).toHaveLength(1);
    expect(resModel.stops[0]!.runClass).toBe("model text");
    expect(resModel.stops[0]!.beforeClass).toBe("D");
    expect(resModel.stops[0]!.afterClass).toBe("D");
    expect(resModel.observations).toHaveLength(0);

    // Case (ii): <5-letter value outside an opaque run (<40 chars / prose) on a non-model body OR in any address
    const shortTokenBody: RecordedRequest = {
      url: "https://example.invalid/check",
      method: "POST",
      bodyBytes: 25,
      refused: false,
      body: Buffer.from("short-run-only-39-AAA-Tom_BBBBBBBBBBBBB", "utf8"), // 39 chars total
    };
    expect("short-run-only-39-AAA-Tom_BBBBBBBBBBBBB".length).toBe(39);
    const urlTokenReq: RecordedRequest = {
      url: "https://www.google.com/recaptcha/api2/clr?k=AAAAAAAAAAAAAAAAAAAA-Tom_BBBBBBBBBBBBBBBBBBBB",
      method: "GET",
      bodyBytes: 0,
      refused: false,
    };
    const resProse = scanWire([shortTokenBody], ["Tom"]);
    expect(resProse.stops).toHaveLength(1);
    expect(resProse.stops[0]!.runClass).toBe("body text");

    const resAddr = scanWire([urlTokenReq], ["Tom"]);
    expect(resAddr.stops).toHaveLength(1);
    expect(resAddr.stops[0]!.field).toBe("address");
    expect(resAddr.stops[0]!.runClass).toBe("address");
    expect(resAddr.stops[0]!.path).toBe("/recaptcha/api2/clr");

    // Case (iii): >=5-letter listed value anywhere, even inside a >=40 opaque run on a non-model host
    const reqFivePlusInOpaque: RecordedRequest = {
      url: "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchange",
      method: "POST",
      bodyBytes: 70,
      refused: false,
      body: Buffer.from("a1B2c3D4e5F6g7H8i9J0-Maria_k1L2m3N4o5P6q7R8s9T0", "utf8"),
    };
    const resFive = scanWire([reqFivePlusInOpaque], ["Maria"]);
    expect(resFive.stops).toHaveLength(1);
    expect(resFive.stops[0]!.kind).toBe("stop");
    expect(resFive.stops[0]!.runClass).toBe("opaque");
    expect(resFive.observations).toHaveLength(0);
  });

  it("row 5: H37 retake slots (h37-1..h37-4) ignore passing h36-8 and OPEN-QUESTIONS.md H37a section has 20-row stop table", () => {
    const fh = filmHelpers as Record<string, unknown>;
    expect(fh["H37_TAKE_SUFFIXES"]).toEqual(["h37-1", "h37-2", "h37-3", "h37-4"]);
    expect(typeof fh["selectH37TakeSuffix"]).toBe("function");
    const selectH37 = fh["selectH37TakeSuffix"] as (dir?: string, date?: string, rawRoot?: string) => { suffix: string; rawDir: string };

    const dir = mkdtempSync(join(tmpdir(), "h37-slots-"));
    const rawRoot = resolve(tmpdir(), "h37a-raw-root");
    try {
      // A passing h36-8 take does NOT block h37-1
      writeFileSync(join(dir, "film-run-2026-11-15-h36-8.json"), JSON.stringify({ status: "pass" }));
      expect(selectH37(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h37-1",
        rawDir: join(rawRoot, "raw-h37-1"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h37-1.json"), JSON.stringify({ status: "fail" }));
      expect(selectH37(dir, "2026-11-15", rawRoot).suffix).toBe("h37-2");
      writeFileSync(join(dir, "film-run-2026-11-15-h37-2.json"), JSON.stringify({ status: "pass" }));
      expect(selectH37(dir, "2026-11-15", rawRoot).suffix).toBe("h37-3");
      writeFileSync(join(dir, "film-run-2026-11-15-h37-3.json"), JSON.stringify({ status: "fail" }));
      expect(selectH37(dir, "2026-11-15", rawRoot).suffix).toBe("h37-4");
      writeFileSync(join(dir, "film-run-2026-11-15-h37-4.json"), JSON.stringify({ status: "pass" }));
      expect(() => selectH37(dir, "2026-11-15", rawRoot)).toThrow(/cap of 4/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const doc = readFileSync(".kiro/specs/OPEN-QUESTIONS.md", "utf8");
    const idx = doc.indexOf("## Session H37a");
    expect(idx).toBeGreaterThan(-1);
    const nextIdx = doc.indexOf("## Session H37b", idx);
    expect(nextIdx).toBeGreaterThan(idx);
    const sec = doc.slice(idx, nextIdx);
    const rows = sec
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("| spec ") && !l.startsWith("|---"));
    expect(rows).toHaveLength(20);
    for (const row of rows) {
      const cells = row
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      expect(cells).toHaveLength(4);
      expect(["a", "b", "c", "d"]).toContain(cells[2]);
      expect(cells[3]).toBe("none");
    }
    expect(sec).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
    expect(sec).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u);

    const filmRunSrc = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    expect(filmRunSrc).toContain("selectH37TakeSuffix");
    expect(filmRunSrc).toContain("opaqueWireTokenShortValue");
    expect(filmRunSrc).toContain("--force-device-scale-factor=");
    expect(filmRunSrc).toContain("width: 1920, height: 1080");
    expect(filmRunSrc).toContain("width: 3840, height: 2160");
  });
});
