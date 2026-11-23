// egress-check R17 (session H15): each request row says how the request was answered.
// One test per line of words. Invented people only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { withCapture } from "../../src/egress/capture";
import type { CheckResult } from "../../src/egress/check";
import { buildLines } from "../../src/egress/line";
import { makeLedger } from "../../src/egress/ledger";
import { send, type CheckValues } from "../../src/egress/send";
import type { JobResult } from "../../src/inference/types";

afterEach(() => vi.unstubAllGlobals());

const result: CheckResult = { listedChecked: 12, listedFound: [], maskedChecked: 4, maskedFound: [], onPurposeFound: [], passed: true };
const HOST = "firebasevertexai.googleapis.com";
const requestRow = (input: Partial<Parameters<typeof buildLines>[0]>) => buildLines({ result, connected: true, host: HOST, ...input }).rows.find((r) => r.label === "The request")!.value;

describe("the capture records how each request was answered", () => {
  it("records the HTTP status of an answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    const out = await withCapture(async () => {
      await fetch("https://example.invalid/a", { method: "POST", body: "one" });
      await fetch("https://example.invalid/b", { method: "POST", body: "two" }).catch(() => undefined);
    });
    expect(out.captured.map((c) => c.status)).toEqual([200, 200]);
  });

  it("records an HTTP error as its status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    const out = await withCapture(async () => void (await fetch("https://example.invalid/a", { method: "POST", body: "x" })));
    expect(out.captured[0]!.status).toBe(403);
  });

  it("records no answer when fetch throws, and lets the error through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const out = await withCapture(async () => void (await fetch("https://example.invalid/a", { method: "POST", body: "x" })));
    expect(out.ok).toBe(false);
    expect(out.captured[0]!.status).toBe("no answer");
  });
});

describe("the request row of the card", () => {
  it("answered: sent to the host, answered the status", () => {
    expect(requestRow({ status: 200 })).toBe("sent to firebasevertexai.googleapis.com · answered 200");
  });

  it("no answer: sent to the host, no answer", () => {
    expect(requestRow({ status: "no answer" })).toBe("sent to firebasevertexai.googleapis.com · no answer");
  });

  it("no answer and the source is the device: says the draft was made on this device", () => {
    expect(requestRow({ status: "no answer", source: "ON_DEVICE" })).toBe("sent to firebasevertexai.googleapis.com · no answer, drafted on this device");
  });

  it("an HTTP error and the source is the device: says what answered and where the draft was made", () => {
    expect(requestRow({ status: 403, source: "ON_DEVICE" })).toBe("sent to firebasevertexai.googleapis.com · answered 403, drafted on this device");
  });

  it("no request made: the old words stay", () => {
    expect(requestRow({ connected: false, host: "" })).toBe("none made, answered by a fixed sample: cloud off");
    expect(requestRow({ deviceOnly: true, connected: true, host: "" })).toBe("none made, draft made on this device");
  });
});

describe("send puts the status on the card", () => {
  const values: CheckValues = { listedNames: ["Maria Okonkwo-Reyes"], surfaceForms: ["Bea"], sentOnPurpose: [] };
  const text = "Present: [Person 1]";
  const preview = { text, result, canSend: true, blockedLine: null } as never;
  const url = `https://${HOST}/v1beta/projects/p/models/m:generateContent`;

  it("a cut call that the SDK answered from the device shows no answer, drafted on this device", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const out = await send<string>(
      {
        preview,
        job: "draft",
        mode: "PREFER_IN_CLOUD",
        run: async () => {
          await fetch(url, { method: "POST", body: text }).catch(() => undefined);
          return { value: "note", inferenceSource: "ON_DEVICE", connected: true } as JobResult<string>;
        },
      },
      { ...values, ledger: makeLedger() },
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.lines.rows.find((r) => r.label === "The request")!.value).toBe(`sent to ${HOST} · no answer, drafted on this device`);
  });

  it("an answered call shows the status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const out = await send<string>(
      {
        preview,
        job: "draft",
        mode: "PREFER_IN_CLOUD",
        run: async () => {
          await fetch(url, { method: "POST", body: text });
          return { value: "note", inferenceSource: "IN_CLOUD", connected: true } as JobResult<string>;
        },
      },
      { ...values, ledger: makeLedger() },
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.lines.rows.find((r) => r.label === "The request")!.value).toBe(`sent to ${HOST} · answered 200`);
    // The ledger keeps its keys: the status is not a ledger field.
    expect(Object.keys(out.entry)).not.toContain("status");
  });
});
