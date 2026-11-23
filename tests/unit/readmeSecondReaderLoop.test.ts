// Second-reader task 19 (R9.7): the README lines about the loop agree with the loop record.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILE = "results/second-reader-loop-2026-11-14.json";
const loop = JSON.parse(readFileSync(FILE, "utf8")) as {
  generateContentCalls: number;
  readerModelAsked: string;
  maskedByHerBetweenPasses: string;
  guessesQuotingThoseWordsInPass2: string[];
  passes: { status: number; model: string; guessesShown: { description: string; quotes: string[] }[]; maskedOnCard: { of: number } }[];
};
const readme = readFileSync("README.md", "utf8");

describe("the second reader loop record and the README", () => {
  it("the record has two passes, both 200, at most four calls, and no URL", () => {
    expect(loop.passes).toHaveLength(2);
    expect(loop.passes.map((p) => p.status)).toEqual([200, 200]);
    expect(loop.generateContentCalls).toBeLessThanOrEqual(4);
    expect(readFileSync(FILE, "utf8")).not.toMatch(/https?:\/\//);
  });

  it("the masked words are not quoted in pass 2, and the card count went up by one", () => {
    expect(loop.guessesQuotingThoseWordsInPass2).toEqual([]);
    const q = loop.maskedByHerBetweenPasses.toLowerCase();
    for (const g of loop.passes[1]!.guessesShown) for (const w of g.quotes) expect(w.toLowerCase()).not.toContain(q);
    expect(loop.passes[1]!.maskedOnCard.of).toBe(loop.passes[0]!.maskedOnCard.of + 1);
  });

  it("every guess shown has a description", () => {
    for (const p of loop.passes) for (const g of p.guessesShown) expect(g.description).not.toBe("");
  });

  it("the README names the file, the model and the count of masked values it records", () => {
    expect(readme).toContain(FILE);
    expect(readme).toContain(loop.readerModelAsked);
    const { of: a } = loop.passes[0]!.maskedOnCard;
    const { of: b } = loop.passes[1]!.maskedOnCard;
    expect(readme).toContain(`(${a} to ${b})`);
    expect(readme).toContain(`pressed the chip "${loop.maskedByHerBetweenPasses}"`);
    expect(readme).toContain("is not measured");
  });
});
