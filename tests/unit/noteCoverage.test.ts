import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import type { VisitRecord } from "../../src/inference/types";
import { checkVisitRecord } from "../../src/inference/structure/structure.schema";
import { findMissingSentences, noteSentences, tokens } from "../../src/record/noteCoverage";

// The recorded replies of the model on the invented visit, read as the job reads them.
function replies(file: string): VisitRecord[] {
  const j = JSON.parse(readFileSync(`results/${file}.json`, "utf8")) as { attempts: { structureReply: string }[] };
  return j.attempts.map((a) => {
    const c = checkVisitRecord(JSON.parse(a.structureReply));
    if (!c.ok) throw new Error(`${file}: reply is not clean`);
    return c.record;
  });
}
const FILES = ["film-rehearsal-2026-11-14-h22b", "film-run-2026-11-14-h22b", "film-run-2026-11-14-h22c", "film-run-2026-11-14-h22d", "film-run-2026-11-14-h22f"];
const [rehearsal, h22b, h22c, h22d, h22f] = FILES.map(replies) as [VisitRecord[], VisitRecord[], VisitRecord[], VisitRecord[], VisitRecord[]];
const note = inventedVisit.note;
const counts = (rs: VisitRecord[]) => rs.map((r) => findMissingSentences(note, r).length);

describe("noteSentences", () => {
  it("splits the invented note into 11 sentences", () => {
    const s = noteSentences(note);
    expect(s).toHaveLength(11);
    expect(s[8]).toBe("Tomas Brandvald (neighbour, also on my list) offered to help with the form.");
  });
  it("gives [] for an empty note", () => {
    expect(noteSentences("")).toEqual([]);
    expect(findMissingSentences("", rehearsal[0]!)).toEqual([]);
    expect(findMissingSentences("  \n ", rehearsal[0]!)).toEqual([]);
  });
});

describe("findMissingSentences on the 12 recorded replies", () => {
  it("counts the missing sentences of each reply", () => {
    expect(counts(rehearsal)).toEqual([0, 3, 0, 0, 0]);
    expect(counts(h22b)).toEqual([1]);
    expect(counts(h22c)).toEqual([2, 2, 0]);
    expect(counts(h22d)).toEqual([3, 0]);
    expect(counts(h22f)).toEqual([0]);
  });
  it("lists the three dropped sentences of rehearsal attempt 2, word for word", () => {
    expect(findMissingSentences(note, rehearsal[1]!)).toEqual([
      "Landlord not replied to 2 emails.",
      "Maria missed the benefits form deadline last wk, letter on the table.",
      "DOB on form 3/3/87.",
    ]);
  });
  it("lists the cut third fact of h22b attempt 1", () => {
    expect(findMissingSentences(note, h22b[0]!)).toEqual(["Maria missed the benefits form deadline last wk, letter on the table."]);
  });
  it("gives the four Seen sentences when seen is empty", () => {
    const r = { ...structuredClone(rehearsal[0]!), seen: [] };
    expect(findMissingSentences(note, r)).toHaveLength(4);
    expect(findMissingSentences(note, r)).toEqual(rehearsal[0]!.seen);
  });
  it("also lists the header sentence when the record has no date", () => {
    const r = { ...structuredClone(rehearsal[0]!), seen: [], visitDate: "" };
    expect(findMissingSentences(note, r)).toContain("12/11 home visit 14:00, flat 3, 14 Alder Court.");
  });
  it("pins the known gaps: the header is never listed, and time, place and sister are in no record", () => {
    const all = [...rehearsal, ...h22b, ...h22c, ...h22d, ...h22f];
    expect(all).toHaveLength(12);
    for (const r of all) {
      expect(findMissingSentences(note, r)).not.toContain("12/11 home visit 14:00, flat 3, 14 Alder Court.");
      const have = new Set([r.visitDate, ...r.present.map((p) => p.label), ...r.seen, ...r.agreed, ...r.risks, ...r.nextSteps].flatMap(tokens));
      for (const w of ["14:00", "alder", "sister"]) expect(have.has(w), w).toBe(false);
    }
  });
  it("does not change the record it reads", () => {
    const r = rehearsal[1]!;
    const before = structuredClone(r);
    findMissingSentences(note, r);
    expect(r).toEqual(before);
  });
});
