import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { pronounToken, restoreAll } from "../../src/masking/pronouns";
import { strings } from "../../src/app/strings";

const note = inventedVisit.note;
function setup(list: string, raw = note) {
  const clients = parseClientList(list).entries;
  return { clients, result: applyMask(raw, exactAndNear(raw, clients, DEFAULT_POLICY), clients) };
}

describe("pronoun tokens and restore (masking task 11)", () => {
  it("restores she/her from the list for a token that was asked for", () => {
    const { clients, result } = setup(inventedVisit.clientList);
    const draft = `[Person 1] was in. ${pronounToken("she", "[Person 1]")} said ${pronounToken("her", "Person 1")} form was late. The letter was ${pronounToken("her", "Person 1")}.`;
    const out = restoreAll(draft, result, clients);
    expect(out.text).toBe("Maria Okonkwo-Reyes was in. She said her form was late. The letter was her.");
    expect(out.tokensReplaced).toBe(3);
    expect(out.notes).toEqual([]);
  });

  it("restores he/him for subject, object and possessive", () => {
    const { clients, result } = setup(inventedVisit.clientList);
    const draft = "[Person 2] rang. {he:Person 2} offered to help {him:Person 2} with {his:Person 2} form.";
    // Person 2 in the invented note is Tomas Brandvold
    const out = restoreAll(draft, result, clients);
    expect(out.text).toBe("Tomas Brandvold rang. He offered to help him with his form.");
  });

  it("restores they/them for a client listed with they/them", () => {
    const { clients, result } = setup("Rosalind Achterberg; Ros; they/them", "Ros rang.");
    const out = restoreAll("[Person 1] rang. {they:Person 1} said {their:Person 1} piece to {them:Person 1}.", result, clients);
    expect(out.text).toBe("Rosalind Achterberg rang. They said their piece to them.");
    expect(out.notes).toEqual([]);
  });

  it("keeps a capital letter at the start of a sentence", () => {
    const { clients, result } = setup(inventedVisit.clientList);
    expect(restoreAll("{She:Person 1} agreed.", result, clients).text).toBe("She agreed.");
    expect(restoreAll("{He:Person 2} agreed.", result, clients).text).toBe("He agreed.");
  });

  it("uses they/them and says so when the list gives no pronouns", () => {
    const { clients, result } = setup("Priya Halloran; ;", "Priya rang.");
    const out = restoreAll("[Person 1] rang. {she:Person 1} left.", result, clients);
    expect(out.text).toBe("Priya Halloran rang. They left.");
    expect(out.notes).toEqual(["No pronouns are on the list for Priya Halloran, so they/them was used."]);
  });

  it("uses they/them and says so for a tag that is not a listed person", () => {
    const { clients, result } = setup(inventedVisit.clientList);
    const out = restoreAll("{he:Person 9} left.", result, clients);
    expect(out.text).toBe("They left.");
    expect(out.notes).toHaveLength(1);
  });

  it("says no pronouns were changed when the draft has no tokens, and rewrites nothing", () => {
    const { clients, result } = setup(inventedVisit.clientList);
    const draft = "[Person 1] said she would post the form. He was kind.";
    const out = restoreAll(draft, result, clients);
    expect(out.text).toBe("Maria Okonkwo-Reyes said she would post the form. He was kind.");
    expect(out.tokensReplaced).toBe(0);
    expect(out.notes).toEqual([strings.masking.noPronounTokens]);
    expect(strings.masking.noPronounTokens).toBe("The draft used no pronoun tokens, so no pronouns were changed.");
  });

  it("leaves text that only looks like a token", () => {
    const { clients, result } = setup(inventedVisit.clientList);
    const out = restoreAll("{hat:Person 1} and {he} and {he:}", result, clients);
    expect(out.text).toBe("{hat:Person 1} and {he} and {he:}");
    expect(out.tokensReplaced).toBe(0);
  });
});
