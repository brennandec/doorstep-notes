import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const story = readFileSync("docs/submission/STORY.md", "utf8");
const readme = readFileSync("README.md", "utf8");

const count = (text: string, part: string): number => text.split(part).length - 1;

describe("text order (H27b)", () => {
  it("STORY.md holds the short split paragraph once and not the old first sentence", () => {
    const paragraph =
      "Drafts and rewrites use gemini-3.5-flash-lite in the cloud, the second reader uses gemini-3.8-flash, and App Check is on for cloud calls.";
    expect(count(story, paragraph)).toBe(1);
    expect(story).not.toContain("Every job goes through Firebase AI Logic hybrid inference.");
  });

  it("STORY.md names the App Check exchange once", () => {
    expect(count(story, "and one App Check exchange")).toBe(1);
  });

  it("README.md states the calls, the exchange and the cap once", () => {
    expect(
      count(readme, "The run made 3 generateContent calls and one App Check exchange; the cap on model calls was 4."),
    ).toBe(1);
  });
});
