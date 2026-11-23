// @vitest-environment happy-dom
// H34b items 1 to 3 and 7(b), as amended by H34b-AMEND-1 (drafting R16.7 to R16.9). Invented people only.
// Each case fails at the base: before this order a mark such as {she} reached the sheet as it was written.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { hideMarks, restoreDraft, type Restored } from "../../src/drafting/restoreDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
// The seeded property test lives in tests/property. The unit suite includes tests/unit only, so it runs from here.
import "../property/draftForms.property.test";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const restore = (draft: string) => restoreDraft({ draft, outgoing, clients });
const BRACKETS = /[[\]{}]/;
const LINE = strings.drafting.unreadMark;
const PRONOUN = strings.drafting.shownPronoun;

const sheetOf = (r: Restored) => ({
  ...emptyState(),
  finished: { text: r.shown, source: "IN_CLOUD" as const, connected: true, notes: r.notes, added: r.added, copyHeld: r.copyHeld, held: r.text },
});

describe("the line has fixed words (item 3)", () => {
  it("reads as ordered", () => {
    expect(LINE).toBe("The model left a mark the app could not read. Read the note before you copy.");
  });
});

describe("a token wrapped twice or in mixed brackets is read as the token (item 1)", () => {
  for (const form of ["{{she:Person 1}}", "[[she:Person 1]]", "{[she:Person 1]}", "[{she:Person 1}]"]) {
    it(`${form} is put back as the pronoun and leaves no mark`, () => {
      const r = restore(`Then ${form} agreed.`);
      expect(r.text).toBe("Then she agreed.");
      expect(r.shown).toBe("Then she agreed.");
      expect(r.notes).not.toContain(LINE);
    });
  }

  it("{{Person 1}} is put back as the name", () => {
    const r = restore("Then {{Person 1}} agreed.");
    expect(r.text).toBe("Then Maria Okonkwo-Reyes agreed.");
    expect(r.notes).not.toContain(LINE);
  });

  it("an unmapped wrapped token stays in the working text as the token and is flagged, not hidden as a mark", () => {
    const r = restore("Then {{she:Person 9}} agreed.");
    expect(r.text).toBe("Then {she:Person 9} agreed.");
    expect(r.shown).toBe(`Then ${PRONOUN} agreed.`);
    expect(r.copyHeld).toBe(true);
    expect(r.notes).not.toContain(LINE);
  });
});

describe("a mark the app cannot read never shows (item 2)", () => {
  it("a bare role word in braces shows the pronoun phrase; the working text is unchanged", () => {
    const r = restore("[Person 1] said {she} would call.");
    expect(r.text).toBe("Maria Okonkwo-Reyes said {she} would call.");
    expect(r.shown).toBe(`Maria Okonkwo-Reyes said ${PRONOUN} would call.`);
    expect(r.notes).toContain(LINE);
  });

  it("every role word, in braces and in square brackets, in any case", () => {
    for (const role of ["he", "She", "THEY", "him", "her", "them", "his", "hers", "their"]) {
      for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
        const r = restore(`Then ${open}${role}${close} left.`);
        expect(r.shown, role).toBe(`Then ${PRONOUN} left.`);
        expect(r.notes, role).toContain(LINE);
      }
    }
  });

  it("{he:the landlord} shows the pronoun phrase and the line", () => {
    const r = restore("Then {he:the landlord} rang.");
    expect(r.shown).toBe(`Then ${PRONOUN} rang.`);
    expect(r.notes).toContain(LINE);
  });

  it("any other group shows its inner words without the brackets, and the line", () => {
    const r = restore("The form [see note] was late {sic}.");
    expect(r.shown).toBe("The form see note was late sic.");
    expect(r.notes).toContain(LINE);
  });

  it("an empty group shows nothing", () => {
    const r = restore("The form {} was late.");
    expect(r.shown).toBe("The form was late.");
    expect(r.notes).toContain(LINE);
  });

  it("a lone bracket character is dropped", () => {
    const r = restore("The form } was ] late [ today {.");
    expect(r.shown).not.toMatch(BRACKETS);
    expect(r.shown).toBe("The form was late today.");
    expect(r.notes).toContain(LINE);
  });

  it("a group of more than 60 characters is not a group: its brackets are dropped and the words stay", () => {
    const inner = "a".repeat(61);
    const r = restore(`See {${inner}} now.`);
    expect(r.shown).toBe(`See ${inner} now.`);
    expect(r.notes).toContain(LINE);
  });

  it("a group of exactly 60 characters is a group", () => {
    const inner = "b".repeat(60);
    expect(hideMarks(`See {${inner}} now.`)).toEqual({ text: `See ${inner} now.`, changed: true });
  });

  it("nested groups leave no bracket", () => {
    const r = restore("Then {[she]} and {{he}} and [{ x [y] z }] left.");
    expect(r.shown).not.toMatch(BRACKETS);
    expect(r.notes).toContain(LINE);
  });

  it("a text with no mark has no line and is unchanged", () => {
    const r = restore("[Person 1] posted the form (as agreed).");
    expect(r.shown).toBe("Maria Okonkwo-Reyes posted the form (as agreed).");
    expect(r.notes).not.toContain(LINE);
  });

  it("the unmapped tag phrases are not marks", () => {
    const r = restore("[Person 1] met [Person 9] at [Place 4] with {her:Person 9}.");
    expect(r.notes).not.toContain(LINE);
    expect(r.shown).not.toMatch(BRACKETS);
  });
});

describe("a group of the form {word:words} that names no tag (amendment D)", () => {
  it("{it:Mould} at the start of a sentence shows It, and adds no line", () => {
    const r = restore("{it:Mould} was seen.");
    expect(r.shown).toBe("It was seen.");
    expect(r.notes).not.toContain(LINE);
  });

  it("{it:Mould} after a full stop shows It", () => {
    const r = restore("[Person 1] looked. {it:Mould} was seen.");
    expect(r.shown).toBe("Maria Okonkwo-Reyes looked. It was seen.");
    expect(r.notes).not.toContain(LINE);
  });

  it("saw {it:Mould} shows saw it, and adds no line", () => {
    const r = restore("[Person 1] saw {it:Mould}");
    expect(r.shown).toBe("Maria Okonkwo-Reyes saw it");
    expect(r.notes).not.toContain(LINE);
  });

  it("its and itself are read the same way", () => {
    expect(restore("The window and {its:window} frame.").shown).toBe("The window and its frame.");
    expect(restore("It marked {itself:Mould} on the wall.").shown).toBe("It marked itself on the wall.");
    expect(restore("{its:window} frame.").notes).not.toContain(LINE);
  });

  it("a capital on the word is kept", () => {
    expect(restore("Then {It:Mould} spread.").shown).toBe("Then It spread.");
  });

  it("{he:the landlord} is the pronoun phrase and the line", () => {
    const r = restore("{he:the landlord} rang.");
    expect(r.shown).toBe(`${PRONOUN} rang.`);
    expect(r.notes).toContain(LINE);
  });

  it("another first word shows the inner words and the line", () => {
    const r = restore("The form {note:late} came.");
    expect(r.shown).toBe("The form note:late came.");
    expect(r.notes).toContain(LINE);
  });
});

describe("the line is a line, not a flag (item 3)", () => {
  it("is plain, is not a flag, and does not hold Copy", () => {
    const r = restore("[Person 1] said {she} would call and saw {it:Mould}.");
    expect(r.notes).toContain(LINE);
    expect(r.notes.some((n) => n.startsWith("Not put back:"))).toBe(false);
    expect(r.copyHeld).toBe(false);
    const zone = renderFinishedZone(sheetOf(r));
    const item = [...zone.querySelectorAll("li")].find((li) => li.textContent === LINE);
    expect(item, "the line stands under the note").toBeDefined();
    expect(item!.classList.contains("error")).toBe(false);
    expect(item!.querySelector("button")).toBeNull();
    expect((zone.querySelector("#copy") as HTMLButtonElement).disabled).toBe(false);
    expect(zone.querySelector("[data-copy-held]")).toBeNull();
    expect(zone.querySelector(".sheet-text")?.textContent).not.toMatch(BRACKETS);
  });

  it("is said once however many marks there are", () => {
    const r = restore("{she} and {he} and [x] and }");
    expect(r.notes.filter((n) => n === LINE)).toHaveLength(1);
  });
});
