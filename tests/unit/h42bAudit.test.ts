import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { isMissedVisitText, sanitizeMissedVisitPresent } from "../../src/inference/missedVisit";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import {
  CLOUD_CALL_BUDGET,
  RELEASE_DAY_CLOUD_CALL_BUDGET,
  RELEASE_DAY_UTC_DATES,
  checkDailyCloudBudget,
  emptyLedger,
  readLedger,
  recordDailyCloudCall,
} from "../e2e/fixtures/cloudCalls";
import {
  COPIED_LABEL_RE,
  evaluateWrongPersonPronouns,
  findInventedAttribution,
  findMissedVisitFabricatedPresence,
  hasCopiedRecordLabel,
  summarizeMeasuredDrafts,
} from "../e2e/device/n3Audit";
import { assertCleanMeasurementTree, main as runN3Measure } from "../../scripts/measureN3CloudDrafts";

const CLIENTS = parseClientList(
  "Maria Okonkwo-Reyes; ; she/her\nTomas Brandvold; ; he/him\nBea Ashworth; ; she/her",
).entries;

describe("H42b wrong-person object-her detection and sheet warning", () => {
  it("emits the wrong-person warning line for object-position {her:Tag} pointing at the nearest prior tag", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "12/11",
        present: [
          { label: "Maria Okonkwo-Reyes", role: "client" },
          { label: "Tomas Brandvold", role: "other" },
        ],
        seen: ["Meeting took place."],
        agreed: ["Maria posts form; Tomas helps."],
        risks: [],
        nextSteps: [],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const raw =
      "[Person 1] would post the form, and [Person 2] offered to help {her:Person 2} with the form.";
    const r = restoreDraft({ draft: raw, outgoing: out, clients: CLIENTS });
    expect(r.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
  });

  it("keeps possessive {her:Tag} before a noun phrase free of the wrong-person warning", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "12/11",
        present: [{ label: "Maria Okonkwo-Reyes", role: "client" }],
        seen: ["Calendar checked."],
        agreed: [],
        risks: [],
        nextSteps: [],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const raw = "[Person 1] checked {her:Person 1} calendar before the appointment.";
    const r = restoreDraft({ draft: raw, outgoing: out, clients: CLIENTS });
    expect(r.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
  });
});

describe("H42b N3 programmatic auditors and status gate", () => {
  const n001Note =
    "Missed appt 06/01. Client: Beatrice Delacroix.\n" +
    "Batrice Delacroix did not attend the 2pm slot at the clinic. Rang twice, no answer.\n" +
    "Told by his old friend from the allotment that they had gone to a relative for a few days.\n" +
    "Went to Flat 25, Eddlecombe House, curtains shut, left a card.";

  it("flags fabricated household presence on missed-visit drafts and accepts worker-only wording", () => {
    const bad = findMissedVisitFabricatedPresence({
      note: n001Note,
      outgoingSent: "Visit date: 06/01\nPresent: [Person 1], [Person 2]\nSeen: [Place 1]\n\nInstructions: ...",
      rawCloudReply: "On 06/01, [Person 1] and [Person 2] visited [Place 1].",
      restoredDraft: "On 06/01, Beatrice Delacroix and Marta Adeyemi visited Flat 25, Eddlecombe House.",
    });
    expect(bad).not.toBeNull();

    const good = findMissedVisitFabricatedPresence({
      note: n001Note,
      outgoingSent: "Visit date: 06/01\nPresent: no household member present (no answer / missed visit)\nSeen: [Place 1], curtains shut\n\nInstructions: ...",
      rawCloudReply:
        "On 06/01, no household member was present because nobody answered. The worker went to [Place 1], where the curtains were shut, and left a card. The worker was told by [Detail 1] that they had gone to [Detail 2] for a few days.",
      restoredDraft:
        "On 06/01, no household member was present because nobody answered. The worker went to Flat 25, Eddlecombe House, where the curtains were shut, and left a card. The worker was told by his old friend from the allotment that they had gone to a relative for a few days.",
    });
    expect(good).toBeNull();

    const sanitized = sanitizeMissedVisitPresent(n001Note, {
      visitDate: "06/01",
      present: [
        { label: "Beatrice Delacroix", role: "client" },
        { label: "Marta Adeyemi", role: "other" },
      ],
      seen: ["Flat 25, curtains shut"],
      agreed: [],
      risks: [],
      nextSteps: [],
    });
    expect(sanitized.present).toEqual([]);
  });

  it("distinguishes faithful record phrases from invented attribution", () => {
    const outgoing = "Visit date: 13/06\nPresent: no household member present\nAgreed: [Person 3] (on my list) helps with form\nNext steps: noted for the team meeting\n\nInstructions: ...";
    expect(findInventedAttribution("It was noted for the team meeting on the worker's list.", outgoing)).toBeNull();
    expect(findInventedAttribution("Maria reported that the form was late.", outgoing)).toBe("reported");
    expect(findInventedAttribution("The form belonged to Tomas's list.", outgoing)).toBe("Tomas's list");
  });

  it("verifies zero silent wrong-person pronouns and fails summary status on any defect", () => {
    const flagged = evaluateWrongPersonPronouns({
      rawCloudReply: "[Person 3] offered to help {him:Person 3} with the form.",
      outgoingSent: "Visit date: 12/11\n\nInstructions: ...",
      sheetNotes: [`${strings.drafting.pronounWrongPerson} Tomas offered to help him with the form.`],
    });
    expect(flagged.hasWrongPersonPronoun).toBe(true);
    expect(flagged.hasWrongPersonWarning).toBe(true);
    expect(flagged.silentWrongPersonPronoun).toBe(false);

    const silentBare = evaluateWrongPersonPronouns({
      rawCloudReply: "[Person 3] offered to help her with the form.",
      outgoingSent: "Visit date: 12/11\nPresent: [Person 1], [Person 3]\n\nInstructions: ...",
      sheetNotes: [],
    });
    expect(silentBare.hasWrongPersonPronoun).toBe(true);
    expect(silentBare.hasWrongPersonWarning).toBe(false);
    expect(silentBare.silentWrongPersonPronoun).toBe(true);

    const samplePass: {
      fixtureIsMissedVisit: boolean;
      n4CopiedLabelFail: boolean;
      n5AttributionHit: string | null;
      n6PronounHedgeHit: string | null;
      n7TokenLeakHit: string | null;
      missedVisitFabricatedPresence: string | null;
      hasWrongPersonPronoun: boolean;
      hasWrongPersonWarning: boolean;
      silentWrongPersonPronoun: boolean;
    } = {
      fixtureIsMissedVisit: false,
      n4CopiedLabelFail: false,
      n5AttributionHit: null,
      n6PronounHedgeHit: null,
      n7TokenLeakHit: null,
      missedVisitFabricatedPresence: null,
      hasWrongPersonPronoun: false,
      hasWrongPersonWarning: false,
      silentWrongPersonPronoun: false,
    };
    const passing = summarizeMeasuredDrafts(Array.from({ length: 12 }, () => ({ ...samplePass })));
    expect(passing.status).toBe("pass");

    const withFabricated = Array.from({ length: 12 }, () => ({ ...samplePass }));
    withFabricated[6]!.missedVisitFabricatedPresence = "Beatrice visited Flat 25";
    withFabricated[6]!.fixtureIsMissedVisit = true;
    const failedPresence = summarizeMeasuredDrafts(withFabricated);
    expect(failedPresence.status).toBe("fail");
    expect(failedPresence.summary.missedVisitFabricatedPresenceCount).toBe(1);

    const withSilentPronoun = Array.from({ length: 12 }, () => ({ ...samplePass }));
    withSilentPronoun[2]!.hasWrongPersonPronoun = true;
    withSilentPronoun[2]!.silentWrongPersonPronoun = true;
    const failedPronoun = summarizeMeasuredDrafts(withSilentPronoun);
    expect(failedPronoun.status).toBe("fail");
    expect(failedPronoun.summary.silentWrongPersonPronounCount).toBe(1);
  });

  it("measureN3CloudDrafts refuses cleanly with 0 network calls when daily ledger is at/over 40", async () => {
    const dir = mkdtempSync(join(tmpdir(), "n3-cap-"));
    const ledgerFile = join(dir, "ledger.json");
    writeFileSync(ledgerFile, JSON.stringify({ ...emptyLedger(), total: 51, stoppedAtBudget: true }), "utf8");
    const openSpy = vi.fn();
    try {
      await expect(runN3Measure({ ledgerFile, open: openSpy as never })).rejects.toThrow(/0 network calls made/);
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits wrong-person warning on bare untagged him/her/them and subject/{role:Detail} mismatches (0 silent cases)", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [
          { label: "Maria Okonkwo-Reyes", role: "client" },
          { label: "Tomas Brandvold", role: "other" },
          { label: "Bea Ashworth", role: "other" },
        ],
        seen: ["Flat 25; spoken with [Detail 1]."],
        agreed: [],
        risks: [],
        nextSteps: ["his old friend from the allotment passed message"],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithDetail = {
      ...out,
      mask: {
        ...out.mask,
        map: {
          ...out.mask.map,
          "[Detail 1]": "his old friend from the allotment",
        },
      },
    };

    const bareHimDraft = "[Person 2] offered to help him with the form.";
    const bareRestored = restoreDraft({ draft: bareHimDraft, outgoing: outWithDetail, clients: CLIENTS });
    expect(bareRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: bareHimDraft,
        outgoingSent: out.text,
        sheetNotes: bareRestored.notes,
      }),
    ).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });

    const detailSubjectDraft = "The worker was told by [Detail 1] that {they:Detail 1} had left for a few days.";
    const detailRestored = restoreDraft({ draft: detailSubjectDraft, outgoing: outWithDetail, clients: CLIENTS });
    expect(detailRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: detailSubjectDraft,
        outgoingSent: out.text,
        sheetNotes: detailRestored.notes,
      }),
    ).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });

    const subjectMismatchDraft = "The worker spoke to [Detail 1], and {she:Person 1} was away.";
    const mismatchRestored = restoreDraft({ draft: subjectMismatchDraft, outgoing: outWithDetail, clients: CLIENTS });
    expect(mismatchRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: subjectMismatchDraft,
        outgoingSent: out.text,
        sheetNotes: mismatchRestored.notes,
      }),
    ).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });
  });

  it("ignores third-party no-answer/deadline misses on attended notes and detects paraphrased unanswered visits", () => {
    const attendedNote = "No answer from landlord; missed benefits deadline. Maria O-R in. Bea there.";
    expect(isMissedVisitText(attendedNote)).toBe(false);
    const kept = sanitizeMissedVisitPresent(attendedNote, {
      visitDate: "12/11",
      present: [
        { label: "Maria Okonkwo-Reyes", role: "client" },
        { label: "Bea Ashworth", role: "other" },
      ],
      seen: ["Spoke with client about heating."],
      agreed: [],
      risks: [],
      nextSteps: [],
    });
    expect(kept.present).toHaveLength(2);

    const paraphrasedOut = buildOutgoing({
      record: {
        visitDate: "13/06",
        present: [],
        seen: ["Unanswered knock; nobody home at Flat 23."],
        agreed: [],
        risks: [],
        nextSteps: [],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    expect(paraphrasedOut.maskedRecord).toContain("Present: no household member present (no answer / missed visit)");
  });

  it("allows negated presence such as 'No individuals were present' while still flagging mixed positive claims", () => {
    const n002Note = "Missed appt 13/06. Went to Flat 23, curtains shut, left a card.";
    const outgoingSent = "Visit date: 13/06\nPresent: no household member present (no answer / missed visit)";
    expect(
      findMissedVisitFabricatedPresence({
        note: n002Note,
        outgoingSent,
        rawCloudReply: "No individuals were present for the visit.",
        restoredDraft: "No individuals were present for the visit.",
      }),
    ).toBeNull();
    expect(
      findMissedVisitFabricatedPresence({
        note: n002Note,
        outgoingSent,
        rawCloudReply: "No household members were present.",
        restoredDraft: "No household members were present.",
      }),
    ).toBeNull();
    expect(
      findMissedVisitFabricatedPresence({
        note: n002Note,
        outgoingSent,
        rawCloudReply: "No individuals were mentioned. [Person 1] was present for the visit.",
        restoredDraft: "No individuals were mentioned. Nicolas Ashworth was present for the visit.",
      }),
    ).toContain("was present");
  });

  it("H44 item 1: the stored n002 drafts of 2026-11-17 (attempts 1 and 2) are faithful and not flagged", () => {
    const file = JSON.parse(readFileSync("results/h43-n3-cloud-drafts-2026-11-17.json", "utf8")) as {
      samples: Array<{ fixtureId: string; attempt: number; outgoingSent: string; rawCloudReply: string | null; restoredDraft: string }>;
    };
    const note = "Missed appt 13/06. Went to Flat 23, curtains shut, left a card.";
    for (const attempt of [1, 2]) {
      const s = file.samples.find((x) => x.fixtureId === "synthetic-n002" && x.attempt === attempt)!;
      expect(s.rawCloudReply).toContain("[I] went to [Place 1]");
      expect(findMissedVisitFabricatedPresence({ note, outgoingSent: s.outgoingSent, rawCloudReply: s.rawCloudReply, restoredDraft: s.restoredDraft })).toBeNull();
    }
  });

  it("H44 item 1: a person-subject visit is still flagged although the record says 'Went to [Place 1]'", () => {
    const note = "Missed appt 13/06. Went to Flat 23, curtains shut, left a card.";
    const outgoingSent = "Visit date: [Date 1]\nPresent: no household member present (no answer / missed visit)\nNext steps: Went to [Place 1], curtains shut, left a card";
    expect(
      findMissedVisitFabricatedPresence({
        note,
        outgoingSent,
        rawCloudReply: "[Person 1] went to [Place 1], found the curtains shut.",
        restoredDraft: "Beatrice went to Flat 23, found the curtains shut.",
      }),
    ).toContain("went to");
    expect(
      findMissedVisitFabricatedPresence({
        note,
        outgoingSent: "Visit date: [Date 1]\nPresent: no household member present (no answer / missed visit)\nNext steps: left a card",
        rawCloudReply: "[I] went to [Place 1], found the curtains shut.",
        restoredDraft: "I went to Flat 23, found the curtains shut.",
      }),
    ).toContain("went to");
  });

  it("H44b 2: an unstated subject after 'and' inherits the clause before it", () => {
    const note = "Missed appt 13/06. Went to Flat 23, curtains shut, left a card.";
    const outgoingSent = "Visit date: [Date 1]\nPresent: no household member present (no answer / missed visit)\nNext steps: Went to [Place 1], curtains shut, left a card";
    const run = (raw: string, restored: string) =>
      findMissedVisitFabricatedPresence({ note, outgoingSent, rawCloudReply: raw, restoredDraft: restored });
    expect(run("[Person 1] arrived and went to [Place 1].", "Beatrice arrived and went to Flat 23.")).toContain("went to");
    expect(run("Beatrice arrived and went to Flat 23.", "Beatrice arrived and went to Flat 23.")).toContain("went to");
    expect(run("I rang twice and went to [Place 1].", "I rang twice and went to Flat 23.")).toBeNull();
    expect(run("Rang twice and went to [Place 1].", "Rang twice and went to Flat 23.")).toBeNull();
  });

  it("warns on cataphoric {role:Person N} before first bare [Person N] without false-flagging anaphoric or single-person drafts", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [],
        seen: ["Flat 25"],
        agreed: [],
        risks: [],
        nextSteps: ["An old friend told them.", "Spoke to Marta Adeyemi at the front desk."],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithMarta = {
      ...out,
      mask: {
        ...out.mask,
        map: { ...out.mask.map, "[Person 1]": "Marta Adeyemi" },
      },
    };

    const cataphoricDraft =
      "An old friend from the allotment told {him:Person 1} that they had gone to a relative for a few days. " +
      "The worker left a card and spoke to [Person 1] at the front desk, who will pass on the new time.";
    const cataphoricRestored = restoreDraft({ draft: cataphoricDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(cataphoricRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: cataphoricDraft,
        outgoingSent: out.text,
        sheetNotes: cataphoricRestored.notes,
      }),
    ).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });

    const anaphoricDraft =
      "The worker spoke to [Person 1] at the front desk. Later, {she:Person 1} confirmed she would pass on the new time.";
    const anaphoricRestored = restoreDraft({ draft: anaphoricDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(anaphoricRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: anaphoricDraft,
        outgoingSent: out.text,
        sheetNotes: anaphoricRestored.notes,
      }),
    ).toMatchObject({ hasWrongPersonPronoun: false, hasWrongPersonWarning: false, silentWrongPersonPronoun: false });

    const singleNeverBareDraft = "The worker left a card and spoke to {she:Person 1} at the front desk.";
    const neverBareRestored = restoreDraft({ draft: singleNeverBareDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(neverBareRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: singleNeverBareDraft,
        outgoingSent: out.text,
        sheetNotes: neverBareRestored.notes,
      }),
    ).toMatchObject({ hasWrongPersonPronoun: false, hasWrongPersonWarning: false, silentWrongPersonPronoun: false });
  });

  it("H43c c1 shape (a): warns on an untagged pronoun sentence, not on its tagged near miss", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [],
        seen: ["Flat 25"],
        agreed: [],
        risks: [],
        nextSteps: ["Spoke to Marta Adeyemi at the front desk."],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithMarta = {
      ...out,
      mask: { ...out.mask, map: { ...out.mask.map, "[Person 1]": "Marta Adeyemi" } },
    };
    const warnDraft = "The worker spoke to [Person 1] at the front desk. Later she confirmed the new time.";
    const warnRestored = restoreDraft({ draft: warnDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(warnRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
    const nearMissDraft = "The worker spoke to [Person 1] at the front desk. Later {she:Person 1} confirmed the new time.";
    const nearMissRestored = restoreDraft({ draft: nearMissDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(nearMissRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
  });

  it("H43c-2 c1-a: a bare pronoun of another family after a tagged token warns", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [],
        seen: ["Flat 25"],
        agreed: [],
        risks: [],
        nextSteps: ["Spoke to Marta Adeyemi at the front desk."],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithMarta = {
      ...out,
      mask: { ...out.mask, map: { ...out.mask.map, "[Person 1]": "Marta Adeyemi", "[Person 2]": "Tomas Brandvold" } },
    };
    const warnDraft = "{she:Person 1} told [Person 2] he would rebook.";
    const warnRestored = restoreDraft({ draft: warnDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(warnRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
  });

  it("H43c-2 c1-a: anaphoricDraft stays quiet as at 111f0f3", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [],
        seen: ["Flat 25"],
        agreed: [],
        risks: [],
        nextSteps: ["Spoke to Marta Adeyemi at the front desk."],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithMarta = {
      ...out,
      mask: { ...out.mask, map: { ...out.mask.map, "[Person 1]": "Marta Adeyemi" } },
    };
    const anaphoricDraft =
      "The worker spoke to [Person 1] at the front desk. Later, {she:Person 1} confirmed she would pass on the new time.";
    const anaphoricRestored = restoreDraft({ draft: anaphoricDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(anaphoricRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
  });

  it("H43c c1 shape (b): warns when a Person N token is followed later in the same sentence by bare [Person N], not on its near miss", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [],
        seen: ["Flat 25"],
        agreed: [],
        risks: [],
        nextSteps: ["Spoke to Marta Adeyemi at the front desk."],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithMarta = {
      ...out,
      mask: { ...out.mask, map: { ...out.mask.map, "[Person 1]": "Marta Adeyemi", "[Person 2]": "Tomas Brandvold" } },
    };
    const warnDraft = "{they:Person 1} agreed that [Person 1] posts the benefits form Mon.";
    const warnRestored = restoreDraft({ draft: warnDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(warnRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
    const nearMissDraft = "{they:Person 1} agreed that [Person 2] posts the benefits form Mon.";
    const nearMissRestored = restoreDraft({ draft: nearMissDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(nearMissRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
  });

  it("H43c-2 c1-b: token then bare same person across and in one sentence warns", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [],
        seen: ["Flat 25"],
        agreed: [],
        risks: [],
        nextSteps: ["Spoke to Marta Adeyemi at the front desk."],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithMarta = {
      ...out,
      mask: { ...out.mask, map: { ...out.mask.map, "[Person 1]": "Marta Adeyemi", "[Person 2]": "Tomas Brandvold" } },
    };
    const warnDraft = "{they:Person 1} agreed the form was late and [Person 1] posts it.";
    const warnRestored = restoreDraft({ draft: warnDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(warnRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
  });

  it("H43c-2 c1-b: token then bare different person across and in one sentence does not warn", () => {
    const out = buildOutgoing({
      record: {
        visitDate: "06/01",
        present: [],
        seen: ["Flat 25"],
        agreed: [],
        risks: [],
        nextSteps: ["Spoke to Marta Adeyemi at the front desk."],
      },
      clients: CLIENTS,
      policy: DEFAULT_POLICY,
    });
    const outWithMarta = {
      ...out,
      mask: { ...out.mask, map: { ...out.mask.map, "[Person 1]": "Marta Adeyemi", "[Person 2]": "Tomas Brandvold" } },
    };
    const nearMissDraft = "{they:Person 1} agreed the form was late and [Person 2] posts it.";
    const nearMissRestored = restoreDraft({ draft: nearMissDraft, outgoing: outWithMarta, clients: CLIENTS });
    expect(nearMissRestored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
  });

  it("replays inline Run 3 cataphoric synthetic-n001 #2 & #3 plus all live 2026-11-16 samples with 0 silent cases", () => {
    const run3 = JSON.parse(readFileSync("results/h42-n3-cloud-drafts-2026-11-16.json", "utf8")) as {
      buildCommit: string;
      samples: Array<{
        fixtureId: string;
        attempt: number;
        outgoingSent: string;
        rawCloudReply: string;
        restoredDraft: string;
        n4CopiedLabelFail: boolean;
      }>;
    };
    const synth = JSON.parse(readFileSync("results/synthetic-set.json", "utf8")) as {
      notes: Array<{
        id: string;
        clientList: Array<{ id: string; fullName: string; otherNames?: string[]; pronouns?: string }>;
      }>;
    };
    const fmt = (list: Array<{ fullName: string; otherNames?: string[]; pronouns?: string }>) =>
      list.map((c) => `${c.fullName}; ${(c.otherNames ?? []).join(", ")}; ${c.pronouns ?? ""}`).join("\n");
    const n001Clients = parseClientList(fmt(synth.notes.find((n) => n.id === "n001")!.clientList)).entries;
    const n002Clients = parseClientList(fmt(synth.notes.find((n) => n.id === "n002")!.clientList)).entries;
    const manifestClients = parseClientList("Odalys Brennan-Webb; ; she/her\nIone; ; she/her").entries;
    const inventedClients = parseClientList(inventedVisit.clientList).entries;

    const fixtureConfig: Record<
      string,
      {
        clients: typeof CLIENTS;
        map: Record<string, string>;
        clientByTag: Record<string, string>;
      }
    > = {
      inventedVisit: {
        clients: inventedClients,
        map: {
          "[Person 1]": "Maria Okonkwo-Reyes",
          "[Person 2]": "Bea",
          "[Person 3]": "Tomas Brandvold",
        },
        clientByTag: {
          "[Person 1]": inventedClients.find((c) => c.fullName === "Maria Okonkwo-Reyes")!.id,
          "[Person 3]": inventedClients.find((c) => c.fullName === "Tomas Brandvold")!.id,
        },
      },
      "handwriting-manifest": {
        clients: manifestClients,
        map: {
          "[Person 1]": "Odalys Brennan-Webb",
          "[Person 2]": "Ione",
        },
        clientByTag: {
          "[Person 1]": manifestClients.find((c) => c.fullName === "Odalys Brennan-Webb")!.id,
          "[Person 2]": manifestClients.find((c) => c.fullName === "Ione")!.id,
        },
      },
      "synthetic-n001": {
        clients: n001Clients,
        map: {
          "[Date 1]": "06/01",
          "[Place 1]": "Flat 25",
          "[Place 2]": "Eddlecombe House",
          "[Person 1]": "Marta Adeyemi",
          "[Date 2]": "16/12/1998",
        },
        clientByTag: {},
      },
      "synthetic-n002": {
        clients: n002Clients,
        map: {
          "[Place 1]": "Flat 23",
          "[Place 2]": "Eddlecombe House",
        },
        clientByTag: {},
      },
    };

    const inferMapForLiveSample = (
      rawCloudReply: string,
      restoredDraft: string,
      cfg: { clients: typeof CLIENTS; map: Record<string, string>; clientByTag: Record<string, string> },
    ): { map: Record<string, string>; clientByTag: Record<string, string> } => {
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tokenRe = /(\[(?:Person|Place|Date|Detail)[ \t]+\d+\]|\{[a-z]+:[ \t]*(?:Person|Place|Date|Detail)[ \t]+\d+\})/gi;
      const seenGroup = new Map<string, number>();
      let pattern = "^";
      let last = 0;
      let groupIndex = 0;
      for (const m of rawCloudReply.matchAll(tokenRe)) {
        const idx = m.index!;
        pattern += esc(rawCloudReply.slice(last, idx));
        const tok = m[0]!;
        if (tok.startsWith("[")) {
          const existing = seenGroup.get(tok);
          if (existing !== undefined) {
            pattern += `\\${existing}`;
          } else {
            groupIndex += 1;
            seenGroup.set(tok, groupIndex);
            pattern += "(.+?)";
          }
        } else {
          pattern += "[A-Za-z'’]+";
        }
        last = idx + tok.length;
      }
      pattern += esc(rawCloudReply.slice(last)) + "$";
      const match = new RegExp(pattern, "s").exec(restoredDraft);
      if (!match) return { map: cfg.map, clientByTag: cfg.clientByTag };
      const map: Record<string, string> = { ...cfg.map };
      const clientByTag: Record<string, string> = { ...cfg.clientByTag };
      for (const [tag, gIdx] of seenGroup.entries()) {
        const val = match[gIdx]!;
        map[tag] = val;
        if (/^\[Person/i.test(tag)) {
          const matchedClient = cfg.clients.find(
            (c) =>
              c.fullName.toLowerCase() === val.toLowerCase() ||
              c.otherNames.some((o) => o.toLowerCase() === val.toLowerCase()),
          );
          if (matchedClient) clientByTag[tag] = matchedClient.id;
        }
      }
      return { map, clientByTag };
    };

    const inlineCataphoricReplies = [
      {
        attempt: 2,
        outgoingSent:
          "Visit date: [Date 1]\nPresent: no household member present (no answer / missed visit)\nSeen: [Place 1], [Place 2], curtains shut\nAgreed: none\nRisks: none\nNext steps: Rang twice, no answer; Told by his old friend from the allotment that they had gone to a relative for a few days; Left a card; Spoke to [Person 1] at the front desk, who will pass on the new time; Left the leaflet about the bus pass with the neighbour; Checked DOB [Date 2] before rebooking\n\nInstructions: ...",
        rawCloudReply:
          "On [Date 1], nobody answered because no household member was present during the missed visit. [Place 1] and [Place 2] were seen, and the curtains were shut. Nothing was agreed and no risks were identified. The worker rang twice with no answer. An old friend from the allotment told {him:Person 1} that they had gone to a relative for a few days. The worker left a card and spoke to [Person 1] at the front desk, who will pass on the new time. The worker left the leaflet about the bus pass with the neighbour and checked DOB [Date 2] before rebooking.",
      },
      {
        attempt: 3,
        outgoingSent:
          "Visit date: [Date 1]\nPresent: no household member present (no answer / missed visit)\nSeen: [Place 1], [Place 2], curtains shut\nAgreed: none\nRisks: none\nNext steps: Rang twice, no answer; Told by his old friend from the allotment that they had gone to a relative for a few days; Left a card; Spoke to [Person 1] at the front desk, who will pass on the new time; Left the leaflet about the bus pass with the neighbour; Checked DOB [Date 2] before rebooking\n\nInstructions: ...",
        rawCloudReply:
          "On [Date 1] a visit occurred at [Place 1] and [Place 2] where curtains were shut. Nobody answered because no household member was present during the missed visit. No agreements were made and no risks were identified. Two rings yielded no answer. An old friend from the allotment told {him:Person 1} that they had gone to a relative for a few days. A card was left. [Person 1] at the front desk was spoken to, and {she:Person 1} will pass on the new time. The leaflet about the bus pass was left with the neighbour. Date of birth [Date 2] was checked before rebooking.",
      },
    ];
    const inlineWarned: string[] = [];
    for (const sample of inlineCataphoricReplies) {
      const cfg = fixtureConfig["synthetic-n001"]!;
      const maskedRecord = sample.outgoingSent.split("\n\nInstructions:")[0]!;
      const base = buildOutgoing({
        record: { visitDate: "06/01", present: [], seen: [], agreed: [], risks: [], nextSteps: [] },
        clients: cfg.clients,
        policy: DEFAULT_POLICY,
      });
      const outgoing = {
        ...base,
        text: sample.outgoingSent,
        maskedRecord,
        mask: { ...base.mask, maskedText: maskedRecord, map: cfg.map, clientByTag: cfg.clientByTag },
      };
      const restored = restoreDraft({ draft: sample.rawCloudReply, outgoing, clients: cfg.clients });
      const audit = evaluateWrongPersonPronouns({
        rawCloudReply: sample.rawCloudReply,
        outgoingSent: sample.outgoingSent,
        sheetNotes: restored.notes,
      });
      if (audit.hasWrongPersonWarning) inlineWarned.push(`synthetic-n001#${sample.attempt}`);
      expect(audit.silentWrongPersonPronoun).toBe(false);
    }
    expect(inlineWarned).toEqual(["synthetic-n001#2", "synthetic-n001#3"]);

    const silentSamples: string[] = [];
    for (const sample of run3.samples as Array<{
      fixtureId: string;
      attempt: number;
      outgoingSent: string;
      rawCloudReply: string;
      restoredDraft: string;
      n4CopiedLabelFail: boolean;
    }>) {
      const cfg = fixtureConfig[sample.fixtureId]!;
      const maskedRecord = sample.outgoingSent.split("\n\nInstructions:")[0]!;
      const base = buildOutgoing({
        record: { visitDate: "01/01", present: [], seen: [], agreed: [], risks: [], nextSteps: [] },
        clients: cfg.clients,
        policy: DEFAULT_POLICY,
      });
      const quick = restoreDraft({
        draft: sample.rawCloudReply,
        outgoing: {
          ...base,
          text: sample.outgoingSent,
          maskedRecord,
          mask: { ...base.mask, maskedText: maskedRecord, map: cfg.map, clientByTag: cfg.clientByTag },
        },
        clients: cfg.clients,
      });
      const resolved =
        quick.shown === sample.restoredDraft
          ? { map: cfg.map, clientByTag: cfg.clientByTag }
          : inferMapForLiveSample(sample.rawCloudReply, sample.restoredDraft, cfg);
      const outgoing = {
        ...base,
        text: sample.outgoingSent,
        maskedRecord,
        mask: { ...base.mask, maskedText: maskedRecord, map: resolved.map, clientByTag: resolved.clientByTag },
      };
      const restored =
        quick.shown === sample.restoredDraft
          ? quick
          : restoreDraft({ draft: sample.rawCloudReply, outgoing, clients: cfg.clients });
      expect(restored.shown).toBe(sample.restoredDraft);
      expect(sample.n4CopiedLabelFail).toBe(hasCopiedRecordLabel(sample.restoredDraft));
      const audit = evaluateWrongPersonPronouns({
        rawCloudReply: sample.rawCloudReply,
        outgoingSent: sample.outgoingSent,
        sheetNotes: restored.notes,
      });
      if (audit.silentWrongPersonPronoun) silentSamples.push(`${sample.fixtureId}#${sample.attempt}`);
      expect(audit.silentWrongPersonPronoun).toBe(false);
    }
    expect(silentSamples).toEqual([]);
  });

  it("hasCopiedRecordLabel catches both 'Visit date:' and bare 'Visit date' (including Run 3 synthetic-n002 #1 & #2) while confirming 0/12 Visit date on live Run 4 pass drafts (H42c Item 2)", () => {
    const run3InlineSamples = [
      {
        fixtureId: "synthetic-n002",
        attempt: 1,
        restoredDraft:
          "An attempted visit took place on Visit date:, during which nobody answered because no household member was present. The property was observed at Flat 23 and Eddlecombe House, with the curtains shut. No agreements were reached, and no risks were identified. The next steps involve the visit being rebooked for Thursday, and a text was sent to confirm.",
      },
      {
        fixtureId: "synthetic-n002",
        attempt: 2,
        restoredDraft:
          "An attempted visit occurred on Visit date, but nobody answered because no household member was present. Flat 23 and Eddlecombe House were observed with the curtains shut. No agreements were made, and no risks were identified. The next steps are that the visit was rebooked for Thursday, and a text was sent to confirm.",
      },
    ];
    expect(
      run3InlineSamples.filter((s) => hasCopiedRecordLabel(s.restoredDraft)).map((s) => `${s.fixtureId}#${s.attempt}`),
    ).toEqual(["synthetic-n002#1", "synthetic-n002#2"]);

    const liveDrafts = JSON.parse(readFileSync("results/h42-n3-cloud-drafts-2026-11-16.json", "utf8")) as {
      buildCommit: string;
      status: string;
      summary: { n4LabelFreeCount: number };
      samples: Array<{ fixtureId: string; attempt: number; restoredDraft: string; n4CopiedLabelFail: boolean }>;
    };
    expect(liveDrafts.status).toBe("pass");
    expect(liveDrafts.summary.n4LabelFreeCount).toBe(12);
    expect(liveDrafts.samples).toHaveLength(12);
    for (const s of liveDrafts.samples) {
      expect(hasCopiedRecordLabel(s.restoredDraft)).toBe(false);
      expect(s.n4CopiedLabelFail).toBe(false);
    }

    expect(COPIED_LABEL_RE.test("An attempted visit occurred on Visit date, but nobody answered.")).toBe(true);
    expect(hasCopiedRecordLabel("An attempted visit took place on Visit date:, during which nobody answered.")).toBe(true);
    expect(hasCopiedRecordLabel("An attempted visit occurred on visit date.")).toBe(true);
    expect(hasCopiedRecordLabel("An attempted visit occurred on [Visit date].")).toBe(true);
    expect(hasCopiedRecordLabel("Present: none")).toBe(true);
    expect(
      hasCopiedRecordLabel(
        "Every person listed was present at the visit. Mould was seen in the bedroom. It was agreed that the worker rings Mon. No risks were identified. The next steps are to revisit.",
      ),
    ).toBe(false);

    const samplePass = {
      fixtureIsMissedVisit: false,
      n4CopiedLabelFail: false,
      n5AttributionHit: null,
      n6PronounHedgeHit: null,
      n7TokenLeakHit: null,
      missedVisitFabricatedPresence: null,
      hasWrongPersonPronoun: false,
      hasWrongPersonWarning: false,
      silentWrongPersonPronoun: false,
    };
    const withVisitDateFail = Array.from({ length: 12 }, () => ({ ...samplePass }));
    withVisitDateFail[10]!.n4CopiedLabelFail = hasCopiedRecordLabel(
      "An attempted visit occurred on Visit date, but nobody answered.",
    );
    const failedSummary = summarizeMeasuredDrafts(withVisitDateFail);
    expect(failedSummary.status).toBe("fail");
    expect(failedSummary.summary.n4LabelFreeCount).toBe(11);
  });

  it("measureN3CloudDrafts refuses with 0 network calls when src/scripts/tests has uncommitted edits (H42c Item 1)", async () => {
    expect(() => assertCleanMeasurementTree("")).not.toThrow();
    expect(() => assertCleanMeasurementTree(" M src/drafting/buildOutgoing.ts\n")).toThrow(/0 network calls made/);

    const dir = mkdtempSync(join(tmpdir(), "n3-dirty-"));
    const ledgerFile = join(dir, "ledger.json");
    writeFileSync(ledgerFile, JSON.stringify({ ...emptyLedger(), total: 0 }), "utf8");
    const openSpy = vi.fn();
    try {
      await expect(
        runN3Measure({
          ledgerFile,
          open: openSpy as never,
          checkDirty: true,
          dirtyStatusForTest: " M scripts/measureN3CloudDrafts.ts",
        }),
      ).rejects.toThrow(/0 network calls made/);
      expect(openSpy).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ORDER H42d: 2026-11-16 release-day ledger uses RELEASE_DAY_CLOUD_CALL_BUDGET (100) while other UTC dates enforce CLOUD_CALL_BUDGET (40)", () => {
    expect(CLOUD_CALL_BUDGET).toBe(40);
    expect(RELEASE_DAY_CLOUD_CALL_BUDGET).toBe(100);
    expect(RELEASE_DAY_UTC_DATES.has("2026-11-16")).toBe(true);
    expect(emptyLedger().budget).toBe(40);
    expect(emptyLedger().capInForce).toBe("CLOUD_CALL_BUDGET (40)");

    const nov15 = readLedger("results/e2e-cloud-on-2026-11-15-h23.json");
    expect(nov15.total).toBe(51);
    expect(nov15.budget).toBe(40);
    expect(nov15.stoppedAtBudget).toBe(true);
    expect(nov15.capInForce).toBe("CLOUD_CALL_BUDGET (40)");

    const dir = mkdtempSync(join(tmpdir(), "h42d-budget-"));
    try {
      const nov16File = join(dir, "e2e-cloud-on-2026-11-16-h23.json");
      writeFileSync(nov16File, JSON.stringify({ ...emptyLedger(), total: 36, stoppedAtBudget: false }), "utf8");
      const nov16Before = checkDailyCloudBudget(nov16File);
      expect(nov16Before.allowed).toBe(true);
      expect(nov16Before.remaining).toBe(64);
      expect(nov16Before.ledger.budget).toBe(100);
      expect(nov16Before.ledger.capInForce).toBe("RELEASE_DAY_CLOUD_CALL_BUDGET (100)");

      writeFileSync(nov16File, JSON.stringify({ ...emptyLedger(), total: 99, stoppedAtBudget: false }), "utf8");
      const call100 = recordDailyCloudCall("test.spec.ts", "release cap check", "Chrome", nov16File);
      expect(call100.allowed).toBe(true);
      expect(call100.ledger.total).toBe(100);
      expect(call100.ledger.budget).toBe(100);
      expect(call100.ledger.capInForce).toBe("RELEASE_DAY_CLOUD_CALL_BUDGET (100)");
      expect(call100.ledger.stoppedAtBudget).toBe(false);

      const call101 = recordDailyCloudCall("test.spec.ts", "release cap check", "Chrome", nov16File);
      expect(call101.allowed).toBe(false);
      expect(call101.ledger.total).toBe(100);
      expect(call101.ledger.stoppedAtBudget).toBe(true);
      expect(checkDailyCloudBudget(nov16File)).toMatchObject({ allowed: false, remaining: 0 });

      const nov17File = join(dir, "e2e-cloud-on-2026-11-17-h23.json");
      const nov17Initial = readLedger(nov17File);
      expect(nov17Initial.budget).toBe(40);
      expect(nov17Initial.capInForce).toBe("CLOUD_CALL_BUDGET (40)");

      writeFileSync(nov17File, JSON.stringify({ ...emptyLedger(), total: 39, stoppedAtBudget: false }), "utf8");
      const call40 = recordDailyCloudCall("test.spec.ts", "normal cap check", "Chrome", nov17File);
      expect(call40.allowed).toBe(true);
      expect(call40.ledger.total).toBe(40);
      expect(call40.ledger.budget).toBe(40);
      expect(call40.ledger.capInForce).toBe("CLOUD_CALL_BUDGET (40)");

      const call41 = recordDailyCloudCall("test.spec.ts", "normal cap check", "Chrome", nov17File);
      expect(call41.allowed).toBe(false);
      expect(call41.ledger.total).toBe(40);
      expect(call41.ledger.stoppedAtBudget).toBe(true);
      expect(checkDailyCloudBudget(nov17File)).toMatchObject({ allowed: false, remaining: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
