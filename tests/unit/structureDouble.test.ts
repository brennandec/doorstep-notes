import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeKit, type FirebaseDeps } from "../../src/inference";
import { structureDouble } from "../../src/inference/structure/structure.double";

describe("structure double", () => {
  it("returns the prepared invented record, labelled not connected, with no request", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("no network"); });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const r = await structureDouble.run({ noteText: inventedVisit.note });
      expect(r.value).toEqual(inventedVisit.preparedRecord);
      expect(r.connected).toBe(false);
      expect(r.inferenceSource).toBe("ON_DEVICE");
      expect(structureDouble.mode).toBe("ONLY_ON_DEVICE");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
  it("is never chosen by makeKit", () => {
    const real = { structure: { mode: "ONLY_ON_DEVICE", run: async () => { throw new Error("x"); } } } as unknown as FirebaseDeps["real"];
    for (const device of ["unavailable", "downloadable", "downloading", "available"] as const) {
      for (const cloud of [false, true]) {
        expect(makeKit({ device, cloud }, { real }).structure).not.toBe(structureDouble);
      }
    }
  });
  it("is imported by no file in src", () => {
    const walk = (p: string): string[] => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p]);
    const hits = walk("src").filter((f) => /\.ts$/.test(f) && !f.endsWith("structure.double.ts")).filter((f) => /structure\.double/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
