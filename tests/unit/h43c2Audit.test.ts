// H43c-2 c2: the audit's own tests. The same must-warn and near-miss sentences as the
// device's c1-a/c1-b tests, run through evaluateWrongPersonPronouns only.
import { describe, expect, it } from "vitest";
import { evaluateWrongPersonPronouns } from "../e2e/device/n3Audit";

const OUTGOING = "Visit date: 06/01\nPresent: [Person 1], [Person 2]\nSeen: Flat 25\n\nInstructions: write the note.";

function audit(rawCloudReply: string) {
  return evaluateWrongPersonPronouns({ rawCloudReply, outgoingSent: OUTGOING, sheetNotes: [] });
}

describe("H43c-2 c2 audit own tests (same sentences as the device)", () => {
  it("c1-a must-warn: {she:Person 1} told [Person 2] he would rebook", () => {
    expect(audit("{she:Person 1} told [Person 2] he would rebook.")).toMatchObject({
      hasWrongPersonPronoun: true,
      wrongPersonPronounHits: ["{she:Person 1} told [Person 2] he would rebook."],
    });
  });

  it("c1-a near miss: anaphoricDraft stays quiet", () => {
    const anaphoricDraft =
      "The worker spoke to [Person 1] at the front desk. Later, {she:Person 1} confirmed she would pass on the new time.";
    expect(audit(anaphoricDraft)).toMatchObject({
      hasWrongPersonPronoun: false,
      wrongPersonPronounHits: [],
    });
  });

  it("c1-b must-warn: {they:Person 1} agreed the form was late and [Person 1] posts it", () => {
    expect(audit("{they:Person 1} agreed the form was late and [Person 1] posts it.")).toMatchObject({
      hasWrongPersonPronoun: true,
      wrongPersonPronounHits: ["{they:Person 1} agreed the form was late and [Person 1] posts it."],
    });
  });

  it("c1-b near miss: {they:Person 1} agreed the form was late and [Person 2] posts it", () => {
    expect(audit("{they:Person 1} agreed the form was late and [Person 2] posts it.")).toMatchObject({
      hasWrongPersonPronoun: false,
      wrongPersonPronounHits: [],
    });
  });
});
