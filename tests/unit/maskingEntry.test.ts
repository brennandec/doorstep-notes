import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { devicePass, runPasses } from "../../src/masking/entry";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import type { KeyValueBackend } from "../../src/storage/backend";
import { makeMaskStateStore } from "../../src/storage/maskState";

const clients = parseClientList(inventedVisit.clientList).entries;
const note = inventedVisit.note;

describe("measurement entry points (masking task 15)", () => {
  it("headless: reports exact and near separately and together, on the raw note", () => {
    const p = runPasses(note, clients, DEFAULT_POLICY);
    expect(p.exact.map((s) => s.surfaceForm)).toEqual(["Maria O-R", "Maria", "Maria", "Tomas"]);
    expect(p.near.map((s) => s.surfaceForm)).toEqual(["Brandvald"]);
    expect(p.combined.map((s) => s.surfaceForm)).toEqual(["Maria O-R", "Maria", "Maria", "Tomas Brandvald"]);
    for (const s of [...p.exact, ...p.near]) expect(note.slice(s.start, s.end)).toBe(s.surfaceForm);
  });

  it("headless: needs no DOM and no network", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      runPasses(note, clients, DEFAULT_POLICY);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(typeof document).toBe("undefined");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("browser: the device pass reads the same raw note and merges over the same exact and near spans", async () => {
    const run = vi.fn(proposeMasksDouble.run.bind(proposeMasksDouble));
    const r = await devicePass(note, clients, { mode: "ONLY_ON_DEVICE", run }, DEFAULT_POLICY);
    expect(run).toHaveBeenCalledWith(note);
    const headless = runPasses(note, clients, DEFAULT_POLICY).combined;
    expect(r.spans.filter((s) => s.kind !== "proposed")).toEqual(headless);
    expect(r.spans.filter((s) => s.kind === "proposed").map((s) => s.surfaceForm)).toEqual(["14 Alder Court", "Bea", "3/3/87"]);
    expect(r.inferenceSource).toBe("ON_DEVICE");
  });
});

describe("mask state at rest (masking R6.3)", () => {
  function inspectable(): KeyValueBackend & { keys(): string[] } {
    const map = new Map<string, unknown>();
    return {
      async get(k) { return map.has(k) ? structuredClone(map.get(k)) : undefined; },
      async set(k, v) { map.set(k, structuredClone(v)); },
      async remove(k) { map.delete(k); },
      keys: () => [...map.keys()],
    };
  }
  const result = applyMask(note, runPasses(note, clients, DEFAULT_POLICY).combined, clients);

  it("keeps spans, map and surface forms together, and removes them together", async () => {
    const backend = inspectable();
    const store = makeMaskStateStore(backend);
    expect(await store.load()).toBeNull();
    await store.save({ spans: result.spans, map: result.map, surfaceForms: result.surfaceForms });
    const back = await store.load();
    expect(back?.spans).toEqual(result.spans);
    expect(back?.map).toEqual(result.map);
    expect(back?.surfaceForms).toEqual(result.surfaceForms);
    await store.clear();
    expect(backend.keys()).toEqual([]);
    expect(await store.load()).toBeNull();
  });

  it("ignores a stored value that is not mask state", async () => {
    const backend = inspectable();
    await backend.set("maskState", { spans: "no" });
    expect(await makeMaskStateStore(backend).load()).toBeNull();
  });
});
