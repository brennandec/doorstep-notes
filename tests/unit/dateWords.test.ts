// Masking task 28 (R19, sixth review R6): the date-word rule was tried and taken out again (measurement R15.2).
// The fourth device run found fewer dates of birth than the third (results/catch-rate-run-4.json), so a bare
// date from the device pass is kept, as before. These tests hold the rule out. Invented people only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeProposals, type Proposal } from "../../src/masking/merge";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const kept = (raw: string, text: string, kind: Proposal["kind"] = "dob"): string[] =>
  mergeProposals(raw, [], [{ text, kind }], DEFAULT_POLICY).spans.map((s) => s.surfaceForm);

describe("the date-word rule is out (R19.3, measurement R15.2)", () => {
  it("keeps a bare day and month with no year and no birth word", () => {
    expect(kept("Visit on 12/11 with Bea.", "12/11")).toEqual(["12/11"]);
    expect(kept("She will come on 12 November again.", "12 November")).toEqual(["12 November"]);
  });
  it("keeps the same text with a birth word near it, and a date with a year", () => {
    expect(kept("Bea was born 12/11 in Leeds.", "12/11")).toEqual(["12/11"]);
    expect(kept("Seen on 3/3/87 at home.", "3/3/87")).toEqual(["3/3/87"]);
  });
  it("holds no date-word code in the filter or the merge", () => {
    expect(readFileSync("src/masking/merge.ts", "utf8")).not.toContain("isDateWordWithoutBirth");
    expect(readFileSync("src/masking/notNeeded.ts", "utf8")).not.toContain("export function isDateWordWithoutBirth");
  });
  it("says in the filter file that the try was kept as the fourth run", () => {
    expect(readFileSync("src/masking/notNeeded.ts", "utf8")).toContain("results/catch-rate-run-4.json");
  });
});
