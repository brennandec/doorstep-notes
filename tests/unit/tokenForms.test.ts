// H11 item 1 (drafting R14): no redaction token in a finished note.
// One fixture per form, run through the restore step and through screening plus restore (the
// path the page takes). The check on the result looks for any text of the shape
// "[" ... "Person" N "]" in any form, with any bracket, any role prefix and any kind.
// Invented people only.
import { describe, expect, it } from "vitest";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { screenDraft } from "../../src/drafting/screenDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import type { MaskResult } from "../../src/masking/types";

const clients = parseClientList("Maria Okonkwo-Reyes; ; she/her\nTomas Brandvold; ; he/him").entries;
const maria = clients[0]!;
const tomas = clients[1]!;

const mask: MaskResult = {
  maskedText: "",
  spans: [],
  map: {
    "[Person 1]": "Maria Okonkwo-Reyes",
    "[Person 2]": "Tomas Brandvold",
    "[Person 3]": "Bea",
    "[Place 1]": "Harbour Street",
    "[Date 1]": "12/11",
    "[Detail 1]": "her twin brother",
  },
  clientByTag: { "[Person 1]": maria.id, "[Person 2]": tomas.id },
  surfaceForms: [],
  listedNames: [],
  sentOnPurpose: [],
};
const sentRecord = "Present: [Person 1], [Person 2], [Person 3]. At [Place 1] on [Date 1]. [Detail 1].";
const outgoing = { text: sentRecord, maskedRecord: sentRecord, mask };

/** Any redaction token left, in any bracket, with or without a role prefix, in any case. */
const LEFT = /[[{(][^\]})\n]{0,30}(?:Person|Place|Date|Detail)[ \t]*\d+/i;
const left = (text: string): string | null => LEFT.exec(text)?.[0] ?? null;

const finish = (draft: string) => restoreDraft({ draft, outgoing, clients }).text;

const ROLES = ["he", "she", "they", "him", "her", "them", "his", "hers", "their"] as const;

describe("one fixture per form: a mapped token is put back (R14.1, R14.2)", () => {
  const forms: Array<[string, string, string]> = [
    ["the plain tag", "[Person 1] posted the form.", "Maria Okonkwo-Reyes posted the form."],
    ["a pronoun token in braces", "Bea helped {him:Person 2} post it.", "Bea helped him post it."],
    ["a pronoun token in square brackets (the form the cloud wrote)", "Bea helped [him:Person 2] post it.", "Bea helped him post it."],
    ["a pronoun token in round brackets", "Bea helped (him:Person 2) post it.", "Bea helped him post it."],
    ["a pronoun token with the tag in its own brackets, braces", "Bea helped {him:[Person 2]} post it.", "Bea helped him post it."],
    ["a pronoun token with the tag in its own brackets, square", "Bea helped [him:[Person 2]] post it.", "Bea helped him post it."],
    ["a pronoun token with a space after the colon", "Bea helped [him: Person 2] post it.", "Bea helped him post it."],
    ["a pronoun token in capitals at a sentence start", "[He:Person 2] posted it.", "He posted it."],
    ["a subject token", "[she:Person 1] posted it.", "She posted it."],
    ["a possessive token", "Bea saw [her:Person 1] form and [his:Person 2] letter.", "Bea saw her form and his letter."],
    ["a they token for a person with no pronouns on the list", "[their:Person 3] form was late.", "Their form was late."],
    ["a place tag", "The visit was at [Place 1].", "The visit was at Harbour Street."],
    ["a date tag", "The visit was on [Date 1].", "The visit was on 12/11."],
    ["a detail tag", "[Detail 1] was present.", "her twin brother was present."],
    ["braces around a bare tag", "{Person 1} posted it.", "Maria Okonkwo-Reyes posted it."],
    ["double square brackets around a bare tag", "[[Person 1]] posted it.", "Maria Okonkwo-Reyes posted it."],
    ["round brackets around a bare tag keep the round brackets", "Bea ([Person 1]) posted it.", "Bea (Maria Okonkwo-Reyes) posted it."],
  ];
  for (const [name, draft, want] of forms) {
    it(`${name}: ${draft}`, () => {
      const out = finish(draft);
      expect(left(out)).toBeNull();
      expect(out).toBe(want);
    });
  }

  it("an unknown word before the colon is not a role prefix and is flagged, not hidden", () => {
    const r = restoreDraft({ draft: "They met at [it:Place 1].", outgoing, clients });
    expect(r.text).toContain("Place 1");
    expect(r.notes.some((n) => n.includes("Place 1"))).toBe(true);
  });

  it("every role prefix, in lower case and with a capital, in every bracket pair, leaves no token", () => {
    for (const role of ROLES) {
      for (const name of [role, role[0]!.toUpperCase() + role.slice(1)]) {
        for (const [open, close] of [["{", "}"], ["[", "]"], ["(", ")"]] as const) {
          for (const inner of [false, true]) {
            const label = inner ? "[Person 1]" : "Person 1";
            const out = finish(`Then ${open}${name}:${label}${close} agreed.`);
            expect(left(out), `${open}${name}:${label}${close}`).toBeNull();
          }
        }
      }
    }
  });

  it("the pronoun comes from the client list entry, not from the role word", () => {
    expect(finish("[him:Person 1] and [her:Person 2].")).toBe("Her and him.");
  });
});

describe("the same forms through screening and restore, as the page does (R14.2)", () => {
  it("leaves no token in the finished note", () => {
    const drafts = [
      "[Person 1] said [she:Person 1] would post [her:Person 1] form.",
      "Bea helped [him:Person 2] at [Place 1] on [Date 1].",
      "Bea helped {him:[Person 2]} at [Place 1].",
    ];
    for (const draft of drafts) {
      const screened = screenDraft({ draft, outgoing: { mask }, clients, policy: DEFAULT_POLICY });
      const r = restoreDraft({ draft: screened.maskedText, outgoing, clients, screened });
      expect(left(r.text), draft).toBeNull();
    }
  });
});

describe("a token with no map entry stays visible and flagged (R14.3)", () => {
  it("[him:Person 9] is not hidden", () => {
    const r = restoreDraft({ draft: "Bea saw [him:Person 9].", outgoing, clients });
    expect(left(r.text)).not.toBeNull();
    expect(r.notes.some((n) => n.includes("Person 9"))).toBe(true);
  });

  it("text with no token is unchanged", () => {
    expect(finish("Bea posted the form on Friday. She waited (as agreed) [see note].")).toBe(
      "Bea posted the form on Friday. She waited (as agreed) [see note].",
    );
  });
});

describe("property: any mapped token in any form is gone from the finished note (R14.4)", () => {
  // A small seeded generator: no dependency, the same cases every run.
  let seed = 20261114;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;

  const given = ["Maria", "Tomas", "Ione", "Bea", "Anselm", "Odile", "Pavel", "Rhea", "Soren", "Lucia", "Ned"];
  const family = ["Okonkwo-Reyes", "Brandvold", "Hartigan", "Velasquez", "Marsh", "Eklund", "Dubois", "Tran"];
  const kinds = ["Person", "Place", "Date", "Detail"] as const;

  it("holds over 500 generated names, numbers, kinds and forms", () => {
    for (let i = 0; i < 500; i++) {
      const count = 1 + Math.floor(next() * 5);
      const map: Record<string, string> = {};
      const parts: string[] = [];
      const expected: string[] = [];
      for (let j = 1; j <= count; j++) {
        const kind = pick(kinds);
        const n = 1 + Math.floor(next() * 12);
        const tag = `[${kind} ${n}]`;
        const name = `${pick(given)} ${pick(family)}${j}`.replace(/\d/g, "");
        map[tag] = name;
        const form = pick(["plain", "braces", "square", "round", "innerBraces", "innerSquare"] as const);
        const role = pick(ROLES);
        const word = next() < 0.3 ? role[0]!.toUpperCase() + role.slice(1) : role;
        const label = `${kind} ${n}`;
        const token =
          form === "plain" ? `[${label}]`
          : form === "braces" ? `{${word}:${label}}`
          : form === "square" ? `[${word}:${label}]`
          : form === "round" ? `(${word}:${label})`
          : form === "innerBraces" ? `{${word}:[${label}]}`
          : `[${word}:[${label}]]`;
        parts.push(`Then ${token} agreed.`);
        expected.push(token);
      }
      const generated: MaskResult = { ...mask, map, clientByTag: {} };
      const record = Object.keys(map).join(" ");
      const out = restoreDraft({
        draft: parts.join(" "),
        outgoing: { text: record, maskedRecord: record, mask: generated },
        clients,
      }).text;
      expect(left(out), `${i}: ${parts.join(" ")} -> ${out}`).toBeNull();
      // A plain tag is replaced by its value.
      for (const [tag, name] of Object.entries(map)) if (parts.join(" ").includes(`Then ${tag} agreed`)) expect(out).toContain(name);
    }
  });
});

describe("the list in src/masking/tokenForms.ts is the list the tests use (R14.1)", async () => {
  const { tokenForms, normalizeTokens } = await import("../../src/masking/tokenForms");
  it("every form it lists is put back for every kind and role", () => {
    for (const [kind, n] of [["Person", 1], ["Place", 1], ["Date", 1], ["Detail", 1]] as const) {
      for (const role of ROLES) {
        for (const form of tokenForms(kind, n, role)) {
          expect(left(finish(`Then ${form} agreed.`)), form).toBeNull();
        }
      }
    }
  });

  it("normalizing twice gives the same text", () => {
    for (const form of tokenForms("Person", 1)) expect(normalizeTokens(normalizeTokens(form))).toBe(normalizeTokens(form));
  });
});


describe("a token or tag wrapped twice, or in mixed brackets, is the token (H34b item 1, R14.1)", async () => {
  const { tokenForms, normalizeTokens } = await import("../../src/masking/tokenForms");

  it("is read as the token", () => {
    expect(normalizeTokens("{{she:Person 1}}")).toBe("{she:Person 1}");
    expect(normalizeTokens("[[her:Person 1]]")).toBe("{her:Person 1}");
    expect(normalizeTokens("{[she:Person 1]}")).toBe("{she:Person 1}");
    expect(normalizeTokens("[{she:Person 1}]")).toBe("{she:Person 1}");
    expect(normalizeTokens("{{Person 1}}")).toBe("[Person 1]");
    expect(normalizeTokens("{[Person 1]}")).toBe("[Person 1]");
  });

  it("tokenForms lists them, so the form tests above cover them", () => {
    const forms = tokenForms("Person", 1, "she");
    for (const want of ["{{she:Person 1}}", "[[she:Person 1]]", "{[she:Person 1]}", "{{Person 1}}"]) expect(forms).toContain(want);
  });

  it("leaves a group that is not a token alone", () => {
    expect(normalizeTokens("{{she}} and [[x]]")).toBe("{{she}} and [[x]]");
  });
});
