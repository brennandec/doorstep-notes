// @vitest-environment happy-dom
// Judge table fix 5: one second-reader pass on bytes that actually left the device.
// The pass is read from the bytes the send path captured. The failure tests below fail when no
// bytes left, or when the reader was a test double. Invented people only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { renderReaderPanel } from "../../src/app/zones/readerPanel";
import { emptyState } from "../../src/app/state";
import { CLOUD_MODEL_HOST } from "../../src/constants";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { makeLedger } from "../../src/egress/ledger";
import { secondReaderDouble } from "../../src/inference/secondReader/secondReader.double";
import type { SecondReaderJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { askSecondReader, prepareSecondReader } from "../../src/secondReader/flow";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const now = () => new Date("2026-11-14T09:00:00.000Z");
const URL_OF_CALL = `https://${CLOUD_MODEL_HOST}/v1beta/projects/invented-project/models/gemini-3.5-flash-lite:generateContent`;

afterEach(() => vi.unstubAllGlobals());

/** A job that really calls fetch, as the SDK does, and answers IN_CLOUD. */
function liveJob(): SecondReaderJob {
  return {
    mode: "ONLY_IN_CLOUD",
    async run(_t, input) {
      await fetch(URL_OF_CALL, { method: "POST", body: JSON.stringify({ contents: [{ parts: [{ text: input.text }] }] }) });
      return { value: { guesses: [{ who: "a tenant", evidence: [] }] }, inferenceSource: "IN_CLOUD", connected: true };
    },
  };
}

async function ask(job: SecondReaderJob) {
  const prep = prepareSecondReader(outgoing);
  const out = await askSecondReader(prep, { reader: job, ledger: makeLedger(), clients, policy: DEFAULT_POLICY, now });
  if (out.status !== "answered") throw new Error("expected answered");
  return { out, prep };
}

describe("the pass is read from the bytes that left", () => {
  it("records the host, the model, the request count and the bytes of a live call", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const { out, prep } = await ask(liveJob());
    const pass = out.result.pass;
    expect(pass.left).toBe(true);
    expect(pass.host).toBe(CLOUD_MODEL_HOST);
    expect(pass.model).toBe("gemini-3.5-flash-lite");
    expect(pass.requests).toBe(1);
    expect(pass.bytes).toBe(out.captured.reduce((n, c) => n + c.body.byteLength, 0));
    expect(pass.bytes).toBeGreaterThan(new TextEncoder().encode(prep.text).byteLength);
    expect(pass.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pass.at).toBe("2026-11-14T09:00:00.000Z");
  });

  it("holds the text the cloud read: the masked record and the instructions, and no listed name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const { out, prep } = await ask(liveJob());
    const sent = new TextDecoder().decode(out.captured[0]!.body);
    expect(sent).toContain(JSON.stringify(prep.text).slice(1, -1));
    expect(sent).not.toMatch(/Halloran|Okonkwo|Brandvald/i);
    expect(out.result.pass.read).toBe(prep.text);
  });
});

describe("failure tests: no bytes left, or a test double answered", () => {
  it("a double made no request: the pass says no bytes left", async () => {
    const { out } = await ask(secondReaderDouble);
    expect(out.result.connected).toBe(false);
    expect(out.result.pass.left).toBe(false);
    expect(out.result.pass.bytes).toBe(0);
    expect(out.result.pass.requests).toBe(0);
  });

  it("a job that says IN_CLOUD but sent nothing is not a pass that left", async () => {
    const claims: SecondReaderJob = { mode: "ONLY_IN_CLOUD", run: async () => ({ value: { guesses: [] }, inferenceSource: "IN_CLOUD", connected: true }) };
    const { out } = await ask(claims);
    expect(out.result.pass.left).toBe(false);
    expect(out.result.pass.bytes).toBe(0);
  });
});

describe("the screen shows the pass", () => {
  const withPass = (pass: unknown, connected: boolean) =>
    emptyState({
      record: inventedVisit.preparedRecord,
      reader: {
        pending: false,
        asking: false,
        line: null,
        maskedQuotes: [],
        announce: "",
        result: { guesses: [], replaced: 0, allDropped: false, source: "IN_CLOUD", connected, pass } as never,
      },
    });
  const left = { left: true, host: CLOUD_MODEL_HOST, model: "gemini-3.5-flash-lite", requests: 1, bytes: 2413, modelRequests: 1, modelBytes: 2413, sha256: "ab".repeat(32), at: "2026-11-14T09:00:00.000Z", read: "x" };
  const none = { left: false, host: "", model: "", requests: 0, bytes: 0, modelRequests: 0, modelBytes: 0, sha256: "", at: "2026-11-14T09:00:00.000Z", read: "" };

  it("says how many bytes left, to which host and model, and the short hash", () => {
    const line = renderReaderPanel(withPass(left, true)).querySelector("[data-reader-pass]");
    expect(line).not.toBeNull();
    const t = line!.textContent ?? "";
    expect(t).toContain("Sent to the model: 2,413 bytes in one request.");
    expect(t).toContain(CLOUD_MODEL_HOST);
    expect(t).toContain("gemini-3.5-flash-lite");
    expect(t).toContain("abababababab");
    expect(line!.getAttribute("data-left")).toBe("true");
  });

  it("says no bytes left when a test double answered", () => {
    const line = renderReaderPanel(withPass(none, false)).querySelector("[data-reader-pass]");
    expect(line?.getAttribute("data-left")).toBe("false");
    expect(line?.textContent).toBe(strings.secondReader.passNone);
  });

  it("shows no pass line before the reader has answered", () => {
    expect(renderReaderPanel(emptyState({ record: inventedVisit.preparedRecord })).querySelector("[data-reader-pass]")).toBeNull();
  });
});
