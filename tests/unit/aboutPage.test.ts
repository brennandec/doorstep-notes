// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aboutFacts } from "../../src/app/aboutFacts";
import { renderAbout } from "../../src/app/aboutPage";
import { flattenStrings, strings } from "../../src/app/strings";

describe("WO-08 /about", () => {
  it("keeps digits out of the string table and fills them from the pins", () => {
    expect(flattenStrings(strings.about).join("\n")).not.toMatch(/\d/);
    const rate = JSON.parse(readFileSync("results/catch-rate.json", "utf8")) as {
      setSize: number;
      exactAndNear: { caught: number; total: number };
      merged: { n: number; caught: number; total: number; browser: string; date: string };
    };
    expect(aboutFacts.notes).toBe(String(rate.setSize));
    expect(aboutFacts.notes).toBe(String(rate.merged.n));
    expect(aboutFacts.listCaught).toBe(String(rate.exactAndNear.caught));
    expect(Number(aboutFacts.total.replace(/,/g, ""))).toBe(rate.exactAndNear.total);
    expect(Number(aboutFacts.modelCaught.replace(/,/g, ""))).toBe(rate.merged.caught);
    expect(rate.merged.browser).toContain(aboutFacts.browser);
    expect(rate.merged.date.startsWith(aboutFacts.when)).toBe(true);
    const facts = readFileSync("docs/sdk-facts.md", "utf8");
    expect(facts).toContain(`version ${aboutFacts.version} or higher`);
    expect(facts).toContain(`${aboutFacts.freeGb} GB free`);
    expect(facts).toContain(`more than ${aboutFacts.vramGb} GB VRAM`);
    expect(facts).toContain(`${aboutFacts.ramGb} GB RAM`);
  });

  it("shows the six agency sections and does not invent a contact", () => {
    const root = document.createElement("div");
    renderAbout(root);
    const text = root.textContent ?? "";
    expect(document.title).toBe(strings.about.title);
    expect(text).toContain(strings.about.agency);
    for (const heading of [strings.about.computers, strings.about.switchTitle, strings.about.keeps, strings.about.without, strings.about.leaves, strings.about.claims]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("version 139 or later");
    expect(text).toContain("found 509 of 1,141");
    expect(text).toContain("1,032 of 1,141");
    expect(text).toContain("GenAILocalFoundationalModelSettings");
    expect(text).toMatch(/egress check/);
    expect(text).not.toMatch(/privacy notice|write to us|@/i);
    expect(root.querySelector("a.btn")?.getAttribute("href")).toBe("/");
  });
});
