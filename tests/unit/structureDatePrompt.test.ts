// H20 R6: the device structure prompt follows the record's date rule and the schema: the note's own date words,
// never converted or completed.
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, buildCreateOptions } from "../../src/inference/structure/createOptions";
import { VISIT_RECORD_SCHEMA } from "../../src/inference/structure/structure.schema";

describe("the create options date instruction (H20 R6)", () => {
  it("does not ask for a converted date", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/YYYY|ISO|MM-DD/i);
    const sent = JSON.stringify(buildCreateOptions({ hasPhoto: false }));
    expect(sent).not.toMatch(/YYYY/);
  });

  it("asks for the date words as the note wrote them, never converted or completed, empty when absent", () => {
    expect(SYSTEM_PROMPT).toMatch(/visitDate \(the date words exactly as the note writes them/);
    expect(SYSTEM_PROMPT).toMatch(/never converted or completed/);
    expect(SYSTEM_PROMPT).toMatch(/no year/i);
    expect(SYSTEM_PROMPT).toMatch(/empty text if the note gives no date/);
  });

  it("agrees with the schema's own description of the field", () => {
    const description = String((VISIT_RECORD_SCHEMA as { properties: { visitDate: { description?: string } } }).properties.visitDate.description);
    expect(description).toMatch(/exactly as written/);
    expect(description).toMatch(/Never convert, complete or add a year or a month name/);
  });
});
