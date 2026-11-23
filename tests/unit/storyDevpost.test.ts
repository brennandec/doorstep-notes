// H21: docs/submission/STORY.md is the text written for the Devpost form.
// It checks structure, quoted lines, the Try it block, and that every number is in a results file.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLinks, renderTryBlock } from "../../scripts/writeReadme";

const story = readFileSync("docs/submission/STORY.md", "utf8");
const sources = readFileSync("docs/sources.md", "utf8");
const readme = readFileSync("README.md", "utf8");
const resultFiles = readdirSync("results").filter((f) => f.endsWith(".json"));
const resultsText = resultFiles.map((f) => readFileSync(`results/${f}`, "utf8")).join("\n");
const json = (name: string) => JSON.parse(readFileSync(`results/${name}`, "utf8"));

const sourceQuotes = sources.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("> ")).map((l) => l.slice(2));
const ovic = sourceQuotes.find((q) => q.startsWith("OVIC"))!;

/** The text a number is looked for in: no quoted lines, no addresses, no links block. */
const proseForNumbers = () =>
  story
    .split("\n")
    .filter((l) => !l.trim().startsWith(">"))
    .join("\n")
    .replace(/https?:\/\/\S+/g, "");

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const heading = (name: string) => story.split("\n").findIndex((l) => /^#{1,3} /.test(l) && l.toLowerCase().includes(name));

describe("STORY.md written for the form (H21)", () => {
  it("is not the internal draft: no draft header, no README tags, not marked unpublished", () => {
    expect(story).not.toMatch(/story draft/i);
    expect(story).not.toMatch(/draft for the submission form/i);
    expect(story).not.toMatch(/\(README[,)]/);
    expect(story).not.toMatch(/Each sentence names the README section/);
  });

  it("is at most 900 words", () => {
    expect(words(story)).toBeLessThanOrEqual(900);
  });

  it("opens on Dana and the employer rule, then the OVIC finding as quoted in docs/sources.md", () => {
    const dana = story.indexOf("Dana");
    const rule = story.search(/employer forbids/i);
    const quote = story.indexOf(ovic);
    expect(dana).toBeGreaterThan(-1);
    expect(rule).toBeGreaterThan(-1);
    expect(quote).toBeGreaterThan(-1);
    expect(dana).toBeLessThan(rule);
    expect(rule).toBeLessThan(quote);
    // Nothing but the title and the opening heading may come before Dana, and the lines between them are few (H27).
    const before = story.slice(0, story.indexOf("## Dana's evening")).split("\n");
    const opening = before.slice(1).filter((l) => l.trim());
    expect(opening.length).toBeGreaterThanOrEqual(1);
    expect(opening.length).toBeLessThanOrEqual(5);
    for (const l of opening) expect(l.startsWith("#")).toBe(false);
  });

  it("opens with the title and the judge lines, in this order (H27)", () => {
    const before = story.slice(0, story.indexOf("## Dana's evening")).split("\n").filter((l) => l.trim());
    expect(before).toEqual([
      "# Doorstep Notes",
      "Doorstep Notes masks a housing caseworker's client list on her own computer.",
      "Four modes, one per job: `ONLY_ON_DEVICE` structures the note and proposes masks in Gemini Nano; `PREFER_IN_CLOUD` drafts; `PREFER_ON_DEVICE` rewrites one sentence; `ONLY_IN_CLOUD` runs the second reader.",
      "Proof: `results/hybrid-run-2026-11-14-h20.json`, `results/second-reader-loop-2026-11-14.json`, `results/catch-rate.json`.",
    ]);
  });

  it("has a table of the five jobs: job, mode, what leaves the device, with the README's modes", () => {
    const rows = story.split("\n").filter((l) => l.trim().startsWith("|"));
    expect(rows[0]!.toLowerCase()).toMatch(/job.*mode.*leaves/);
    const body = rows.slice(2);
    expect(body).toHaveLength(5);
    for (const mode of ["ONLY_ON_DEVICE", "PREFER_IN_CLOUD", "PREFER_ON_DEVICE", "ONLY_IN_CLOUD"]) {
      expect(story).toContain(mode);
      expect(readme).toContain(mode);
    }
    expect(body.filter((r) => r.includes("ONLY_ON_DEVICE"))).toHaveLength(3);
    expect(body.filter((r) => /nothing/i.test(r))).toHaveLength(2);
  });

  it("explains the second reader with the recorded loop, and says what the file does not prove", () => {
    const at = heading("second reader");
    expect(at).toBeGreaterThan(-1);
    const loop = json("second-reader-loop-2026-11-14.json");
    const section = story.split("\n").slice(at).join("\n").split(/\n#{1,3} /)[0];
    expect(section).toContain(loop.maskedByHerBetweenPasses);
    expect(section).toMatch(/does not (prove|show)/i);
    expect(section).toMatch(/second-reader-loop-2026-11-14/);
    for (const q of loop.passes[1].guessesShown.flatMap((g: { quotes: string[] }) => g.quotes).slice(0, 1)) {
      expect(section).toContain(q);
    }
  });

  it("gives the figures with their limits, each equal to the value in its results file", () => {
    const c = json("catch-rate.json");
    const fmt = (n: number) => n.toLocaleString("en-US");
    expect(story).toContain(fmt(c.exactAndNear.caught));
    expect(story).toContain(fmt(c.merged.caught));
    expect(story).toContain(fmt(c.exactAndNear.total));
    expect(story).toContain(String(c.setSize));
    expect(story).toMatch(/in-sample/);
    expect(story).toMatch(/describing phrases/i);
    expect(story).toContain(`${c.device.byKind.phrase.caught} of ${c.device.byKind.phrase.total}`);
    const h = json("hybrid-run-2026-11-14-h20.json");
    expect(h.status).toBe("pass");
    expect(story).toMatch(/0 of 20 listed names/);
    expect(h.steps.find((s: { step: number }) => s.step === 5).extra.card.verdict).toMatch(/0 of 20/);
    expect(h.observed.requestsOutsideThePageWhileOffline).toBe(0);
    expect(story).toMatch(/0 requests/);
    expect(story).toContain(`${h.cloudCalls.generateContent} \`generateContent\``);
  });

  it("maps every number to a results file", () => {
    const tokens = proseForNumbers().match(/\d[\d,]*(?:\.\d+)*/g) ?? [];
    expect(tokens.length).toBeGreaterThan(5);
    const missing = tokens.map((t) => t.replace(/,/g, "")).filter((t) => !new RegExp(`(?<![\\d.])${t.replace(/\./g, "\\.")}(?![\\d])`).test(resultsText));
    expect(missing).toEqual([]);
  });

  it("has a Try it block: desktop Chrome, the invented visit, what works without the model, what the model needs", () => {
    const at = heading("try it");
    expect(at).toBeGreaterThan(-1);
    const section = story.split("\n").slice(at).join("\n").split(/\n#{1,3} /)[0];
    expect(section).toMatch(/desktop Google Chrome/);
    expect(section).toContain("Try an invented visit");
    expect(section).toMatch(/without the built-in model/i);
    expect(section).toMatch(/needs the built-in model|model needs/i);
    expect(section).toMatch(/downloaded/);
  });

  it("writes the link line from links.json, and writes nothing for a null", () => {
    const block = renderTryBlock(readLinks(process.cwd()));
    for (const line of block.split("\n").filter(Boolean)) expect(story).toContain(line);
    const links = readLinks(process.cwd());
    if (!links.film) expect(story).not.toMatch(/^- Film:/m);
    if (!links.hostedPage) expect(story).not.toMatch(/^- Hosted page:/m);
    expect(story).not.toMatch(/\bnull\b|\bTBD\b|coming soon/i);
  });

  it("names Gemini Nano only if docs/sources.md holds a dated Chrome-docs quote naming it", () => {
    const sourceNamesIt = /Gemini Nano/.test(sources);
    if (!sourceNamesIt) expect(story).not.toMatch(/Gemini Nano/i);
  });

  it("has What's next only from README Limits, as a short list", () => {
    const at = heading("what's next");
    if (at === -1) return;
    const section = story.split("\n").slice(at).join("\n").split(/\n#{1,3} /)[0] ?? "";
    const items = section.split("\n").filter((l) => l.startsWith("- "));
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(4);
    const limits = readme.slice(readme.indexOf("## Limits"), readme.indexOf("## Third-party notices"));
    expect(limits).toMatch(/Chrome on desktop only/);
    expect(section).toMatch(/Chrome/);
  });

  it("uses plain words: no banned words about the app, no emoji", () => {
    expect(story).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared)\b/i);
    expect(story).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(story).toMatch(/Unlisted details can still identify a person/);
  });
});
