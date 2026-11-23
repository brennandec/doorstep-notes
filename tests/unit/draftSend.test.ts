// Drafting task 9 (R2.3, R8.1): the draft goes out through src/egress/send.ts only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { prepareDraft, sendDraft } from "../../src/drafting/draftFlow";
import { makeLedger } from "../../src/egress/ledger";
import { makePreview } from "../../src/egress/send";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { DraftFailure } from "../../src/inference/draft/draft.real";
import type { DraftJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { CLOUD_MODEL_HOST } from "../../src/constants";

afterEach(() => vi.unstubAllGlobals());

const clients = parseClientList(inventedVisit.clientList).entries;
const prep = () => prepareDraft({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });

describe("prepareDraft", () => {
  it("builds the outgoing text and a preview of that very text", () => {
    const p = prep();
    expect(p.preview.text).toBe(p.outgoing.text);
    expect(p.preview.canSend).toBe(true);
  });

  it("blocks Send when a listed name is in the text and was not chosen on purpose", () => {
    const p = prepareDraft({
      record: { ...inventedVisit.preparedRecord, seen: ["Mould."] },
      clients,
      policy: DEFAULT_POLICY,
    });
    const bad = makePreview(`${p.outgoing.text}\nPriya Halloran rang.`, p.values);
    expect(bad.canSend).toBe(false);
    expect(bad.blockedLine?.kind).toBe("blocked");
    expect(bad.blockedLine?.verdict).toContain("Priya Halloran");
  });

  it("lets a name through when she chose to send it on purpose", () => {
    const p = prepareDraft({
      record: inventedVisit.preparedRecord,
      clients,
      policy: DEFAULT_POLICY,
      sentOnPurpose: ["Maria Okonkwo-Reyes"],
    });
    expect(p.outgoing.text).toContain("Maria Okonkwo-Reyes");
    expect(p.preview.canSend).toBe(true);
  });
});

describe("sendDraft", () => {
  it("does not call the job when the preview check blocks the text", async () => {
    const p = prep();
    const run = vi.fn();
    const job = { run } as unknown as DraftJob;
    const ledger = makeLedger();
    const blocked = { ...p, preview: makePreview(`${p.outgoing.text}\nPriya Halloran rang.`, p.values) };
    const out = await sendDraft(blocked, "PREFER_IN_CLOUD", { draft: job, ledger, clients });
    expect(out.status).toBe("blocked");
    if (out.status === "blocked") expect(out.lines.kind).toBe("blocked");
    expect(run).not.toHaveBeenCalled();
    expect(ledger.all()).toHaveLength(0);
  });

  it("captures the request, checks the bytes and writes a ledger entry with job draft", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    const p = prep();
    const job: DraftJob = {
      async run(_t, input) {
        await fetch(`https://${CLOUD_MODEL_HOST}/v1beta/projects/p/models/m:generateContent`, {
          method: "POST",
          body: JSON.stringify({ contents: [{ parts: [{ text: input.text }] }] }),
        });
        return { value: { text: "[Person 1] agreed.", short: false }, inferenceSource: "IN_CLOUD", connected: true };
      },
    };
    const ledger = makeLedger();
    const out = await sendDraft(p, "PREFER_IN_CLOUD", { draft: job, ledger, clients });
    expect(out.status).toBe("drafted");
    if (out.status !== "drafted") return;
    expect(out.captured).toHaveLength(1);
    expect(out.captured[0]!.url).toContain(CLOUD_MODEL_HOST);
    expect(new TextDecoder().decode(out.captured[0]!.body)).toContain("Visit date");
    expect(out.lines.kind).toBe("pass");
    expect(out.restored.text).toBe("Maria Okonkwo-Reyes agreed.");
    const entries = ledger.all();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ job: "draft", mode: "PREFER_IN_CLOUD", inferenceSource: "IN_CLOUD", connected: true });
    expect(entries[0]!.sha256).toHaveLength(1);
  });

  it("gives the job the shown text and nothing else", async () => {
    const p = prep();
    const seen: unknown[] = [];
    const job: DraftJob = {
      async run(t, input, mode) {
        seen.push(input, mode);
        return draftDouble.run(t, input, mode);
      },
    };
    await sendDraft(p, "PREFER_IN_CLOUD", { draft: job, ledger: makeLedger(), clients });
    expect(seen).toEqual([{ text: p.outgoing.text }, "PREFER_IN_CLOUD"]);
  });

  it("restores names on the device and keeps the labels from the result", async () => {
    const out = await sendDraft(prep(), "PREFER_IN_CLOUD", { draft: draftDouble, ledger: makeLedger(), clients });
    expect(out.status).toBe("drafted");
    if (out.status !== "drafted") return;
    expect(out.labels).toEqual({ source: "IN_CLOUD", connected: false, shortLine: null });
    expect(out.restored.text).toContain("Maria Okonkwo-Reyes");
    expect(out.lines.rows[2]!.value).toMatch(/cloud off/);
  });

  it("an offline device draft sends nothing and says so", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const device: DraftJob = {
      run: async () => ({ value: { text: "Short [Person 1].", short: true }, inferenceSource: "ON_DEVICE", connected: true }),
    };
    const ledger = makeLedger();
    const out = await sendDraft(prep(), "ONLY_ON_DEVICE", { draft: device, ledger, clients });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(out.status).toBe("drafted");
    if (out.status !== "drafted") return;
    expect(out.captured).toEqual([]);
    expect(out.lines.kind).toBe("offlineDevice");
    expect(out.lines.verdict).toMatch(/^Nothing went to the cloud: 0 of \d+ listed names\.$/);
    expect(out.lines.rows[2]!.value).toBe("none made, draft made on this device");
    expect(out.labels.shortLine).toBe("Shorter draft made on this device.");
    expect(ledger.all()[0]).toMatchObject({ job: "draft", mode: "ONLY_ON_DEVICE", inferenceSource: "ON_DEVICE" });
  });

  it("reports a job failure with its plain line and still writes the ledger", async () => {
    const failing: DraftJob = { run: async () => { throw new DraftFailure("failed", "The draft could not be made. Your masked record is kept."); } };
    const ledger = makeLedger();
    const out = await sendDraft(prep(), "PREFER_IN_CLOUD", { draft: failing, ledger, clients });
    expect(out.status).toBe("failed");
    if (out.status === "failed") expect(out.line).toBe("The draft could not be made. Your masked record is kept.");
    expect(ledger.all()).toHaveLength(1);
  });

  it("uses a plain line for any other error, not the error text", async () => {
    const failing: DraftJob = { run: async () => { throw new Error("internal detail"); } };
    const out = await sendDraft(prep(), "PREFER_IN_CLOUD", { draft: failing, ledger: makeLedger(), clients });
    expect(out.status).toBe("failed");
    if (out.status === "failed") expect(out.line).not.toContain("internal");
  });
});
