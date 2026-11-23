// Capture-and-record task 30 (third review, X4 and Y3): day first when the note shows it.
import { describe, expect, it } from "vitest";
import { dayFirstEvidence, readNoteDate } from "../../src/record/noteDate";

const NOW = new Date(2026, 10, 13, 9, 0, 0); // 2026-11-13
const read = (words: string, locale: string, note?: string) => readNoteDate(words, { locale, now: () => NOW, ...(note !== undefined ? { note } : {}) });

describe("dayFirstEvidence", () => {
  it("is true for a numeric date whose first number is above 12 and second is a month", () => {
    expect(dayFirstEvidence("Next: revisit 26/11.")).toBe(true);
    expect(dayFirstEvidence("seen 13.05.26")).toBe(true);
    expect(dayFirstEvidence("on 31-12")).toBe(true);
  });
  it("is false when no date has a first number above 12", () => {
    expect(dayFirstEvidence("12/11 home visit, DOB 3/3/87")).toBe(false);
    expect(dayFirstEvidence("")).toBe(false);
  });
  it("is not given by a time, a house number or a date whose second number is not a month", () => {
    expect(dayFirstEvidence("arrived 14.30")).toBe(false);
    expect(dayFirstEvidence("at 14:00, flat 3, 14 Alder Court")).toBe(false);
    expect(dayFirstEvidence("11/26")).toBe(false);
  });
});

describe("readNoteDate with the note (Y3)", () => {
  const note = "12/11 home visit. Revisit 26/11.";
  it("reads 12/11 as 12 November in a month-first locale when the note also holds 26/11", () => {
    expect(read("12/11", "en-US", note)).toMatchObject({ day: 12, month: 11, year: 2026, yearAssumed: true });
  });
  it("reads 12/11 as 12 November in a day-first locale too", () => {
    expect(read("12/11", "en-GB", note)).toMatchObject({ day: 12, month: 11, year: 2026 });
  });
  it("alone, 12/11 follows the locale", () => {
    expect(read("12/11", "en-US", "12/11 home visit.")).toMatchObject({ day: 11, month: 12 });
    expect(read("12/11", "en-GB", "12/11 home visit.")).toMatchObject({ day: 12, month: 11 });
    expect(read("12/11", "en-US")).toMatchObject({ day: 11, month: 12 });
  });
  it("marks a reading whose order came from the note as an inference", () => {
    expect(read("12/11", "en-US", note)).toMatchObject({ orderFromNote: true, orderAssumed: false });
    expect(read("12/11", "en-US", "12/11 only")).toMatchObject({ orderFromNote: false, orderAssumed: true });
  });
  it("does not change a date that is not ambiguous", () => {
    expect(read("26/11", "en-US", note)).toMatchObject({ day: 26, month: 11, orderFromNote: false });
    expect(read("12 November", "en-US", note)).toMatchObject({ day: 12, month: 11 });
  });
  it("applies to every date in the note, so 3/4 is 3 April when the note shows day first", () => {
    expect(read("3/4", "en-US", "Visit 3/4. Revisit 26/11.")).toMatchObject({ day: 3, month: 4 });
  });
  it("keeps equal numbers unmarked, as before", () => {
    expect(read("3/3", "en-US", note)).toMatchObject({ day: 3, month: 3, orderFromNote: false });
  });
});
