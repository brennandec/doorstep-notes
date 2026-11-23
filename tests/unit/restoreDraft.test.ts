// Drafting task 8 (R6.1 to R6.6, ruling 13): put names back on this device.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreDraft, sentTags } from "../../src/drafting/restoreDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

afterEach(() => vi.unstubAllGlobals());

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const sent = sentTags(outgoing.maskedRecord);
const restore = (draft: string, c = clients, o = outgoing) => restoreDraft({ draft, outgoing: o, clients: c });

describe("restoring tags (R6.1)", () => {
  it("replaces every tag from the mask map", () => {
    expect(sent).toContain("[Person 1]");
    expect(outgoing.mask.map["[Person 1]"]).toBe("Maria Okonkwo-Reyes");
    const r = restore("[Person 1] posts the form. [Person 3] offered help. [Person 1] agreed.");
    expect(r.text).toBe("Maria Okonkwo-Reyes posts the form. Tomas Brandvold offered help. Maria Okonkwo-Reyes agreed.");
    expect(outgoing.mask.map["[Person 2]"]).toBe("Bea");
    expect(r.notes.some((n) => n.startsWith("Not put back:"))).toBe(false);
  });
});

describe("pronoun tokens only (R6.2, R6.3)", () => {
  it("restores the tokens the draft was asked to use, from the client list entry", () => {
    const r = restore("[Person 1] said {she:Person 1} would post {her:Person 1} form. {He:Person 3} will help {him:Person 3} with {his:Person 3} plan.");
    expect(r.text).toBe("Maria Okonkwo-Reyes said she would post her form. He will help him with his plan.");
    expect(r.tokensReplaced).toBe(5);
  });

  it("does not re-read free text: a pronoun written out is left alone", () => {
    const r = restore("[Person 1] was tired. She said he would call, and they left. {They:Person 1} agreed.");
    expect(r.text).toContain("She said he would call, and they left.");
    expect(r.text).toContain("She agreed.");
  });

  it("says so, and rewrites no pronoun, when the draft has no tokens", () => {
    const draft = "[Person 1] was tired. She said her form was posted.";
    const r = restore(draft);
    expect(r.text).toBe("Maria Okonkwo-Reyes was tired. She said her form was posted.");
    expect(r.notes).toContain("The draft used no pronoun tokens, so no pronouns were changed.");
    expect(r.tokensReplaced).toBe(0);
  });

  it("does not say it when tokens were used", () => {
    expect(restore("{She:Person 1} agreed.").notes).not.toContain(strings.masking.noPronounTokens);
  });
});

describe("a client with no pronouns on the list (R6.4)", () => {
  it("gets they/them in the tokens, with a visible note", () => {
    const list = parseClientList("Maria Okonkwo-Reyes; ; \nTomas Brandvold; ; he/him").entries;
    const o = buildOutgoing({ record: inventedVisit.preparedRecord, clients: list, policy: DEFAULT_POLICY });
    const r = restoreDraft({ draft: "{They:Person 1} agreed and {their:Person 1} form is posted.", outgoing: o, clients: list });
    expect(r.text).toBe("They agreed and their form is posted.");
    expect(r.notes.some((n) => /No pronouns are on the list for Maria Okonkwo-Reyes, so they\/them was used\./.test(n))).toBe(true);
  });
});

describe("tags that do not match (R6.5, R16)", () => {
  const NOT = (what: string) => `Not put back: ${what}. The app cannot tell what it stands for.`;

  it("keeps an unknown tag in the working text, shows a plain phrase and flags it", () => {
    const r = restore("[Person 1] met [Person 9] at [Place 4].");
    expect(r.text).toBe("Maria Okonkwo-Reyes met [Person 9] at [Place 4].");
    expect(r.shown).toBe("Maria Okonkwo-Reyes met (name not put back) at (place not put back).");
    expect(r.notes).toContain(NOT("a name (Person 9)"));
    expect(r.notes).toContain(NOT("a place (Place 4)"));
  });

  it("keeps a pronoun token for an unknown tag in the working text, and shows a plain phrase", () => {
    const r = restore("{She:Person 9} agreed.");
    expect(r.text).toBe("{She:Person 9} agreed.");
    expect(r.shown).toBe("(pronoun not put back) agreed.");
    expect(r.notes).toContain(NOT("a pronoun for Person 9"));
  });

  it("says in a plain line that a tag that was sent is missing from the draft", () => {
    const r = restore("[Person 1] posts the form.");
    expect(sent).toContain("[Person 2]");
    expect(r.notes).toContain("The draft left out a name (Person 2) that was sent. Check the note.");
    expect(r.notes.some((n) => n.includes("Person 1"))).toBe(false);
    expect(r.copyHeld).toBe(false);
  });

  it("reads a tag whose case was changed as the tag it names, and flags a tag that does not exist (H12 R15.3)", () => {
    const r = restore("[person 1] posts the form and [Person 2] helps. [Person 7] watched.");
    expect(r.shown).toContain("Maria Okonkwo-Reyes posts the form and Bea helps.");
    expect(r.notes).not.toContain(NOT("a name (Person 1)"));
    expect(r.notes).toContain(NOT("a name (Person 7)"));
    expect(r.text).toContain("[Person 7]");
    expect(r.shown).not.toContain("[Person 7]");
  });

  it("counts a pronoun token as the tag being present", () => {
    const r = restore("{She:Person 1} and {they:Person 2} and {he:Person 3} agreed.");
    expect(r.notes.filter((n) => n.startsWith("Not put back") || n.startsWith("The draft left out"))).toEqual([]);
  });

  it("does not repeat a note", () => {
    const r = restore("[Person 9] and [Person 9] and [Person 1] [Person 2]");
    expect(r.notes.filter((n) => n === NOT("a name (Person 9)"))).toHaveLength(1);
  });
});

describe("sent tags", () => {
  it("leave out the example tag in the instructions", () => {
    const bare = buildOutgoing({
      record: { ...inventedVisit.preparedRecord, present: [], seen: ["Door open."], agreed: [], risks: [], nextSteps: [] },
      clients,
      policy: DEFAULT_POLICY,
    });
    expect(bare.text).toContain("[Person 1]");
    expect(sentTags(bare.maskedRecord)).toEqual([]);
    expect(restoreDraft({ draft: "The door was open.", outgoing: bare, clients }).notes).toEqual([strings.masking.noPronounTokens]);
  });
});

describe("restoring makes no request (R6.6)", () => {
  it("works with a fetch that throws", () => {
    const fetchSpy = vi.fn(() => { throw new Error("no request allowed"); });
    vi.stubGlobal("fetch", fetchSpy);
    const r = restore("[Person 1] said {she:Person 1} would call.");
    expect(r.text).toBe("Maria Okonkwo-Reyes said she would call.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
