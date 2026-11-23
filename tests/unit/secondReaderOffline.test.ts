// Second reader task 6 (R4): offline and error behaviour, with a fake probe and a throwing fake.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { makeLedger } from "../../src/egress/ledger";
import { makeKit } from "../../src/inference";
import { secondReaderDouble } from "../../src/inference/secondReader/secondReader.double";
import type { SecondReaderJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import type { OnlineDeps } from "../../src/net/online";
import { askWhenOnline, prepareSecondReader, readerAvailability } from "../../src/secondReader/flow";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const prep = prepareSecondReader(outgoing);

function online(onLine: boolean, probeOk: boolean | "throws") {
  const fetch = vi.fn(async () => {
    if (probeOk === "throws") throw new TypeError("Failed to fetch");
    return { ok: probeOk };
  });
  const deps: OnlineDeps = { navigatorOnLine: () => onLine, fetch, now: () => 1 };
  return { deps, fetch };
}
const spyJob = () => {
  const run = vi.fn(async () => ({ value: { guesses: [] }, inferenceSource: "IN_CLOUD" as const, connected: true }));
  return { job: { mode: "ONLY_IN_CLOUD", run } as SecondReaderJob, run };
};

describe("readerAvailability", () => {
  it("is available when the browser is online and the probe passes", async () => {
    expect(await readerAvailability(online(true, true).deps)).toEqual({ available: true });
  });

  it("is not available when the browser says offline, and runs no probe", async () => {
    const o = online(false, true);
    expect(await readerAvailability(o.deps)).toEqual({ available: false, line: "The second reader needs a connection." });
    expect(o.fetch).not.toHaveBeenCalled();
  });

  it("is not available when the probe answers with an error", async () => {
    expect((await readerAvailability(online(true, false).deps)).available).toBe(false);
  });

  it("is not available when the probe throws", async () => {
    expect((await readerAvailability(online(true, "throws").deps)).available).toBe(false);
  });

  it("takes no device model state, so the model being absent or downloading changes nothing (R4.2)", () => {
    expect(readerAvailability.length).toBe(1);
  });
});

describe("askWhenOnline", () => {
  it("offline: calls nothing, writes no ledger entry, and gives the connection line", async () => {
    const { job, run } = spyJob();
    const ledger = makeLedger();
    const out = await askWhenOnline(prep, { reader: job, ledger, clients, policy: DEFAULT_POLICY, online: online(false, true).deps });
    expect(out).toEqual({ status: "offline", line: strings.secondReader.needsConnection });
    expect(run).not.toHaveBeenCalled();
    expect(ledger.all()).toEqual([]);
  });

  it("probe failed: the same, with no request but the probe", async () => {
    const { job, run } = spyJob();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const out = await askWhenOnline(prep, { reader: job, ledger: makeLedger(), clients, policy: DEFAULT_POLICY, online: online(true, false).deps });
    vi.unstubAllGlobals();
    expect(out.status).toBe("offline");
    expect(run).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("online: asks, and the answer comes back", async () => {
    const { job, run } = spyJob();
    const out = await askWhenOnline(prep, { reader: job, ledger: makeLedger(), clients, policy: DEFAULT_POLICY, online: online(true, true).deps });
    expect(out.status).toBe("answered");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a throwing job gives the connection line even when the clock reads 503 milliseconds (H11 item 4)", async () => {
    const at503 = () => new Date("2026-11-14T09:00:00.503Z");
    const throwing: SecondReaderJob = { mode: "ONLY_IN_CLOUD", run: async () => { throw new Error("503 from the service for Maria Okonkwo-Reyes"); } };
    const pinned = await askWhenOnline(prep, { reader: throwing, ledger: makeLedger(), clients, policy: DEFAULT_POLICY, online: online(true, true).deps, now: at503 });
    expect(JSON.stringify(pinned)).not.toMatch(/from the service|Okonkwo/);
  });

  it("a throwing job gives the connection line, not the error message", async () => {
    const job: SecondReaderJob = {
      mode: "ONLY_IN_CLOUD",
      async run() {
        throw new Error("503 from the service for Maria Okonkwo-Reyes");
      },
    };
    // The clock is fixed: a real clock can read ".503" and the digits would match the error text (H11 item 4).
    const out = await askWhenOnline(prep, { reader: job, ledger: makeLedger(), clients, policy: DEFAULT_POLICY, online: online(true, true).deps, now: () => new Date("2026-11-14T09:00:00.000Z") });
    expect(out.status).toBe("failed");
    expect(JSON.stringify(out)).not.toMatch(/from the service|Okonkwo/);
    if (out.status === "failed") expect(out.line).toBe(strings.secondReader.needsConnection);
  });

  it("a failed ask leaves the prepared text unchanged, so it can be sent again (R4.3)", async () => {
    const before = prep.text;
    const job: SecondReaderJob = { mode: "ONLY_IN_CLOUD", run: async () => { throw new Error("x"); } };
    await askWhenOnline(prep, { reader: job, ledger: makeLedger(), clients, policy: DEFAULT_POLICY, online: online(true, true).deps });
    expect(prep.text).toBe(before);
    expect(prep.preview.text).toBe(before);
    const again = await askWhenOnline(prep, { reader: secondReaderDouble, ledger: makeLedger(), clients, policy: DEFAULT_POLICY, online: online(true, true).deps });
    expect(again.status).toBe("answered");
  });
});

describe("the device model state", () => {
  it("does not change which job answers (R4.2)", () => {
    const other = { value: undefined as never, inferenceSource: "ON_DEVICE" as const, connected: true };
    const real: SecondReaderJob = { mode: "ONLY_IN_CLOUD", run: async () => other as never };
    const deps = {
      real: {
        structure: { mode: "ONLY_ON_DEVICE" as const, run: async () => other },
        proposeMasks: { mode: "ONLY_ON_DEVICE" as const, run: async () => other },
        draft: { run: async () => other },
        rewrite: { mode: "PREFER_ON_DEVICE" as const, run: async () => other },
        secondReader: real,
      },
    };
    const picks = (["unavailable", "downloadable", "downloading", "available"] as const).map(
      (device) => makeKit({ device, cloud: false }, deps).secondReader,
    );
    expect(new Set(picks).size).toBe(1);
  });
});
