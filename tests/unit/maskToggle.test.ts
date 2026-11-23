import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { mergeProposals } from "../../src/masking/merge";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { clearPurpose, maskText, purposeQuestion, sendOnPurpose, toggleSpan } from "../../src/masking/toggle";
import type { MaskSpan } from "../../src/masking/types";

const clients = parseClientList(inventedVisit.clientList).entries;
const note = inventedVisit.note;
const start = (): MaskSpan[] => {
  const base = exactAndNear(note, clients, DEFAULT_POLICY);
  return applyMask(note, mergeProposals(note, base, [{ text: "Bea", kind: "name" }], DEFAULT_POLICY).spans, clients).spans;
};
const at = (spans: MaskSpan[], text: string) => spans.findIndex((s) => s.surfaceForm === text);

describe("toggle (masking tasks 10 and 13)", () => {
  it("accepts a proposed value and announces the tag in words", () => {
    const spans = start();
    const c = toggleSpan(spans, at(spans, "Bea"));
    expect(c.spans[at(spans, "Bea")]!.accepted).toBe(true);
    expect(c.announcement).toBe("Masked: Person 2");
  });

  it("unmasks a listed value everywhere it was written the same way, and announces the written text", () => {
    const spans = start();
    const c = toggleSpan(spans, at(spans, "Maria"));
    expect(c.announcement).toBe("Unmasked: Maria");
    expect(c.spans.filter((s) => s.surfaceForm === "Maria").map((s) => s.accepted)).toEqual([false, false]);
    expect(c.spans.find((s) => s.surfaceForm === "Maria O-R")!.accepted).toBe(true);
  });

  it("does not renumber tags when a chip is pressed", () => {
    const spans = start();
    const c = toggleSpan(spans, at(spans, "Bea"));
    expect(c.spans.map((s) => s.tag)).toEqual(spans.map((s) => s.tag));
  });

  it("does nothing for an index that does not exist", () => {
    const spans = start();
    expect(toggleSpan(spans, 99)).toEqual({ spans, announcement: "" });
  });
});

describe("mask a word by hand (masking R5.3)", () => {
  it("masks every occurrence of the same text as one manual value", () => {
    const text = "The Form came. Later the form went. Informal talk.";
    const c = maskText(text, [], "form");
    expect(c.spans.map((s) => [s.surfaceForm, s.kind, s.tag])).toEqual([
      ["Form", "manual", "[Detail 1]"],
      ["form", "manual", "[Detail 1]"],
    ]);
    expect(c.announcement).toBe("Masked: Detail 1");
  });

  it("accepts an existing proposal with the same range instead of adding a second span", () => {
    const spans = start();
    const c = maskText(note, spans, "Bea");
    expect(c.spans).toHaveLength(spans.length);
    expect(c.spans[at(spans, "Bea")]!.accepted).toBe(true);
  });

  it("skips an occurrence inside another mask", () => {
    const spans = start();
    const c = maskText(note, spans, "O-R");
    expect(c.spans).toEqual(spans);
    expect(c.announcement).toBe("");
  });

  it("does nothing for empty text or text not in the note", () => {
    const spans = start();
    expect(maskText(note, spans, "  ").spans).toBe(spans);
    expect(maskText(note, spans, "Zoltan").announcement).toBe("");
  });

  it("numbers a new manual value after the existing details", () => {
    const first = maskText(note, start(), "mould");
    const second = maskText(note, first.spans, "landlord");
    expect(second.announcement).toBe("Masked: Detail 2");
  });
});

describe("send on purpose (masking task 10, R7)", () => {
  it("asks a question that names the value", () => {
    const spans = start();
    const span = { ...spans[at(spans, "Maria O-R")]!, surfaceForm: "Maria Okonkwo-Reyes" };
    expect(purposeQuestion(span)).toBe("Send Maria Okonkwo-Reyes by name in the text that leaves?");
  });

  it("marks one value: unmasked, sentOnPurpose, others untouched", () => {
    const spans = start();
    const c = sendOnPurpose(spans, at(spans, "Maria O-R"));
    const target = c.spans[at(spans, "Maria O-R")]!;
    expect(target).toMatchObject({ accepted: false, sentOnPurpose: true });
    expect(c.spans.filter((s) => s.sentOnPurpose)).toHaveLength(1);
    expect(c.spans.find((s) => s.surfaceForm === "Maria")!.accepted).toBe(true);
    expect(c.announcement).toBe("Will be sent by name: Maria O-R");
  });

  it("puts the full name and the written form in the result's sentOnPurpose list", () => {
    const spans = start();
    const c = sendOnPurpose(spans, at(spans, "Maria O-R"));
    const r = applyMask(note, c.spans, clients);
    expect(r.sentOnPurpose).toEqual(["Maria Okonkwo-Reyes", "Maria O-R"]);
    expect(r.maskedText).toContain("Maria O-R in, sister Bea");
    expect(r.surfaceForms).not.toContain("Maria O-R");
  });

  it("is removed when the value is masked again", () => {
    const spans = start();
    const sent = sendOnPurpose(spans, at(spans, "Maria O-R"));
    const back = toggleSpan(sent.spans, at(spans, "Maria O-R"));
    expect(back.spans[at(spans, "Maria O-R")]).toMatchObject({ accepted: true, sentOnPurpose: false });
    expect(applyMask(note, back.spans, clients).sentOnPurpose).toEqual([]);
  });

  it("is removed for a new record", () => {
    const sent = sendOnPurpose(start(), 0);
    expect(clearPurpose(sent.spans).some((s) => s.sentOnPurpose)).toBe(false);
    const fresh = exactAndNear(note, clients, DEFAULT_POLICY);
    expect(fresh.some((s) => s.sentOnPurpose)).toBe(false);
  });

  it("is not offered for a proposed or manual value", () => {
    const spans = start();
    const c = sendOnPurpose(spans, at(spans, "Bea"));
    expect(c.spans).toBe(spans);
    expect(c.announcement).toBe("");
  });
});
