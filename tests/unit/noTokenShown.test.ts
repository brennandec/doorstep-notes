
// @vitest-environment happy-dom
// H17, drafting R16 (tasks 42 and 43): no token syntax reaches her eyes or her clipboard, and Copy is held while
// any flag is open. One fixture for each case seen in the failing Google Chrome runs of H16. Invented people only.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreAddedTag, restoreDraft, type Restored } from "../../src/drafting/restoreDraft";
import { screenDraft } from "../../src/drafting/screenDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { tokenForms } from "../../src/masking/tokenForms";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });

/** Any bracket or brace form of a tag or a pronoun token. */
const TOKEN_SYNTAX = /[[\]{}]|\b(?:Person|Place|Date|Detail)\s*\d+\b/i;
/** Brackets only: the words "Person 9" may name what a flag is about. */
const BRACKETS = /[[\]{}]/;

/** The flow of a draft: screen it, restore it, show it. */
function show(draft: string, proposed: { text: string; kind: "name" | "place" | "dob" | "phrase" }[] = []) {
  const screened = screenDraft({ draft, outgoing, clients, policy: DEFAULT_POLICY, proposed, noteText: inventedVisit.note });
  const r = restoreDraft({ draft: screened.maskedText, outgoing, clients, screened });
  return { screened, r };
}

const sheetOf = (r: Restored) => ({
  ...emptyState(),
  finished: { text: r.shown, source: "IN_CLOUD" as const, connected: true, notes: r.notes, added: r.added, copyHeld: r.copyHeld, held: r.text },
});

describe("the cloud writes a pronoun token and the device model proposes it as a name (screen 05 of H16)", () => {
  const draft = "[Person 1] posts the form. The neighbour offered to help {him:Person 1} with the form.";
  const proposed = [{ text: "{him:Person 1}", kind: "phrase" as const }];

  it("is not turned into a detail: the token is restored to the pronoun of the list entry", () => {
    const { screened, r } = show(draft, proposed);
    expect(screened.addedTags).toEqual([]);
    expect(r.added).toEqual([]);
    expect(r.shown).toMatch(/offered to help (him|her|them) with the form/);
    expect(r.shown).not.toMatch(TOKEN_SYNTAX);
    expect(r.copyHeld).toBe(false);
  });

  it("also holds when the device model proposes the words of the tag without brackets", () => {
    const { screened, r } = show(draft, [{ text: "Person 1", kind: "name" }, { text: "him:Person 1", kind: "phrase" }]);
    expect(screened.addedTags).toEqual([]);
    expect(r.shown).not.toMatch(TOKEN_SYNTAX);
  });

  it("shows no button with token syntax", () => {
    const { r } = show(draft, proposed);
    const zone = renderFinishedZone(sheetOf(r));
    expect(zone.textContent).not.toMatch(BRACKETS);
  });
});

describe("a model renames a token", () => {
  it("shows a plain phrase in the note and a plain-language flag for a pronoun token written back as [Detail 1]", () => {
    const { r } = show("[Person 1] posts the form. The neighbour offered to help [Detail 1] with the form.");
    expect(r.shown).toContain("offered to help (detail not put back) with the form.");
    expect(r.shown).not.toMatch(BRACKETS);
    expect(r.notes).toContain("Not put back: a detail (Detail 1). The app cannot tell what it stands for.");
    expect(r.notes.join(" ")).not.toMatch(BRACKETS);
    expect(r.copyHeld).toBe(true);
  });
});

describe("a token the restore cannot map", () => {
  it("is a pronoun for the person it names, in plain words", () => {
    const { r } = show("[Person 1] agreed and {she:Person 9} will call.");
    expect(r.shown).toBe("Maria Okonkwo-Reyes agreed and (pronoun not put back) will call.");
    expect(r.notes).toContain("Not put back: a pronoun for Person 9. The app cannot tell what it stands for.");
    expect(r.copyHeld).toBe(true);
  });

  for (const [tag, phrase, what] of [
    ["[Person 9]", "(name not put back)", "a name (Person 9)"],
    ["[Place 4]", "(place not put back)", "a place (Place 4)"],
    ["[Date 3]", "(date not put back)", "a date (Date 3)"],
    ["[Detail 7]", "(detail not put back)", "a detail (Detail 7)"],
  ] as const) {
    it(`says ${what} for ${tag}`, () => {
      const { r } = show(`[Person 1] met ${tag} today.`);
      expect(r.shown).toBe(`Maria Okonkwo-Reyes met ${phrase} today.`);
      expect(r.notes).toContain(`Not put back: ${what}. The app cannot tell what it stands for.`);
    });
  }

  it("keeps the same flag once when a tag stands twice", () => {
    const { r } = show("[Person 9] and [Person 9] met [Person 1] and [Person 2].");
    expect(r.notes.filter((n) => n.startsWith("Not put back:"))).toHaveLength(1);
  });

  for (const role of ["him", "She", "their"]) {
    for (const form of tokenForms("Person", 9, role)) {
      it(`shows no token syntax for ${form}`, () => {
        const { r } = show(`[Person 1] spoke to ${form} today.`);
        expect(r.shown, form).not.toMatch(BRACKETS);
        expect(r.shown, form).not.toMatch(/\b(?:Person|Place|Date|Detail)\s*\d+\b/i);
        expect(r.notes.join(" "), form).not.toMatch(BRACKETS);
        expect(r.notes.some((n) => n.startsWith("Not put back:")), form).toBe(true);
        expect(r.copyHeld, form).toBe(true);
      });
    }
  }

  it("flags a tag that was sent and is missing from the draft, without token syntax", () => {
    const { r } = show("[Person 1] posts the form.");
    expect(r.notes.join(" ")).not.toMatch(BRACKETS);
    expect(r.notes.some((n) => n.startsWith("The draft left out a name (Person 2)"))).toBe(true);
    expect(r.copyHeld).toBe(false);
  });
});

describe("a name the model added", () => {
  const GLENDA = [{ text: "Glenda Pruitt", kind: "name" as const }];
  const draft = "[Person 1] agreed. Glenda Pruitt also rang. {She:Person 1} will post it.";

  it("shows a plain phrase and a flag, and holds Copy until she presses", () => {
    const { r } = show(draft, GLENDA);
    expect(r.shown).toBe("Maria Okonkwo-Reyes agreed. (name not put back) also rang. She will post it.");
    expect(r.notes.some((n) => n.startsWith("Added by the model:"))).toBe(true);
    expect(r.notes.join(" ")).not.toMatch(BRACKETS);
    expect(r.copyHeld).toBe(true);
  });

  it("has a button that holds the name and no tag, and Copy follows the press", () => {
    const { r } = show(draft, GLENDA);
    const before = renderFinishedZone(sheetOf(r));
    const button = before.querySelector("[data-put-back]") as HTMLButtonElement;
    expect(button.textContent).toBe("Put back what the model added: Glenda Pruitt");
    expect(before.textContent).not.toMatch(BRACKETS);
    expect((before.querySelector("#copy") as HTMLButtonElement).disabled).toBe(true);

    const back = restoreAddedTag(r, r.added[0]!.tag, clients);
    expect(back.shown).toBe("Maria Okonkwo-Reyes agreed. Glenda Pruitt also rang. She will post it.");
    expect(back.copyHeld).toBe(false);
    const after = renderFinishedZone(sheetOf(back));
    expect(after.querySelector("[data-put-back]")).toBeNull();
    expect((after.querySelector("#copy") as HTMLButtonElement).disabled).toBe(false);
  });

  it("holds Copy until every added name is back", () => {
    const { r } = show("[Person 1] agreed. Glenda Pruitt rang. Daniel Okafor left.", [...GLENDA, { text: "Daniel Okafor", kind: "name" }]);
    const [first, second] = r.added;
    const a = restoreAddedTag(r, first!.tag, clients);
    expect(a.copyHeld).toBe(true);
    expect(a.shown).toContain("(name not put back)");
    expect(restoreAddedTag(a, second!.tag, clients).copyHeld).toBe(false);
  });
});

describe("Copy follows the flags (R16.4)", () => {
  it("is disabled, with one line of reason, while a flag is open", () => {
    const { r } = show("[Person 1] met [Person 9].");
    const zone = renderFinishedZone(sheetOf(r));
    const copy = zone.querySelector("#copy") as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    expect(copy.title).toBe(strings.drafting.copyHeld);
    expect(zone.querySelector("[data-copy-held]")?.textContent).toBe(strings.drafting.copyHeld);
    expect(strings.drafting.copyHeld).not.toMatch(BRACKETS);
    expect(strings.drafting.copyHeld).not.toContain("\n");
  });

  it("is enabled when no flag is open", () => {
    const { r } = show("[Person 1] met [Person 2].");
    expect(r.notes.some((n) => n.startsWith("Not put back:"))).toBe(false);
    const zone = renderFinishedZone(sheetOf(r));
    expect((zone.querySelector("#copy") as HTMLButtonElement).disabled).toBe(false);
    expect(zone.querySelector("[data-copy-held]")).toBeNull();
  });

  it("copies the string the sheet prints", () => {
    const { r } = show("[Person 1] met [Person 2].");
    const zone = renderFinishedZone(sheetOf(r));
    expect(zone.querySelector(".sheet-text")?.textContent).toBe(r.shown);
  });
});
