// Masking task 26 (third review, X5 and Y4): kinds. Invented people only.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { screenDraft } from "../../src/drafting/screenDraft";
import { makeProposeMasksJob, type ProposeSdk } from "../../src/inference/proposeMasks/proposeMasks.real";
import { checkCandidates } from "../../src/inference/proposeMasks/proposeMasks.schema";
import { parseClientList } from "../../src/masking/clientList";
import { mergeProposals, type Proposal } from "../../src/masking/merge";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { assignTags } from "../../src/masking/tags";

const clients = parseClientList(inventedVisit.clientList).entries;
const accepting = { ...DEFAULT_POLICY, proposalsStartAccepted: true };

describe("a weekday, a time or a relative day is dropped (Y4)", () => {
  const raw = "Seen Mon at 14:00 with Bea. Back tomorrow, then Fri. Born 3/3/87.";
  const wanted: Proposal[] = [
    { text: "Mon", kind: "place" },
    { text: "Fri", kind: "place" },
    { text: "14:00", kind: "place" },
    { text: "tomorrow", kind: "place" },
    { text: "Bea", kind: "name" },
    { text: "3/3/87", kind: "dob" },
  ];

  it("in the merge on the record", () => {
    const { spans } = mergeProposals(raw, [], wanted, DEFAULT_POLICY);
    expect(spans.map((s) => s.surfaceForm)).toEqual(["Bea", "3/3/87"]);
  });

  it("in the screening of a returned draft", () => {
    const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const s = screenDraft({ draft: raw, outgoing, clients, policy: DEFAULT_POLICY, noteText: inventedVisit.note, proposed: wanted });
    expect(s.maskedText).toContain("Mon");
    expect(s.maskedText).toContain("Fri");
    expect(s.maskedText).toContain("14:00");
    expect(s.maskedText).toContain("tomorrow");
    expect(s.maskedText).not.toContain("Bea");
    expect(s.maskedText).not.toContain("3/3/87");
    // No tag of any kind was made for them.
    expect(s.maskedText).not.toMatch(/\[Place \d+\]/);
  });
});

describe("role words and months in the screening of a returned draft (masking R18)", () => {
  it("leaves a lone role word and a month, and masks only the name after a role word", () => {
    const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const draft = "The neighbour Tamsin Quill rang in March. Her sister was there.";
    const s = screenDraft({
      draft,
      outgoing,
      clients,
      policy: DEFAULT_POLICY,
      noteText: inventedVisit.note,
      proposed: [
        { text: "neighbour Tamsin Quill", kind: "name" },
        { text: "March", kind: "dob" },
        { text: "sister", kind: "phrase" },
      ],
    });
    expect(s.maskedText).toContain("neighbour");
    expect(s.maskedText).toContain("March");
    expect(s.maskedText).toContain("sister");
    expect(s.maskedText).not.toContain("Tamsin Quill");
  });
});

describe("a suggestion with no kind is a Detail (Y4)", () => {
  it("is tagged [Detail 1] in the merge, never [Place n]", () => {
    const raw = "Her twin brother was in.";
    const { spans } = mergeProposals(raw, [], [{ text: "her twin brother" } as unknown as Proposal], accepting);
    expect(assignTags(spans).map((s) => s.tag)).toEqual(["[Detail 1]"]);
  });

  it("is tagged [Detail n] in the screening of a draft", () => {
    const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const s = screenDraft({
      draft: "Her twin brother rang.",
      outgoing,
      clients,
      policy: DEFAULT_POLICY,
      noteText: "Her twin brother rang.",
      proposed: [{ text: "Her twin brother" } as never],
    });
    expect(s.maskedText).toMatch(/^\[Detail \d+\] rang\.$/);
    expect(s.maskedText).not.toMatch(/\[Place/);
  });

  it("is accepted by the reply check as a describing phrase", () => {
    const r = checkCandidates({ candidates: [{ text: "her twin brother" }, { text: "Bea", kind: "name" }, { text: "x", kind: "" }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.candidates).toEqual([{ text: "her twin brother", kind: "phrase" }, { text: "Bea", kind: "name" }, { text: "x", kind: "phrase" }]);
  });

  it("is accepted by the job, which gives it the phrase kind", async () => {
    const sdk: ProposeSdk = { generate: async () => ({ text: JSON.stringify({ candidates: [{ text: "her twin brother" }] }), inferenceSource: "on_device" }) };
    const job = makeProposeMasksJob({ sdk, state: async () => "available" });
    expect((await job.run("Her twin brother was in.")).value).toEqual([{ text: "her twin brother", kind: "phrase" }]);
  });

  it("still refuses a kind that is present and is not one of the four", () => {
    expect(checkCandidates({ candidates: [{ text: "a", kind: "colour" }] }).ok).toBe(false);
    expect(checkCandidates({ candidates: [{ text: "a", kind: 3 }] }).ok).toBe(false);
  });
});

describe("kinds that are given keep their tags", () => {
  it("keeps Bea as a person and 14 Alder Court as a place", () => {
    const raw = "Bea lives at 14 Alder Court.";
    const { spans } = mergeProposals(raw, [], [{ text: "Bea", kind: "name" }, { text: "14 Alder Court", kind: "place" }], accepting);
    expect(assignTags(spans).map((s) => s.tag)).toEqual(["[Person 1]", "[Place 1]"]);
  });
});
