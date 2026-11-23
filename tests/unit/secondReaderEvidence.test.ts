// Second reader task 1 (R2.1, R2.2): quotes that are not in the masked text are dropped,
// and the all-dropped line is shown. Invented people only.
import { describe, expect, it } from "vitest";
import { strings } from "../../src/app/strings";
import { keepEvidence } from "../../src/secondReader/evidence";
import type { Guess } from "../../src/inference/types";

const MASKED = [
  "Visit date: 2026-11-12",
  "Present: [Person 1], [Person 2], worker",
  "Seen: Mould in the back bedroom, worse by the window.",
  "Agreed: [Person 1] posts the benefits form on Friday.",
].join("\n");

describe("keepEvidence", () => {
  it("keeps a quote that is in the masked text, as written there", () => {
    const guesses: Guess[] = [{ who: "a tenant in a ground-floor flat", evidence: ["back bedroom"] }];
    const r = keepEvidence(guesses, MASKED);
    expect(r.guesses[0]!.evidence).toEqual(["back bedroom"]);
    expect(r.allDropped).toBe(false);
  });

  it("compares with case folding and returns the text as it stands in the masked text", () => {
    const r = keepEvidence([{ who: "a tenant", evidence: ["BACK BEDROOM", "Benefits Form"] }], MASKED);
    expect(r.guesses[0]!.evidence).toEqual(["back bedroom", "benefits form"]);
  });

  it("drops a quote that is not in the masked text", () => {
    const r = keepEvidence(
      [{ who: "a tenant", evidence: ["back bedroom", "the landlord was rude", "Friday"] }],
      MASKED,
    );
    expect(r.guesses[0]!.evidence).toEqual(["back bedroom", "Friday"]);
    expect(r.dropped).toBe(1);
  });

  it("drops an empty quote and a quote of white space", () => {
    const r = keepEvidence([{ who: "a tenant", evidence: ["", "   ", "Friday"] }], MASKED);
    expect(r.guesses[0]!.evidence).toEqual(["Friday"]);
    expect(r.dropped).toBe(2);
  });

  it("keeps a guess whose quotes were all dropped, with no quotes", () => {
    const r = keepEvidence([{ who: "someone in the area", evidence: ["no such words"] }], MASKED);
    expect(r.guesses).toEqual([{ who: "someone in the area", evidence: [] }]);
  });

  it("reports allDropped when every quote of every guess was dropped", () => {
    const r = keepEvidence(
      [
        { who: "a", evidence: ["not here"] },
        { who: "b", evidence: ["nor here"] },
      ],
      MASKED,
    );
    expect(r.allDropped).toBe(true);
    expect(r.dropped).toBe(2);
  });

  it("reports allDropped for a guess that gave no quotes at all", () => {
    expect(keepEvidence([{ who: "a", evidence: [] }], MASKED).allDropped).toBe(true);
  });

  it("does not report allDropped when there is no guess", () => {
    const r = keepEvidence([], MASKED);
    expect(r.allDropped).toBe(false);
    expect(r.guesses).toEqual([]);
  });

  it("does not report allDropped while one quote is kept", () => {
    const r = keepEvidence([{ who: "a", evidence: ["nope"] }, { who: "b", evidence: ["Friday"] }], MASKED);
    expect(r.allDropped).toBe(false);
  });

  it("does not match across a word boundary", () => {
    const r = keepEvidence([{ who: "a", evidence: ["bedroo"] }], MASKED);
    expect(r.guesses[0]!.evidence).toEqual([]);
  });

  it("keeps a quote that is a tag, because the tag is in the text", () => {
    const r = keepEvidence([{ who: "a", evidence: ["[Person 1]"] }], MASKED);
    expect(r.guesses[0]!.evidence).toEqual(["[Person 1]"]);
  });

  it("has the line for the all-dropped case in the string table", () => {
    expect(strings.secondReader.allDropped).toBe("The reader gave no words from your text, so there is nothing to tap.");
  });
});
