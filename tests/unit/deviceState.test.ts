import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { parseClientList } from "../../src/masking/clientList";
import { planDevicePass } from "../../src/masking/deviceState";
import { runDevicePass } from "../../src/masking/devicePass";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";

const clients = parseClientList(inventedVisit.clientList).entries;

describe("device state behaviour (masking task 14)", () => {
  it("absent: exact and near work, no device pass, one line says what it would add", () => {
    for (const state of ["unavailable", "downloadable"] as const) {
      const p = planDevicePass(state);
      expect(p).toMatchObject({ exactAndNear: true, runDevicePass: false, queued: false, showProgress: false });
      expect(p.line).toContain("not on this computer");
      expect(p.line).toContain("suggest more names, places, dates of birth and describing phrases");
      expect(p.line).toContain("Exact and near masking still work");
    }
  });

  it("downloading: exact and near work now, the device pass is queued with progress", () => {
    const p = planDevicePass("downloading", 41.6);
    expect(p).toMatchObject({ exactAndNear: true, runDevicePass: false, queued: true, showProgress: true });
    expect(p.line).toBe("Exact and near masking work now. The device pass runs when the device model is ready (42%).");
  });

  it("available: the device pass runs", () => {
    const p = planDevicePass("available");
    expect(p).toMatchObject({ exactAndNear: true, runDevicePass: true, queued: false });
  });

  it("network off changes nothing: no masking step calls the network", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("offline"); });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const base = exactAndNear(inventedVisit.note, clients, DEFAULT_POLICY);
      expect(base.length).toBeGreaterThan(0);
      const r = await runDevicePass(inventedVisit.note, base, proposeMasksDouble, DEFAULT_POLICY);
      expect(r.spans.length).toBeGreaterThan(base.length);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("with the device model absent the exact and near result is the same as with it present", () => {
    const base = exactAndNear(inventedVisit.note, clients, DEFAULT_POLICY);
    expect(base.map((s) => s.surfaceForm)).toEqual(["Maria O-R", "Maria", "Maria", "Tomas Brandvald"]);
  });
});
