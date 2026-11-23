// Drafting task 2 (R1.1, R2.1, R2.2): the outgoing text is built from the masked
// record only, and the text shown is the text the job is given.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing, recordBlock } from "../../src/drafting/buildOutgoing";
import { makeLedger } from "../../src/egress/ledger";
import { makePreview, send } from "../../src/egress/send";
import type { DraftInput } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const values = {
  listedNames: outgoing.mask.listedNames,
  surfaceForms: outgoing.mask.surfaceForms,
  sentOnPurpose: outgoing.mask.sentOnPurpose,
};

describe("the draft job input (R1.1)", () => {
  it("has the text and nothing else", () => {
    const keys: Record<keyof DraftInput, true> = { text: true };
    expect(Object.keys(keys)).toEqual(["text"]);
  });

  it("is built from the masked record: no listed name, no map, no surface form", () => {
    for (const name of outgoing.mask.listedNames) {
      for (const part of name.split(/[\s-]+/).filter((p) => p.length >= 3)) {
        expect(outgoing.text, part).not.toMatch(new RegExp(`\\b${part.replace(/[^\p{L}\p{N}]/gu, "")}\\b`, "iu"));
      }
    }
    for (const form of outgoing.mask.surfaceForms) expect(outgoing.text.toLowerCase()).not.toContain(form.toLowerCase());
    expect(outgoing.text).not.toMatch(/they\/them|she\/her|he\/him/);
    expect(outgoing.text).not.toContain(inventedVisit.note.split("\n")[0]!);
  });

  it("does not export a way to pass the mask map into the text", async () => {
    const mod = await import("../../src/drafting/buildOutgoing");
    expect(Object.keys(mod).sort()).toEqual(["INSTRUCTIONS", "RELEASE_18_INSTRUCTION_CHARS", "buildOutgoing", "recordBlock"]);
  });
});

describe("the text shown is the text the job is given (R2.2)", () => {
  it("is the same string, character for character", async () => {
    const preview = makePreview(outgoing.text, values);
    const seen: string[] = [];
    const out = await send(
      {
        preview,
        job: "draft",
        mode: "PREFER_IN_CLOUD",
        run: async (_t, text) => {
          seen.push(text);
          return { value: "ok", inferenceSource: "IN_CLOUD", connected: false };
        },
      },
      { ...values, ledger: makeLedger() },
    );
    expect(out.status).toBe("sent");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(outgoing.text);
    expect(seen[0]).toBe(preview.text);
    expect(seen[0]!.length).toBe(outgoing.text.length);
  });
});

describe("missed-visit Present: preservation with noteText", () => {
  const n002Note =
    "Missed appt 13/06. Client: Nicolas Ashworth.\nWent to Flat 23, Eddlecombe House, curtains shut, left a card.\nRebooked for Thursday.";
  const sparseMissedRecord = {
    visitDate: "13/06",
    present: [],
    seen: [],
    agreed: [],
    risks: [],
    nextSteps: ["Rebooked for Thursday.", "Text sent to confirm."],
  };

  it("emits no-household-member-present when record fields drop missed-visit words and never leaks noteText", () => {
    expect(recordBlock(sparseMissedRecord, n002Note)).toContain(
      "Present: no household member present (no answer / missed visit)",
    );
    const out = buildOutgoing({
      record: sparseMissedRecord,
      clients,
      policy: DEFAULT_POLICY,
      noteText: n002Note,
    });
    expect(out.maskedRecord).toContain("Present: no household member present (no answer / missed visit)");
    expect(out.text).not.toContain("curtains shut");
    expect(out.text).not.toContain("Eddlecombe");
  });

  it("does not force missed-visit Present: on an attended note whose fields mention an earlier miss", () => {
    const attendedRecord = {
      ...sparseMissedRecord,
      seen: ["Client missed an earlier clinic appointment."],
    };
    // H46: an empty Present renders as a sentence, never the bare label the cloud copied.
    expect(recordBlock(attendedRecord, inventedVisit.note)).toContain("No one was present.");
    expect(recordBlock(attendedRecord, inventedVisit.note)).not.toContain("Present: none");
  });

  it("preserves explicit non-worker attendees added manually by the user", () => {
    const editedRecord = {
      ...sparseMissedRecord,
      present: [{ label: "Nicolas Ashworth", role: "client" as const }],
    };
    expect(recordBlock(editedRecord, n002Note)).toContain("Present: Nicolas Ashworth");
  });

  it("omits the Visit date line when visitDate is blank or whitespace (H46: no label, no date words)", () => {
    const blankDateRecord = { ...sparseMissedRecord, visitDate: "" };
    const wsDateRecord = { ...sparseMissedRecord, visitDate: "   " };
    expect(recordBlock(blankDateRecord, n002Note)).toMatch(/^Present: no household member present/);
    expect(recordBlock(wsDateRecord, n002Note)).not.toContain("Visit date");
    const out = buildOutgoing({
      record: blankDateRecord,
      clients,
      policy: DEFAULT_POLICY,
      noteText: n002Note,
    });
    expect(out.maskedRecord).toMatch(/^Present: no household member present/);
    expect(out.text).not.toMatch(/^Visit date:/m);
  });
});
