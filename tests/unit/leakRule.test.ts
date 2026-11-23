// H16 task 2: what the raw-line rule of the device checks catches. A line of the raw note found in a request
// counts as a leak only when that raw line still carries a listed name, another name of a listed person, a name
// part, a surface form or a masked original. The remainder of a line whose names were masked
// ("my list) offered to help with the form.") carries none of them and is not a leak. The name checks themselves
// are unchanged. Invented people only.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { lineCarriesValue, noteLinesLeaked, valueInText } from "../e2e/device/leakRule";

const NOTE_LINES = inventedVisit.note.split("\n").map((l) => l.trim()).filter((l) => l.length >= 12);
const SENSITIVE = [
  "Maria Okonkwo-Reyes", "Tomas Brandvold", "Maria O-R", "Mari", "Tom",
  "Maria", "Okonkwo-Reyes", "Tomas", "Brandvold", "Brandvald", "Bea", "3/3/87", "14 Alder Court", "Alder Court",
];

describe("valueInText", () => {
  it("finds a value of five letters or more inside a longer word, folded for case", () => {
    expect(valueInText("see MARIAS form", "Maria")).toBe(true);
  });
  it("needs a value under five letters to stand as a whole word", () => {
    expect(valueInText("Tomorrow I ring", "Tom")).toBe(false);
    expect(valueInText("Tom rings", "Tom")).toBe(true);
  });
});

describe("the raw-line rule", () => {
  it("does not flag the remainder of a line whose name was masked", () => {
    const wire = ["Tomorrow: [Person 2] (neighbour, also on my list) offered to help with the form. Risk: rent arrears."];
    expect(noteLinesLeaked(wire, NOTE_LINES, SENSITIVE)).toEqual([]);
  });

  it("flags a raw line that still carries a listed name", () => {
    const wire = ["Agreed: I ring landlord Mon. Maria posts form Fri. Tomas Brandvald (neighbour, also on"];
    expect(noteLinesLeaked(wire, NOTE_LINES, SENSITIVE)).toEqual([NOTE_LINES[3]]);
  });

  it("flags a raw line that carries an original that should have been masked", () => {
    const wire = ["14:00, flat 3, 14 Alder Court. [Person 1] in, sister Bea there too."];
    // the whole line is not in the wire, but the line below is
    expect(noteLinesLeaked(["Maria missed the benefits form deadline last wk, letter on the table. DOB on form 3/3/87."], NOTE_LINES, SENSITIVE))
      .toEqual([NOTE_LINES[2]]);
    expect(noteLinesLeaked(wire, NOTE_LINES, SENSITIVE)).toEqual([]);
  });

  it("flags a raw line whose only sensitive word is a near variant of a list name", () => {
    const line = "Tomas Brandvald offered to help with the form on Friday.";
    expect(noteLinesLeaked([line], [line], SENSITIVE)).toEqual([line]);
  });

  it("does not flag a raw line with no name in it, even word for word (the name checks are the check)", () => {
    const wire = [NOTE_LINES[1]!];
    expect(lineCarriesValue(NOTE_LINES[1]!, SENSITIVE)).toBe(false);
    expect(noteLinesLeaked(wire, NOTE_LINES, SENSITIVE)).toEqual([]);
  });

  it("finds the fragment of the recorded run in the note and shows it carries no value", () => {
    const fragment = "my list) offered to help with the form.";
    expect(NOTE_LINES).toContain(fragment);
    expect(valueInText(NOTE_LINES.join(" "), fragment)).toBe(true);
    expect(lineCarriesValue(fragment, SENSITIVE)).toBe(false);
    // The old rule (any raw line of 12 characters or more found in a request) would have flagged this wire.
    const wire = "Tomorrow: [Person 2] (neighbour, also on my list) offered to help with the form.";
    expect(valueInText(wire, fragment)).toBe(true);
    expect(noteLinesLeaked([wire], NOTE_LINES, SENSITIVE)).toEqual([]);
  });
});
