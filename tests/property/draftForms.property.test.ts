// @vitest-environment happy-dom
// H34b item 7(a), drafting R16.7 and R16.9: for any reply, no token syntax and no unreadable mark reaches her eyes.
// 500 generated replies mix words, tags, tokens in every form of tokenForms(), bare role groups, thing groups,
// empty groups, nested groups, long groups and lone brackets. The shown text, Copy's title, every button and every line
// hold none of [ ] { }, and every readable tag that could not be put back is still in the working text.
// A seeded generator, no dependency: the same replies every run. Invented people only.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { emptyState } from "../../src/app/state";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreDraft, tagsNamedIn } from "../../src/drafting/restoreDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { tokenForms, TOKEN_ROLES } from "../../src/masking/tokenForms";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });

const BRACKETS = /[[\]{}]/;

let seed = 20261115;
const next = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;

const WORDS = ["Mould", "was", "seen", "by", "the", "window", "landlord", "agreed", "to", "call", "on", "Monday.", "Letter", "form", "Bea", "helped.", "it", "its"];
const UNMAPPED = [["Person", 9], ["Person", 8], ["Place", 4], ["Date", 3], ["Detail", 7]] as const;
const MAPPED = [["Person", 1], ["Person", 2]] as const;
const OTHER_GROUPS = ["see note", "sic", "he:the landlord", "she: the neighbour", "it:Mould", "It:Mould", "its:the window", "itself:Mould", "x:y:z", "a [b] c", "{he}", "[[they]]", "[{her}]", "{ [x [y] z] }"];

/** One piece of a reply and the unmapped tag label it names, if any. */
function piece(): { text: string; unmapped?: string } {
  const r = next();
  if (r < 0.2) return { text: pick(WORDS) };
  if (r < 0.32) {
    const [kind, n] = pick(UNMAPPED);
    return { text: `[${kind} ${n}]`, unmapped: `${kind} ${n}` };
  }
  if (r < 0.52) {
    const [kind, n] = pick(UNMAPPED);
    const role = pick(TOKEN_ROLES);
    return { text: pick(tokenForms(kind, n, next() < 0.3 ? role[0]!.toUpperCase() + role.slice(1) : role)), unmapped: `${kind} ${n}` };
  }
  if (r < 0.62) {
    const [kind, n] = pick(MAPPED);
    return { text: pick(tokenForms(kind, n, pick(TOKEN_ROLES))) };
  }
  if (r < 0.72) {
    const role = pick(TOKEN_ROLES);
    const [open, close] = pick([["{", "}"], ["[", "]"], ["{{", "}}"], ["{ ", " }"]] as const);
    return { text: `${open}${next() < 0.3 ? role.toUpperCase() : role}${close}` };
  }
  if (r < 0.78) return { text: pick(["{}", "[]", "{ }", "[ ]", "{{}}"]) };
  if (r < 0.88) {
    const inner = pick(OTHER_GROUPS);
    return { text: next() < 0.5 ? `{${inner}}` : `[${inner}]` };
  }
  if (r < 0.92) return { text: `{${"long words ".repeat(7)}}` };
  return { text: pick(["{", "}", "[", "]", "[[", "}}"]) };
}

describe("property: no token syntax and no unreadable mark reaches the sheet, for any reply (H34b)", () => {
  it("holds over 500 generated replies", () => {
    for (let i = 0; i < 500; i++) {
      const count = 3 + Math.floor(next() * 8);
      const pieces = Array.from({ length: count }, piece);
      const draft = pieces.map((p) => p.text).join(next() < 0.15 ? "\n" : " ");
      const r = restoreDraft({ draft, outgoing, clients });
      const where = `${i}: ${JSON.stringify(draft)} -> ${JSON.stringify(r.shown)}`;

      // The sheet and the clipboard text.
      expect(r.shown, where).not.toMatch(BRACKETS);
      expect(r.notes.join(" "), where).not.toMatch(BRACKETS);

      // Copy's title, every button and every line in the finished zone.
      const zone = renderFinishedZone({
        ...emptyState(),
        finished: { text: r.shown, source: "IN_CLOUD" as const, connected: true, notes: r.notes, added: r.added, copyHeld: r.copyHeld, held: r.text },
      });
      expect(zone.textContent ?? "", where).not.toMatch(BRACKETS);
      const copy = zone.querySelector("#copy") as HTMLButtonElement;
      expect(copy.title, where).not.toMatch(BRACKETS);
      for (const b of zone.querySelectorAll("button")) {
        expect(b.textContent ?? "", where).not.toMatch(BRACKETS);
        expect(b.getAttribute("title") ?? "", where).not.toMatch(BRACKETS);
        expect(b.getAttribute("aria-label") ?? "", where).not.toMatch(BRACKETS);
      }

      // Every readable tag that could not be put back is still in the working text, so a later press can put it back.
      const kept = tagsNamedIn(r.text);
      for (const p of pieces) if (p.unmapped !== undefined) expect(kept, where).toContain(`[${p.unmapped}]`);
      // Copy is held exactly while such a tag is in the working text.
      expect(r.copyHeld, where).toBe(kept.length > 0);
    }
  });
});
