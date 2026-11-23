// Second reader task 5 (R1.3, R1.4, R3.3): the call goes through src/egress/send.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { makeLedger } from "../../src/egress/ledger";
import { secondReaderDouble } from "../../src/inference/secondReader/secondReader.double";
import { SecondReaderFailure } from "../../src/inference/secondReader/secondReader.real";
import { SECOND_READER_INSTRUCTIONS } from "../../src/inference/secondReader/instructions";
import type { SecondReaderJob, SecondReaderOutput } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { makeLedgerStorage, openPersistentLedger } from "../../src/storage/ledger";
import type { KeyValueBackend } from "../../src/storage/backend";
import { memoryBackend } from "../../src/storage/backend";
import { askSecondReader, prepareSecondReader } from "../../src/secondReader/flow";
import { strings } from "../../src/app/strings";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const now = () => new Date("2026-11-12T21:30:00.000Z");
const LEAKY: SecondReaderOutput = {
  guesses: [
    { who: "MARIA OKONKWO-REYES, a tenant", evidence: ["Mould in the back bedroom"] },
    { who: "a neighbour called Brandvald", evidence: ["offered to help with the form"] },
  ],
};
const jobReturning = (value: SecondReaderOutput, connected = true): SecondReaderJob & { texts: string[] } => {
  const texts: string[] = [];
  return {
    texts,
    mode: "ONLY_IN_CLOUD",
    async run(_t, input) {
      texts.push(input.text);
      return { value, inferenceSource: "IN_CLOUD", connected };
    },
  };
};
const depsOf = (reader: SecondReaderJob, ledger = makeLedger()) => ({ reader, ledger, clients, policy: DEFAULT_POLICY, now });

afterEach(() => vi.unstubAllGlobals());

describe("prepareSecondReader", () => {
  it("builds the masked record plus the fixed instructions", () => {
    const prep = prepareSecondReader(outgoing);
    expect(prep.text).toBe(`${outgoing.maskedRecord}\n\n${SECOND_READER_INSTRUCTIONS}`);
    expect(prep.preview.text).toBe(prep.text);
    expect(prep.preview.canSend).toBe(true);
  });

  it("holds the same masked record she already sees in zone 2 for the draft", () => {
    expect(prepareSecondReader(outgoing).text).toContain(outgoing.maskedRecord);
  });
});

describe("askSecondReader", () => {
  it("gives the job exactly the text that was shown, and nothing else", async () => {
    const job = jobReturning({ guesses: [] });
    const prep = prepareSecondReader(outgoing);
    await askSecondReader(prep, depsOf(job));
    expect(job.texts).toEqual([prep.preview.text]);
  });

  it("applies the preview check: a listed name in the text blocks the call and writes no ledger entry", async () => {
    const job = jobReturning({ guesses: [] });
    const ledger = makeLedger();
    const leaky = { ...outgoing, maskedRecord: `${outgoing.maskedRecord}\nPresent: Priya Halloran` };
    const prep = prepareSecondReader(leaky);
    expect(prep.preview.canSend).toBe(false);
    const out = await askSecondReader(prep, depsOf(job, ledger));
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") expect(out.lines.verdict).toContain("Priya Halloran");
    expect(job.texts).toEqual([]);
    expect(ledger.all()).toEqual([]);
  });

  it("appends a ledger entry with job secondReader, mode ONLY_IN_CLOUD and source IN_CLOUD", async () => {
    const ledger = makeLedger();
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(secondReaderDouble, ledger));
    expect(out.status).toBe("answered");
    const entries = ledger.all();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      job: "secondReader",
      mode: "ONLY_IN_CLOUD",
      inferenceSource: "IN_CLOUD",
      connected: false,
      at: "2026-11-12T21:30:00.000Z",
    });
    expect(entries[0]!.sha256).toHaveLength(1);
  });

  it("runs the egress check on the body and prints the line", async () => {
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(secondReaderDouble));
    if (out.status !== "answered") throw new Error("expected answered");
    expect(out.lines.kind).toBe("pass");
    expect(out.lines.rows[2]!.value).toBe(strings.egress.requestDouble);
    expect(out.lines.failure).toBe(false);
    expect(out.entry.listedFound).toBe(0);
    expect(out.entry.maskedFound).toBe(0);
  });

  it("with a live job, checks the bytes the browser sent", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
      seen.push(init.body);
      return new Response("{}");
    }));
    const job: SecondReaderJob = {
      mode: "ONLY_IN_CLOUD",
      async run(_t, input) {
        await fetch("https://example.invalid/v1/generate", { method: "POST", body: JSON.stringify({ text: input.text }) });
        return { value: { guesses: [] }, inferenceSource: "IN_CLOUD", connected: true };
      },
    };
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(job));
    if (out.status !== "answered") throw new Error("expected answered");
    expect(seen).toHaveLength(1);
    expect(out.captured).toHaveLength(1);
    expect(out.lines.kind).toBe("pass");
    expect(out.entry.connected).toBe(true);
  });

  it("makes one ledger entry per ask", async () => {
    const ledger = makeLedger();
    const deps = depsOf(secondReaderDouble, ledger);
    await askSecondReader(prepareSecondReader(outgoing), deps);
    await askSecondReader(prepareSecondReader(outgoing), deps);
    expect(ledger.all().map((e) => e.job)).toEqual(["secondReader", "secondReader"]);
  });

  it("redacts the reply before returning it", async () => {
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(jobReturning(LEAKY)));
    if (out.status !== "answered") throw new Error("expected answered");
    expect(JSON.stringify(out.result.guesses)).not.toMatch(/okonkwo|brandvald/i);
    expect(out.result.replaced).toBe(2);
  });

  it("drops quotes that are not in the masked text and reports allDropped", async () => {
    const reply: SecondReaderOutput = { guesses: [{ who: "a tenant", evidence: ["words that are not there"] }] };
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(jobReturning(reply)));
    if (out.status !== "answered") throw new Error("expected answered");
    expect(out.result.guesses).toEqual([{ who: "a tenant", evidence: [] }]);
    expect(out.result.allDropped).toBe(true);
  });

  it("returns the source and connected from the job", async () => {
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(secondReaderDouble));
    if (out.status !== "answered") throw new Error("expected answered");
    expect(out.result.source).toBe("IN_CLOUD");
    expect(out.result.connected).toBe(false);
  });

  it("never writes the unredacted reply to storage or to the ledger (R3.3)", async () => {
    const writes: unknown[] = [];
    const base = memoryBackend();
    const spy: KeyValueBackend = {
      get: (k) => base.get(k),
      set: async (k, v) => {
        writes.push(structuredClone(v));
        await base.set(k, v);
      },
      remove: (k) => base.remove(k),
    };
    const ledger = await openPersistentLedger(makeLedgerStorage(spy));
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(jobReturning(LEAKY), ledger));
    await new Promise((r) => setTimeout(r, 10));
    expect(out.status).toBe("answered");
    expect(writes.length).toBeGreaterThan(0);
    const everything = JSON.stringify([writes, ledger.all()]);
    expect(everything).not.toMatch(/okonkwo|brandvald|neighbour called|tenant/i);
    for (const w of writes) {
      for (const e of (w as { entries: Record<string, unknown>[] }).entries) expect(Object.keys(e)).not.toContain("guesses");
    }
  });

  it("fails with the connection line when the job throws, and still writes the ledger entry", async () => {
    const ledger = makeLedger();
    const job: SecondReaderJob = {
      mode: "ONLY_IN_CLOUD",
      async run() {
        throw new SecondReaderFailure("unreachable", strings.secondReader.needsConnection);
      },
    };
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(job, ledger));
    expect(out.status).toBe("failed");
    if (out.status === "failed") expect(out.line).toBe(strings.secondReader.needsConnection);
    expect(ledger.all()).toHaveLength(1);
  });

  it("fails with the same line when the job throws an error of another kind", async () => {
    const job: SecondReaderJob = {
      mode: "ONLY_IN_CLOUD",
      async run() {
        throw new TypeError("Failed to fetch");
      },
    };
    const out = await askSecondReader(prepareSecondReader(outgoing), depsOf(job));
    if (out.status !== "failed") throw new Error("expected failed");
    expect(out.line).toBe(strings.secondReader.needsConnection);
  });
});
