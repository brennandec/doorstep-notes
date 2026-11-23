import { describe, expect, it } from "vitest";
import { scoreNote, scorePass } from "../../../scripts/score";
import type { SyntheticNote } from "../../../scripts/buildSet";

// "Bea Okafor visited 3 Mill Lane, born 01/02/1950." with invented people.
const text = "Bea Okafor visited 3 Mill Lane, born 01/02/1950.";
const at = (s: string) => ({ start: text.indexOf(s), end: text.indexOf(s) + s.length });
const note = (id: string, spans: [string, "listedName" | "place" | "dob" | "otherName"][]): SyntheticNote => ({
  id,
  text,
  clientList: [],
  identifiers: spans.map(([s, kind]) => ({ kind, text: s, ...at(s) })),
});
const n1 = note("n1", [["Bea Okafor", "listedName"], ["3 Mill Lane", "place"], ["01/02/1950", "dob"]]);

describe("scoreNote (measurement R3.2, R5)", () => {
  it("counts an identifier as caught when every character is inside a masked span", () => {
    const s = scoreNote(n1, [at("Bea Okafor"), at("3 Mill Lane"), at("01/02/1950")]);
    expect(s.caught.map((i) => i.text)).toEqual(["Bea Okafor", "3 Mill Lane", "01/02/1950"]);
    expect(s.missed).toEqual([]);
    expect(s.falseMasks).toEqual([]);
  });

  it("counts a partial cover as a miss", () => {
    const s = scoreNote(n1, [{ start: at("Bea Okafor").start, end: at("Bea Okafor").end - 1 }]);
    expect(s.missed.map((i) => i.text)).toContain("Bea Okafor");
    expect(s.caught.map((i) => i.text)).not.toContain("Bea Okafor");
  });

  it("counts two touching spans as covering one identifier", () => {
    const a = at("Bea");
    const b = at("Okafor");
    const s = scoreNote(n1, [a, { start: a.end, end: b.start }, b]);
    expect(s.caught.map((i) => i.text)).toContain("Bea Okafor");
  });

  it("leaves a gap uncovered: two spans with a space between do not cover the whole name", () => {
    const s = scoreNote(n1, [at("Bea"), at("Okafor")]);
    expect(s.missed.map((i) => i.text)).toContain("Bea Okafor");
  });

  it("counts a span that covers no known identifier as a false mask, with its text", () => {
    const s = scoreNote(n1, [at("visited")]);
    expect(s.falseMasks).toEqual([{ ...at("visited"), text: "visited" }]);
    expect(s.missed).toHaveLength(3);
  });

  it("does not count a larger span that covers an identifier and more as a false mask", () => {
    const s = scoreNote(n1, [{ start: 0, end: at("visited").end }]);
    expect(s.falseMasks).toEqual([]);
    expect(s.caught.map((i) => i.text)).toEqual(["Bea Okafor"]);
  });

  it("does not count a partial cover of an identifier as a false mask", () => {
    const s = scoreNote(n1, [at("Okafor")]);
    expect(s.falseMasks).toEqual([]);
  });

  it("ignores empty spans", () => {
    const s = scoreNote(n1, [{ start: 5, end: 5 }]);
    expect(s.falseMasks).toEqual([]);
    expect(s.caught).toEqual([]);
  });

  it("scores a note with no masks: everything missed, nothing false", () => {
    const s = scoreNote(n1, []);
    expect(s.missed).toHaveLength(3);
    expect(s.falseMasks).toEqual([]);
  });
});

describe("scorePass", () => {
  const n2 = note("n2", [["Bea Okafor", "listedName"], ["3 Mill Lane", "place"]]);
  const n3 = note("n3", [["01/02/1950", "dob"], ["Bea Okafor", "otherName"]]);
  const notes = [n1, n2, n3];
  const masks = new Map([
    ["n1", [at("Bea Okafor"), at("visited")]],
    ["n2", [at("Bea Okafor"), at("3 Mill Lane")]],
    ["n3", [at("01/02/1950")]],
  ]);

  it("totals caught, total and false masks across notes", () => {
    const r = scorePass(notes, masks);
    expect(r.score.total).toBe(7);
    expect(r.score.caught).toBe(4);
    expect(r.score.falseMasks).toBe(1);
    expect(r.notesScored).toBe(3);
  });

  it("totals per kind", () => {
    const r = scorePass(notes, masks);
    expect(r.score.byKind["listedName"]).toEqual({ caught: 2, total: 2 });
    expect(r.score.byKind["place"]).toEqual({ caught: 1, total: 2 });
    expect(r.score.byKind["dob"]).toEqual({ caught: 1, total: 2 });
    expect(r.score.byKind["otherName"]).toEqual({ caught: 0, total: 1 });
    expect(r.score.byKind["phrase"]).toEqual({ caught: 0, total: 0 });
    expect(r.score.byKind["nearVariant"]).toEqual({ caught: 0, total: 0 });
  });

  it("lists every miss with note id, kind and text", () => {
    const r = scorePass(notes, masks);
    expect(r.misses).toEqual([
      { noteId: "n1", kind: "place", text: "3 Mill Lane" },
      { noteId: "n1", kind: "dob", text: "01/02/1950" },
      { noteId: "n3", kind: "otherName", text: "Bea Okafor" },
    ]);
  });

  it("lists every false mask with note id and text", () => {
    expect(scorePass(notes, masks).falseMaskItems).toEqual([{ noteId: "n1", kind: "falseMask", text: "visited" }]);
  });

  it("scores the first n notes only", () => {
    const r = scorePass(notes, masks, 2);
    expect(r.notesScored).toBe(2);
    expect(r.score.total).toBe(5);
    expect(r.score.caught).toBe(3);
    expect(r.misses.every((m) => m.noteId !== "n3")).toBe(true);
  });

  it("treats a note with no entry as having no masks", () => {
    const r = scorePass(notes, new Map());
    expect(r.score.caught).toBe(0);
    expect(r.score.total).toBe(7);
  });

  it("clamps n to the set size and refuses a negative n", () => {
    expect(scorePass(notes, masks, 99).notesScored).toBe(3);
    expect(scorePass(notes, masks, 0).notesScored).toBe(0);
    expect(() => scorePass(notes, masks, -1)).toThrow();
  });

  it("has caught plus missed equal to total in every kind", () => {
    const r = scorePass(notes, masks);
    expect(r.misses).toHaveLength(r.score.total - r.score.caught);
  });
});
