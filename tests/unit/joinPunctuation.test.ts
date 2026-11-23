// H12 (drafting R15.6, masking R20): no doubled punctuation where items are joined,
// and a trailing full stop does not hide a weekday. Invented people only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { recordBlock } from "../../src/drafting/buildOutgoing";
import { isNotNeeded } from "../../src/masking/notNeeded";

describe("the record block joins items without a doubled stop (R15.6)", () => {
  it("drops one trailing full stop from an item when another item follows", () => {
    const text = recordBlock({ ...inventedVisit.preparedRecord, seen: ["Mould by the window.", "Letter about a form."] });
    expect(text).toContain("Seen: Mould by the window; Letter about a form.");
    expect(text).not.toMatch(/\.;/);
  });
  it("keeps the last item as written and a single item alone", () => {
    expect(recordBlock({ ...inventedVisit.preparedRecord, seen: ["One."] })).toContain("Seen: One.");
  });
  it("leaves no .; in the invented visit", () => {
    expect(recordBlock(inventedVisit.preparedRecord)).not.toMatch(/\.;/);
  });
});

describe("trailing punctuation before the not-needed lookup (masking R20.1)", () => {
  for (const w of ["Mon.", "Fri.", "Thurs.", "Tue,", "Wed;", "Sat.,"]) {
    it(`${w} is a weekday`, () => expect(isNotNeeded(w)).toBe(true));
  }
  it("does not change a date or a name", () => {
    expect(isNotNeeded("3/3/87")).toBe(false);
    expect(isNotNeeded("Bea.")).toBe(false);
    expect(isNotNeeded(".")).toBe(false);
  });
});

describe("what the rule drops from the recorded device false masks (masking R20.2)", () => {
  it("counts the strings that the added rule alone drops", () => {
    const misses = JSON.parse(readFileSync("results/misses.json", "utf8")) as { falseMasks: { device: { text: string }[] } };
    const texts = misses.falseMasks.device.map((m) => m.text);
    const stripped = (t: string) => t.trim().replace(/[.,;]+$/, "");
    // Before this rule none of them was dropped for its ending, so every string that ends in . , or ; and is dropped now is the rule's count.
    const droppedByRule = texts.filter((t) => stripped(t) !== t.trim() && isNotNeeded(t));
    console.log(`H12 COUNT: ${droppedByRule.length} of ${texts.length} device false-mask strings ${JSON.stringify(droppedByRule)}`);
    expect(texts.length).toBe(61);
  });
});
