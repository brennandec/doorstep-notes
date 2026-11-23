// @vitest-environment happy-dom
// H39 items 1 to 3: brace-less and braced word:Role marks never show on the finished sheet;
// reconstructible pronoun:Role marks keep the pronoun (with case/sentence-start capital) and drop :Role without unreadMark;
// ordinary prose colons (times, labels, headers, URLs) stay untouched; unrepairable marks still trigger unreadMark.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { hideMarks, restoreAddedTag, restoreDraft } from "../../src/drafting/restoreDraft";
import { screenDraft } from "../../src/drafting/screenDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({
  record: inventedVisit.preparedRecord,
  clients,
  policy: DEFAULT_POLICY,
  extraMasked: ["Bea"],
});
const restore = (draft: string) => restoreDraft({ draft, outgoing, clients });
const UNREAD = strings.drafting.unreadMark;
const SHOWN_PRONOUN = strings.drafting.shownPronoun;

const H37_2_CLOUD_REPLY = [
  "Visit date: 12/11. Present: [Person 1], [Person 2].",
  "",
  "A visit was conducted on 12/11 and was attended by [Person 1] and [Person 2]. It was observed that mould has returned in the back bedroom and is worse by the window. The landlord has not replied to two emails sent by them:Landlord. [Person 1] missed the benefits form deadline. The date of birth on the form is 3/3/87.",
  "",
  "It was agreed that I:Worker will ring the landlord on Monday and [Person 1] will post the form on Friday. [Person 3], who is a neighbour and also on my:Worker list, offered to help with the form.",
  "",
  "The identified risk is rent arrears if the form is late.",
  "",
  "The next step is to revisit 26/11.",
].join("\n");

const H37_2_OUTGOING = {
  ...outgoing,
  maskedRecord: [
    "Visit date: 12/11",
    "Present: [Person 1], [Person 2]",
    "Seen: Mould in back bedroom again, worse by the window; Landlord not replied to 2 emails; [Person 1] missed the benefits form deadline; DOB on form [Date 1].",
    "Agreed: I ring landlord Mon; [Person 1] posts form Fri; [Person 3] (neighbour, also on my list) offered to help with the form.",
    "Risks: rent arrears if form is late.",
    "Next steps: revisit [Place 1].",
  ].join("\n"),
  mask: {
    ...outgoing.mask,
    map: {
      "[Person 1]": "Maria Okonkwo-Reyes",
      "[Person 2]": "Bea",
      "[Person 3]": "Tomas Brandvold",
      "[Date 1]": "3/3/87",
      "[Place 1]": "26/11",
    },
    clientByTag: {
      "[Person 1]": clients[0]!.id,
      "[Person 3]": clients[1]!.id,
    },
  },
};

describe("H39 item 1: exact h37-2 cloud reply and pronoun:Role mark reconstruction", () => {
  it("repairs h37-2 bare marks (them:Landlord, I:Worker, my:Worker) cleanly without unreadMark", () => {
    const screened = screenDraft({
      draft: H37_2_CLOUD_REPLY,
      outgoing: H37_2_OUTGOING,
      clients,
      policy: DEFAULT_POLICY,
      noteText: inventedVisit.note,
    });
    const r = restoreDraft({ draft: screened.maskedText, outgoing: H37_2_OUTGOING, clients, screened });
    expect(r.shown).toContain("Visit date: 12/11. Present: Maria Okonkwo-Reyes, Bea.");
    expect(r.shown).toContain("emails sent by them.");
    expect(r.shown).toContain("agreed that I will ring the landlord");
    expect(r.shown).toContain("Tomas Brandvold, who is a neighbour and also on my list, offered");
    expect(r.shown).not.toMatch(/them:Landlord|I:Worker|my:Worker|:[A-Za-z]/);
    expect(r.text).not.toMatch(/them:Landlord|I:Worker|my:Worker|:[A-Za-z]/);
    expect(r.notes).not.toContain(UNREAD);
  });

  it("handles every pronoun and schema role word with or without braces and multi-word role phrases", () => {
    const cases: Array<[string, string]> = [
      ["Sent by them:Landlord.", "Sent by them."],
      ["Sent by {them:Landlord}.", "Sent by them."],
      ["Sent by [them:Landlord].", "Sent by them."],
      ["Sent by (them:Landlord).", "Sent by them."],
      ["Sent by {{them:Landlord}}.", "Sent by them."],
      ["I:Worker will ring on Monday.", "I will ring on Monday."],
      ["I:Worker will ring on Monday.", "I will ring on Monday."],
      ["Please copy me:Worker.", "Please copy me."],
      ["Check my:Worker list.", "Check my list."],
      ["My:Worker list is open.", "My list is open."],
      ["my:Worker list is open.", "My list is open."],
      ["The form is mine:Worker.", "The form is mine."],
      ["I saw myself:Worker in the mirror.", "I saw myself in the mirror."],
      ["we:Worker agreed with us:Client about our:Worker notes and ours:Other.", "We agreed with us about our notes and ours."],
      ["We prepared ourselves:Social Worker for the meeting.", "We prepared ourselves for the meeting."],
      ["Can you:Client check your:Client copy? It is yours:Client for yourself:Support Worker.", "Can you check your copy? It is yours for yourself."],
      ["he:Neighbour asked him:Neighbour for his:Landlord key himself:Carer.", "He asked him for his key himself."],
      ["she:Client posted her:Client letter and kept hers:Client herself:Tenant.", "She posted her letter and kept hers herself."],
      ["they:Other called them:Landlord using their:Resident phone; the folder is theirs:Family Member and they checked themselves:Doctor and themself:Nurse.", "They called them using their phone; the folder is theirs and they checked themselves and themself."],
      ["{she: Social Worker} spoke with [our:Housing Officer] and (their:Outreach Worker).", "She spoke with our and their."],
      ["Spoke with {she:SocialWorker}, [him:CaseWorker], (they:HousingOfficer), her:PropertyManager, and their:LettingAgent.", "Spoke with she, him, they, her, and their."],
      ["The letter was sent by them:the landlord.", "The letter was sent by them."],
      ["Check [he:Caseworker] and {her:Manager} and (his:Teacher).", "Check he and her and his."],
      ["Look at it:Mould and its:Window and itself:Bedroom without braces.", "Look at it and its and itself without braces."],
      ["It:Worker happened again.", "It happened again."],
    ];
    for (const [draft, want] of cases) {
      const r = restore(draft);
      expect(r.shown, draft).toBe(want);
      expect(r.text, draft).toBe(want);
      expect(r.notes, draft).not.toContain(UNREAD);
    }
  });

  it("preserves sentence-start capitalization when bare lowercase pronoun:Role begins a sentence", () => {
    const r = restore("my:Worker list is short. their:Landlord reply arrived.\nthem:Client confirmed.");
    expect(r.shown).toBe("My list is short. Their reply arrived.\nThem confirmed.");
    expect(r.notes).not.toContain(UNREAD);
  });

  it("restores bare or parenthesized pronoun:Person N tags from the client list entry", () => {
    const r = restore("[Person 1] helped him:Person 1 and (she:Person 2) helped them:Person 2.");
    expect(r.shown).toBe("Maria Okonkwo-Reyes helped her and he helped him.");
    expect(r.text).toBe("Maria Okonkwo-Reyes helped her and he helped him.");
    expect(r.notes).not.toContain(UNREAD);
  });

  it("restores 3rd-person reflexives (himself, herself, themselves, themself) with :Person N from the client list entry", () => {
    const r1 = restore("[Person 1] blamed {himself:Person 1} and (themself:Person 1), while [Person 2] checked [herself:Person 2] and bare herself:Person 2.");
    expect(r1.shown).toBe("Maria Okonkwo-Reyes blamed herself and herself, while Tomas Brandvold checked himself and bare himself.");
    expect(r1.text).toBe(r1.shown);
    expect(r1.copyHeld).toBe(false);
    expect(r1.notes).not.toContain(UNREAD);

    const unsetClients = parseClientList(`${inventedVisit.clientList}\nCasey Morgan; ; `).entries;
    const unsetOutgoing = buildOutgoing({
      record: {
        ...inventedVisit.preparedRecord,
        agreed: [...inventedVisit.preparedRecord.agreed, "Casey Morgan offered to follow up."],
      },
      clients: unsetClients,
      policy: DEFAULT_POLICY,
    });
    const personNumber = (name: string) => {
      const tag = Object.entries(unsetOutgoing.mask.map).find(([, mapped]) => mapped === name)?.[0];
      expect(tag, name).toMatch(/^\[Person \d+\]$/);
      return tag!.match(/\d+/)![0]!;
    };
    const maria = personNumber("Maria Okonkwo-Reyes");
    const tomas = personNumber("Tomas Brandvold");
    const casey = personNumber("Casey Morgan");
    expect(new Set([maria, tomas, casey]).size).toBe(3);
    const rCap = restoreDraft({
      draft: `{himself:Person ${maria}}. [herself:Person ${tomas}]. themselves:Person ${casey}.`,
      outgoing: unsetOutgoing,
      clients: unsetClients,
    });
    expect(rCap.shown).toBe("Herself. Himself. Themselves.");
    expect(rCap.notes).toContain(strings.masking.pronounFallback.replace("{name}", "Casey Morgan"));
    expect(rCap.notes).not.toContain(UNREAD);

    const rMiss = restore("[Person 1] saw {herself:Person 9}.");
    expect(rMiss.shown).toBe(`Maria Okonkwo-Reyes saw ${SHOWN_PRONOUN}.`);
    expect(rMiss.copyHeld).toBe(true);
    expect(rMiss.notes.some((n) => n.startsWith("Not put back:") && n.includes("Person 9"))).toBe(true);
  });

  it("repairs 1st/2nd-person pronoun:Person N marks before tag checks without false Not put back or (name not put back)", () => {
    const cases: Array<[string, string]> = [
      ["[Person 2] ({I:Person 2}) arranged [my:Person 2] call and (We:Person 2) confirmed.", "Tomas Brandvold (I) arranged my call and We confirmed."],
      ["Bare I:Person 2 and my:Person 2 and {you:[Person 2]} and [our:[Person 2]] and (YOUR:Person 1) copy and [your:Person 1] notes.", "Bare I and my and you and our and Your copy and your notes."],
      ["{I:[Person 2]} met [Person 1] with me:Person 2, mine:Person 2, myself:Person 2, us:Person 2, ours:Person 2, ourselves:Person 2, yours:Person 2, yourself:Person 2, yourselves:Person 2.", "I met Maria Okonkwo-Reyes with me, mine, myself, us, ours, ourselves, yours, yourself, yourselves."],
      ["we:Person 2 agreed with {We:Person 2}.", "We agreed with We."],
    ];
    for (const [draft, want] of cases) {
      const r = restore(draft);
      expect(r.shown, draft).toBe(want);
      expect(r.text, draft).toBe(want);
      expect(r.copyHeld, draft).toBe(false);
      expect(r.notes.some((n) => n.startsWith("Not put back:")), draft).toBe(false);
      expect(r.notes, draft).not.toContain(UNREAD);
    }

    // Case-insensitive except "I": lowercase "i" is not silently promoted to uppercase "I" via Person N rule.
    const rLowerI = restore("Part i:Person 2 stayed flagged as unread.");
    expect(rLowerI.shown).not.toContain("Person 2");
    expect(rLowerI.shown).toBe("Part i stayed flagged as unread.");
    expect(rLowerI.notes).toContain(UNREAD);
  });

  it("keeps [it:Place 1] and {it:Place 1} flagged while hiding unmapped bare word:Kind N with unreadMark", () => {
    for (const bad of ["They met at [it:Place 1].", "They met at {it:Place 1}."]) {
      const r = restore(bad);
      expect(r.text).toContain("Place 1");
      expect(r.shown).toBe(`They met at ${strings.drafting.shownPlace}.`);
      expect(r.copyHeld).toBe(true);
      expect(r.notes.some((n) => n.includes("Place 1"))).toBe(true);
    }

    for (const [draft, want] of [
      ["They met at it:Place 1.", `They met at ${SHOWN_PRONOUN}.`],
      ["Asked Maria:Person 1 and foo:Person 1 and on bar:Date 2 with baz:Detail 3.", "Asked Maria and foo and on bar with baz."],
    ] as const) {
      const r = restore(draft);
      expect(r.shown, draft).toBe(want);
      expect(r.shown, draft).not.toMatch(/:\s*(?:Person|Place|Date|Detail)\s+\d+/);
      expect(r.notes, draft).toContain(UNREAD);
    }
  });

  it("still flags unmapped bare she:Person 9 without leaving raw syntax on the sheet", () => {
    const r = restore("Then she:Person 9 agreed.");
    expect(r.text).toBe("Then {she:Person 9} agreed.");
    expect(r.shown).toBe(`Then ${SHOWN_PRONOUN} agreed.`);
    expect(r.copyHeld).toBe(true);
    expect(r.notes).not.toContain(UNREAD);
  });
});

describe("H39 item 1 & 3: unrepairable word:Role marks still trigger unreadMark and never leak :Role", () => {
  it("flags bare and braced unrecognized pronoun:Role without showing :Role", () => {
    for (const draft of ["Then she:AlienRole called.", "Then {she:AlienRole} called.", "Then (they:UnknownEntity) left.", "Then he: CaseManager left.", "Then he:CaseManager left."]) {
      const r = restore(draft);
      expect(r.shown, draft).toBe(`Then ${SHOWN_PRONOUN} ${draft.includes("called") ? "called" : "left"}.`);
      expect(r.shown, draft).not.toMatch(/AlienRole|UnknownEntity|CaseManager|:/);
      expect(r.notes, draft).toContain(UNREAD);
    }
  });

  it("flags non-pronoun word with known schema role (foo:Worker, {foo:Landlord}) without showing :Role", () => {
    for (const draft of ["Asked foo:Worker today.", "Asked {foo:Landlord} today.", "Asked (bar:Client) today."]) {
      const r = restore(draft);
      expect(r.shown, draft).not.toMatch(/:(?:Worker|Landlord|Client)/);
      expect(r.notes, draft).toContain(UNREAD);
    }
  });

  it("preserves existing hideMarks unreadMark contract on unknown braces and {he:the landlord}", () => {
    const r1 = restore("Then {he:the landlord} rang.");
    expect(r1.shown).toBe(`Then ${SHOWN_PRONOUN} rang.`);
    expect(r1.notes).toContain(UNREAD);
    const r2 = restore("The form {note:late} came.");
    expect(r2.shown).toBe("The form note:late came.");
    expect(r2.notes).toContain(UNREAD);
    const h = hideMarks("[Person 1] {she}");
    expect(h.changed).toBe(true);
    expect(h.text).toContain(SHOWN_PRONOUN);
  });
});

describe("H39 item 2: ordinary prose colons are untouched", () => {
  it("leaves clock times (10:30, 9:00am, 14:05:30) untouched", () => {
    const prose = "Visit started at 10:30 and 9:00am and ended at 14:05:30.";
    const r = restore(prose);
    expect(r.shown).toBe(prose);
    expect(r.text).toBe(prose);
    expect(r.notes).not.toContain(UNREAD);
  });

  it("leaves Agreed: and Next step: record clauses untouched", () => {
    const prose = "Agreed: [Person 1] posts the form on Friday.\nNext step: revisit 26/11.";
    const r = restore(prose);
    expect(r.shown).toBe("Agreed: Maria Okonkwo-Reyes posts the form on Friday.\nNext step: revisit 26/11.");
    expect(r.notes).not.toContain(UNREAD);
  });

  it("leaves Re: and Subject: correspondence prefixes untouched", () => {
    const prose = "Subject: Home visit review.\nRe: Benefits form deadline.";
    const r = restore(prose);
    expect(r.shown).toBe(prose);
    expect(r.notes).not.toContain(UNREAD);
  });

  it("leaves Action: and Note: labels untouched", () => {
    const prose = "Action: Ring the landlord on Monday.\nNote: Mould worsening by window.";
    const r = restore(prose);
    expect(r.shown).toBe(prose);
    expect(r.notes).not.toContain(UNREAD);
  });

  it("leaves http:// and https:// URLs untouched", () => {
    const prose = "Guidance at http://example.invalid/a:1 and https://example.org/help/section:2 applies.";
    const r = restore(prose);
    expect(r.shown).toBe(prose);
    expect(r.notes).not.toContain(UNREAD);
  });

  it("leaves spaced colons before role words in ordinary prose untouched", () => {
    const prose = "Note: Worker will ring. Agreed: Landlord to inspect roof. To you: Client arrived at 10:30.";
    const r = restore(prose);
    expect(r.shown).toBe(prose);
    expect(r.notes).not.toContain(UNREAD);
  });

  it("leaves unspaced prose colons before capitalized words, tags, and in parens untouched", () => {
    const r1 = restore("Present:[Person 1], [Person 2].");
    expect(r1.shown).toBe("Present:Maria Okonkwo-Reyes, Tomas Brandvold.");
    expect(r1.notes).not.toContain(UNREAD);

    for (const prose of [
      "Seen:Mould in back bedroom.",
      "Re:Benefits form deadline.",
      "Ref:AB12",
      "Check (Note:Mould) in the bedroom.",
    ]) {
      const r = restore(prose);
      expect(r.shown, prose).toBe(prose);
      expect(r.notes, prose).not.toContain(UNREAD);
    }
  });

  it("protects pronoun tokens, thing groups, and pronoun:Role marks from device screening proposals", () => {
    const draft = "[Person 1] confirmed {she:Person 1} sent emails to them:Landlord regarding {it:condensation}, and Glenda Pruitt visited Landlord.";
    const screened = screenDraft({
      draft,
      outgoing,
      clients,
      policy: DEFAULT_POLICY,
      noteText: inventedVisit.note,
      proposed: [
        { text: "she", kind: "phrase" },
        { text: "Landlord", kind: "name" },
        { text: "condensation", kind: "phrase" },
        { text: "Glenda Pruitt", kind: "name" },
      ],
    });
    expect(screened.maskedText).toContain("{she:Person 1}");
    expect(screened.maskedText).toContain("them:Landlord");
    // CHANGED 2026-11-19 (chain R17 session A, item 3, masking R22): this line used to expect that the proposed lone
    // "Landlord" was masked ("not.toContain visited Landlord"). R22.1 now drops a lone role word before it can mask
    // every lower-case "landlord" too, so "visited Landlord" stays in the text. The mark them:Landlord is still protected.
    expect(screened.maskedText).toContain("visited Landlord");
    expect(screened.maskedText).toContain("{it:condensation}");
    const r = restoreDraft({ draft: screened.maskedText, outgoing, clients, screened });
    expect(r.shown).toBe("Maria Okonkwo-Reyes confirmed she sent emails to them regarding it, and (name not put back) visited Landlord.");
    expect(r.added.map((a) => a.name)).toEqual(["Glenda Pruitt"]);
    expect(r.notes).not.toContain(UNREAD);
  });

  it("restores plural multi-tag tokens when all tags are mapped while still flagging singular conflicts or unmapped tags", () => {
    const draft = "[Person 1] and [Person 2] met. {They:[Person 1] and [Person 2]} discussed emails sent by {them:[Person 1], [Person 2]}.";
    const screened = screenDraft({
      draft,
      outgoing,
      clients,
      policy: DEFAULT_POLICY,
      noteText: inventedVisit.note,
      proposed: [{ text: "them", kind: "phrase" }],
    });
    expect(screened.maskedText).toContain("{them:[Person 1], [Person 2]}");
    const r = restoreDraft({ draft: screened.maskedText, outgoing, clients, screened });
    expect(r.shown).toBe("Maria Okonkwo-Reyes and Tomas Brandvold met. They discussed emails sent by them.");
    expect(r.tokensReplaced).toBe(2);
    expect(r.copyHeld).toBe(false);
    expect(r.notes).not.toContain(strings.masking.noPronounTokens);
    expect(r.notes).not.toContain(UNREAD);

    const badSingular = restore("{he:[Person 1], [Person 2]} came.");
    expect(badSingular.shown).toBe(`${SHOWN_PRONOUN} came.`);
    expect(badSingular.notes).toContain(UNREAD);

    const badMissing = restore("Sent by {them:[Person 1], [Person 9]}.");
    expect(badMissing.shown).toBe(`Sent by ${SHOWN_PRONOUN}.`);
    expect(badMissing.copyHeld).toBe(true);
    expect(badMissing.notes.some((n) => n.startsWith("Not put back:") && n.includes("Person 9"))).toBe(true);
  });
});

describe("H39 property test: 250 mixed drafts never show bare or braced word:Role while preserving prose colons", () => {
  it("strips or hides every generated word:Role mark cleanly and keeps prose colons intact", () => {
    let seed = 20261116;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;

    const repairableTokens = [
      "them:Landlord", "I:Worker", "my:Worker", "{them:Landlord}", "[I:Worker]", "(my:Worker)",
      "she:Client", "he:Neighbour", "they:Other", "{our:Social Worker}", "[her:Doctor]", "she:Person 1",
    ];
    const unrepairableTokens = ["she:AlienRole", "{them:UnknownRole}", "(entity:Worker)", "foo:Landlord", "{he:the landlord}"];
    const proseChunks = ["Agreed: check back on Friday.", "Note: 10:30 arrival.", "Next step: revisit.", "Action: file copy at https://example.invalid/doc:1."];
    const words = ["Maria [Person 1] met [Person 2] at 9:00am.", "Mould persisted near window.", "Re: rent arrears risk."];

    const leakedBareMark = /\b(?:them|I|my|she|he|they|our|her|entity|foo):(?:Landlord|Worker|Client|Neighbour|Other|Social Worker|Doctor|Person 1|AlienRole|UnknownRole)\b/i;

    for (let i = 0; i < 250; i++) {
      const parts = [pick(words), pick(repairableTokens), pick(proseChunks), next() < 0.4 ? pick(unrepairableTokens) : pick(repairableTokens)];
      const draft = parts.join(" ");
      const r = restore(draft);
      expect(r.shown, draft).not.toMatch(/[[\]{}]/);
      expect(r.shown, draft).not.toMatch(leakedBareMark);
      const zone = renderFinishedZone({
        ...emptyState(),
        finished: { text: r.shown, source: "IN_CLOUD", connected: true, notes: r.notes, added: r.added, copyHeld: r.copyHeld, held: r.text },
      });
      expect(zone.querySelector(".sheet-text")?.textContent ?? "", draft).not.toMatch(leakedBareMark);
    }
  });
});

describe("H39b item 1: mark followed by 's / curly ’s converts to valid possessive determiner or flags unreadMark", () => {
  it("converts braced and bare pronoun marks + 's / ’s to valid possessive determiners", () => {
    const cases: Array<[string, string]> = [
      ["her:Person 1's form was filed.", "Maria Okonkwo-Reyes's form was filed."],
      ["Check her:Person 1's form today.", "Check Maria Okonkwo-Reyes's form today."],
      ["Her:Person 1\u2019s form arrived.", "Maria Okonkwo-Reyes\u2019s form arrived."],
      ["my:Worker's badge was checked.", "My badge was checked."],
      ["Please bring my:Worker's badge.", "Please bring my badge."],
      ["Check my:Worker\u2019s badge.", "Check my badge."],
      ["{she:Person 1}'s form was signed.", "Maria Okonkwo-Reyes's form was signed."],
      ["Signed {she:Person 1}'s form and {he:Person 2}\u2019s form.", "Signed Maria Okonkwo-Reyes's form and Tomas Brandvold\u2019s form."],
      ["Check I:Person 1's checklist first.", "Check my checklist first."],
      ["I:Person 1's checklist is ready.", "My checklist is ready."],
      ["Check {it:Mould}'s spread and {its:Window}\u2019s frame.", "Check its spread and its frame."],
      ["Check {them:[Person 1], [Person 2]}'s joint folder.", "Check their joint folder."],
      ["{They:[Person 1] and [Person 2]}\u2019s joint folder arrived.", "Their joint folder arrived."],
    ];
    for (const [draft, want] of cases) {
      const r = restore(draft);
      expect(r.shown, draft).toBe(want);
      expect(r.text, draft).toBe(want);
      expect(r.copyHeld, draft).toBe(false);
      expect(r.notes, draft).not.toContain(UNREAD);
      expect(r.shown, draft).not.toMatch(/\b(?:Her|My|His|Our|Your|Their|Herself|Himself|Itself)'s\b/i);
    }
  });

  it("keeps apostrophe-s when a tag resolves to a person's name", () => {
    const r = restore("[Person 2]'s form and [Person 1]\u2019s notes.");
    expect(r.shown).toBe("Tomas Brandvold's form and Maria Okonkwo-Reyes\u2019s notes.");
    expect(r.notes).not.toContain(UNREAD);

    const h37 = restoreDraft({ draft: "[Person 2]'s form.", outgoing: H37_2_OUTGOING, clients });
    expect(h37.shown).toBe("Bea's form.");
    expect(h37.notes).not.toContain(UNREAD);
  });

  it("flags unrepairable mark + 's (reflexive, unknown role, or unmapped tag) without silent wrong text", () => {
    for (const bad of [
      "Signed herself:Person 1's form.",
      "Signed {himself:Person 2}'s form.",
      "Took herself:Worker's badge.",
      "Saw {itself:Mould}'s mark.",
      "Saw itself:condensation's mark.",
      "Took {themselves:[Person 1], [Person 2]}'s form.",
      "Signed her:AlienRole's form.",
    ]) {
      const r = restore(bad);
      expect(r.notes, bad).toContain(UNREAD);
      expect(r.shown, bad).not.toMatch(/\b(?:Herself|Himself|Themselves|Itself|Her|My|His)['\u2019]s\b/i);
    }

    const unmapped = restore("Signed {she:Person 9}'s form.");
    expect(unmapped.copyHeld).toBe(true);
    expect(unmapped.notes.some((n) => n.startsWith("Not put back:") && n.includes("Person 9"))).toBe(true);
    expect(unmapped.shown).not.toMatch(/\bHer['\u2019]s\b/i);
  });
});

describe("H39b items 2 & 3: plural 1st/2nd person safety and plural wrong-person detection", () => {
  it("keeps unmapped {we:Person 1 and Person 9} held/flagged and never credits 1st/2nd person marks for left-out checks", () => {
    const unmappedWe = restore("{we:Person 1 and Person 9} will ring.");
    expect(unmappedWe.copyHeld).toBe(true);
    expect(unmappedWe.shown).toBe(`${SHOWN_PRONOUN} will ring.`);
    expect(unmappedWe.shown).not.toMatch(/Person\s*9/i);
    expect(unmappedWe.notes).toContain(UNREAD);
    expect(unmappedWe.notes.some((n) => n.startsWith("Not put back:") && n.includes("Person 9"))).toBe(true);
    expect(unmappedWe.notes.some((n) => n.startsWith("Not put back:") && n.includes("Person 1"))).toBe(false);

    const weLeftOut = restore("{we:Person 1 and Person 2} will ring.");
    expect(weLeftOut.shown).toBe("We will ring.");
    expect(weLeftOut.notes).toContain("The draft left out a name (Person 1) that was sent. Check the note.");
    expect(weLeftOut.notes).toContain("The draft left out a name (Person 2) that was sent. Check the note.");

    const firstSingleLeftOut = restore("{I:Person 2} met we:Person 1.");
    expect(firstSingleLeftOut.shown).toBe("I met we.");
    expect(firstSingleLeftOut.notes).toContain("The draft left out a name (Person 1) that was sent. Check the note.");
    expect(firstSingleLeftOut.notes).toContain("The draft left out a name (Person 2) that was sent. Check the note.");

    const weNamedElsewhere = restore("[Person 1] met [Person 2]. {We:Person 1 and Person 2} will ring.");
    expect(weNamedElsewhere.shown).toBe("Maria Okonkwo-Reyes met Tomas Brandvold. We will ring.");
    expect(weNamedElsewhere.notes.some((n) => n.startsWith("The draft left out a name (Person 1)"))).toBe(false);
    expect(weNamedElsewhere.notes.some((n) => n.startsWith("The draft left out a name (Person 2)"))).toBe(false);

    const thirdPlural = restore("{They:[Person 1] and [Person 2]} will ring.");
    expect(thirdPlural.shown).toBe("They will ring.");
    expect(thirdPlural.notes.some((n) => n.startsWith("The draft left out a name (Person 1)"))).toBe(false);
    expect(thirdPlural.notes.some((n) => n.startsWith("The draft left out a name (Person 2)"))).toBe(false);
  });

  it("still emits pronounWrongPerson when an object-form plural mark points back ambiguously", () => {
    const r = restore("[Person 1] and [Person 2] arrived, and the officer handed {them:[Person 1], [Person 2]} the letter.");
    expect(r.shown).toBe("Maria Okonkwo-Reyes and Tomas Brandvold arrived, and the officer handed them the letter.");
    expect(r.copyHeld).toBe(false);
    expect(r.notes).toContain(
      "Check this sentence: a pronoun may point at the wrong person. Maria Okonkwo-Reyes and Tomas Brandvold arrived, and the officer handed them the letter.",
    );

    const repeatedPlural = restore("{They:[Person 1], [Person 2]} argued, and the host asked {them:[Person 1], [Person 2]} to step outside.");
    expect(repeatedPlural.notes).toContain(
      "Check this sentence: a pronoun may point at the wrong person. They argued, and the host asked them to step outside.",
    );

    const subjPlural = restore("[Person 1] and [Person 2] met and {they:[Person 1], [Person 2]} left.");
    expect(subjPlural.notes.some((n) => n.startsWith("Check this sentence:"))).toBe(false);

    const crossSentence = restore("[Person 1] and [Person 2] arrived. Later someone rang {them:[Person 1], [Person 2]}.");
    expect(crossSentence.notes.some((n) => n.startsWith("Check this sentence:"))).toBe(false);
  });
});

describe("H39b item 4: Restored.repairedMarks counts repaired marks accurately and wires to finished sheet", () => {
  it("counts repaired marks across bare/braced role marks, possessives, and plural marks while keeping clean drafts at 0", () => {
    const clean = restore("Visit note for [Person 1]. {She:Person 1} met [Person 2].");
    expect(clean.repairedMarks).toBe(0);

    const h37Screen = screenDraft({
      draft: H37_2_CLOUD_REPLY,
      outgoing: H37_2_OUTGOING,
      clients,
      policy: DEFAULT_POLICY,
      noteText: inventedVisit.note,
    });
    const h37Restored = restoreDraft({ draft: h37Screen.maskedText, outgoing: H37_2_OUTGOING, clients, screened: h37Screen });
    expect(h37Restored.repairedMarks).toBe(3);

    const poss = restore("Signed her:Person 1's form and brought my:Worker's badge and {it:Mould}'s report.");
    expect(poss.repairedMarks).toBe(3);

    const tokenPoss = restore("{she:Person 1}'s form.");
    expect(tokenPoss.repairedMarks).toBe(1);

    const namePoss = restore("[Person 2]'s form.");
    expect(namePoss.repairedMarks).toBe(0);

    const unrepairablePoss = restore("Signed herself:Person 1's form.");
    expect(unrepairablePoss.repairedMarks).toBe(0);

    const pluralMix = restore("{Them:[Person 1], [Person 2]} met {we:Person 1 and Person 2}.");
    expect(pluralMix.repairedMarks).toBe(2);

    const zone = renderFinishedZone({
      ...emptyState(),
      finished: {
        text: poss.shown,
        source: "IN_CLOUD",
        connected: true,
        notes: poss.notes,
        added: poss.added,
        copyHeld: poss.copyHeld,
        held: poss.text,
        repairedMarks: poss.repairedMarks,
      },
    });
    expect(zone.querySelector("[data-sheet]")?.getAttribute("data-repaired-marks")).toBe("3");
  });
});

describe("H39b Round 2: non-Person possessives, R15.4 leftovers, mixed plurals, and added-tag plurals", () => {
  it("Knife 1: never synthesizes :unread on {Status:Person 1}'s or {herself:Person 1}'s and keeps copyHeld + unreadMark", () => {
    const statusPoss = restore("Signed {Status:Person 1}'s form.");
    expect(statusPoss.shown).not.toContain("Status:unread");
    expect(statusPoss.shown).not.toContain(":unread");
    expect(statusPoss.shown).toBe(`Signed ${strings.drafting.shownName} form.`);
    expect(statusPoss.copyHeld).toBe(true);
    expect(statusPoss.notes).toContain(UNREAD);
    expect(statusPoss.notes.some((n) => n.startsWith("Not put back:") && n.includes("Person 1"))).toBe(true);

    const reflexivePoss = restore("Signed {herself:Person 1}'s form.");
    expect(reflexivePoss.shown).toBe(`Signed ${SHOWN_PRONOUN} form.`);
    expect(reflexivePoss.shown).not.toMatch(/herself/i);
    expect(reflexivePoss.copyHeld).toBe(true);
    expect(reflexivePoss.notes).toContain(UNREAD);
    expect(reflexivePoss.notes.some((n) => n.startsWith("Not put back:") && n.includes("Person 1"))).toBe(true);
  });

  it("Knife 2: never rewrites non-Person possessives to their/Their while keeping 1st/2nd-person Person N possessives with left-out honesty", () => {
    const withMappedPlaceAndDetail = {
      ...outgoing,
      maskedRecord: `${outgoing.maskedRecord}\nAddress: [Place 1]\nDetail: [Detail 1]`,
      mask: {
        ...outgoing.mask,
        map: {
          ...outgoing.mask.map,
          "[Place 1]": "14 Oak Road",
          "[Detail 1]": "back boiler",
        },
      },
    };
    for (const [draft, expectedPlaceholder, expectedLabel] of [
      ["Fixed {it:Place 1}'s roof.", strings.drafting.shownPlace, "Place 1"],
      ["Checked {my:Place 1}'s address.", strings.drafting.shownPlace, "Place 1"],
      ["Updated {I:Detail 1}'s note.", strings.drafting.shownDetail, "Detail 1"],
      ["Checked {her:Place 1}'s gate.", SHOWN_PRONOUN, "Place 1"],
    ] as const) {
      for (const targetOutgoing of [outgoing, withMappedPlaceAndDetail]) {
        const r = restoreDraft({ draft, outgoing: targetOutgoing, clients });
        expect(r.shown, draft).not.toMatch(/\bTheir\b/i);
        expect(r.shown, draft).toContain(expectedPlaceholder);
        expect(r.shown, draft).not.toContain("'s");
        expect(r.copyHeld, draft).toBe(true);
        expect(r.notes, draft).toContain(UNREAD);
        expect(r.notes.some((n) => n.startsWith("Not put back:") && n.includes(expectedLabel)), draft).toBe(true);
      }
    }

    const myPerson = restore("{my:Person 1}'s form was ready.");
    expect(myPerson.shown).toBe("My form was ready.");
    expect(myPerson.copyHeld).toBe(false);
    expect(myPerson.notes.some((n) => n.startsWith("Not put back:"))).toBe(false);
    expect(myPerson.notes.some((n) => n.includes("left out") && n.includes("Person 1"))).toBe(true);

    const mixedPersons = restore("[Person 1] checked {I:Person 2}'s badge, {our:Person 1}'s plan, and {your:Person 1}'s form.");
    expect(mixedPersons.shown).toBe("Maria Okonkwo-Reyes checked my badge, our plan, and your form.");
    expect(mixedPersons.copyHeld).toBe(false);
    expect(mixedPersons.notes.some((n) => n.includes("left out") && n.includes("Person 2"))).toBe(true);
    expect(mixedPersons.notes.some((n) => n.includes("left out") && n.includes("Person 1"))).toBe(false);
  });

  it("Knife 3: mapped Place 1 alongside [it:Place 1] still emits R15.4 Not put back for Place 1", () => {
    const withMappedPlace = {
      ...outgoing,
      maskedRecord: `${outgoing.maskedRecord}\nAddress: [Place 1]`,
      mask: {
        ...outgoing.mask,
        map: {
          ...outgoing.mask.map,
          "[Place 1]": "14 Oak Road",
        },
      },
    };
    const r = restoreDraft({
      draft: "[Place 1] had mould and [it:Place 1] smelled.",
      outgoing: withMappedPlace,
      clients,
    });
    expect(r.shown).toBe(`14 Oak Road had mould and ${strings.drafting.shownPlace} smelled.`);
    expect(r.text).toBe("14 Oak Road had mould and [it:Place 1] smelled.");
    expect(r.copyHeld).toBe(true);
    expect(r.notes).toContain("Not put back: a place (Place 1). The app cannot tell what it stands for.");
    expect(r.notes).not.toContain(UNREAD);
  });

  it("Knife 4: hides mixed-kind plural marks cleanly without leaking Detail/Place labels and resolves added-tag plurals via restoreAddedTag", () => {
    for (const [draft, expectedMissing] of [
      ["{us:Person 1, Detail 2} met.", "Detail 2"],
      ["{they:Person 1 and Place 1} met.", "Place 1"],
    ] as const) {
      const r = restore(draft);
      expect(r.shown, draft).toBe(`${SHOWN_PRONOUN} met.`);
      expect(r.shown, draft).not.toContain(expectedMissing);
      expect(r.shown, draft).not.toContain("Detail");
      expect(r.shown, draft).not.toContain("Place");
      expect(r.copyHeld, draft).toBe(true);
      expect(r.notes, draft).toContain(UNREAD);
      expect(r.notes.some((n) => n.startsWith("Not put back:") && n.includes(expectedMissing)), draft).toBe(true);
    }

    const withAddedPerson4 = {
      ...outgoing,
      addedNames: [{ tag: "[Person 4]", name: "Glenda Pruitt" }],
    };

    const weAdded = restoreDraft({
      draft: "[Person 1] confirmed {we:Person 1 and Person 4} will ring.",
      outgoing: withAddedPerson4,
      clients,
    });
    expect(weAdded.added).toEqual([{ tag: "[Person 4]", name: "Glenda Pruitt" }]);
    expect(weAdded.copyHeld).toBe(true);
    expect(weAdded.notes).toContain(strings.drafting.addedByModel);
    expect(weAdded.shown).toContain(SHOWN_PRONOUN);

    const wePutBack = restoreAddedTag(weAdded, "[Person 4]", clients);
    expect(wePutBack.shown).toBe("Maria Okonkwo-Reyes confirmed we will ring.");
    expect(wePutBack.text).toBe("Maria Okonkwo-Reyes confirmed we will ring.");
    expect(wePutBack.copyHeld).toBe(false);
    expect(wePutBack.added).toEqual([]);
    expect(wePutBack.notes).not.toContain(UNREAD);
    expect(wePutBack.notes).not.toContain(strings.drafting.addedByModel);

    const theyAdded = restoreDraft({
      draft: "[Person 1] confirmed. {they:Person 1 and Person 4} met.",
      outgoing: withAddedPerson4,
      clients,
    });
    expect(theyAdded.added).toEqual([{ tag: "[Person 4]", name: "Glenda Pruitt" }]);
    expect(theyAdded.copyHeld).toBe(true);

    const theyPutBack = restoreAddedTag(theyAdded, "[Person 4]", clients);
    expect(theyPutBack.shown).toBe("Maria Okonkwo-Reyes confirmed. They met.");
    expect(theyPutBack.text).toBe("Maria Okonkwo-Reyes confirmed. They met.");
    expect(theyPutBack.copyHeld).toBe(false);
    expect(theyPutBack.added).toEqual([]);
    expect(theyPutBack.notes).not.toContain(UNREAD);
    expect(theyPutBack.notes).not.toContain(strings.drafting.addedByModel);
  });
});

describe("H39c item 1: mapped single-person 3rd-person mark + 's / ’s shows person's name with 's / ’s", () => {
  it("shows Maria Okonkwo-Reyes's on both possessive and contraction with straight and curly apostrophes", () => {
    for (const [draft, want] of [
      ["{she:Person 1}'s form was signed.", "Maria Okonkwo-Reyes's form was signed."],
      ["{she:Person 1}'s going to ring.", "Maria Okonkwo-Reyes's going to ring."],
      ["{she:Person 1}\u2019s form was signed.", "Maria Okonkwo-Reyes\u2019s form was signed."],
      ["{she:Person 1}\u2019s going to ring.", "Maria Okonkwo-Reyes\u2019s going to ring."],
    ] as const) {
      const r = restore(draft);
      expect(r.shown, draft).toBe(want);
      expect(r.text, draft).toBe(want);
      expect(r.copyHeld, draft).toBe(false);
      expect(r.repairedMarks, draft).toBe(1);
      expect(r.tokensReplaced, draft).toBe(1);
      expect(r.notes, draft).not.toContain(UNREAD);
      expect(r.notes, draft).not.toContain(strings.masking.noPronounTokens);
      expect(r.notes.some((n) => n.includes("left out") && n.includes("Person 1")), draft).toBe(false);
    }
  });

  it("handles every 3rd-person role and bracket form and works for a they/them single client", () => {
    for (const role of ["he", "she", "they", "him", "her", "them", "his", "hers", "their"]) {
      for (const form of [
        `{${role}:Person 1}'s going to ring.`,
        `[${role}:Person 1]'s form.`,
        `${role}:Person 1\u2019s form.`,
      ]) {
        const r = restore(form);
        expect(r.shown, form).toContain(form.includes("\u2019s") ? "Maria Okonkwo-Reyes\u2019s" : "Maria Okonkwo-Reyes's");
        expect(r.copyHeld, form).toBe(false);
        expect(r.notes, form).not.toContain(UNREAD);
      }
    }

    const nbClients = parseClientList("Maria Okonkwo-Reyes; ; she/her\nJordan Patel; ; they/them").entries;
    const nbOutgoing = {
      text: "Visit [Person 1] and [Person 2].",
      maskedRecord: "Visit [Person 1] and [Person 2].",
      mask: {
        maskedText: "",
        spans: [],
        map: { "[Person 1]": "Maria Okonkwo-Reyes", "[Person 2]": "Jordan Patel" },
        clientByTag: { "[Person 1]": nbClients[0]!.id, "[Person 2]": nbClients[1]!.id },
        surfaceForms: [],
        listedNames: [],
        sentOnPurpose: [],
      },
    };
    for (const [draft, want] of [
      ["{they:Person 2}'s form was signed.", "Jordan Patel's form was signed."],
      ["{they:Person 2}'s going to ring.", "Jordan Patel's going to ring."],
      ["{their:Person 2}\u2019s flat is damp.", "Jordan Patel\u2019s flat is damp."],
    ] as const) {
      const r = restoreDraft({ draft, outgoing: nbOutgoing, clients: nbClients });
      expect(r.shown, draft).toBe(want);
      expect(r.copyHeld, draft).toBe(false);
      expect(r.notes, draft).not.toContain(UNREAD);
    }
  });

  it("holds added-person '{she:Person 4}'s' until Put back and resolves to Glenda Pruitt's on restoreAddedTag", () => {
    const withAddedPerson4 = {
      ...outgoing,
      addedNames: [{ tag: "[Person 4]", name: "Glenda Pruitt" }],
    };
    const held = restoreDraft({
      draft: "[Person 1] said {she:Person 4}'s going to ring.",
      outgoing: withAddedPerson4,
      clients,
    });
    expect(held.added).toEqual([{ tag: "[Person 4]", name: "Glenda Pruitt" }]);
    expect(held.copyHeld).toBe(true);
    expect(held.notes).toContain(strings.drafting.addedByModel);
    expect(held.shown).not.toContain("Glenda");

    const putBack = restoreAddedTag(held, "[Person 4]", clients);
    expect(putBack.shown).toBe("Maria Okonkwo-Reyes said Glenda Pruitt's going to ring.");
    expect(putBack.text).toBe("Maria Okonkwo-Reyes said Glenda Pruitt's going to ring.");
    expect(putBack.copyHeld).toBe(false);
    expect(putBack.added).toEqual([]);
    expect(putBack.notes).not.toContain(UNREAD);
    expect(putBack.notes).not.toContain(strings.drafting.addedByModel);
    expect(putBack.notes).not.toContain(strings.masking.noPronounTokens);
  });

  it("keeps H39c section 2 invariants unchanged (un-suffixed pronouns, plurals, 1st/2nd-person, unrepairable)", () => {
    expect(restore("Read {her:Person 1} form and {his:Person 2} car.").shown).toBe("Read her form and his car.");
    expect(restore("{they:Person 1 and Person 2}'s flat is cold.").shown).toBe("Their flat is cold.");
    expect(restore("Check {I:Person 1}'s badge.").notes).toContain(
      "The draft left out a name (Person 1) that was sent. Check the note.",
    );
    expect(restore("Check {I:Person 1}'s badge.").shown).toBe("Check my badge.");
    expect(restore("Check {my:Person 1}'s badge.").shown).toBe("Check my badge.");
  });
});
