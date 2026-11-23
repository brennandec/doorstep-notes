// @vitest-environment happy-dom
// egress-check task 19 and shell-and-offline task 36 (R9.3, R9.4, R21, U10): the words say what the code scans.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIN_NAME_PART_LENGTH, NEAR_MATCH_MIN_LETTERS } from "../../src/constants";
import { egressLine } from "../../src/app/parts/egressLine";
import { scannedSentence } from "../../src/app/scanned";
import { renderScreen } from "../../src/app/screen";
import { emptyState } from "../../src/app/state";
import { flattenStrings, strings } from "../../src/app/strings";
import { checkEgress } from "../../src/egress/check";
import { buildLines } from "../../src/egress/line";

const readme = readFileSync("README.md", "utf8");
const section = readme.slice(readme.indexOf("## What the egress check shows, and what it does not"), readme.indexOf("## Figures"));
const KEY_PHRASES = [
  "the address and the body of each request",
  "each listed name whole",
  "its other names",
  "its single parts of 3 letters or more",
  "5 letters or more is also found inside a longer word",
];

describe("the scanned sentence", () => {
  it("is built from the string table and the two constants", () => {
    expect(scannedSentence()).toBe(
      "Scanned: the address and the body of each request, each listed name whole, its other names, and its single parts of 3 letters or more. A listed value of 5 letters or more is also found inside a longer word.",
    );
    expect(scannedSentence()).toContain(`${MIN_NAME_PART_LENGTH} letters or more`);
    expect(scannedSentence()).toContain(`${NEAR_MATCH_MIN_LETTERS} letters or more is also found`);
    expect(strings.egress.scanned).not.toMatch(/\d/);
  });

  it("keeps its key phrases", () => {
    for (const p of KEY_PHRASES) expect(scannedSentence()).toContain(p);
  });
});

describe("on the page (R9.3)", () => {
  const passLines = buildLines({
    result: checkEgress({ captured: [{ url: "", body: new TextEncoder().encode("x") }], listedNames: ["Maria Okonkwo-Reyes"], surfaceForms: [], sentOnPurpose: [] }),
    connected: false,
  });
  const failLines = buildLines({
    result: checkEgress({ captured: [{ url: "", body: new TextEncoder().encode("Maria") }], listedNames: ["Maria Okonkwo-Reyes"], surfaceForms: [], sentOnPurpose: [] }),
    connected: true,
  });

  it("stands under the egress line before a send, after a pass and after a failure", () => {
    for (const lines of [null, passLines, failLines]) {
      const el = egressLine(lines);
      const scanned = el.querySelector("[data-egress-scanned]")!;
      expect(scanned.textContent).toBe(scannedSentence());
      // Fourth review K6 (shell-and-offline task 59): the words stand behind the closed fold
      // "What this check scans", which is the last child of the egress line, so the egress line
      // stays the last child of zone 2.
      expect(scanned.parentElement).toBe(el.lastElementChild);
      expect(el.lastElementChild?.tagName).toBe("DETAILS");
    }
  });

  it("leaves the egress line as the last child of zone 2", () => {
    const root = document.createElement("div");
    root.append(...renderScreen(emptyState({ egressLines: passLines }), { onNoteInput() {}, onListInput() {}, onTryExample() {}, onRemoveExample() {}, onGetModel() {}, onMakeRecord() {} }));
    const zone = root.querySelector('[data-zone="leaves"]')!;
    expect(zone.lastElementChild!.hasAttribute("data-egress-line")).toBe(true);
    expect(zone.lastElementChild!.textContent).toContain("Scanned:");
  });

  // Rewritten by egress-check task 27 (fifth review N1): the paragraph sentences of R5 became the card of R14.
  it("keeps the standing sentence and the waiting line, and holds the card strings of R14", () => {
    const e = strings.egress;
    expect(e.standing).toBe("This checks listed names and masked values only. Other details in the text can still identify a person.");
    expect(strings.egressWaiting).toBe("The egress check runs before anything is sent. It covers listed names only.");
    expect(e.verdictPass).toBe("No listed name left this device: {n} of {m}.");
    expect(e.verdictFail).toBe("Egress check failed. Found {n} of {m} listed names: {names}.");
    expect(e.nearVariants).toBe("Near variants that were not masked are not checked.");
    expect(e.rowMasked).toBe("Masked values in the text sent");
    expect(e.rowRequest).toBe("The request");
    expect(e.rowParts).toBe("Single name parts of {min} letters or more");
  });

  it("has no emoji, banned word or digit in the new strings", () => {
    for (const t of flattenStrings(strings.egress.scanned)) {
      expect(t).not.toMatch(/\d/);
      expect(t).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared)\b/i);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe("in the README (R9.4, R21.1)", () => {
  it("holds the same sentence as the page, word for word", () => {
    expect(section).toContain(scannedSentence());
  });

  it("holds the key phrases, the word 'address' and the two numbers from the constants", () => {
    for (const p of KEY_PHRASES) expect(section).toContain(p);
    expect(section).toContain("address");
    expect(section).toContain(`${MIN_NAME_PART_LENGTH} letters`);
    expect(section).toContain(`${NEAR_MATCH_MIN_LETTERS} letters`);
    expect(section).toContain("MIN_NAME_PART_LENGTH");
    expect(section).toContain("NEAR_MATCH_MIN_LETTERS");
  });

  it("no longer says that it scans the request body only", () => {
    expect(section).not.toMatch(/bytes of the request body/);
    expect(section).not.toMatch(/scans the request body\b/);
  });

  it("says that case is ignored with Unicode case folding and that a short value must be a whole word", () => {
    expect(section).toMatch(/Unicode case folding/);
    expect(section).toMatch(/must stand as a whole word/);
  });

  it("says the ledger is kept on this device and has no save control (H20 R2.4, replaces R21.3)", () => {
    expect(readme).not.toContain(`"${["Save", " ledger"].join("")}" is on the screen`);
    expect(readme).not.toMatch(/The page has no control that saves them to the cloud/);
    expect(readme).toContain('closed fold "Egress ledger (N entries)"');
  });
});
