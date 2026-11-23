// @vitest-environment happy-dom
// H11 item 3 (second-reader R7): two byte counts, each with its own words.
// The pass line used to give the bytes and requests of every captured request, App Check
// exchange included, under the words "Bytes sent". On the real run that was 1,066 bytes in 2
// requests while the call to the model was 1,012 bytes in one request. Now the screen says both.
// The last test reads the counts from results/second-reader-real-service.json and checks that
// the line the page showed in that run is the line built from the counts in the same file.
// Invented people only.
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { passText, renderReaderPanel } from "../../src/app/zones/readerPanel";
import { CLOUD_MODEL_HOST } from "../../src/constants";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { makeLedger } from "../../src/egress/ledger";
import type { SecondReaderJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { askSecondReader, prepareSecondReader, readPass } from "../../src/secondReader/flow";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const APP_CHECK_HOST = "content-firebaseappcheck.googleapis.com";
const MODEL_URL = `https://${CLOUD_MODEL_HOST}/v1beta/projects/invented/models/gemini-3.5-flash-lite:generateContent`;
const APP_CHECK_URL = `https://${APP_CHECK_HOST}/v1/projects/invented/apps/invented:exchangeDebugToken`;
const enc = (s: string) => new TextEncoder().encode(s);

afterEach(() => vi.unstubAllGlobals());

const captured = (url: string, body: string) => ({ url, body: enc(body) }) as never;

describe("the pass keeps the two counts apart (R7.1)", () => {
  it("counts the model call alone and every request with a body, App Check included", async () => {
    const wire = [captured(APP_CHECK_URL, "x".repeat(54)), captured(MODEL_URL, "y".repeat(1012))];
    const pass = await readPass(wire, "text", "2026-11-14T09:00:00.000Z");
    expect(pass.modelBytes).toBe(1012);
    expect(pass.modelRequests).toBe(1);
    expect(pass.bytes).toBe(1066);
    expect(pass.requests).toBe(2);
    expect(pass.host).toBe(CLOUD_MODEL_HOST);
  });

  it("with the model call alone, the two counts are equal", async () => {
    const pass = await readPass([captured(MODEL_URL, "y".repeat(500))], "text", "2026-11-14T09:00:00.000Z");
    expect([pass.modelBytes, pass.modelRequests]).toEqual([pass.bytes, pass.requests]);
  });

  it("a pass with no bytes has no counts", async () => {
    const pass = await readPass([], "text", "2026-11-14T09:00:00.000Z");
    expect([pass.modelBytes, pass.modelRequests, pass.bytes, pass.requests]).toEqual([0, 0, 0, 0]);
  });

  it("a live second-reader pass through the send path carries both", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const job: SecondReaderJob = {
      mode: "ONLY_IN_CLOUD",
      async run(_t, input) {
        await fetch(APP_CHECK_URL, { method: "POST", body: JSON.stringify({ debug_token: "invented" }) });
        await fetch(MODEL_URL, { method: "POST", body: JSON.stringify({ contents: [{ parts: [{ text: input.text }] }] }) });
        return { value: { guesses: [] }, inferenceSource: "IN_CLOUD", connected: true };
      },
    };
    const out = await askSecondReader(prepareSecondReader(outgoing), { reader: job, ledger: makeLedger(), clients, policy: DEFAULT_POLICY });
    if (out.status !== "answered") throw new Error("expected answered");
    const p = out.result.pass;
    expect(p.requests).toBe(2);
    expect(p.modelRequests).toBe(1);
    expect(p.bytes).toBeGreaterThan(p.modelBytes);
  });
});

describe("the screen names both counts with their own words (R7.1)", () => {
  const pass = {
    left: true, host: CLOUD_MODEL_HOST, model: "gemini-3.5-flash-lite", sha256: "ab".repeat(32), at: "2026-11-14T09:00:00.000Z", read: "x",
    modelBytes: 1012, modelRequests: 1, bytes: 1066, requests: 2,
  };

  it("says what each count counts", () => {
    const t = passText(pass);
    expect(t).toContain("Sent to the model: 1,012 bytes in one request.");
    expect(t).toContain("Including the App Check exchange: 1,066 bytes in 2 requests.");
    expect(t).not.toContain("Bytes sent:");
  });

  it("uses the singular for one request and the plural for the rest", () => {
    expect(passText({ ...pass, modelRequests: 2 })).toContain("Sent to the model: 1,012 bytes in 2 requests.");
  });

  it("is on the page, with the host, the model and the short hash", () => {
    const state = emptyState({ record: inventedVisit.preparedRecord });
    const s = {
      ...state,
      reader: { pending: false, asking: false, line: null, maskedQuotes: [], announce: "", result: { guesses: [], replaced: 0, allDropped: false, source: "IN_CLOUD", connected: true, pass } as never },
    };
    const t = renderReaderPanel(s).querySelector("[data-reader-pass]")?.textContent ?? "";
    expect(t).toContain("Sent to the model: 1,012 bytes in one request.");
    expect(t).toContain("Including the App Check exchange: 1,066 bytes in 2 requests.");
    expect(t).toContain(CLOUD_MODEL_HOST);
    expect(t).toContain("abababababab");
  });

  it("the words are in the string table", () => {
    expect(strings.secondReader.passModelCount).toContain("Sent to the model");
    expect(strings.secondReader.passAllCount).toContain("App Check");
  });
});

describe("the results file carries both counts, and the line on the screen is built from them (R7.2, R7.3)", () => {
  const FILE = "results/second-reader-real-service.json";
  const file = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Record<string, unknown>) : null;

  it("has all four counts, and the model's alone is the one in bytesLeft", () => {
    expect(file).not.toBeNull();
    for (const key of ["bytesToModel", "requestsToModel", "bytesIncludingAppCheck", "requestsIncludingAppCheck"]) {
      expect(typeof file![key], key).toBe("number");
    }
    expect(file!.bytesLeft).toBe(file!.bytesToModel);
    expect(file!.requestsToModel).toBe(1);
    expect(file!.bytesIncludingAppCheck as number).toBeGreaterThanOrEqual(file!.bytesToModel as number);
    expect(file!.requestsIncludingAppCheck as number).toBeGreaterThanOrEqual(file!.requestsToModel as number);
  });

  it("the pass line the page showed is the line built from those counts", () => {
    expect(file).not.toBeNull();
    const line = passText({
      left: true,
      host: String(file!.host),
      model: String(file!.model),
      sha256: String(file!.sha256OfBytesLeft),
      at: "",
      read: "",
      modelBytes: file!.bytesToModel as number,
      modelRequests: file!.requestsToModel as number,
      bytes: file!.bytesIncludingAppCheck as number,
      requests: file!.requestsIncludingAppCheck as number,
    });
    expect(String(file!.passLineOnScreen).replace(/\s+/g, " ")).toBe(line);
  });

  it("no longer says 1,066 bytes in 2 requests under the model's words", () => {
    expect(String(file?.passLineOnScreen)).not.toMatch(/Bytes sent: 1,066/);
  });
});
