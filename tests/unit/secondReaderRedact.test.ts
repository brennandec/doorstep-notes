// Second reader task 2 (R3, ruling 14): the reply is redacted before it is shown.
// Invented people only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import type { Guess, SecondReaderOutput } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { redactReply } from "../../src/secondReader/redact";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const ctx = { mask: outgoing.mask, clients, policy: DEFAULT_POLICY };

const tagOf = (clientName: string) => {
  const id = clients.find((c) => c.fullName === clientName)!.id;
  return Object.entries(outgoing.mask.clientByTag).find(([, v]) => v === id)![0];
};

/** The second fixture reply: an invented listed name in capitals and a near variant. For unit tests only. */
const LEAKY: SecondReaderOutput = {
  guesses: [
    { who: "MARIA OKONKWO-REYES, a tenant", evidence: ["Mould in the back bedroom"] },
    { who: "a neighbour called Brandvald", evidence: ["offered to help with the form"] },
  ],
};

describe("redactReply", () => {
  it("sets up the outgoing text so the listed people have tags", () => {
    expect(outgoing.text).not.toMatch(/Okonkwo/i);
    expect(tagOf("Maria Okonkwo-Reyes")).toMatch(/^\[Person \d+\]$/);
    expect(tagOf("Tomas Brandvold")).toMatch(/^\[Person \d+\]$/);
  });

  it("replaces a listed name written in capitals by its tag", () => {
    const r = redactReply(LEAKY, ctx);
    expect(r.guesses[0]!.who).toBe(`${tagOf("Maria Okonkwo-Reyes")}, a tenant`);
    expect(JSON.stringify(r.guesses)).not.toMatch(/okonkwo/i);
  });

  it("replaces a near variant of a listed name by its tag", () => {
    const r = redactReply(LEAKY, ctx);
    expect(r.guesses[1]!.who).toBe(`a neighbour called ${tagOf("Tomas Brandvold")}`);
    expect(JSON.stringify(r.guesses)).not.toMatch(/brandvald/i);
  });

  it("replaces a recorded surface form that is not on the list", () => {
    const record = { ...inventedVisit.preparedRecord, seen: ["Mould in the back bedroom.", "Neighbour Orla Pennant called in."] };
    const out = buildOutgoing({ record, clients, policy: DEFAULT_POLICY, extraMasked: ["Orla Pennant"] });
    expect(out.mask.surfaceForms).toContain("Orla Pennant");
    const tag = Object.entries(out.mask.map).find(([, v]) => v === "Orla Pennant")![0];
    const r = redactReply(
      { guesses: [{ who: "ORLA PENNANT next door", evidence: ["Neighbour Orla Pennant called in."] }] },
      { mask: out.mask, clients, policy: DEFAULT_POLICY },
    );
    expect(r.guesses[0]!.who).toBe(`${tag} next door`);
    expect(r.guesses[0]!.evidence[0]).toBe(`Neighbour ${tag} called in.`);
    expect(r.replaced).toBe(2);
  });

  it("gives one tag to one person across every field", () => {
    const r = redactReply(
      { guesses: [{ who: "Maria Okonkwo-Reyes", evidence: ["MARIA OKONKWO-REYES", "Maria O-R"] }] },
      ctx,
    );
    const tag = tagOf("Maria Okonkwo-Reyes");
    expect(r.guesses[0]).toEqual({ who: tag, evidence: [tag, tag] });
  });

  it("counts the replacements", () => {
    expect(redactReply(LEAKY, ctx).replaced).toBe(2);
  });

  it("gives a listed person who has no tag in the sent text a new tag, not an existing one", () => {
    const r = redactReply({ guesses: [{ who: "Priya Halloran", evidence: [] }] }, ctx);
    const used = Object.keys(outgoing.mask.map);
    expect(r.guesses[0]!.who).toMatch(/^\[Person \d+\]$/);
    expect(used).not.toContain(r.guesses[0]!.who);
    expect(r.replaced).toBe(1);
  });

  it("leaves a reply with no listed name as it is, and counts none", () => {
    const clean: SecondReaderOutput = {
      guesses: [{ who: "a tenant in a ground-floor flat", evidence: ["Mould in the back bedroom"] }],
    };
    const r = redactReply(clean, ctx);
    expect(r.guesses).toEqual(clean.guesses);
    expect(r.replaced).toBe(0);
  });

  it("leaves a tag the reader wrote as it is", () => {
    const tag = tagOf("Maria Okonkwo-Reyes");
    const r = redactReply({ guesses: [{ who: `${tag} in the flat`, evidence: [tag] }] }, ctx);
    expect(r.guesses[0]).toEqual({ who: `${tag} in the flat`, evidence: [tag] });
    expect(r.replaced).toBe(0);
  });

  it("does not change the reply it was given", () => {
    const before = JSON.stringify(LEAKY);
    redactReply(LEAKY, ctx);
    expect(JSON.stringify(LEAKY)).toBe(before);
  });

  it("keeps the number of guesses and quotes", () => {
    const r = redactReply(LEAKY, ctx);
    expect(r.guesses.map((g: Guess) => g.evidence.length)).toEqual([1, 1]);
  });

  it("has the line for a replaced name in the string table", () => {
    expect(strings.secondReader.redacted).toBe("The reader produced a name from your list. It is shown as its tag.");
  });

  it("imports nothing from storage, so the raw reply cannot be written (R3.3)", () => {
    const source = readFileSync("src/secondReader/redact.ts", "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
    expect(imports.filter((i) => /storage|ledger|indexedDB/i.test(i))).toEqual([]);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
