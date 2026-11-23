import { describe, expect, it } from "vitest";
import { fold, foldWithMap, findWholeWords } from "../../src/masking/fold";

describe("case folding (masking task 3)", () => {
  it("folds MARIA and maria to the same text", () => {
    expect(fold("MARIA")).toBe(fold("maria"));
    expect(fold("Maria")).toBe("maria");
  });

  it("folds the letter ß and SS alike", () => {
    expect(fold("ß")).toBe(fold("SS"));
    expect(fold("Strauß")).toBe(fold("STRAUSS"));
  });

  it("keeps accented letters as written, so José is not Jose", () => {
    expect(fold("José")).toBe("josé");
    expect(fold("José")).not.toBe(fold("Jose"));
    expect(fold("JOSÉ")).toBe(fold("josé"));
  });

  it("treats composed and decomposed accents as the same text", () => {
    expect(fold("Jose\u0301")).toBe(fold("Jos\u00e9"));
  });

  it("maps every folded position back to the original text", () => {
    const f = foldWithMap("Strauß!");
    expect(f.text).toBe("strauss!");
    // both folded s of ß point at the one original ß
    expect(f.starts[5]).toBe(5);
    expect(f.starts[6]).toBe(5);
    expect(f.ends[6]).toBe(6);
    expect(f.starts[7]).toBe(6);
  });
});

describe("whole word search on folded text", () => {
  it("finds MARIA and maria in the original positions", () => {
    const text = "MARIA called. maria rang. Maria's keys.";
    const hits = findWholeWords(text, "Maria").map((h) => text.slice(h.start, h.end));
    expect(hits).toEqual(["MARIA", "maria", "Maria"]);
  });

  it("does not find a name inside a longer word", () => {
    expect(findWholeWords("Mariana and Amaria and Marias", "Maria")).toEqual([]);
  });

  it("finds a name next to punctuation and a hyphen", () => {
    const text = "(Maria) saw Maria-Jo, then Okonkwo-Reyes.";
    expect(findWholeWords(text, "Maria").map((h) => h.start)).toEqual([1, 12]);
    expect(findWholeWords(text, "Okonkwo-Reyes")).toHaveLength(1);
  });

  it("does not match half of an expanded letter", () => {
    expect(findWholeWords("Strauß", "S")).toEqual([]);
    expect(findWholeWords("Strauß", "strauss").map((h) => [h.start, h.end])).toEqual([[0, 6]]);
  });

  it("finds a name made of accented letters and next to one", () => {
    const text = "José and Joséphine and JOSÉ";
    expect(findWholeWords(text, "josé").map((h) => text.slice(h.start, h.end))).toEqual(["José", "JOSÉ"]);
  });

  it("returns nothing for an empty term", () => {
    expect(findWholeWords("anything", "")).toEqual([]);
  });
});
