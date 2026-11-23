// capture-and-record R12 (U1): the model never writes a date. Tasks 22 to 24 and 26.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { TASK_TEXT } from "../../src/inference/structure/structure.real";
import { VISIT_RECORD_SCHEMA } from "../../src/inference/structure/structure.schema";
import {
  dateTokens,
  firstDateWords,
  guardRecordDates,
  readNoteDate,
  unmarkedYears,
  withoutFlagged,
} from "../../src/record/noteDate";

const NOW = new Date(2026, 10, 13, 9, 0, 0); // 2026-11-13, local time
const rec = (over: Partial<typeof inventedVisit.preparedRecord> = {}) => ({ ...inventedVisit.preparedRecord, ...over });

describe("task 22: the date field is the note's words", () => {
  it("describes the field as the words as written, never converted or completed", () => {
    const d = VISIT_RECORD_SCHEMA.properties.visitDate;
    expect(d.type).toBe("string");
    expect(typeof d.description).toBe("string");
    expect(d.description).toMatch(/exactly as written/i);
    expect(d.description).toMatch(/never convert, complete or add a year or a month name/i);
  });

  it("tells the model not to change any date, weekday or relative day, in every field", () => {
    expect(TASK_TEXT).toMatch(/never change, convert or complete a date, a weekday or a relative day/i);
    for (const kept of ["12/11", "26/11", "Mon", "Fri", "tomorrow"]) expect(TASK_TEXT).toContain(kept);
    expect(TASK_TEXT).toMatch(/never add a year or a month name/i);
    expect(TASK_TEXT).toMatch(/JSON/);
  });

  it("does not accept a reply of 2023-12-11 for the note 12/11 as the date", () => {
    const g = guardRecordDates(rec({ visitDate: "2023-12-11" }), inventedVisit.note);
    expect(g.record.visitDate).toBe("12/11");
    expect(g.replacedDate).toBe(true);
  });
});

describe("task 23: the date-token guard", () => {
  const table: [string, string][] = [
    ["12/11", "numeric with a slash"],
    ["12-11", "numeric with a dash"],
    ["12.11", "numeric with a dot"],
    ["12/11/2025", "numeric with a year"],
    ["2023-12-11", "ISO date"],
    ["2019", "four-digit year"],
    ["November", "month name"],
    ["Nov", "short month name"],
    ["Monday", "weekday"],
    ["Mon", "short weekday"],
    ["today", "relative day"],
    ["tomorrow", "relative day"],
    ["yesterday", "relative day"],
  ];
  for (const [token, kind] of table) {
    it(`finds a ${kind}: ${token}`, () => {
      expect(dateTokens(`Visit on ${token} was fine.`).map((t) => t.text)).toContain(token);
    });
  }

  it("finds nothing in a plain sentence, and not a time or a word that only sounds like a month", () => {
    expect(dateTokens("Worker rings the landlord at 14:00 and will march on, sat down, in the sun.").map((t) => t.text)).toEqual([]);
  });

  it("replaces a bad date field with the first date words of the note, and says so", () => {
    const g = guardRecordDates(rec({ visitDate: "12 November 2023" }), inventedVisit.note);
    expect(g.record.visitDate).toBe("12/11");
    expect(g.replacedDate).toBe(true);
    expect(strings.date.deviceWroteDate).toBe("The device wrote a date that is not in your note. The words from your note are shown instead.");
  });

  it("leaves the date field empty when the note has no date words", () => {
    const g = guardRecordDates(rec({ visitDate: "2023-12-11" }), "Home visit, flat 3. Mould in the bedroom.");
    expect(g.record.visitDate).toBe("");
    expect(g.replacedDate).toBe(true);
  });

  it("keeps a date field that holds the note's own words", () => {
    const g = guardRecordDates(rec({ visitDate: "12/11" }), inventedVisit.note);
    expect(g.record.visitDate).toBe("12/11");
    expect(g.replacedDate).toBe(false);
    expect(g.flagged).toEqual([]);
  });

  it("marks a bad token in another field, and compares with case folding", () => {
    const g = guardRecordDates(rec({ visitDate: "12/11", nextSteps: ["Revisit on 27/11.", "Ring on MON."], agreed: ["Worker rings on Monday."] }), inventedVisit.note);
    expect(g.flagged).toEqual(["Monday", "27/11"]);
    // MON is in the note as Mon, folded.
    expect(g.flagged).not.toContain("MON");
  });

  it("leaves a flagged token out of the outgoing record while it is marked", () => {
    const record = rec({ nextSteps: ["Revisit on 27/11.", "Ring the landlord."] });
    const out = withoutFlagged(record, ["27/11"]);
    expect(out.nextSteps).toEqual(["Revisit on.", "Ring the landlord."]);
    expect(withoutFlagged(record, [])).toBe(record);
  });

  it("takes a month name with its day as the first date words", () => {
    expect(firstDateWords("Visit 12 November, then back.")).toBe("12 November");
    expect(firstDateWords("Visit on Monday 12/11.")).toBe("12/11");
    expect(firstDateWords("Nothing here")).toBe("");
  });
});

describe("task 24: readNoteDate", () => {
  const read = (words: string, locale: string) => readNoteDate(words, { locale, now: () => NOW });

  it("reads 12/11 as 12 November 2026 in en-GB, with an assumed year", () => {
    expect(read("12/11", "en-GB")).toMatchObject({ day: 12, month: 11, year: 2026, yearAssumed: true, orderAssumed: true });
  });
  it("reads 12/11 as 11 December 2026 in en-US", () => {
    expect(read("12/11", "en-US")).toMatchObject({ day: 11, month: 12, year: 2026, yearAssumed: true });
  });
  it("reads 26/11 as 26 November 2026 in both orders, because only one order is possible", () => {
    for (const locale of ["en-GB", "en-US"]) {
      expect(read("26/11", locale)).toMatchObject({ day: 26, month: 11, year: 2026, yearAssumed: true, orderAssumed: false });
    }
  });
  it("takes the year from the words and then does not assume it", () => {
    expect(read("12/11/2025", "en-GB")).toMatchObject({ day: 12, month: 11, year: 2025, yearAssumed: false });
  });
  it("gives no reading for a weekday or for words that are not a date", () => {
    expect(read("Mon", "en-GB")).toBeNull();
    expect(read("next week", "en-GB")).toBeNull();
    expect(read("", "en-GB")).toBeNull();
    expect(read("31/02", "en-GB")).toBeNull();
  });
  it("reads a month name, and an ISO date", () => {
    expect(read("12 November", "en-US")).toMatchObject({ day: 12, month: 11, year: 2026, yearAssumed: true, orderAssumed: false });
    expect(read("2025-03-04", "en-GB")).toMatchObject({ day: 4, month: 3, year: 2025, yearAssumed: false });
  });
  it("falls back to day first for a locale it cannot read", () => {
    expect(read("12/11", "not a locale!!")).toMatchObject({ day: 12, month: 11 });
  });
});

describe("task 26: the year audit helper", () => {
  it("finds a year that the note does not hold, on a line with no mark", () => {
    expect(unmarkedYears("Visit date: 2023-12-11", "12/11 home visit")).toEqual(["2023"]);
  });
  it("accepts a year the note holds", () => {
    expect(unmarkedYears("Seen: rent due in 2025", "rent due in 2025 per letter")).toEqual([]);
  });
  it("accepts a year on a line that says assumed, confirmed by you or set by you", () => {
    for (const mark of ["read as 12 November 2026, assumed", "read as 12 November 2026, confirmed by you", "set by you: 12 November 2026"]) {
      expect(unmarkedYears(mark, "12/11 home visit")).toEqual([]);
    }
  });
  it("looks line by line, so a mark on one line does not cover another", () => {
    expect(unmarkedYears("read as 12 November 2026, assumed\nVisit date: 2026-11-12", "12/11")).toEqual(["2026"]);
  });
});
