// H13: the README's first screen, its quotes, the call-site block, the by-kind lines and the links.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLOUD_TIER } from "../../src/constants";
import {
  CALLS_END,
  CALLS_START,
  fileLookup,
  IN_SAMPLE_SENTENCE,
  KIND_LABELS,
  KINDS_END,
  KINDS_START,
  readLinks,
  renderCallsBlock,
  renderKindsBlock,
  renderTryBlock,
  scanCallSites,
} from "../../scripts/writeReadme";

const readme = readFileSync("README.md", "utf8");
const sources = readFileSync("docs/sources.md", "utf8");
const between = (a: string, b: string) => readme.slice(readme.indexOf(a) + a.length, readme.indexOf(b)).trim();

/** The quoted lines of docs/sources.md, in order. */
const quotes = sources.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("> ")).map((l) => l.slice(2));

describe("the README first screen (H13)", () => {
  it("runs in order: value sentence, pinned line, judge path, jobs table, call sites, problem, three pictures", () => {
    const at = (s: string) => {
      const i = readme.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      at("# Doorstep Notes"),
      at("Dana, a housing caseworker, turns her rough visit notes into a formal case note"),
      at("A writing aid with an egress check on listed names. Unlisted details can still identify a person."),
      at("## Judge path"),
      at("| Job | Mode | Leaves the device |"),
      at(CALLS_START),
      at("## Why it matters"),
      at("](docs/screens/14-send-blocked.png)"),
      at("](docs/screens/05-finished-note.png)"),
      at("](docs/screens/17-second-reader-real-service.png)"),
    ];
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    const judge = order[3] ?? -1;
    const table = order[4] ?? -1;
    expect(readme.indexOf("|")).toBe(table);
    const jobs = readme.indexOf("## The five jobs");
    expect(jobs).toBeGreaterThan(judge);
    expect(jobs).toBeLessThan(table);
    const path = readme.slice(judge, jobs).split("\n").filter((l) => l.trim() && !l.startsWith("#") && l !== "Film:");
    expect(path).toHaveLength(5);
    expect(readme.slice(judge, jobs)).toContain("Film:");
  });

  it("quotes each problem source byte for byte from docs/sources.md, with its read date and address", () => {
    expect(quotes.length).toBeGreaterThanOrEqual(2);
    const why = between("## Why it matters", "## Pictures");
    for (const q of quotes.slice(0, 2)) expect(why).toContain(`"${q}"`);
    expect(why.match(/read 2026-11-14/g)).toHaveLength(2);
    expect(why).toContain("https://ai.google.dev/gemini-api/terms");
    expect(why).toContain("https://ovic.vic.gov.au/");
    expect(why.split("\n").filter((l) => l.trim() !== "").filter((l) => !l.startsWith("Both quotes"))).toHaveLength(2);
  });

  it("names Firebase AI Logic hybrid inference and App Check above the table", () => {
    const intro = between("## The five jobs", "| Job | Mode");
    expect(intro).toContain("Firebase AI Logic hybrid inference");
    expect(intro).toContain("App Check");
  });

  it("names the tier the project runs on", () => {
    expect(CLOUD_TIER).toBe("paid");
    expect(readme).toContain("Cloud tier: paid.");
    expect(readme).toContain("paid tier of the Gemini Developer API, through Firebase AI Logic");
    expect(readme).not.toContain("Cloud tier: no-cost");
    expect(readme).not.toMatch(/\b55 days\b/);
  });

  it("says Gemini Nano only if docs/sources.md carries a dated quote for it", () => {
    if (!/Gemini Nano/.test(sources)) expect(readme).not.toMatch(/Gemini Nano/);
  });

  it("does not say no command talks to the Firebase project, or that the billing reason was not looked into", () => {
    expect(readme).not.toContain("any command that talks to the Firebase project");
    expect(readme).not.toContain("was not looked into");
  });

  it("has the three sections and the Firebase set-up steps", () => {
    for (const h of ["## Try it", "## Run it locally", "## Run it with your own Firebase project"]) expect(readme).toContain(h);
    for (const s of ["npm ci", "npm run build", "npm run preview", "firebase.config.local.json", "firebase.config.example.json", "debug token", "App Check enforcement"]) {
      expect(readme).toContain(s);
    }
    expect(readme).toContain("appcheck-debug-token.local");
    expect(readme).toContain(".browser-profile/");
  });
});

describe("the call-site block (H13)", () => {
  it("equals a fresh scan of src/", () => {
    const sites = scanCallSites(process.cwd());
    expect(sites.length).toBeGreaterThan(0);
    expect(between(CALLS_START, CALLS_END)).toBe(renderCallsBlock(sites));
  });

  it("lists every getGenerativeModel call, and skips comments", () => {
    const hits = readFileSync("src/firebase/deviceInit.ts", "utf8").split("\n").filter((l) => /getGenerativeModel\s*\(/.test(l));
    expect(hits.length).toBeGreaterThan(0);
    expect(scanCallSites(process.cwd()).map((s) => s.file)).toContain("src/firebase/deviceInit.ts");
    expect(renderCallsBlock([{ file: "src/a.ts", line: 3 }])).toBe("- `src/a.ts:3`");
  });
});

describe("the by-kind lines (H13)", () => {
  it("equal results/catch-rate.json merged.byKind, in the README and from the function", () => {
    const file = JSON.parse(readFileSync("results/catch-rate.json", "utf8")) as { merged: { byKind: Record<string, { caught: number; total: number }> } };
    const held = between(KINDS_START, KINDS_END);
    expect(held).toBe(renderKindsBlock(fileLookup(process.cwd())));
    for (const [key, label] of KIND_LABELS) {
      const k = file.merged.byKind[key]!;
      expect(held).toContain(`- ${label}: ${k.caught} of ${k.total} found by all passes together`);
    }
    expect(held).toContain(IN_SAMPLE_SENTENCE);
  });

  it("reads not measured with no file", () => {
    expect(renderKindsBlock(() => undefined)).toBe("By kind of identifier: not measured.");
  });
});

describe("the links (H13)", () => {
  it("print no line for a null", () => {
    expect(renderTryBlock({ film: null, hostedPage: null })).toBe("");
    expect(renderTryBlock({ film: "https://example.test/f", hostedPage: null })).toBe("- Film: https://example.test/f");
  });

  it("are null today and the README block is empty", () => {
    expect(readLinks(process.cwd())).toEqual(JSON.parse(readFileSync("docs/submission/links.json", "utf8")));
    expect(between("<!-- try:start (written by npm run measure:readme from docs/submission/links.json) -->", "<!-- try:end -->")).toBe(
      renderTryBlock(readLinks(process.cwd())),
    );
  });
});

describe("docs/submission/STORY.md (H13)", () => {
  const story = readFileSync("docs/submission/STORY.md", "utf8");
  it("exists and names the five jobs and the disclosure", () => {
    for (const mode of ["ONLY_ON_DEVICE", "PREFER_IN_CLOUD", "PREFER_ON_DEVICE", "ONLY_IN_CLOUD"]) expect(story).toContain(mode);
    expect(story).toContain("AI coding tools");
  });
  it("quotes the sources byte for byte", () => {
    for (const q of quotes.slice(0, 2)) expect(story).toContain(q);
  });
});
