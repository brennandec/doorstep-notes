// Measurement task 19 and 21 (R14.1, R14.2, N4, P4): the kinds of not-needed suggestions.
// No browser. Invented words and counts only, except the last block, which reads the real files.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  KIND_LABELS,
  NOT_NEEDED_END,
  NOT_NEEDED_KINDS,
  NOT_NEEDED_START,
  classifyNotNeeded,
  listNotNeeded,
  notNeededSentence,
  replaceNotNeeded,
  writeNotNeeded,
} from "../../../scripts/listNotNeeded";
import { readResults } from "../../../scripts/results";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function project(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "doorstep-notneeded-"));
  dirs.push(root);
  mkdirSync(join(root, "results"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, "results", `${name}.json`), JSON.stringify(body));
  return root;
}
const item = (noteId: string, text: string) => ({ noteId, kind: "falseMask", text });

describe("classifyNotNeeded (R14.1)", () => {
  it("names the six kinds", () => {
    expect(NOT_NEEDED_KINDS).toEqual(["common word", "first name nobody in the note", "place word", "number", "date word", "other"]);
  });
  it.each([
    ["14/03", "date word"],
    ["Missed appt 13/02", "date word"],
    ["two weeks", "date word"],
    ["last month", "date word"],
    ["2pm slot", "date word"],
    ["Tuesday", "date word"],
    ["30th", "number"],
    ["sections 3 and 4", "number"],
    ["relative", "common word"],
    ["a relative", "common word"],
    ["the neighbour", "common word"],
    ["grace", "common word"],
    ["Missed appt", "common word"],
    ["the clinic", "place word"],
    ["Harrow Lodge", "place word"],
    ["Hana", "first name nobody in the note"],
    ["Walter", "first name nobody in the note"],
    ["Quillon Brisco", "other"],
  ] as const)("%s is %s", (text, kind) => {
    expect(classifyNotNeeded(text)).toBe(kind);
  });
  it("gives every text exactly one kind from the list", () => {
    for (const t of ["", "  ", "x", "Maria Okonkwo", "12/11/2026"]) expect(NOT_NEEDED_KINDS).toContain(classifyNotNeeded(t));
  });
});

describe("listNotNeeded (R14.1)", () => {
  const catchRate = { device: { date: "2026-01-02T00:00:00.000Z", browser: "Google Chrome 1", falseMasks: 4 } };
  const misses = {
    falseMasks: {
      device: [item("n1", "14/03"), item("n2", "14/03"), item("n3", "30th"), item("n4", "the clinic")],
    },
  };
  it("counts by kind, largest first, and keeps the strings", () => {
    const r = listNotNeeded(misses, catchRate);
    expect(r.status).toBe("pass");
    if (r.status !== "pass") return;
    expect(r.total).toBe(4);
    expect(r.kinds.map((k) => [k.kind, k.count])).toEqual([["date word", 2], ["place word", 1], ["number", 1]]);
    expect(r.kinds[0]!.strings).toEqual([{ text: "14/03", count: 2 }]);
  });
  it("counts to the total of the run it describes", () => {
    const r = listNotNeeded(misses, catchRate);
    if (r.status !== "pass") throw new Error("expected pass");
    expect(r.kinds.reduce((n, k) => n + k.count, 0)).toBe(r.total);
  });
  it("is a miss when the stored run holds no strings", () => {
    for (const bad of [{}, { falseMasks: {} }, { falseMasks: { device: "not measured" } }, { falseMasks: { device: [{ noteId: "n1" }] } }]) {
      const r = listNotNeeded(bad, catchRate);
      expect(r.status).toBe("miss");
      if (r.status === "miss") expect(r.reason).toMatch(/strings/);
    }
  });
  it("is a miss when the strings are not those of the stored run", () => {
    const r = listNotNeeded(misses, { device: { falseMasks: 5 } });
    expect(r.status).toBe("miss");
    if (r.status === "miss") expect(r.reason).toMatch(/4.*5|5.*4/);
  });
  it("is a miss when the stored run is not readable", () => {
    expect(listNotNeeded(misses, undefined).status).toBe("miss");
    expect(listNotNeeded(undefined, catchRate).status).toBe("miss");
  });
});

describe("writeNotNeeded (R14.1)", () => {
  it("writes results/not-needed-kinds.json with the header, date and browser of the run it describes", () => {
    const root = project({
      "catch-rate": { device: { date: "2026-01-02T00:00:00.000Z", browser: "Google Chrome 1", falseMasks: 2 } },
      misses: { falseMasks: { device: [item("n1", "grace"), item("n2", "Walter")] } },
    });
    writeNotNeeded(root);
    const out = readResults("not-needed-kinds", root) as Record<string, any>;
    expect(out["status"]).toBe("pass");
    expect(out["total"]).toBe(2);
    expect(out["runDate"]).toBe("2026-01-02T00:00:00.000Z");
    expect(out["runBrowser"]).toBe("Google Chrome 1");
    expect(out["script"]).toBe("scripts/listNotNeeded.ts");
    expect(out["kinds"].map((k: any) => k.kind).sort()).toEqual(["common word", "first name nobody in the note"]);
  });
  it("writes a miss with its reason when the strings are absent, and never a count", () => {
    const root = project({ "catch-rate": { device: { falseMasks: 2 } }, misses: { falseMasks: { device: "not measured" } } });
    writeNotNeeded(root);
    const out = readResults("not-needed-kinds", root) as Record<string, any>;
    expect(out["status"]).toBe("miss");
    expect(out["reason"]).toMatch(/strings/);
    expect(out["kinds"]).toBeUndefined();
  });
  it("does not touch catch-rate.json or misses.json", () => {
    const root = project({ "catch-rate": { device: { falseMasks: 1 } }, misses: { falseMasks: { device: [item("n1", "grace")] } } });
    const before = [readFileSync(join(root, "results", "catch-rate.json"), "utf8"), readFileSync(join(root, "results", "misses.json"), "utf8")];
    writeNotNeeded(root);
    expect([readFileSync(join(root, "results", "catch-rate.json"), "utf8"), readFileSync(join(root, "results", "misses.json"), "utf8")]).toEqual(before);
  });
});

describe("the README sentence (R14.2)", () => {
  const result = {
    status: "pass" as const,
    total: 9,
    kinds: [
      { kind: "date word", count: 5, strings: [] },
      { kind: "common word", count: 2, strings: [] },
      { kind: "number", count: 1, strings: [] },
      { kind: "other", count: 1, strings: [] },
    ],
  };
  it("names the three largest kinds with their counts and the total", () => {
    expect(notNeededSentence(result)).toBe(
      "Of the 9 suggestions that were not needed in the third run, the three largest kinds were date word (5), common word (2) and number (1).",
    );
  });
  it("reads not measured when there is no result", () => {
    expect(notNeededSentence({ status: "miss", reason: "x" })).toMatch(/not measured/);
    expect(notNeededSentence(undefined)).toMatch(/not measured/);
  });
  it("is written between its own markers and nothing else in the document changes", () => {
    const doc = `before\n${NOT_NEEDED_START}\nold\n${NOT_NEEDED_END}\nafter\n`;
    expect(replaceNotNeeded(doc, "new")).toBe(`before\n${NOT_NEEDED_START}\nnew\n${NOT_NEEDED_END}\nafter\n`);
    expect(() => replaceNotNeeded("no markers", "new")).toThrow(/markers/);
  });
  it("has a label for every kind", () => {
    for (const k of NOT_NEEDED_KINDS) expect(KIND_LABELS[k]).toBeTruthy();
  });
});

describe("the real files (P4)", () => {
  const kinds = readResults("not-needed-kinds") as Record<string, any> | undefined;
  const readme = readFileSync("README.md", "utf8");
  const catchRate = readResults("catch-rate") as Record<string, any>;
  it("holds kinds that add up to the false masks of the third run", () => {
    expect(kinds?.["status"]).toBe("pass");
    expect(kinds!["total"]).toBe(catchRate["device"]["falseMasks"]);
    expect(kinds!["kinds"].reduce((n: number, k: any) => n + k.count, 0)).toBe(kinds!["total"]);
  });
  it("is written from the strings in results/misses.json, recomputed here", () => {
    const misses = readResults("misses") as Record<string, any>;
    const again = listNotNeeded(misses, catchRate);
    expect(again.status).toBe("pass");
    if (again.status !== "pass" || !kinds) return;
    expect(again.kinds.map((k) => [k.kind, k.count])).toEqual(kinds["kinds"].map((k: any) => [k.kind, k.count]));
  });
  it("is the sentence in the README, exactly", () => {
    const start = readme.indexOf(NOT_NEEDED_START);
    const end = readme.indexOf(NOT_NEEDED_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = readme.slice(start + NOT_NEEDED_START.length, end).trim();
    expect(body).toBe(notNeededSentence(kinds as any));
  });
});
