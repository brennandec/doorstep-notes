import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { languageLine, looksNotEnglish } from "../../src/app/language";

describe("language line", () => {
  it("shows the line for an invented Welsh sentence", () => {
    const welsh = "Roedd y fflat yn oer iawn ac nid oedd y landlord wedi ateb ein negeseuon e-bost ers wythnos.";
    expect(looksNotEnglish(welsh)).toBe(true);
    expect(languageLine(welsh)).toBe("The device model may not read this language well.");
  });
  it("shows the line for text in another script", () => {
    expect(languageLine("Квартира холодная, хозяин не ответил на письма уже неделю.")).not.toBeNull();
  });
  it("shows nothing for the invented English note", () => {
    expect(languageLine(inventedVisit.note)).toBeNull();
  });
  it("shows nothing for an empty or very short text", () => {
    expect(languageLine("")).toBeNull();
    expect(languageLine("ok")).toBeNull();
  });
  it("shows nothing for short English shorthand", () => {
    expect(languageLine("Visit Mon. Form not sent. Ring landlord.")).toBeNull();
  });
});
