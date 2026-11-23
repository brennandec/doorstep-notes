import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { draftDouble, rewriteDouble, secondReaderDouble } from "../../src/inference/doubles";
import { DeviceModelAbsentError, makeKit, type FirebaseDeps } from "../../src/inference";
import type { DeviceModelState } from "../../src/inference/types";

const ticket = {} as never;
const result = <T>(value: T) => ({ value, inferenceSource: "ON_DEVICE" as const, connected: true });

function deps(): FirebaseDeps {
  return {
    real: {
      structure: { mode: "ONLY_ON_DEVICE", run: vi.fn(async () => result({ visitDate: "", present: [], seen: [], agreed: [], risks: [], nextSteps: [] })) },
      proposeMasks: { mode: "ONLY_ON_DEVICE", run: vi.fn(async () => result([])) },
      draft: { run: vi.fn(async () => result({ text: "real draft", short: false })) },
      rewrite: { mode: "PREFER_ON_DEVICE", run: vi.fn(async () => result("real rewrite")) },
      secondReader: { mode: "ONLY_IN_CLOUD", run: vi.fn(async () => result({ guesses: [] })) },
    },
  };
}

const states: DeviceModelState[] = ["unavailable", "downloadable", "downloading", "available"];

describe("makeKit: every switch combination", () => {
  for (const device of states) {
    for (const cloud of [false, true]) {
      it(`device ${device}, cloud ${cloud ? "on" : "off"}`, async () => {
        const d = deps();
        const kit = makeKit({ device, cloud }, d);
        const ready = device === "available";

        // Device jobs depend only on the device switch.
        expect(kit.structure).toBe(ready ? d.real.structure : kit.structure);
        expect(kit.plan.structure).toBe(ready ? "real" : "absent");
        expect(kit.plan.proposeMasks).toBe(ready ? "real" : "absent");
        if (!ready) {
          await expect(kit.structure.run({ noteText: "x" })).rejects.toBeInstanceOf(DeviceModelAbsentError);
          await expect(kit.proposeMasks.run("x")).rejects.toBeInstanceOf(DeviceModelAbsentError);
          await expect(kit.draft.run(ticket, { text: "x" }, "ONLY_ON_DEVICE")).rejects.toBeInstanceOf(DeviceModelAbsentError);
        } else {
          expect(kit.structure).toBe(d.real.structure);
          expect(kit.proposeMasks).toBe(d.real.proposeMasks);
          await kit.draft.run(ticket, { text: "x" }, "ONLY_ON_DEVICE");
          expect(d.real.draft.run).toHaveBeenCalledTimes(1);
        }

        // Cloud jobs depend only on the cloud switch.
        expect(kit.plan.secondReader).toBe(cloud ? "real" : "double");
        expect(kit.plan.draftOnline).toBe(cloud ? "real" : "double");
        expect(kit.secondReader).toBe(cloud ? d.real.secondReader : secondReaderDouble);
        const online = await kit.draft.run(ticket, { text: "masked" }, "PREFER_IN_CLOUD");
        expect(online.connected).toBe(cloud);
        if (!cloud) expect(online.value.text).toContain("fixed sample");
        const reader = await kit.secondReader.run(ticket, { text: "masked" });
        expect(reader.connected).toBe(cloud);

        // Rewrite: real when the device can answer or the cloud is on.
        expect(kit.plan.rewrite).toBe(ready || cloud ? "real" : "double");
        if (!ready && !cloud) expect(kit.rewrite).toBe(rewriteDouble);
      });
    }
  }

  it("turning the cloud flag on does not change which device jobs are real, and the reverse", () => {
    for (const device of states) {
      const a = makeKit({ device, cloud: false }, deps()).plan;
      const b = makeKit({ device, cloud: true }, deps()).plan;
      expect([a.structure, a.proposeMasks, a.draftOffline]).toEqual([b.structure, b.proposeMasks, b.draftOffline]);
    }
    for (const cloud of [false, true]) {
      const plans = states.map((device) => makeKit({ device, cloud }, deps()).plan);
      for (const p of plans) {
        expect([p.secondReader, p.draftOnline]).toEqual([plans[0]!.secondReader, plans[0]!.draftOnline]);
      }
    }
  });

  it("cloud doubles make no request and say not connected", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("no request allowed"); });
    vi.stubGlobal("fetch", fetchSpy);
    expect((await draftDouble.run(ticket, { text: "a" }, "PREFER_IN_CLOUD")).connected).toBe(false);
    expect((await rewriteDouble.run(ticket, { text: "a", tags: [] })).connected).toBe(false);
    expect((await secondReaderDouble.run(ticket, { text: "a" })).connected).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("never chooses a device double in the app", () => {
    const source = readFileSync("src/inference/index.ts", "utf8");
    expect(source).not.toMatch(/structure\.double|proposeMasks\.double|structureDouble|proposeDouble/);
    const doubles = readFileSync("src/inference/doubles.ts", "utf8");
    expect(doubles).not.toMatch(/export const (structure|propose)/);
  });
});
