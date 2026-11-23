// @vitest-environment happy-dom
// H12 (drafting R15): the finished note is plain text she can paste.
// Built from the recorded cloud draft (results/cloud-draft-2026-11-14.json, read, never written) and the invented list.
// Invented people only.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { makeLedger } from "../../src/egress/ledger";
import { buildOutgoing, INSTRUCTIONS } from "../../src/drafting/buildOutgoing";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import type { DraftJob } from "../../src/inference/types";
import { normalizeTokens } from "../../src/masking/tokenForms";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const recorded = (JSON.parse(readFileSync("results/cloud-draft-2026-11-14.json", "utf8")) as { draftText: string }).draftText;
// The line the screen showed on 05: the cloud wrote the pronoun token in square brackets.
const screen05 = recorded.replace("* [Person 2] has offered {his:Person 1} assistance in completing the form.", "* [Person 2] has offered to assist [him:Person 1] with the completion of the form.");

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const finish = (draft: string) => restoreDraft({ draft, outgoing, clients });

/** Any redaction tag or token left, in any bracket, with any role prefix and any kind. */
const LEFT = /[[{(][^\]})\n]{0,30}(?:Person|Place|Date|Detail)[ \t]*\d+/i;

describe("the recorded cloud draft becomes a plain finished note (R15.5, R15.7)", () => {
  it("the fixture is the one the cloud returned", () => {
    expect(recorded).toContain("**Date of Visit:**");
    expect(screen05).toContain("assist [him:Person 1] with the completion");
  });

  for (const [name, draft] of [["as recorded", recorded], ["with the screen 05 pronoun line", screen05]] as const) {
    it(`holds no Markdown mark and no tag or token (${name})`, () => {
      const text = finish(draft).text;
      expect(text).not.toContain("**");
      expect(text.split("\n").some((l) => /^#{1,6}\s/.test(l))).toBe(false);
      expect(LEFT.test(text)).toBe(false);
      expect(text).toContain("Date of Visit: 12/11");
      expect(text).toContain("Maria Okonkwo-Reyes");
    });
  }

  it("puts the pronoun back from her list entry: Maria gets her", () => {
    expect(finish(screen05).text).toContain("assist her with the completion");
  });

  it("strips a heading and bold marks once, and leaves a lone asterisk and a hash inside a line", () => {
    const t = finish("# Case Note\n### Next\nPaid 5 * 2 and ref #4. **Bold** and **x**\n####### seven").text;
    expect(t).toBe("Case Note\nNext\nPaid 5 * 2 and ref #4. Bold and x\n####### seven");
  });
});

describe("Copy and the sheet read one string (R15.1)", () => {
  it("the text Copy puts on the clipboard equals the text on the sheet", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const copied: string[] = [];
    const draft: DraftJob = {
      run: vi.fn(async (_t, input: { text: string }) => ({ value: { text: input.text.length > 0 ? screen05 : "", short: false }, inferenceSource: "IN_CLOUD" as const, connected: true })),
    } as never;
    const deps: ControllerDeps = {
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: true,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      drafting: {
        draftFor: () => draft,
        ledger: makeLedger(),
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async (t) => void copied.push(t),
      },
    };
    const c = makeController(deps);
    const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 5)); };
    await c.start();
    c.handlers.onTryExample();
    c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
    c.render();
    for (const id of ["draft", "send", "copy"]) {
      (root.querySelector(`#${id}`) as HTMLButtonElement).click();
      await settle();
      // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it.
      for (let i = 0; i < 5 && root.querySelector("[data-keep-likely]"); i++) {
        (root.querySelector("[data-keep-likely]") as HTMLElement).click();
        await settle();
      }
    }
    const sheet = root.querySelector(".sheet-text")!.textContent!;
    expect(copied).toHaveLength(1);
    expect(copied[0]).toBe(sheet);
    expect(sheet).toContain("assist her with the completion");
    expect(sheet).not.toContain("**");
  });
});

describe("the instructions (R15.2)", () => {
  it("ask for plain sentences and name the token form", () => {
    expect(INSTRUCTIONS).toBe(
      "Instructions: Write exactly five paragraphs separated by one blank line, in this order: purpose of the visit; what was observed; agreed actions, with who and when; risks; next contact. No headings, no Markdown, no lists. " +
        "Do not copy field labels or the words Visit date. When Visit date: is none, do not mention a visit date. " +
        "Keep every date, number, and tag such as [Date 1] and [Person 1] exactly as written. " +
        "For a pronoun that stands for a tagged person, write a single token in curly braces, such as {she:Person 1}, {him:Person 1} or {their:Person 1}. " +
        "When one action names two people, repeat each tag, as in [Person 3] offered to help [Person 1], and do not write he, she, they, him, her, them, or their after the second tag. " +
        "Never write hedged pronoun pairs or alternatives joined by or, /, or and/or, and never repeat an action with an alternative pronoun clause. " +
        "Treat 'I', 'my', or an unstated subject before a visit action (such as 'went to', 'rang', 'checked', 'left', or 'told by') as the worker, never as a tagged [Person N]. " +
        "Follow the Present: line strictly: if it lists any [Person N], state that each listed person was present, and never say nobody was present. " +
        "Only when Present: states no household member present, state that nobody answered because no household member was present, and never state that a [Person N] was present. " +
        "Use only facts in the record, and use only verbs the note already contains. Do not add a reporting verb the note does not contain. Never invent a speaker or owner, " +
        "and never turn 'my list' or 'the form' into a tagged person's possessive or 'sent by' attribution.",
    );
  });
  it("are the end of the text zone 2 shows", () => {
    expect(outgoing.text.endsWith(INSTRUCTIONS)).toBe(true);
  });
});

describe("token forms read before restore (R15.3)", () => {
  const forms = [
    "[him:Person 1]", "{him:[Person 1]}", "{ Him : person 1 }", "[ HIM : PERSON  1 ]", "(him: Person 1)",
    "{him:Person 1}", "[him: [Person 1]]",
  ];
  for (const f of forms) {
    it(`reads ${f} as a pronoun for Maria`, () => {
      const t = finish(`Tomas will help ${f} today.`).text;
      expect(t).toMatch(/^Tomas will help (her|Her) today\.$/);
    });
  }
  it("reads a bare tag in odd case or spacing", () => {
    expect(finish("[person 1] and [ Person 2 ] agreed.").text).toBe("Maria Okonkwo-Reyes and Bea agreed.");
  });
  it("reads the same forms for Place, Date and Detail and keeps the role word as written", () => {
    expect(normalizeTokens("{ Him : date 1 }")).toBe("{Him:Date 1}");
    expect(normalizeTokens("{his:[place 1]}")).toBe("{his:Place 1}");
    expect(normalizeTokens("[ detail 2 ]")).toBe("[Detail 2]");
  });

  it("controller keeps Present: no household member present in mask and outgoing draft when sparse record drops missed-visit words", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const seenTexts: string[] = [];
    const draft: DraftJob = {
      run: vi.fn(async (_t, input: { text: string }) => {
        seenTexts.push(input.text);
        return { value: { text: "Nobody answered because no household member was present.", short: false }, inferenceSource: "IN_CLOUD" as const, connected: true };
      }),
    } as never;
    const deps: ControllerDeps = {
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: true,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      drafting: {
        draftFor: () => draft,
        ledger: makeLedger(),
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => {},
      },
    };
    const c = makeController(deps);
    await c.start();
    c.handlers.onNoteInput("Missed appt 13/06. Client: Nicolas Ashworth.\nWent to Flat 23, curtains shut, left a card.");
    c.handlers.onListInput("Nicolas Ashworth; ; he/him");
    c.handlers.onRecordEdit?.({
      visitDate: "13/06",
      present: [],
      seen: [],
      agreed: [],
      risks: [],
      nextSteps: ["Rebooked for Thursday.", "Text sent to confirm."],
    });
    c.handlers.onMask?.();
    expect(c.state().mask?.raw).toContain("Present: no household member present (no answer / missed visit)");
    c.handlers.onDraft?.();
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 5));
    expect(c.state().outgoingText).toContain("Present: no household member present (no answer / missed visit)");
    c.handlers.onSend?.();
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 5));
    expect(seenTexts).toHaveLength(1);
    expect(seenTexts[0]).toContain("Present: no household member present (no answer / missed visit)");
    expect(seenTexts[0]).not.toContain("curtains shut");
  });
});
