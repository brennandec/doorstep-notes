// H44 item 3: a film take whose cloud draft carries a copied label, or whose sheet shows a warning line, is marked not a candidate.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filmCandidateMark } from "../e2e/device/filmHelpers";

describe("filmCandidateMark (H44 item 3)", () => {
  it("a clean draft with no warning line is a candidate", () => {
    expect(filmCandidateMark({ finishedText: "Maria asked for help with the form.", noteItems: [] })).toEqual({ candidate: true, reasons: [] });
  });
  it("a copied label anywhere in the draft is not a candidate", () => {
    const m = filmCandidateMark({ finishedText: "Visited. Risks: rent arrears if form is late.", noteItems: [] });
    expect(m.candidate).toBe(false);
    expect(m.reasons).toEqual(["the cloud draft carries a copied record label"]);
  });
  it("H44b 3: any record label with a colon anywhere in the draft is not a candidate", () => {
    for (const text of ["The Risks: arrears are high.", "Rent is due. **Next steps:** revisit.", "Went well, Seen : nobody."]) {
      expect(filmCandidateMark({ finishedText: text, noteItems: [] }).candidate).toBe(false);
    }
    expect(filmCandidateMark({ finishedText: "The risks are high and the next steps are clear.", noteItems: [] }).candidate).toBe(true);
  });
  it("each warning line is not a candidate, and is named", () => {
    for (const line of [
      "Check this sentence: a pronoun may point at the wrong person. He helped him.",
      "Check this sentence: it starts with a record label. Risks: none.",
      "Not put back: a name.",
      "Added by the model: a name.",
    ]) {
      const m = filmCandidateMark({ finishedText: "Plain note.", noteItems: [line] });
      expect(m.candidate).toBe(false);
      expect(m.reasons).toEqual([`warning line on the sheet: ${line}`]);
    }
  });
  it("an ordinary note line alone does not remove the mark", () => {
    expect(filmCandidateMark({ finishedText: "Plain note.", noteItems: ["The draft used no pronoun tokens, so no pronouns were changed."] }).candidate).toBe(true);
  });
  it("a record with no finished note is not a candidate", () => {
    expect(filmCandidateMark({ finishedText: null, noteItems: null }).candidate).toBe(false);
  });
  it("the spec writes the mark into the record on every path", () => {
    const spec = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    expect(spec.match(/rec\["candidate"\] = filmCandidateMark/g)?.length).toBe(2);
    expect(spec).toContain('rec["finishedNotes"]');
  });
});
