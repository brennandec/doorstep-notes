// @vitest-environment happy-dom
// A fixed date flag on the text that would leave. No model call.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { recordBlock } from "../../src/drafting/buildOutgoing";
import { BIRTH_DATE_WHAT, FULL_DATE_WHAT, dateFlag } from "../../src/record/noteDate";
import { DATE_FLAG_END, DATE_FLAG_START, renderDateFlagBlock } from "../../scripts/writeReadme";

const handlers = (over: Partial<Handlers> = {}): Handlers => ({
  onNoteInput: vi.fn(),
  onListInput: vi.fn(),
  onTryExample: vi.fn(),
  onRemoveExample: vi.fn(),
  onGetModel: vi.fn(),
  onMakeRecord: vi.fn(),
  ...over,
});

describe("date flag, year-carrying forms", () => {
  const forms = ["3/3/87", "03/03/1987", "3-3-87", "3.3.87", "1987-03-03", "3 March 1987", "3rd March 1987", "March 3, 1987", "3 Mar 87"];
  for (const form of forms) {
    it(`flags ${form} as a full date`, () => {
      const hit = dateFlag(`Letter dated ${form}.`);
      expect(hit?.phrase).toBe(form);
      expect(hit?.what).toBe(FULL_DATE_WHAT);
    });
  }
});

describe("date flag, a sentence that names a birth", () => {
  const rows: [string, string][] = [
    ["DOB on form 3/3/87.", "3/3/87"],
    ["D.O.B. 26/11.", "26/11"],
    ["The date of birth is 12/11.", "12/11"],
    ["She was born on 3 March.", "3 March"],
    ["Her birthday is 1987.", "1987"],
    ["Born in 87.", "87"],
    ["DOB March 3, 1987.", "March 3, 1987"],
    ["Birthday 3-3.", "3-3"],
    ["date of birth 03/03/1987.", "03/03/1987"],
  ];
  for (const [text, phrase] of rows) {
    it(`flags ${phrase} in "${text}"`, () => {
      const hit = dateFlag(text);
      expect(hit?.phrase).toBe(phrase);
      expect(hit?.what).toBe(BIRTH_DATE_WHAT);
    });
  }
});

describe("date flag, forms that stay quiet", () => {
  const quiet = [
    "Visit date: 12/11.",
    "Next: revisit 26/11.",
    "Worker rings the landlord at 14:00.",
    "flat 3, 14 Alder Court.",
    "Landlord not replied to 2 emails.",
    "She was born at 14:00.",
    "Visit on 12/11. DOB is missing.",
    "will march on, sat down, in the sun.",
    "The building went up in 1987.",
    "DOB on page 12.",
    "born in flat 87.",
  ];
  for (const text of quiet) {
    it(`does not flag "${text}"`, () => {
      expect(dateFlag(text)).toBeNull();
    });
  }

  it("leaves 12/11 and 26/11 quiet on the example record, and flags the note's own birth line", () => {
    expect(dateFlag(recordBlock(inventedVisit.preparedRecord))).toBeNull();
    expect(dateFlag(inventedVisit.note)?.phrase).toBe("3/3/87");
    expect(dateFlag(inventedVisit.note)?.what).toBe(BIRTH_DATE_WHAT);
  });
});

describe("date flag on the screens", () => {
  it("shows the birth sentence on the masks step and masks the date", () => {
    const onMaskClue = vi.fn();
    const record = structuredClone(inventedVisit.preparedRecord);
    record.seen = ["DOB on form 3/3/87."];
    const root = document.createElement("div");
    root.append(...renderScreen(emptyState({ record, recordOpen: false, started: true, example: true }), handlers({ onMaskClue })));
    expect(root.textContent).toContain("A date of birth is still written out.");
    expect(root.textContent).not.toContain("Not sent");
    root.querySelector<HTMLButtonElement>("#mask-clue")!.click();
    expect(onMaskClue).toHaveBeenCalledWith("3/3/87");
  });

  it("shows the full-date sentence and does not block Send", () => {
    const onMaskClue = vi.fn();
    const root = document.createElement("div");
    root.append(
      ...renderScreen(
        emptyState({
          record: inventedVisit.preparedRecord,
          recordOpen: false,
          started: true,
          outgoingText: "Letter dated 3 March 1987.",
          network: "online",
        }),
        handlers({ onMaskClue }),
      ),
    );
    const send = root.querySelector("[data-send-step]");
    expect(send?.textContent).toContain("A full date is still written out.");
    expect(send?.textContent).not.toContain("Not sent");
    send?.querySelector<HTMLButtonElement>("#mask-clue")!.click();
    expect(onMaskClue).toHaveBeenCalledWith("3 March 1987");
  });
});

describe("date flag readme lines", () => {
  const readme = readFileSync("README.md", "utf8");
  const block = readme.slice(readme.indexOf(DATE_FLAG_START) + DATE_FLAG_START.length, readme.indexOf(DATE_FLAG_END)).trim();

  it("is the two generated lines, and names the limit", () => {
    expect(block).toBe(renderDateFlagBlock());
    expect(block.split("\n")).toHaveLength(2);
    expect(block.split("\n")[1]).toBe("A day and month alone is not flagged.");
    expect(block).not.toMatch(/\b(protects|safe|de-identif)/i);
  });
});
