// @vitest-environment happy-dom
// Session H14, second-reader tasks 15 to 17 (R9): a guess says what the reader inferred.
// Invented people only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderReaderPanel } from "../../src/app/zones/readerPanel";
import * as constants from "../../src/constants";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { SECOND_READER_INSTRUCTIONS } from "../../src/inference/secondReader/instructions";
import { SECOND_READER_SCHEMA, parseReply } from "../../src/inference/secondReader/secondReader.real";
import type { Guess, SecondReaderOutput } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { redactReply } from "../../src/secondReader/redact";

const KINDS = ["place", "relation", "date", "role", "name", "other"];

describe("the schema (R9.1)", () => {
  const item = SECOND_READER_SCHEMA.properties.guesses.items as unknown as {
    properties: Record<string, { type: string; enum?: string[] }>;
    required: string[];
    additionalProperties: boolean;
  };

  it("adds description and why as strings", () => {
    expect(item.properties.description?.type).toBe("string");
    expect(item.properties.why?.type).toBe("string");
  });

  it("adds kind as one of six words", () => {
    expect(item.properties.kind?.type).toBe("string");
    expect(item.properties.kind?.enum).toEqual(KINDS);
  });

  it("requires all five fields and allows no other", () => {
    expect([...item.required].sort()).toEqual(["description", "evidence", "kind", "why", "who"].sort());
    expect(item.additionalProperties).toBe(false);
  });
});

describe("parseReply (R9.1)", () => {
  const full = {
    who: "a tenant in a ground-floor flat",
    description: "a woman on the ground floor with a benefits form",
    why: "the mould and the form point to one flat",
    kind: "place",
    evidence: ["Mould in the back bedroom"],
  };

  it("keeps description, why and kind", () => {
    const out = parseReply(JSON.stringify({ guesses: [full] }));
    expect(out?.guesses[0]).toEqual(full);
  });

  it("still reads a reply that has only who and evidence, with description and why empty", () => {
    const out = parseReply(JSON.stringify({ guesses: [{ who: "a tenant", evidence: ["Mould"] }] }));
    expect(out?.guesses).toHaveLength(1);
    expect(out!.guesses[0]!.who).toBe("a tenant");
    expect(out!.guesses[0]!.evidence).toEqual(["Mould"]);
    expect(out!.guesses[0]!.description).toBe("");
    expect(out!.guesses[0]!.why).toBe("");
  });

  it("leaves out a kind that is not one of the six", () => {
    const out = parseReply(JSON.stringify({ guesses: [{ ...full, kind: "weather" }] }));
    expect(out!.guesses[0]!.kind).toBeUndefined();
  });

  it("refuses a description that is not text", () => {
    expect(parseReply(JSON.stringify({ guesses: [{ ...full, description: 3 }] }))).toBeNull();
  });
});

describe("the instructions (R9.5)", () => {
  it("are the words the owner gave", () => {
    expect(SECOND_READER_INSTRUCTIONS).toBe(
      "Instructions: Read the record above as someone who knows the area would. Say who it could be about. For each guess give a short description of the person, why you think so, and the kind of clue: place, relation, date, role, name or other. Quote only the exact words from the record that would identify the person to someone local, not tags such as [Person 1]. Quote only words that appear in the record.",
    );
  });
});

describe("the reader's model (R9.6)", () => {
  it("READER_CLOUD_MODEL is gemini-3.8-flash and has a source", () => {
    expect((constants as Record<string, unknown>).READER_CLOUD_MODEL).toBe("gemini-3.8-flash");
    expect(constants.CONSTANT_SOURCES.READER_CLOUD_MODEL).toContain("sdk-facts 31");
  });

  it("the reader job is given it in main.ts, and drafting stays on the default", () => {
    const main = readFileSync("src/app/main.ts", "utf8");
    expect(main).toMatch(/makeSecondReaderJob\(\{[^}]*cloudModel: \(\) => currentSettings\(\)\.readerModel/);
    expect(main).toMatch(/makeDraftJob\(\{[^}]*cloudModel: \(\) => currentSettings\(\)\.draftModel/);
    expect(main).not.toMatch(/makeDraftJob\(\{[^}]*readerModel/);
  });
});

describe("redactReply on description and why (R9.2, ruling 14)", () => {
  const clients = parseClientList(inventedVisit.clientList).entries;
  const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
  const ctx = { mask: outgoing.mask, clients, policy: DEFAULT_POLICY };
  const tagOf = (clientName: string) => {
    const id = clients.find((c) => c.fullName === clientName)!.id;
    return Object.entries(outgoing.mask.clientByTag).find(([, v]) => v === id)![0];
  };

  it("puts tags into description and why as it does for who", () => {
    const reply: SecondReaderOutput = {
      guesses: [
        {
          who: "MARIA OKONKWO-REYES",
          description: "MARIA OKONKWO-REYES, a tenant",
          why: "a neighbour called Brandvald offered to help",
          kind: "name",
          evidence: ["Mould in the back bedroom"],
        },
      ],
    };
    const r = redactReply(reply, ctx);
    const g = r.guesses[0]!;
    expect(g.who).toBe(tagOf("Maria Okonkwo-Reyes"));
    expect(g.description).toBe(`${tagOf("Maria Okonkwo-Reyes")}, a tenant`);
    expect(g.why).toBe(`a neighbour called ${tagOf("Tomas Brandvold")} offered to help`);
    expect(g.kind).toBe("name");
    expect(JSON.stringify(r.guesses)).not.toMatch(/okonkwo|brandvald/i);
  });

  it("gives one person one tag across who, description and why", () => {
    const r = redactReply(
      { guesses: [{ who: "Tomas Brandvold", description: "TOMAS BRANDVOLD", why: "tomas brandvold is named", kind: "name", evidence: [] }] },
      ctx,
    );
    const g = r.guesses[0]!;
    expect(g.who).toBe(tagOf("Tomas Brandvold"));
    expect(g.description).toBe(g.who);
    expect(g.why).toBe(`${g.who} is named`);
  });

  it("leaves an absent description absent", () => {
    const r = redactReply({ guesses: [{ who: "a tenant", evidence: [] }] }, ctx);
    expect(r.guesses[0]!.description ?? "").toBe("");
  });
});

describe("the flow carries the new fields past keepEvidence (R9.1, R9.4)", () => {
  it("keeps description, why and kind, redacted, and drops quotes that are not in the text", async () => {
    const clients = parseClientList(inventedVisit.clientList).entries;
    const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const reply: SecondReaderOutput = {
      guesses: [
        {
          who: "a tenant",
          description: "MARIA OKONKWO-REYES, in the ground-floor flat",
          why: "the mould is in her bedroom",
          kind: "place",
          evidence: ["Mould in the back bedroom", "words that are not in the text"],
        },
      ],
    };
    const job = { mode: "ONLY_IN_CLOUD" as const, run: async () => ({ value: reply, inferenceSource: "IN_CLOUD" as const, connected: true }) };
    const { askSecondReader, prepareSecondReader } = await import("../../src/secondReader/flow");
    const { makeLedger } = await import("../../src/egress/ledger");
    const out = await askSecondReader(prepareSecondReader(outgoing), { reader: job, ledger: makeLedger(), clients, policy: DEFAULT_POLICY });
    expect(out.status).toBe("answered");
    if (out.status !== "answered") return;
    const g = out.result.guesses[0]!;
    expect(g.description).toMatch(/^\[Person \d+\], in the ground-floor flat$/);
    expect(g.why).toBe("the mould is in her bedroom");
    expect(g.kind).toBe("place");
    expect(g.evidence).toEqual(["Mould in the back bedroom"]);
  });
});

describe("the panel (R9.3, R9.4)", () => {
  const pass = { left: false, host: "", model: "", modelRequests: 0, modelBytes: 0, requests: 0, bytes: 0, sha256: "", at: "", read: "" };
  function panel(guesses: Guess[]) {
    const state = emptyState({ record: inventedVisit.preparedRecord });
    const s = {
      ...state,
      reader: {
        pending: false,
        asking: false,
        line: null,
        maskedQuotes: [],
        announce: "",
        result: { guesses, replaced: 0, allDropped: false, source: "IN_CLOUD", connected: true, pass } as never,
      },
    };
    return renderReaderPanel(s as never);
  }
  const shown: Guess = {
    who: "a tenant",
    description: "a woman on the ground floor",
    why: "the mould and the form point to one flat",
    kind: "place",
    evidence: ["back bedroom", "[Person 1]"],
  };

  it("shows Guess: <description> as the reader's guess", () => {
    const p = panel([shown]);
    expect(p.querySelector(".reader-who")?.textContent).toBe("Guess: a woman on the ground floor");
    expect(strings.secondReader.guessLabel).toBe("Guess");
    expect(p.querySelector("[data-guess]")?.getAttribute("aria-label") ?? "").toContain(strings.secondReader.guessAria);
  });

  it("falls back to who when the description is empty", () => {
    const p = panel([{ who: "a tenant", evidence: ["back bedroom"] }]);
    expect(p.querySelector(".reader-who")?.textContent).toBe("Guess: a tenant");
    expect(p.querySelector("[data-reader-why]")).toBeNull();
  });

  it("shows the why line and the kind of clue", () => {
    const p = panel([shown]);
    expect(p.querySelector("[data-reader-why]")?.textContent).toContain("the mould and the form point to one flat");
    expect(p.querySelector("[data-reader-kind]")?.textContent).toContain("place");
  });

  it("makes each quote with maskable words a press-to-mask chip, and a tag a plain span", () => {
    const p = panel([shown]);
    const chip = p.querySelector('button[data-quote="back bedroom"]');
    expect(chip).not.toBeNull();
    expect(chip!.getAttribute("data-chip")).toBe("proposed");
    expect(p.querySelector('span[data-quote="[Person 1]"]')).not.toBeNull();
    expect(p.querySelector('button[data-quote="[Person 1]"]')).toBeNull();
  });

  it("does not show a guess whose quotes are all tags, and says how many were hidden", () => {
    const tagOnly: Guess = { who: "[Person 1]", description: "the tenant", why: "named", kind: "name", evidence: ["[Person 1]", "[Person 2] offered"] };
    const onlyTags: Guess = { who: "x", description: "second tenant", why: "named", kind: "name", evidence: ["[Person 2]"] };
    const p = panel([shown, { ...onlyTags, evidence: ["[Person 1]"] }, { ...onlyTags, evidence: ["[Person 2]", "[Person 3]"] }]);
    expect(p.querySelectorAll("[data-guess]")).toHaveLength(1);
    expect(p.querySelector("[data-reader-hidden]")?.textContent).toBe(
      strings.secondReader.hiddenTagOnly.replace("{n}", "2"),
    );
    // a quote of tags and words is not tag-only
    const q = panel([tagOnly]);
    expect(q.querySelectorAll("[data-guess]")).toHaveLength(1);
    expect(q.querySelector("[data-reader-hidden]")).toBeNull();
  });

  it("says one guess in the singular", () => {
    const p = panel([shown, { who: "x", description: "d", why: "w", kind: "name", evidence: ["[Person 1]"] }]);
    expect(p.querySelector("[data-reader-hidden]")?.textContent).toBe(strings.secondReader.hiddenTagOnlyOne);
  });

  it("shows a guess with no quote at all, as before", () => {
    const p = panel([{ who: "a tenant", description: "a tenant", why: "", kind: "other", evidence: [] }]);
    expect(p.querySelectorAll("[data-guess]")).toHaveLength(1);
    expect(p.querySelector("[data-reader-hidden]")).toBeNull();
  });

  it("the new words are in the string table without a digit", () => {
    const s = strings.secondReader;
    for (const w of [s.hiddenTagOnly, s.hiddenTagOnlyOne, s.whyLabel, s.kindLabel, s.guessAria]) expect(w.replace("{n}", "")).not.toMatch(/\d/);
    expect(s.hiddenTagOnlyOne).not.toContain("{n}");
  });
});
