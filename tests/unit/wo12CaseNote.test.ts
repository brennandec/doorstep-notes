// @vitest-environment happy-dom
// WO-12. Headings are the record fields. The model writes the prose.
// A bare pronoun after a second person is replaced on this device when exactly
// one other tagged person has those pronouns.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { INSTRUCTIONS, RELEASE_18_INSTRUCTION_CHARS, buildOutgoing } from "../../src/drafting/buildOutgoing";
import {
  CASE_HEADINGS,
  casePartsFor,
  plainCaseNote,
  repairCasePart,
  repairReportingVerb,
  repairUnclearPronoun,
  reportingVerbAbsentFromNote,
  splitDraftProse,
  unclearPronounCount,
} from "../../src/drafting/caseNote";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { findMissedVisitFabricatedPresence } from "../e2e/device/n3Audit";
import { parseClientList, type ClientEntry } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const CLIENTS = parseClientList(
  "Maria Okonkwo-Reyes; ; she/her\nTomas Brandvold; ; he/him\nBea Ashworth; ; she/her\nRosalind Achterberg; Ros; they/them",
).entries;

function outgoingFor(present: { label: string; role: "client" | "worker" | "other" }[]) {
  return buildOutgoing({
    record: {
      visitDate: "12/11",
      present,
      seen: ["Meeting took place."],
      agreed: ["Maria posts the form."],
      risks: [],
      nextSteps: [],
    },
    clients: CLIENTS,
    policy: DEFAULT_POLICY,
  });
}

function byTag(clients: ClientEntry[], tags: Record<string, string>): Map<string, ClientEntry> {
  const map = new Map<string, ClientEntry>();
  for (const [tag, id] of Object.entries(tags)) {
    const client = clients.find((c) => c.id === id);
    if (client !== undefined) map.set(tag, client);
  }
  return map;
}

const handlers = (over: Partial<Handlers> = {}): Handlers => ({
  onNoteInput: vi.fn(),
  onListInput: vi.fn(),
  onTryExample: vi.fn(),
  onRemoveExample: vi.fn(),
  onGetModel: vi.fn(),
  onMakeRecord: vi.fn(),
  onStartVisit: vi.fn(),
  ...over,
});

function mount(state: ReturnType<typeof emptyState>, h = handlers()) {
  const root = document.createElement("div");
  root.append(...renderScreen(state, h));
  return root;
}

const FIVE =
  "Home visit for the rent form.\n\n" +
  "Damp was on the bedroom wall.\n\n" +
  "The worker rings the landlord on Monday.\n\n" +
  "The rent falls behind if the form is late.\n\n" +
  "The worker visits again next month.";

describe("WO-12 instructions", () => {
  it("stays at or under release 18 and names five parts and the repeated tag", () => {
    expect(INSTRUCTIONS.length).toBeLessThanOrEqual(RELEASE_18_INSTRUCTION_CHARS);
    expect(RELEASE_18_INSTRUCTION_CHARS).toBe(2171);
    expect(INSTRUCTIONS).toContain("Write exactly five paragraphs separated by one blank line");
    expect(INSTRUCTIONS).toContain("repeat each tag, as in [Person 3] offered to help [Person 1]");
    expect(INSTRUCTIONS).toContain("use only verbs the note already contains");
    expect(INSTRUCTIONS).not.toContain("the second person's tag");
    expect(INSTRUCTIONS).not.toMatch(/\b(?:confirmed|noted|indicated)\b/);
  });
});

describe("WO-12 pronoun repair", () => {
  it("replaces a bare pronoun after a second person when exactly one other tagged person matches", () => {
    const out = outgoingFor([
      { label: "Maria Okonkwo-Reyes", role: "client" },
      { label: "Tomas Brandvold", role: "other" },
    ]);
    const raw = "[Person 1] was present. [Person 2] offered to help her with the form.";
    const r = restoreDraft({ draft: raw, outgoing: out, clients: CLIENTS });
    expect(r.shown).toContain("Tomas Brandvold offered to help Maria Okonkwo-Reyes with the form.");
    expect(r.shown).not.toMatch(/\bher\b/);
    expect(unclearPronounCount(r.shown)).toBe(0);
  });

  it("leaves a pronoun when the nearest person is not on the list", () => {
    const maria = CLIENTS[0]!;
    const map = byTag(CLIENTS, { "[Person 1]": maria.id });
    const raw = "[Person 1] arrived with [Person 2]. Her sister was there.";
    expect(repairUnclearPronoun(raw, map)).toBe(raw);
  });

  it("leaves a pronoun that matches the nearest tagged person", () => {
    const maria = CLIENTS[0]!;
    const tomas = CLIENTS[1]!;
    const map = byTag(CLIENTS, { "[Person 1]": maria.id, "[Person 2]": tomas.id });
    const raw = "[Person 1] checked her calendar.";
    expect(repairUnclearPronoun(raw, map)).toBe(raw);
  });

  it("does not rewrite a tagged token, and the wrong-person warning still fires", () => {
    const out = outgoingFor([
      { label: "Maria Okonkwo-Reyes", role: "client" },
      { label: "Tomas Brandvold", role: "other" },
    ]);
    const raw = "[Person 1] would post the form, and [Person 2] offered to help {her:Person 2} with the form.";
    const maria = CLIENTS[0]!;
    const tomas = CLIENTS[1]!;
    expect(repairUnclearPronoun(raw, byTag(CLIENTS, { "[Person 1]": maria.id, "[Person 2]": tomas.id }))).toBe(raw);
    const r = restoreDraft({ draft: raw, outgoing: out, clients: CLIENTS });
    expect(r.shown).toContain("offered to help him with the form.");
    expect(r.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
  });

  it("leaves a one-tag bare pronoun when several listed people share those pronouns", () => {
    const out = outgoingFor([
      { label: "Tomas Brandvold", role: "other" },
      { label: "Maria Okonkwo-Reyes", role: "client" },
      { label: "Bea Ashworth", role: "other" },
    ]);
    const raw = "[Person 1] offered to help her with the form.";
    const r = restoreDraft({ draft: raw, outgoing: out, clients: CLIENTS });
    expect(r.shown).toContain("offered to help her with the form.");
    expect(r.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
  });

  it("repeats both tags when their follows two people and matches neither", () => {
    const odalys = { ...CLIENTS[0]!, fullName: "Odalys Brennan-Webb", pronouns: "she/her" as const };
    const ione = { ...CLIENTS[2]!, fullName: "Ione", pronouns: "she/her" as const };
    const map = new Map<string, ClientEntry>([["[Person 1]", odalys], ["[Person 2]", ione]]);
    const raw = "The visit was to check in with [Person 1] and [Person 2] regarding their current situation.";
    expect(repairUnclearPronoun(raw, map)).toBe(
      "The visit was to check in with [Person 1] and [Person 2] regarding [Person 1] and [Person 2]'s current situation.",
    );
  });

  it("flags a reporting verb the note does not contain", () => {
    const note = "12/11 home visit. Mould in the back bedroom.";
    expect(reportingVerbAbsentFromNote("Observations confirmed the mould.", note)).toBe("confirmed");
    expect(reportingVerbAbsentFromNote("She confirmed the mould.", "She confirmed the mould in the note.")).toBeNull();
    expect(reportingVerbAbsentFromNote("The worker rang the landlord.", note)).toBeNull();
  });

  it("drops the four invented reporting verbs and adds no word", () => {
    const note = inventedVisit.note;
    const missed = "Missed appt 06/01. Rang twice, no answer. Went to Flat 25, curtains shut.";
    const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w !== "");
    const cases: Array<[string, string, string]> = [
      [
        note,
        "Mould was observed in the back bedroom, with an increase in the severity of the mould noted by the window.",
        "Mould was observed in the back bedroom, with an increase in the severity of the mould by the window.",
      ],
      [
        note,
        "Observations indicated the existence of mould in the back bedroom, particularly concentrated by the window.",
        "The existence of mould in the back bedroom, particularly concentrated by the window.",
      ],
      [
        note,
        "Maria Okonkwo-Reyes reported renewed mould in the back bedroom, with increased severity observed near the window. Tomas Brandvold, a neighbour also noted on my list, offered assistance with completing the form.",
        "Renewed mould in the back bedroom, with increased severity observed near the window. Tomas Brandvold, a neighbour also on my list, offered assistance with completing the form.",
      ],
      [
        missed,
        "The worker noted that nobody answered because no household member was present.",
        "Nobody answered because no household member was present.",
      ],
    ];
    for (const [src, raw, expected] of cases) {
      const repaired = repairReportingVerb(raw, src);
      expect(repaired).toBe(expected);
      expect(reportingVerbAbsentFromNote(repaired, src)).toBeNull();
      const before = new Set(words(raw));
      for (const word of words(repaired)) expect(before.has(word)).toBe(true);
    }
    expect(repairReportingVerb("She confirmed the mould.", "She confirmed the mould in the note.")).toBe("She confirmed the mould.");
  });

  it("keeps a part when the reporting frame is the whole part", () => {
    const note = inventedVisit.note;
    const fromRecord = repairCasePart("The worker noted that.", note, "Home visit.");
    expect(fromRecord).toBe("Home visit.");
    expect(reportingVerbAbsentFromNote(fromRecord, note)).toBeNull();
    const fromNote = repairCasePart("Noted.", note, "");
    expect(fromNote).toBe("12/11 home visit 14:00, flat 3, 14 Alder Court.");
    expect(fromNote.trim()).not.toBe("");
    expect(reportingVerbAbsentFromNote(fromNote, note)).toBeNull();
  });

  it("drops an attribution sentence the note does not contain and keeps the part", () => {
    const note = "Missed appt 06/01. Rang twice, no answer. Went to Flat 25, curtains shut.";
    const risks = [
      "Twice attempts were made to contact (name not put back) by telephone, but there was no answer.",
      "A neighbour (name not put back) had been visited by an acquaintance from the allotment and had gone to stay with a relative for a few days.",
      "A card was left at the property.",
    ].join(" ");
    const repaired = repairCasePart(risks, note, "No risks recorded.");
    expect(repaired).not.toMatch(/\bvisited\b/);
    expect(repaired).toContain("A card was left at the property.");
    expect(repaired).toContain("there was no answer");
    const shown = `Risks\n${repaired}`;
    expect(findMissedVisitFabricatedPresence({
      note,
      outgoingSent: "Present: none\n\nInstructions:",
      rawCloudReply: null,
      restoredDraft: shown,
    })).toBeNull();
    expect(reportingVerbAbsentFromNote(repaired, note)).toBeNull();
  });

  it("leaves the word when two other tagged people share the pronoun", () => {
    const out = outgoingFor([
      { label: "Tomas Brandvold", role: "other" },
      { label: "Maria Okonkwo-Reyes", role: "client" },
      { label: "Bea Ashworth", role: "other" },
    ]);
    const raw = "[Person 2] and [Person 3] asked [Person 1] whether she would sign.";
    const r = restoreDraft({ draft: raw, outgoing: out, clients: CLIENTS });
    expect(r.shown).toMatch(/\bshe\b/);
    expect(r.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
  });
});

describe("WO-12 case-note layout", () => {
  const record = structuredClone(inventedVisit.preparedRecord);

  it("shows model prose under Purpose when the draft has five parts", () => {
    const root = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      record,
      finished: { text: FIVE, source: "IN_CLOUD", connected: true, namesRestored: true },
    }));
    const parts = [...root.querySelectorAll("[data-case-part]")];
    expect(parts.map((p) => p.querySelector("h3")?.textContent)).toEqual([...CASE_HEADINGS]);
    expect(parts[0]?.textContent).toContain("Home visit for the rent form.");
    expect(root.textContent).not.toContain("Mould in the back bedroom");
    expect(parts.every((p) => (p.querySelector("p")?.textContent ?? "") !== "")).toBe(true);
  });

  it("does not show a reporting verb the note does not contain", () => {
    const draft = [
      "Home visit for the rent form.",
      "Mould was observed in the back bedroom, with an increase in the severity of the mould noted by the window.",
      "The worker rings the landlord on Monday.",
      "The rent falls behind if the form is late.",
      "The worker visits again next month.",
    ].join("\n\n");
    const root = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      noteText: inventedVisit.note,
      record,
      finished: { text: draft, source: "ON_DEVICE", connected: false, namesRestored: true },
    }));
    const observed = [...root.querySelectorAll("[data-case-part]")][1];
    expect(observed?.textContent).toContain("mould by the window");
    expect(observed?.textContent).not.toMatch(/\bnoted\b/);
  });

  it("still shows Purpose when that part was only a reporting frame", () => {
    const draft = [
      "The worker noted that.",
      "Mould in the back bedroom.",
      "The worker rings the landlord on Monday.",
      "The rent falls behind if the form is late.",
      "The worker visits again next month.",
    ].join("\n\n");
    const root = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      noteText: inventedVisit.note,
      record,
      finished: { text: draft, source: "ON_DEVICE", connected: false, namesRestored: true },
    }));
    const parts = [...root.querySelectorAll("[data-case-part]")];
    expect(parts).toHaveLength(5);
    expect(parts[0]?.querySelector("h3")?.textContent).toBe("Purpose");
    expect(parts[0]?.querySelector("p")?.textContent).toBe("Home visit.");
    expect(parts[0]?.textContent).not.toMatch(/\bnoted\b/);
  });

  it("keeps the record lines, including Purpose, when the draft is one sentence", () => {
    const root = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      record,
      finished: { text: "The worker rang the landlord.", source: "IN_CLOUD", connected: false, namesRestored: true },
    }));
    const purpose = root.querySelector("[data-case-part]")!;
    expect(purpose.querySelector("h3")?.textContent).toBe("Purpose");
    expect(purpose.querySelector("p")?.textContent).toBe("Home visit.");
    expect(root.textContent).toContain("Mould in the back bedroom");
    expect(root.querySelector("main h1.sr-only")?.textContent).toBe(strings.zones.finished);
  });

  it("copies and downloads the plain text of the five parts", async () => {
    const copied: string[] = [];
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((value: Blob | MediaSource) => {
      blobs.push(value as Blob);
      return "blob:wo12";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const root = mount(
      emptyState({
        recordOpen: false,
        example: true,
        started: true,
        record,
        finished: { text: "The worker rang the landlord.", source: "ON_DEVICE", connected: true, namesRestored: true },
      }),
      handlers({
        onCopyFinished: vi.fn(),
        onCopyCaseNote: (text) => copied.push(text),
      }),
    );
    root.querySelector<HTMLButtonElement>("#copy")!.click();
    root.querySelector<HTMLButtonElement>("#download-txt")!.click();
    const parts = casePartsFor("The worker rang the landlord.", record);
    const plain = plainCaseNote(parts);
    expect(copied).toEqual([plain]);
    expect(plain.startsWith("Purpose\nHome visit.")).toBe(true);
    expect(plain).toContain("What was observed\nMould in the back bedroom, worse by the window.");
    expect(await blobs[0]!.text()).toBe(plain);
    expect(splitDraftProse("only one block")).toBeNull();
  });

  it("omits the Purpose heading when the record has no purpose", () => {
    const bare = structuredClone(record);
    delete bare.purpose;
    const root = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      record: bare,
      finished: { text: "The worker rang the landlord.", source: "ON_DEVICE", connected: false, namesRestored: true },
    }));
    const headings = [...root.querySelectorAll("[data-case-part] h3")].map((heading) => heading.textContent);
    expect(headings[0]).toBe("What was observed");
    expect(headings).not.toContain("Purpose");
    const plain = plainCaseNote(casePartsFor("The worker rang the landlord.", bare));
    expect(plain.startsWith("What was observed\n")).toBe(true);
    expect(plain).not.toContain("Purpose");
    expect(plain).toContain("Mould in the back bedroom");
  });
});
