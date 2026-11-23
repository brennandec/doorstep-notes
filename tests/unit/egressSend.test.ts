import { afterEach, describe, expect, it, vi } from "vitest";
import { makeLedger } from "../../src/egress/ledger";
import { sha256Hex } from "../../src/egress/hash";
import { bodyForDouble, makePreview, send, type CheckValues, type SendContext } from "../../src/egress/send";
import type { JobResult } from "../../src/inference/types";

const values: CheckValues = {
  listedNames: ["Maria Okonkwo-Reyes", "Tomas Brandvold", "Priya Halloran"],
  surfaceForms: ["Alder Court", "Bea"],
  sentOnPurpose: [],
};
const ctxOf = (over: Partial<SendContext> = {}): SendContext => ({
  ...values,
  ledger: makeLedger(),
  now: () => new Date("2026-11-12T21:30:00.000Z"),
  ...over,
});
const CLEAN = "Visit date: 2026-11-12\nPresent: [Person 1], worker\nSeen: mould at [Place 1].";
const ok = <T>(value: T, over: Partial<JobResult<T>> = {}): JobResult<T> => ({
  value,
  inferenceSource: "IN_CLOUD",
  connected: true,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("makePreview", () => {
  it("allows Send for clean text and keeps the text as given", () => {
    const p = makePreview(CLEAN, values);
    expect(p.text).toBe(CLEAN);
    expect(p.canSend).toBe(true);
    expect(p.blockedLine).toBeNull();
  });

  it("blocks Send on a listed name and names it in the line", () => {
    const p = makePreview("Present: Maria Okonkwo-Reyes", values);
    expect(p.canSend).toBe(false);
    expect(p.blockedLine?.verdict).toBe("Found in the text that would leave: Maria Okonkwo-Reyes.");
    expect(p.blockedLine?.rows).toEqual([{ label: "What to do", value: "Mask it, then send." }]);
    expect(p.blockedLine?.failure).toBe(true);
    expect(p.blockedLine?.icon).toBe("crossedOctagon");
  });

  it("blocks Send on a recorded surface form, in any case", () => {
    const p = makePreview("at ALDER COURT", values);
    expect(p.canSend).toBe(false);
    expect(p.blockedLine?.verdict).toContain("Alder Court");
  });

  it("allows a name that she chose to send on purpose", () => {
    const p = makePreview("Present: Maria Okonkwo-Reyes", { ...values, sentOnPurpose: ["Maria Okonkwo-Reyes"] });
    expect(p.canSend).toBe(true);
  });

  it("checks the plain text, not a JSON copy of it", () => {
    expect(makePreview('{"a":"Priya Halloran"}', values).canSend).toBe(false);
  });
});

describe("send", () => {
  it("gives the job the preview text, character for character", async () => {
    const run = vi.fn(async (_t: unknown, text: string) => ok(text));
    const preview = makePreview(CLEAN, values);
    const out = await send({ preview, job: "draft", mode: "PREFER_IN_CLOUD", run }, ctxOf());
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![1]).toBe(preview.text);
    expect(run.mock.calls[0]![1]).toBe(CLEAN);
    expect(out.status).toBe("sent");
  });

  it("gives the job a ticket", async () => {
    let seen: unknown;
    await send(
      { preview: makePreview(CLEAN, values), job: "draft", mode: "PREFER_IN_CLOUD", run: async (t) => ((seen = t), ok("x")) },
      ctxOf(),
    );
    expect(seen).toBeTypeOf("object");
  });

  it("does not call the job when the text holds a listed name not on purpose", async () => {
    const run = vi.fn(async () => ok("x"));
    const preview = { ...makePreview(CLEAN, values), text: "Present: Tomas Brandvold" };
    const ledger = makeLedger();
    const out = await send({ preview, job: "draft", mode: "PREFER_IN_CLOUD", run }, ctxOf({ ledger }));
    expect(out.status).toBe("blocked");
    expect(run).not.toHaveBeenCalled();
    expect(ledger.all()).toHaveLength(0);
    if (out.status === "blocked") expect(out.lines.verdict).toContain("Tomas Brandvold");
  });

  it("runs the check on the bytes the browser sent, not on the preview", async () => {
    const fake = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fake);
    const out = await send(
      {
        preview: makePreview(CLEAN, values),
        job: "draft",
        mode: "PREFER_IN_CLOUD",
        // The preview is clean; the request the job makes carries a name.
        run: async (_t, text) => {
          await fetch("https://example.invalid/v1/generate", { method: "POST", body: JSON.stringify({ text, extra: "Priya Halloran" }) });
          return ok("draft text");
        },
      },
      ctxOf(),
    );
    expect(out.status).toBe("sent");
    if (out.status !== "sent") return;
    expect(out.check.passed).toBe(false);
    expect(out.check.listedFound).toEqual(["Priya Halloran"]);
    expect(out.lines.kind).toBe("fail");
    expect(out.lines.verdict).toContain("Egress check failed");
    expect(out.lines.verdict).toContain("Found 1 of 3 listed names");
    expect(out.entry.connected).toBe(true);
    expect(out.entry.byteLengths).toEqual([out.captured[0]!.body.byteLength]);
    expect(out.entry.requests).toEqual([{ host: "example.invalid", bytes: out.captured[0]!.body.byteLength, carriesNote: true, preflight: false }]);
    expect(out.captured[0]!.preflight).toBe(false);
  });

  it("counts a preflight when the call sets a non-safelisted header, and still checks the bytes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const out = await send(
      {
        preview: makePreview(CLEAN, values),
        job: "draft",
        mode: "PREFER_IN_CLOUD",
        run: async (_t, text) => {
          await fetch("https://example.invalid/v1/generate", {
            method: "POST",
            body: JSON.stringify({ text, extra: "Priya Halloran" }),
            headers: { "content-type": "application/json", "x-goog-api-key": "not-a-key" },
          });
          return ok("draft text");
        },
      },
      ctxOf(),
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.check.listedFound).toEqual(["Priya Halloran"]);
    expect(out.entry.requests).toEqual([{
      host: "example.invalid",
      bytes: out.captured[0]!.body.byteLength,
      carriesNote: true,
      preflight: true,
    }]);
    expect(JSON.stringify(out.entry.requests)).not.toContain("not-a-key");
  });

  it("passes when the captured bytes are clean, and hashes them", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const body = JSON.stringify({ text: CLEAN });
    const out = await send(
      {
        preview: makePreview(CLEAN, values),
        job: "secondReader",
        mode: "ONLY_IN_CLOUD",
        run: async () => {
          await fetch("https://example.invalid/v1/generate", { method: "POST", body });
          return ok({ guesses: [] });
        },
      },
      ctxOf(),
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.lines.kind).toBe("pass");
    expect(out.lines.verdict).toContain("0 of 3.");
    expect(out.entry.sha256).toEqual([await sha256Hex(body)]);
    expect(out.entry.job).toBe("secondReader");
    expect(out.entry.mode).toBe("ONLY_IN_CLOUD");
    expect(out.entry.inferenceSource).toBe("IN_CLOUD");
    expect(out.entry.at).toBe("2026-11-12T21:30:00.000Z");
  });

  it("with a double: checks the built body, connected is false, and the line says not connected", async () => {
    const fake = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fake);
    const out = await send(
      { preview: makePreview(CLEAN, values), job: "draft", mode: "PREFER_IN_CLOUD", run: async (_t, text) => ok(text, { connected: false }) },
      ctxOf(),
    );
    expect(fake).not.toHaveBeenCalled();
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.entry.connected).toBe(false);
    expect(out.lines.rows[2]!.value).toMatch(/cloud off/i);
    expect(out.captured).toHaveLength(1);
    expect(out.captured[0]!.body).toEqual(bodyForDouble(CLEAN));
    expect(out.entry.sha256).toEqual([await sha256Hex(bodyForDouble(CLEAN))]);
    expect(out.entry.byteLengths).toEqual([bodyForDouble(CLEAN).byteLength]);
    expect(out.entry.requests).toEqual([]);
  });

  it("a seeded leak in the captured body gives the fail line", async () => {
    const out = await send(
      { preview: makePreview(CLEAN, values), job: "draft", mode: "PREFER_IN_CLOUD", run: async (_t, text) => ok(text, { connected: false }) },
      ctxOf({
        seedLeak: (body) => new Uint8Array([...body, ...new TextEncoder().encode(" Priya Halloran")]),
      }),
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.check.passed).toBe(false);
    expect(out.lines.kind).toBe("fail");
    expect(out.lines.failure).toBe(true);
    expect(out.lines.icon).toBe("crossedOctagon");
    expect(out.lines.verdict).toContain("Egress check failed");
    expect(out.lines.verdict).toContain("Found");
    expect(out.lines.verdict).toContain("Priya Halloran");
    expect(out.entry.listedFound).toBe(1);
  });

  it("a name sent on purpose is reported apart and is not a failure", async () => {
    const ctx = ctxOf({ sentOnPurpose: ["Maria Okonkwo-Reyes"] });
    const text = "Present: Maria Okonkwo-Reyes";
    const out = await send(
      { preview: makePreview(text, ctx), job: "draft", mode: "PREFER_IN_CLOUD", run: async (_t, t) => ok(t, { connected: false }) },
      ctx,
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.lines.kind).toBe("onPurpose");
    expect(out.lines.verdict).toContain("on purpose: Maria Okonkwo-Reyes");
    expect(out.entry.onPurpose).toBe(1);
    expect(out.entry.listedFound).toBe(0);
  });

  it("a device draft with no request reads as nothing sent to the cloud", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const out = await send(
      {
        preview: makePreview(CLEAN, values),
        job: "draft",
        mode: "ONLY_ON_DEVICE",
        run: async (_t, text) => ok({ text, short: true }, { inferenceSource: "ON_DEVICE" }),
      },
      ctxOf(),
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.lines.kind).toBe("offlineDevice");
    expect(out.entry.inferenceSource).toBe("ON_DEVICE");
    expect(out.entry.sha256).toEqual([]);
    expect(out.entry.mode).toBe("ONLY_ON_DEVICE");
  });

  it("a device draft that made a request carrying a name is a failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const out = await send(
      {
        preview: makePreview(CLEAN, values),
        job: "draft",
        mode: "ONLY_ON_DEVICE",
        run: async () => {
          await fetch("https://example.invalid/x", { method: "POST", body: "Tomas Brandvold" });
          return ok({ text: "x", short: true }, { inferenceSource: "ON_DEVICE" });
        },
      },
      ctxOf(),
    );
    if (out.status !== "sent") throw new Error("expected sent");
    expect(out.lines.kind).toBe("fail");
  });

  it("when the job throws, still checks what was sent and appends an entry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const ledger = makeLedger();
    const boom = new Error("model refused");
    const out = await send(
      {
        preview: makePreview(CLEAN, values),
        job: "draft",
        mode: "PREFER_IN_CLOUD",
        run: async () => {
          await fetch("https://example.invalid/x", { method: "POST", body: "Priya Halloran" });
          throw boom;
        },
      },
      ctxOf({ ledger }),
    );
    expect(out.status).toBe("failed");
    if (out.status !== "failed") return;
    expect(out.error).toBe(boom);
    expect(out.lines.kind).toBe("fail");
    expect(ledger.all()).toHaveLength(1);
  });

  it("puts nothing but counts, hashes and times in the ledger", async () => {
    const ledger = makeLedger();
    const text = "Visit with [Person 1] at [Place 1]";
    await send(
      { preview: makePreview(text, values), job: "rewrite", mode: "PREFER_ON_DEVICE", run: async (_t, t) => ok(t, { connected: false }) },
      ctxOf({ ledger }),
    );
    const stored = JSON.stringify(ledger.all());
    expect(stored).not.toContain("Person");
    expect(stored).not.toContain("Visit");
    expect(ledger.all()[0]?.job).toBe("rewrite");
  });

  it("refuses a second send while one runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = send(
      { preview: makePreview(CLEAN, values), job: "draft", mode: "PREFER_IN_CLOUD", run: async () => (await gate, ok("x")) },
      ctxOf(),
    );
    await expect(
      send({ preview: makePreview(CLEAN, values), job: "draft", mode: "PREFER_IN_CLOUD", run: async () => ok("y") }, ctxOf()),
    ).rejects.toThrow(/already running/);
    release();
    expect((await first).status).toBe("sent");
  });
});
