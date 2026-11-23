// D-R6. The dictionary and the fact check are tested on their own, before a model runs.
import { describe, expect, it } from "vitest";
import { prepareRewrite, runRewrite } from "../../src/drafting/rewriteFlow";
import { makeLedger } from "../../src/egress/ledger";
import { makeRewriteJob, type RewriteSdk } from "../../src/inference/rewrite/rewrite.real";
import { FILM_NOTE, REGRESSION_NOTES } from "../../src/inference/rewrite/regressionSet";
import {
  allFive,
  expandShorthand,
  inventedFacts,
  shownText,
} from "../../src/inference/rewrite/shorthand";

const values = { listedNames: [] as string[], surfaceForms: [] as string[], sentOnPurpose: [] as string[] };

describe("shorthand dictionary, before the model", () => {
  it("spells apt, bldg, Fri, appt and f/u", () => {
    expect(expandShorthand("the apt")).toBe("the apartment");
    expect(expandShorthand("the bldg")).toBe("the building");
    expect(expandShorthand("closed Fri.")).toBe("closed Friday.");
    expect(expandShorthand("the appt")).toBe("the appointment");
    expect(expandShorthand("F/u with [Person 1].")).toBe("Follow-up with [Person 1].");
  });

  it("keeps the longer key: appts, docs, wks", () => {
    expect(expandShorthand("both appts")).toBe("both appointments");
    expect(expandShorthand("the docs")).toBe("the documents");
    expect(expandShorthand("2 wks")).toBe("2 weeks");
  });

  it("does not expand inside a word or a tag", () => {
    expect(expandShorthand("[Person 1] did the Monday form.")).toBe("[Person 1] did the Monday form.");
    expect(expandShorthand("document")).toBe("document");
  });

  it("sends the expanded sentence to the model when the note uses the dictionary", () => {
    const note = "[Person 1] said the apt lock sticks. The bldg office is closed Fri.";
    const prep = prepareRewrite({ sentence: note, kind: "shorter", cloud: false, values });
    expect(prep.expanded).toBe("[Person 1] said the apartment lock sticks. The building office is closed Friday.");
    expect(prep.text).toContain("Sentence: " + prep.expanded);
    expect(prep.text).not.toContain(" apt ");
    expect(prep.tags).toEqual(["[Person 1]"]);
  });
});

describe("fact check, after the model", () => {
  const note = "[Person 1] said the apt lock sticks. The bldg office is closed Fri.";
  const expanded = "[Person 1] said the apartment lock sticks. The building office is closed Friday.";

  it("returns the expanded note unchanged when a noun, date, number or tag was invented", () => {
    expect(shownText(note, "[Person 1] said the apartment lock is broken. The building office is closed Friday.")).toBe(expanded);
    expect(shownText(note, "[Person 1] said the apartment lock sticks. The building office is closed Saturday.")).toBe(expanded);
    expect(shownText(note, "[Person 1] said the apartment lock sticks at 9. The building office is closed Friday.")).toBe(expanded);
    expect(shownText(note, "[Person 2] said the apartment lock sticks. The building office is closed Friday.")).toBe(expanded);
    expect(inventedFacts(note, expanded)).toEqual([]);
  });

  it("keeps a reply that uses an inflection or a synonym of a word already in the note", () => {
    const synonym = "[Person 1] reported the apartment lock was stuck, and the building office was closed Friday.";
    expect(inventedFacts(note, synonym)).toEqual([]);
    expect(shownText(note, synonym)).toBe(synonym);
  });

  it("keeps a possessive, an ordinal ending, and monthly when month modifies the next word", () => {
    const manager = REGRESSION_NOTES[12]!.note;
    const possessive = "[Person 1] agreed to bring the documents next Tuesday, and the manager's visit is at 2.";
    expect(inventedFacts(manager, possessive)).toEqual([]);
    expect(shownText(manager, possessive)).toBe(possessive);
    expect(allFive(manager, possessive, REGRESSION_NOTES[12]!.facts)).toBe(true);

    const rent = REGRESSION_NOTES[23]!.note;
    const ordinal = "[Person 4] paid the month rent, and the letter is dated November 3rd.";
    expect(inventedFacts(rent, ordinal)).toEqual([]);
    expect(shownText(rent, ordinal)).toBe(ordinal);

    const payment = REGRESSION_NOTES[19]!.note;
    const monthly = "[Person 4] asked about the monthly payment, and the form is due on Friday.";
    expect(inventedFacts(payment, monthly)).toEqual([]);
    expect(shownText(payment, monthly)).toBe(monthly);
    expect(allFive(payment, monthly, REGRESSION_NOTES[19]!.facts)).toBe(true);

    const thisMonth = REGRESSION_NOTES[11]!.note;
    const changed = "Two letters are on the table, and [Person 4] missed both appointments monthly.";
    expect(shownText(thisMonth, changed)).toBe(expandShorthand(thisMonth));
  });

  it("keeps a reply that adds nothing and spells the dictionary", () => {
    const clean = "[Person 1] said the apartment lock sticks. The building office is closed Friday.";
    expect(shownText(note, clean)).toBe(clean);
  });
});

describe("the 30 notes, fact lists written first", () => {
  it("has 30 invented notes and the film example at n 17", () => {
    expect(REGRESSION_NOTES).toHaveLength(30);
    expect(REGRESSION_NOTES.map((row) => row.n)).toEqual(Array.from({ length: 30 }, (_v, i) => i + 1));
    expect(FILM_NOTE).toBe(17);
    expect(REGRESSION_NOTES[16]!.note).toContain("apt lock");
  });

  it("the expanded note passes all five and shows no invented fact", () => {
    const misses = REGRESSION_NOTES.flatMap((row) => {
      const expanded = expandShorthand(row.note);
      return allFive(row.note, expanded, row.facts) && inventedFacts(row.note, expanded).length === 0
        ? []
        : [`n ${row.n}: ${expanded}`];
    });
    expect(misses).toEqual([]);
  });
});

describe("a shorthand note never puts an invented reply on the screen", () => {
  const note = REGRESSION_NOTES[16]!.note;

  it("replaces the invented device reply with the expanded note", async () => {
    const sdk: RewriteSdk = { generate: async () => ({ text: "[Person 1] said the apartment lock is broken, and the building office was closed Friday.", inferenceSource: "on_device" }) };
    const out = await runRewrite(prepareRewrite({ sentence: note, kind: "shorter", cloud: false, values }), {
      rewrite: makeRewriteJob({ sdk, cloudEnabled: false, state: async () => "available" }),
      ledger: makeLedger(),
      device: "available",
    });
    expect(out.status).toBe("rewritten");
    if (out.status === "rewritten") {
      expect(out.value).toBe(expandShorthand(note));
      expect(inventedFacts(note, out.value)).toEqual([]);
    }
  });
});
