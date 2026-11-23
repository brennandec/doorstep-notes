// Drafting task 5 (R1.3, R4, ruling 12): the app chooses the mode; it is not left to a fallback.
import { describe, expect, it, vi } from "vitest";
import { chooseMode, decideMode, type ModeChoice } from "../../src/drafting/chooseMode";
import type { DeviceModelState } from "../../src/inference/types";

const cloud: ModeChoice = { kind: "cloud", mode: "PREFER_IN_CLOUD" };
const device: ModeChoice = { kind: "device", mode: "ONLY_ON_DEVICE" };
const states: DeviceModelState[] = ["unavailable", "downloadable", "downloading", "available"];

describe("chooseMode, every row of the design table", () => {
  it("online and the probe passes: PREFER_IN_CLOUD whatever the device model is", () => {
    for (const d of states) expect(chooseMode({ browserOnline: true, probe: "passed", device: d })).toEqual(cloud);
  });

  it("browser offline, device model available: ONLY_ON_DEVICE", () => {
    expect(chooseMode({ browserOnline: false, probe: "notRun", device: "available" })).toEqual(device);
  });

  it("online but the probe fails, device model available: ONLY_ON_DEVICE", () => {
    expect(chooseMode({ browserOnline: true, probe: "failed", device: "available" })).toEqual(device);
  });

  it("offline or probe failed, no device model: no call", () => {
    for (const [browserOnline, probe] of [[false, "notRun"], [true, "failed"]] as const) {
      expect(chooseMode({ browserOnline, probe, device: "unavailable" })).toEqual({ kind: "none", reason: "noModel" });
      expect(chooseMode({ browserOnline, probe, device: "downloadable" })).toEqual({ kind: "none", reason: "noModel" });
    }
  });

  it("offline or probe failed, model downloading: no call, and the reason says downloading", () => {
    for (const [browserOnline, probe] of [[false, "notRun"], [true, "failed"]] as const) {
      expect(chooseMode({ browserOnline, probe, device: "downloading" })).toEqual({ kind: "none", reason: "downloading" });
    }
  });

  it("never returns a PREFER mode for the device and never ONLY_IN_CLOUD", () => {
    const seen = new Set<string>();
    for (const browserOnline of [true, false]) {
      for (const probe of ["passed", "failed", "notRun"] as const) {
        for (const d of states) {
          const c = chooseMode({ browserOnline, probe, device: d });
          if (c.kind !== "none") seen.add(c.mode);
        }
      }
    }
    expect([...seen].sort()).toEqual(["ONLY_ON_DEVICE", "PREFER_IN_CLOUD"]);
  });
});

describe("decideMode with a fake probe", () => {
  const deps = (online: boolean, probeOk: boolean) => ({
    navigatorOnLine: () => online,
    fetch: vi.fn(async () => ({ ok: probeOk })),
    now: () => 1,
  });

  it("runs no probe when the browser says offline", async () => {
    const d = deps(false, true);
    expect(await decideMode(d, "available")).toEqual(device);
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it("runs one probe when the browser says online, and goes to the cloud when it passes", async () => {
    const d = deps(true, true);
    expect(await decideMode(d, "unavailable")).toEqual(cloud);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it("goes to the device when the probe is refused", async () => {
    expect(await decideMode(deps(true, false), "available")).toEqual(device);
  });

  it("goes to the device when the probe throws", async () => {
    const d = { navigatorOnLine: () => true, fetch: async () => { throw new Error("no route"); }, now: () => 1 };
    expect(await decideMode(d, "available")).toEqual(device);
    expect(await decideMode(d, "unavailable")).toEqual({ kind: "none", reason: "noModel" });
  });
});
