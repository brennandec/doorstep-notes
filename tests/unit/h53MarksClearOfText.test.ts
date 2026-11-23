// tests/unit/h53MarksClearOfText.test.ts — H53. The rule the desk measured in the real state and the local build could
// not show: the "names put back on this device" mark is absolutely positioned at the card's top-right, so it sits OVER
// the note's first line. Measured 2026-11-20 on the real-cloud take at 1280: 13.0 CSS px of vertical overlap and 232.7
// horizontal, 40 of the badge's 81 rows over live text. This test fails on that layout and passes once the marks are in
// flow above the text, the way the test-double mark already is.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(process.cwd(), "src/app/styles/app.css"), "utf8");

/** The declarations of a rule whose selector list CONTAINS this selector, whitespace-normalised. */
const block = (selector: string): string | null => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // a rule may list several selectors; match the one asked for anywhere in the list before the brace
  const m = CSS.match(new RegExp(`(^|\\n)\\s*([^{}\\n]*${esc}[^{}\\n]*)\\{([^}]*)\\}`, "m"));
  const body = m?.[3];
  return body === undefined ? null : body.replace(/\s+/g, " ").trim();
};

describe("H53: the finished-note marks must not be positioned over the note's first line", () => {
  it("a real mark (.source-label.device / .cloud) is NOT absolutely positioned", () => {
    const device = block(".source-label.device") ?? "";
    const cloud = block(".source-label.cloud") ?? "";
    // The defect is on the ancestor rule that places every direct-child label over the card:
    const placed = block(".sheet > .source-label, .sheet > .source-labels")
      ?? block(".sheet > .source-label,.sheet > .source-labels")
      ?? block(".sheet > .source-label");
    expect(placed, "the rule that positions the marks over the card").not.toBeNull();
    expect(String(placed), "H53: an absolute mark at top:0.6rem covers the note's first line").not.toMatch(/position:\s*absolute/);
    // and neither mark may re-introduce absolute positioning on its own
    expect(device).not.toMatch(/position:\s*absolute/);
    expect(cloud).not.toMatch(/position:\s*absolute/);
  });

  it("the marks sit in the card's flow above the text, as the test-double mark already does", () => {
    const placed = block(".sheet > .source-label, .sheet > .source-labels")
      ?? block(".sheet > .source-label,.sheet > .source-labels")
      ?? block(".sheet > .source-label");
    expect(String(placed)).toMatch(/position:\s*static/);
    // a static mark needs the card to reserve its height, or it lands on the text anyway
    const card = block(".sheet:has(> .source-label.device)") ?? block(".sheet:has(> .source-labels)") ?? block(".sheet:has(> .source-label)");
    expect(card, "the card must reserve space for the marks").not.toBeNull();
    expect(String(card)).toMatch(/padding-top:\s*[\d.]+rem/);
  });

  it("the clearance is stated as a number the layout can be held to", () => {
    // the desk's bar: at least 14 CSS px between the marks and the first line of the note.
    // The gap is NOT the card's padding — it is the mark's margin-bottom plus the text's half-leading. Assuming a 16px
    // root is what let the first correction land at 12px: this app sets html { font-size: 18px }, so 0.5rem is 9px.
    const placed = block(".sheet > .source-label, .sheet > .source-labels")
      ?? block(".sheet > .source-label,.sheet > .source-labels")
      ?? block(".sheet > .source-label");
    const m = String(placed).match(/margin:\s*[\d.]+(?:rem|px)?\s+[\d.]+(?:rem|px)?\s+([\d.]+)(rem|px)?\s+auto/);
    expect(m, "a stated margin-bottom on the placed marks").not.toBeNull();
    const rootPx = Number((CSS.match(/html\s*\{[^}]*font-size:\s*(\d+)px/) ?? [])[1]);
    expect(rootPx, "the app's real root font-size, read from its own CSS").toBeGreaterThan(0);
    const unit = m![2] === "px" ? 1 : rootPx;
    const marginPx = Number(m![1]) * unit;
    // the note is 18px at line-height 1.5, so the first line carries 3px of half-leading above it
    const halfLeadingPx = (18 * 1.5 - 18) / 2;
    const gapPx = Math.round((marginPx + halfLeadingPx) * 10) / 10;
    expect(gapPx, `the real gap is ${gapPx}px (${marginPx}px margin + ${halfLeadingPx}px half-leading); the desk's floor is 14px`).toBeGreaterThanOrEqual(14);
  });
});
