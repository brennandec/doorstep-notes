// Drafting R19 (session H25): two pronoun tokens for one tag that hedge one slot, joined by "or", "/" or "and/or", are one pronoun.
// Invented people only. 0 cloud calls: every draft here is a string typed in this file.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { parseClientList, type ClientEntry } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { collapseLiteralPronounPairs, mergeTokenPairs, restoreAll } from "../../src/masking/pronouns";
import type { MaskResult } from "../../src/masking/types";

const mask: MaskResult = {
  maskedText: "",
  spans: [],
  map: { "[Person 1]": "Maria Okonkwo-Reyes", "[Person 2]": "Tomas Brandvold" },
  clientByTag: { "[Person 1]": "c1", "[Person 2]": "c2" },
  surfaceForms: [],
  listedNames: [],
  sentOnPurpose: [],
};
const withSet = (set: string) =>
  [
    { id: "c1", full: "Maria Okonkwo-Reyes", names: ["Maria Okonkwo-Reyes"], pronouns: set },
    { id: "c2", full: "Tomas Brandvold", names: ["Tomas Brandvold"], pronouns: "he/him" },
  ] as unknown as ClientEntry[];
const out = (draft: string, set = "she/her") => restoreAll(draft, mask, withSet(set)).text;

// In the film's walk (results/film-run-2026-11-14-h22d.json, step 5) the finished note on screen read
// "and she or she will post the form on Friday". The record keeps only draftChars 709, not the draft text,
// so this draft sentence is rebuilt from that frame: the model's exact token pair is not recorded.
const H22D = "It was agreed that the worker will ring the landlord on Monday, and {he:Person 1} or {she:Person 1} will post the form on Friday.";

describe("a same-tag hedge joined by or, / or and/or is one pronoun (drafting R19)", () => {
  it("the h22d sentence: subject pair, for each list entry", () => {
    expect(out(H22D, "she/her")).toBe("It was agreed that the worker will ring the landlord on Monday, and she will post the form on Friday.");
    expect(out(H22D, "he/him")).toBe("It was agreed that the worker will ring the landlord on Monday, and he will post the form on Friday.");
    expect(out(H22D, "they/them")).toBe("It was agreed that the worker will ring the landlord on Monday, and they will post the form on Friday.");
  });

  it("an entry with no pronouns: they, and the fallback line once", () => {
    const r = restoreAll(H22D, mask, withSet(""));
    expect(r.text).toContain("and they will post the form on Friday.");
    expect(r.notes).toEqual(["No pronouns are on the list for Maria Okonkwo-Reyes, so they/them was used."]);
  });

  it("counts a merged pair as one token put back", () => {
    expect(restoreAll(H22D, mask, withSet("she/her")).tokensReplaced).toBe(1);
  });

  it("possessive pair: {his} or {her}", () => {
    const d = "She needs help with {his:Person 1} or {her:Person 1} form.";
    expect(out(d, "she/her")).toBe("She needs help with her form.");
    expect(out(d, "he/him")).toBe("She needs help with his form.");
    expect(out(d, "they/them")).toBe("She needs help with their form.");
  });

  it("possessive pair led by her: the possessive partner names the slot", () => {
    const d = "She needs help with {her:Person 1} or {his:Person 1} form.";
    expect(out(d, "she/her")).toBe("She needs help with her form.");
    expect(out(d, "he/him")).toBe("She needs help with his form.");
    expect(out(d, "they/them")).toBe("She needs help with their form.");
  });

  it("object pair joined by /, with or without spaces, where the clause ends", () => {
    expect(out("The worker will ring {him:Person 1}/{her:Person 1}.", "she/her")).toBe("The worker will ring her.");
    expect(out("The worker will ring {him:Person 1}/{her:Person 1}.", "he/him")).toBe("The worker will ring him.");
    expect(out("The worker will ring {him:Person 1} / {her:Person 1}, then the landlord.", "they/them")).toBe("The worker will ring them, then the landlord.");
  });

  it("and/or, OR in capitals, and a run of three", () => {
    expect(out("so {he:Person 1} and/or {she:Person 1} will post it.")).toBe("so she will post it.");
    expect(out("so {he:Person 1} OR {she:Person 1} will post it.", "he/him")).toBe("so he will post it.");
    expect(out("so {he:Person 1} or {she:Person 1} or {they:Person 1} will post it.", "they/them")).toBe("so they will post it.");
  });

  it("keeps the case of the first token and the sentence-start capital", () => {
    expect(out("{he:Person 1} or {she:Person 1} will post it.")).toBe("She will post it.");
    expect(out("so {He:Person 1} or {she:Person 1} will post it.", "he/him")).toBe("so He will post it.");
    expect(out("so {he:Person 1} or {She:Person 1} will post it.", "he/him")).toBe("so he will post it.");
  });

  it("square-bracket and round-bracket tokens are read first, then merged", () => {
    expect(out("[he:Person 1] or [she:Person 1] will post it.")).toBe("She will post it.");
    expect(out("the worker rang (him:Person 1)/(her:Person 1).", "he/him")).toBe("the worker rang him.");
  });

  it("the page path: restoreDraft shows no doubled pronoun and holds no copy", () => {
    const clients = parseClientList(inventedVisit.clientList).entries;
    const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const r = restoreDraft({ draft: H22D, outgoing, clients });
    expect(r.shown).toContain("and she will post the form on Friday.");
    expect(r.shown).not.toContain("she or she");
    expect(r.copyHeld).toBe(false);
  });

  it("is idempotent", () => {
    const once = mergeTokenPairs(H22D);
    expect(once).toBe("It was agreed that the worker will ring the landlord on Monday, and {he:Person 1} will post the form on Friday.");
    expect(mergeTokenPairs(once)).toBe(once);
  });
});

// Every case below gives the same text before and after H25. Where a he/him or they/them line reads "him daughter" or
// "them son", that is the lone-"her" object reading (src/masking/pronouns.ts ROLE_BY_NAME), recorded in OPEN-QUESTIONS and not changed here.
describe("what a same-tag merge leaves alone (drafting R19)", () => {
  it("two different tags joined by or stay two pronouns, even when both are he/him", () => {
    expect(out("{he:Person 2} or {she:Person 1} will post it.", "she/her")).toBe("He or she will post it.");
    expect(out("{he:Person 2} or {she:Person 1} will post it.", "he/him")).toBe("He or he will post it.");
  });

  it("Person 1 and Person 12 are different tags", () => {
    expect(out("so {he:Person 1} or {she:Person 12} will post it.")).toBe("so she or they will post it.");
  });

  it("a pair joined by and stays", () => {
    expect(out("{she:Person 1} and {she:Person 1} agreed.")).toBe("She and she agreed.");
  });

  it("or inside a word is not a joiner", () => {
    expect(out("so {he:Person 1} order {she:Person 1}.")).toBe("so she order she.");
  });

  it("pronouns written in free text are not read", () => {
    expect(out("[Person 1] said he or she would post it. {she:Person 1} agreed.")).toBe("Maria Okonkwo-Reyes said he or she would post it. She agreed.");
  });

  it("the person or someone of theirs: subject and possessive stay two words", () => {
    const daughter = "{She:Person 1} or {her:Person 1} daughter will bring the lease.";
    expect(out(daughter, "she/her")).toBe("She or her daughter will bring the lease.");
    expect(out(daughter, "he/him")).toBe("He or him daughter will bring the lease.");
    expect(out(daughter, "they/them")).toBe("They or them daughter will bring the lease.");
    expect(out("Either {she:Person 1} or {her:Person 1} sister will post the form.")).toBe("Either she or her sister will post the form.");
    const partner = "{he:Person 1} or {his:Person 1} partner will ring the office.";
    expect(out(partner, "she/her")).toBe("She or her partner will ring the office.");
    expect(out(partner, "he/him")).toBe("He or his partner will ring the office.");
    expect(out(partner, "they/them")).toBe("They or their partner will ring the office.");
    expect(out("{He:Person 2} or {his:Person 2} lawyer will post the form.")).toBe("He or his lawyer will post the form.");
    const advocate = "{they:Person 1} or {their:Person 1} advocate will call.";
    expect(out(advocate, "she/her")).toBe("She or her advocate will call.");
    expect(out(advocate, "he/him")).toBe("He or his advocate will call.");
    expect(out(advocate, "they/them")).toBe("They or their advocate will call.");
    const slash = "so {she:Person 1}/{her:Person 1} daughter will sign.";
    expect(out(slash, "she/her")).toBe("so she/her daughter will sign.");
    expect(out(slash, "he/him")).toBe("so he/him daughter will sign.");
    expect(out(slash, "they/them")).toBe("so they/them daughter will sign.");
  });

  it("the person or someone of theirs: object and possessive stay two words", () => {
    expect(out("The worker will call {him:Person 2} or {his:Person 2} sister.")).toBe("The worker will call him or his sister.");
    const carer = "The worker will ring {him:Person 1} or {his:Person 1} carer.";
    expect(out(carer, "she/her")).toBe("The worker will ring her or her carer.");
    expect(out(carer, "he/him")).toBe("The worker will ring him or his carer.");
    expect(out(carer, "they/them")).toBe("The worker will ring them or their carer.");
    const send = "Send it to {them:Person 1} or {their:Person 1} advocate.";
    expect(out(send, "she/her")).toBe("Send it to her or her advocate.");
    expect(out(send, "he/him")).toBe("Send it to him or his advocate.");
    expect(out(send, "they/them")).toBe("Send it to them or their advocate.");
  });

  it("identical same-tag tokens collapse when standing alone, and leave her-pairs alone before a noun (H42b)", () => {
    expect(out("{she:Person 1} or {she:Person 1} will post it.")).toBe("She will post it.");
    expect(out("The worker will ring {her:Person 1} or {her:Person 1}.")).toBe("The worker will ring her.");
    expect(out("The worker will ring {her:Person 1} or {her:Person 1} sister on Monday.")).toBe("The worker will ring her or her sister on Monday.");
    const son = "The letter goes to {her:Person 1} or {her:Person 1} son.";
    expect(out(son, "she/her")).toBe("The letter goes to her or her son.");
    expect(out(son, "he/him")).toBe("The letter goes to him or him son.");
    expect(out(son, "they/them")).toBe("The letter goes to them or them son.");
  });

  it("her with an object word stays when a word follows the pair (that her may be possessive)", () => {
    const sister = "The worker will ring {him:Person 1} or {her:Person 1} sister.";
    expect(out(sister, "she/her")).toBe("The worker will ring her or her sister.");
    expect(out(sister, "he/him")).toBe("The worker will ring him or him sister.");
    expect(out(sister, "they/them")).toBe("The worker will ring them or them sister.");
    expect(out("The worker will ring {him:Person 1}/{her:Person 1} on Monday.")).toBe("The worker will ring her/her on Monday.");
  });
});

describe("literal plain-text pronoun pairs collapse only when standing alone (H42b item 1)", () => {
  it("1. collapses literal 'her or her' at clause end or before punctuation", () => {
    expect(collapseLiteralPronounPairs("The worker offered to help her or her.")).toBe("The worker offered to help her.");
    expect(collapseLiteralPronounPairs("Spoke to her or her, then left.")).toBe("Spoke to her, then left.");
  });

  it("2. collapses literal 'she/she' when standing alone at clause end or punctuation", () => {
    expect(collapseLiteralPronounPairs("Who will post the form: she/she?")).toBe("Who will post the form: she?");
    expect(collapseLiteralPronounPairs("The caller was she/she.")).toBe("The caller was she.");
  });

  it("3. collapses literal 'his and/or his' when standing alone at clause end or punctuation", () => {
    expect(collapseLiteralPronounPairs("The key was his and/or his.")).toBe("The key was his.");
    expect(collapseLiteralPronounPairs("Left in his and/or his; noted.")).toBe("Left in his; noted.");
  });

  it("4. keeps the mixed literal pair 'her or his' untouched", () => {
    expect(collapseLiteralPronounPairs("The worker spoke to her or his.")).toBe("The worker spoke to her or his.");
    expect(collapseLiteralPronounPairs("Asked her or his mother to call back.")).toBe("Asked her or his mother to call back.");
  });

  it("5. keeps 'asked her or her mother' untouched when a noun follows", () => {
    expect(collapseLiteralPronounPairs("The worker asked her or her mother.")).toBe("The worker asked her or her mother.");
  });

  it("6. keeps 'Her or her form was posted.' untouched when a noun follows", () => {
    expect(collapseLiteralPronounPairs("Her or her form was posted.")).toBe("Her or her form was posted.");
  });

  it("7. keeps 'his and/or his lease' untouched when a noun follows", () => {
    expect(collapseLiteralPronounPairs("He brought his and/or his lease.")).toBe("He brought his and/or his lease.");
  });

  it("8. keeps 'ring her or her sister on Monday' untouched when a noun follows", () => {
    expect(collapseLiteralPronounPairs("The worker will ring her or her sister on Monday.")).toBe(
      "The worker will ring her or her sister on Monday.",
    );
  });

  it("9. keeps literal pairs untouched when a proper name follows", () => {
    expect(collapseLiteralPronounPairs("The worker asked her or her Maria to confirm.")).toBe(
      "The worker asked her or her Maria to confirm.",
    );
    expect(collapseLiteralPronounPairs("Checked with his and/or his Tomas.")).toBe(
      "Checked with his and/or his Tomas.",
    );
  });

  it("10. keeps literal pairs untouched when a tag follows and preserves tokens/tags inside restoreAll", () => {
    expect(collapseLiteralPronounPairs("The worker asked her or her [Person 2].")).toBe(
      "The worker asked her or her [Person 2].",
    );
    expect(out("The worker asked her or her mother. {she:Person 1} agreed.")).toBe(
      "The worker asked her or her mother. She agreed.",
    );
  });

  it("11. keeps her/token pairs untouched before noun-ambiguous social-care words (home, back bedroom, will, can)", () => {
    expect(collapseLiteralPronounPairs("The worker visited her or her home.")).toBe(
      "The worker visited her or her home.",
    );
    expect(collapseLiteralPronounPairs("Checked her or her back bedroom.")).toBe(
      "Checked her or her back bedroom.",
    );
    expect(collapseLiteralPronounPairs("She read her or her will carefully.")).toBe(
      "She read her or her will carefully.",
    );
    expect(collapseLiteralPronounPairs("Packed her or her can of paint.")).toBe(
      "Packed her or her can of paint.",
    );
    expect(out("[Person 1] checked {her:Person 1} or {her:Person 1} back bedroom.")).toBe(
      "Maria Okonkwo-Reyes checked her or her back bedroom.",
    );
  });

  it("12. collapses standalone non-determiner pairs before modals/clause verbs and unambiguous adverbs, while blocking nouns/names", () => {
    expect(collapseLiteralPronounPairs("It was agreed that she or she will post the form on Friday.")).toBe(
      "It was agreed that she will post the form on Friday.",
    );
    expect(collapseLiteralPronounPairs("She/she agreed to post it.")).toBe("She agreed to post it.");
    expect(collapseLiteralPronounPairs("He/he went to the flat.")).toBe("He went to the flat.");
    expect(collapseLiteralPronounPairs("The worker spoke to her or her twice.")).toBe(
      "The worker spoke to her twice.",
    );
    expect(collapseLiteralPronounPairs("The worker spoke to her or her on Monday.")).toBe(
      "The worker spoke to her on Monday.",
    );
    expect(collapseLiteralPronounPairs("She/she mother signed it.")).toBe("She/she mother signed it.");
    expect(collapseLiteralPronounPairs("She/she Maria signed it.")).toBe("She/she Maria signed it.");
  });
});
