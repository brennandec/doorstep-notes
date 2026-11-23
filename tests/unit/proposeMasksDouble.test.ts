import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeKit, type FirebaseDeps } from "../../src/inference";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
import type { Candidate, JobResult, ProposeMasksJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { runDevicePass } from "../../src/masking/devicePass";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const note = inventedVisit.note;

describe("propose-masks double (masking task 7)", () => {
  it("is ONLY_ON_DEVICE and answers with the invented candidates, not connected", async () => {
    expect(proposeMasksDouble.mode).toBe("ONLY_ON_DEVICE");
    const r = await proposeMasksDouble.run(note);
    expect(r.inferenceSource).toBe("ON_DEVICE");
    expect(r.connected).toBe(false);
    expect(r.value).toEqual([
      { text: "Bea", kind: "name" },
      { text: "14 Alder Court", kind: "place" },
      { text: "3/3/87", kind: "dob" },
    ]);
  });

  it("gets the raw text, with nothing masked, from the device pass", async () => {
    const run = vi.fn(proposeMasksDouble.run.bind(proposeMasksDouble));
    const job: ProposeMasksJob = { mode: "ONLY_ON_DEVICE", run };
    const base = exactAndNear(note, clients, DEFAULT_POLICY);
    await runDevicePass(note, base, job, DEFAULT_POLICY);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toBe(note);
    expect(run.mock.calls[0]![0]).toContain("Maria O-R");
  });

  it("drops candidates that are not in the text", async () => {
    const job: ProposeMasksJob = {
      mode: "ONLY_ON_DEVICE",
      async run(): Promise<JobResult<Candidate[]>> {
        return {
          value: [{ text: "Bea", kind: "name" }, { text: "Zoltan Quimby", kind: "name" }],
          inferenceSource: "ON_DEVICE",
          connected: true,
        };
      },
    };
    const r = await runDevicePass(note, [], job, DEFAULT_POLICY);
    expect(r.spans.map((s) => s.surfaceForm)).toEqual(["Bea"]);
    expect(r.dropped).toEqual([{ text: "Zoltan Quimby", kind: "name" }]);
  });

  it("keeps the source label from the job", async () => {
    const r = await runDevicePass(note, [], proposeMasksDouble, DEFAULT_POLICY);
    expect(r.inferenceSource).toBe("ON_DEVICE");
    expect(r.connected).toBe(false);
  });

  it("is never chosen by makeKit, whatever the switches", () => {
    const real = { proposeMasks: { mode: "ONLY_ON_DEVICE", run: async () => ({ value: [], inferenceSource: "ON_DEVICE", connected: true }) } } as unknown as FirebaseDeps["real"];
    for (const device of ["unavailable", "downloadable", "downloading", "available"] as const) {
      for (const cloud of [false, true]) {
        const kit = makeKit({ device, cloud }, { real });
        expect(kit.proposeMasks).not.toBe(proposeMasksDouble);
        expect(kit.plan.proposeMasks).toBe(device === "available" ? "real" : "absent");
      }
    }
  });
});
