// Drafting task 10 (R4, R5): what happens when she presses Draft, by network and device state.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { PROBE_TIMEOUT_MS } from "../../src/constants";
import { prepareDraft } from "../../src/drafting/draftFlow";
import { requestDraft, type RequestDeps } from "../../src/drafting/requestDraft";
import { makeLedger } from "../../src/egress/ledger";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DeviceModelState, DraftJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const clients = parseClientList(inventedVisit.clientList).entries;
const prep = () => prepareDraft({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });

function deps(over: {
  online?: boolean;
  fetch?: RequestDeps["online"]["fetch"];
  device?: DeviceModelState;
  percent?: number;
  draft?: DraftJob;
}): RequestDeps & { draft: DraftJob } {
  const draft = over.draft ?? { run: vi.fn(async (t, i, m) => draftDouble.run(t, i, m)) };
  return {
    online: { navigatorOnLine: () => over.online ?? true, fetch: over.fetch ?? (async () => ({ ok: true })), now: () => 1 },
    device: async () => ({ state: over.device ?? "available", ...(over.percent === undefined ? {} : { percent: over.percent }) }),
    draft,
    ledger: makeLedger(),
    clients,
  };
}

describe("online (R5.1, R5.2)", () => {
  it("waits for Send and shows the cloud mode, whatever the device model is", async () => {
    for (const device of ["unavailable", "downloading", "available"] as const) {
      const d = deps({ device });
      const step = await requestDraft(prep(), d);
      expect(step).toEqual({ step: "needsSend", mode: "PREFER_IN_CLOUD" });
      expect(d.draft.run).not.toHaveBeenCalled();
    }
  });
});

describe("offline with the device model available (R4.1)", () => {
  it("makes the device draft at once, without a probe and without waiting", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => ({ ok: true }));
    const d = deps({ online: false, device: "available", fetch: fetchSpy });
    // No timer is advanced: if the flow waited on a timer, this would never settle.
    const step = await requestDraft(prep(), d);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(step.step).toBe("done");
    if (step.step !== "done" || step.outcome.status !== "drafted") throw new Error("expected a draft");
    expect(step.outcome.labels.shortLine).toBe("Shorter draft made on this device.");
    expect(step.outcome.result.inferenceSource).toBe("ON_DEVICE");
    expect(d.draft.run).toHaveBeenCalledWith(expect.anything(), { text: prep().outgoing.text }, "ONLY_ON_DEVICE");
  });

  it("waits no longer than the probe limit when the browser says online but nothing answers", async () => {
    vi.useFakeTimers();
    const hang = () => new Promise<{ ok: boolean }>(() => {});
    const d = deps({ online: true, device: "available", fetch: hang });
    let settled = false;
    const promise = requestDraft(prep(), d).then((s) => {
      settled = true;
      return s;
    });
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const step = await promise;
    expect(step.step).toBe("done");
    expect(d.draft.run).toHaveBeenCalledWith(expect.anything(), expect.anything(), "ONLY_ON_DEVICE");
  });

  it("sends nothing: no request is made", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = deps({ online: false, device: "available", fetch: fetchSpy as never });
    await requestDraft(prep(), d);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("offline with no device model (R4.2)", () => {
  it("shows the plain line and keeps the masked record to copy", async () => {
    for (const device of ["unavailable", "downloadable"] as const) {
      const p = prep();
      const d = deps({ online: false, device });
      const step = await requestDraft(p, d);
      expect(step).toEqual({
        step: "noDraft",
        reason: "noModel",
        line: "No draft can be made right now. Your masked record is kept.",
        copyText: p.outgoing.maskedRecord,
      });
      expect(d.draft.run).not.toHaveBeenCalled();
    }
    expect(strings.drafting.noDraft).toBe("No draft can be made right now. Your masked record is kept.");
  });

  it("the copyable text is the masked record: no listed name in it", async () => {
    const step = await requestDraft(prep(), deps({ online: false, device: "unavailable" }));
    if (step.step !== "noDraft") throw new Error("expected noDraft");
    expect(step.copyText).not.toMatch(/Maria|Okonkwo|Brandvold/);
    expect(step.copyText).toMatch(/\[Person 1\]/);
  });

  it("is the same when the probe fails while the browser says online", async () => {
    const step = await requestDraft(prep(), deps({ online: true, device: "unavailable", fetch: async () => ({ ok: false }) }));
    expect(step.step).toBe("noDraft");
  });
});

describe("offline with the model downloading (R4.3)", () => {
  it("shows the same line with the progress", async () => {
    const p = prep();
    const step = await requestDraft(p, deps({ online: false, device: "downloading", percent: 40 }));
    expect(step).toEqual({
      step: "noDraft",
      reason: "downloading",
      line: "No draft can be made right now. Your masked record is kept. The device model is downloading, 40%.",
      copyText: p.outgoing.maskedRecord,
    });
  });

  it("shows no percentage it does not have", async () => {
    const step = await requestDraft(prep(), deps({ online: false, device: "downloading" }));
    if (step.step !== "noDraft") throw new Error("expected noDraft");
    expect(step.line).toBe("No draft can be made right now. Your masked record is kept. The device model is downloading.");
  });
});

describe("a blocked text never reaches the job", () => {
  it("returns the blocked step before choosing anything", async () => {
    const p = prepareDraft({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const bad = { ...p, preview: { ...p.preview, canSend: false, blockedLine: { kind: "blocked" } as never } };
    const d = deps({ online: false, device: "available" });
    const step = await requestDraft(bad, d);
    expect(step.step).toBe("blocked");
    expect(d.draft.run).not.toHaveBeenCalled();
  });
});
