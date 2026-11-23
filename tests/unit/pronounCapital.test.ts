import { describe, expect, it } from "vitest";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import type { ClientEntry } from "../../src/masking/clientList";
import { pronounToken, restoreAll } from "../../src/masking/pronouns";
import type { MaskResult } from "../../src/masking/types";

// Drafting R18 (session H18): a restored pronoun that starts a sentence starts with a capital. Invented people only.

const clients = [{ id: "c1", full: "Maria Okonkwo-Reyes", names: ["Maria Okonkwo-Reyes"], pronouns: "she/her" }] as unknown as ClientEntry[];
const mask: MaskResult = {
  maskedText: "",
  spans: [],
  map: { "[Person 1]": "Maria Okonkwo-Reyes" },
  clientByTag: { "[Person 1]": "c1" },
  surfaceForms: [],
  listedNames: [],
  sentOnPurpose: [],
};
const she = pronounToken("she", "[Person 1]");
const her = pronounToken("her", "[Person 1]");
const out = (draft: string) => restoreAll(draft, mask, clients).text;

describe("a restored pronoun at the start of a sentence (drafting R18)", () => {
  it("is capitalised after a full stop and a space", () => {
    expect(out(`The worker rang. ${she} agreed.`)).toBe("The worker rang. She agreed.");
  });
  it("is capitalised after ! and ?", () => {
    expect(out(`Was it sent? ${she} said yes! ${she} agreed.`)).toBe("Was it sent? She said yes! She agreed.");
  });
  it("is capitalised at the start of the text", () => {
    expect(out(`${she} agreed.`)).toBe("She agreed.");
  });
  it("is capitalised at a line start", () => {
    expect(out(`Agreed:\n${she} will post the form.`)).toBe("Agreed:\nShe will post the form.");
    expect(out(`Agreed:\n  ${her} form is late.`)).toBe("Agreed:\n  Her form is late.");
  });
  it("is capitalised after a closing quote or bracket that follows the full stop", () => {
    expect(out(`She said "yes." ${she} left.`)).toBe('She said "yes." She left.');
  });
  it("stays lower case in the middle of a sentence", () => {
    expect(out(`[Person 1] said ${she} would post ${her} form on Friday.`)).toBe("Maria Okonkwo-Reyes said she would post her form on Friday.");
  });
  it("stays lower case after a comma, a colon or a semicolon", () => {
    expect(out(`Agreed, ${she} will post it; ${she} will call: ${she} knows.`)).toBe("Agreed, she will post it; she will call: she knows.");
  });
  it("stays lower case after a full stop with no space (an abbreviation or a number)", () => {
    expect(out(`See no.${she} here.`)).toBe("See no.she here.");
  });
  it("the restoreDraft the page uses carries it into the finished note", () => {
    const text = `[Person 1] was seen by the worker. ${she} agreed that ${she} posts the form on Friday.`;
    const r = restoreDraft({ draft: text, outgoing: { text, maskedRecord: "[Person 1]", mask }, clients });
    expect(r.shown).toBe("Maria Okonkwo-Reyes was seen by the worker. She agreed that she posts the form on Friday.");
  });
});
