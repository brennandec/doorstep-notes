import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSet } from "../../../scripts/buildSet";
import {
  buildCatchRate,
  buildMisses,
  keepDeviceParts,
  measureExactPasses,
  runMeasureExact,
  spansOf,
} from "../../../scripts/measureExact";
import { readResults, writeResults, makeHeader } from "../../../scripts/results";
import { DEFAULT_POLICY } from "../../../src/masking/policy";
import { exactAndNear } from "../../../src/masking/passes";
import { findExact } from "../../../src/masking/exact";
import { findNear } from "../../../src/masking/near";
import { SYNTHETIC_SEED, SYNTHETIC_SET_SIZE } from "../../../src/constants";

const set = buildSet(SYNTHETIC_SEED, SYNTHETIC_SET_SIZE);
const passes = measureExactPasses(set, DEFAULT_POLICY);

describe("exact and near measure (measurement R2, R3, R5)", () => {
  it("scores every identifier in the set once per pass", () => {
    const total = set.reduce((s, n) => s + n.identifiers.length, 0);
    expect(passes.exact.score.total).toBe(total);
    expect(passes.near.score.total).toBe(total);
    expect(passes.exactAndNear.score.total).toBe(total);
    expect(passes.exact.notesScored).toBe(set.length);
  });

  it("runs each pass on the raw note: spans index the raw text", () => {
    for (const n of set.slice(0, 40)) {
      for (const run of [
        () => findExact(n.text, n.clientList, DEFAULT_POLICY),
        () => findNear(n.text, n.clientList, DEFAULT_POLICY, []),
        () => exactAndNear(n.text, n.clientList, DEFAULT_POLICY),
      ]) {
        for (const s of run()) expect(n.text.slice(s.start, s.end)).toBe(s.surfaceForm);
      }
    }
  });

  it("makes the near pass independent of the exact pass: it finds the near variants alone", () => {
    expect(passes.near.score.byKind["nearVariant"]!.caught).toBeGreaterThan(0);
    // Alone, the near pass skips words equal to a listed part, so it catches no listed name.
    expect(passes.near.score.byKind["listedName"]!.caught).toBe(0);
    // The exact pass alone catches no near variant.
    expect(passes.exact.score.byKind["nearVariant"]!.caught).toBe(0);
  });

  it("catches listed names with the exact pass and nothing the builder keeps off the list", () => {
    const k = passes.exact.score.byKind;
    expect(k["listedName"]!.caught).toBeGreaterThan(0);
    for (const kind of ["otherName", "place", "dob", "phrase"]) expect(k[kind]!.caught, kind).toBe(0);
  });

  it("makes exact and near together catch at least what each catches alone", () => {
    expect(passes.exactAndNear.score.caught).toBeGreaterThanOrEqual(passes.exact.score.caught);
    expect(passes.exactAndNear.score.caught).toBeGreaterThanOrEqual(passes.near.score.caught);
  });

  it("lists misses and false masks for each pass", () => {
    for (const p of [passes.exact, passes.near, passes.exactAndNear]) {
      expect(p.misses).toHaveLength(p.score.total - p.score.caught);
      expect(p.falseMaskItems).toHaveLength(p.score.falseMasks);
    }
    expect(passes.exact.misses.length).toBeGreaterThan(0);
  });

  it("reports false masks for names used as ordinary words", () => {
    const text = "Asked for a grace period on the arrears. Visited Grace Reyes.";
    const start = text.indexOf("Grace Reyes");
    const grace = {
      id: "g1",
      text,
      clientList: [{ id: "c1", fullName: "Grace Reyes", otherNames: [], pronouns: "she/her" as const }],
      identifiers: [{ kind: "listedName" as const, text: "Grace Reyes", start, end: start + 11 }],
    };
    const r = measureExactPasses([grace], DEFAULT_POLICY);
    expect(r.exact.score.caught).toBe(1);
    expect(r.exact.falseMaskItems).toEqual([{ noteId: "g1", kind: "falseMask", text: "grace" }]);
  });

  it("turns spans into score input by note id", () => {
    const m = spansOf(set.slice(0, 3), (n) => findExact(n.text, n.clientList, DEFAULT_POLICY));
    expect([...m.keys()]).toEqual(set.slice(0, 3).map((n) => n.id));
  });
});

describe("results shapes", () => {
  const header = makeHeader({ browser: "Node (no browser)", script: "scripts/measureExact.ts", scriptVersion: "1" });

  it("builds catch-rate with exact, near and exact-and-near, and device and merged as not measured with a reason", () => {
    const c = buildCatchRate(passes, SYNTHETIC_SEED, set.length, header);
    expect(c).toMatchObject({ setSize: set.length, seed: SYNTHETIC_SEED, ...header });
    expect(c.exact).toEqual(passes.exact.score);
    expect(c.near).toEqual(passes.near.score);
    expect(c.exactAndNear).toEqual(passes.exactAndNear.score);
    expect(c.device).toMatchObject({ status: "not measured" });
    expect((c.device as { reason: string }).reason.length).toBeGreaterThan(10);
    expect(c.merged).toMatchObject({ status: "not measured" });
  });

  it("builds misses with every list and the device parts as not measured", () => {
    const m = buildMisses(passes, header);
    expect(m.exact).toEqual(passes.exact.misses);
    expect(m.near).toEqual(passes.near.misses);
    expect(m.exactAndNear).toEqual(passes.exactAndNear.misses);
    expect(m.device).toBe("not measured");
    expect(m.merged).toBe("not measured");
    expect(m.falseMasks.exact).toEqual(passes.exact.falseMaskItems);
    expect(m.falseMasks.device).toBe("not measured");
  });

  it("keeps a measured device part from an earlier file when the seed and size match", () => {
    const earlier = { seed: 1, setSize: 5, device: { n: 3, caught: 2 }, merged: { n: 3, caught: 3 } };
    expect(keepDeviceParts(earlier, 1, 5)).toEqual({ device: earlier.device, merged: earlier.merged });
    expect(keepDeviceParts(earlier, 2, 5)).toBeUndefined();
    expect(keepDeviceParts(earlier, 1, 6)).toBeUndefined();
    expect(keepDeviceParts({ seed: 1, setSize: 5, device: { status: "not measured", reason: "x" } }, 1, 5)).toBeUndefined();
    expect(keepDeviceParts(undefined, 1, 5)).toBeUndefined();
  });
});

describe("runMeasureExact writes the files", () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });
  const tmp = () => {
    const d = mkdtempSync(join(tmpdir(), "measure-exact-"));
    dirs.push(d);
    return d;
  };

  it("refuses to run without the set file and says which command makes it", () => {
    expect(() => runMeasureExact(tmp())).toThrow(/measure:set/);
  });

  it("reads the set file and writes catch-rate.json and misses.json with the header", () => {
    const root = tmp();
    const small = buildSet(SYNTHETIC_SEED, 12);
    writeResults("synthetic-set", makeHeader({ browser: "x", script: "s", scriptVersion: "1" }), { seed: SYNTHETIC_SEED, count: 12, notes: small }, root);
    runMeasureExact(root);
    const c = readResults("catch-rate", root)!;
    expect(c["setSize"]).toBe(12);
    expect(c["script"]).toBe("scripts/measureExact.ts");
    expect(typeof c["date"]).toBe("string");
    expect(String(c["browser"])).toMatch(/Node/);
    expect((c["exact"] as { total: number }).total).toBe(small.reduce((s, n) => s + n.identifiers.length, 0));
    expect(readResults("misses", root)).toMatchObject({ device: "not measured" });
  });

  it("does not overwrite a measured device part when it runs again", () => {
    const root = tmp();
    const small = buildSet(SYNTHETIC_SEED, 6);
    writeResults("synthetic-set", makeHeader({ browser: "x", script: "s", scriptVersion: "1" }), { seed: SYNTHETIC_SEED, count: 6, notes: small }, root);
    writeResults("catch-rate", makeHeader({ browser: "b", script: "d", scriptVersion: "1" }), {
      seed: SYNTHETIC_SEED, setSize: 6, device: { n: 4, caught: 1, total: 9 }, merged: { n: 4, caught: 2, total: 9 },
    }, root);
    runMeasureExact(root);
    const c = readResults("catch-rate", root)!;
    expect(c["device"]).toEqual({ n: 4, caught: 1, total: 9 });
    expect(c["merged"]).toEqual({ n: 4, caught: 2, total: 9 });
  });

  it("does not write a new date when the scores are the same", () => {
    const root = tmp();
    const small = buildSet(SYNTHETIC_SEED, 6);
    writeResults("synthetic-set", makeHeader({ browser: "x", script: "s", scriptVersion: "1" }), { seed: SYNTHETIC_SEED, count: 6, notes: small }, root);
    runMeasureExact(root);
    const before = readFileSync(join(root, "results", "catch-rate.json"), "utf8");
    const misses = readFileSync(join(root, "results", "misses.json"), "utf8");
    runMeasureExact(root);
    expect(readFileSync(join(root, "results", "catch-rate.json"), "utf8")).toBe(before);
    expect(readFileSync(join(root, "results", "misses.json"), "utf8")).toBe(misses);
  });
});
