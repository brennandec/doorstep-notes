import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as constants from "../../../src/constants";
import { compareRuns, deviceRuns, figureLines, screenFigureLines } from "../../../src/app/figureText";
import { strings } from "../../../src/app/strings";
import { newestResultName } from "../../../src/app/newest";
import { readResults } from "../../../scripts/results";
import {
  BLOCK_END,
  BLOCK_START,
  DATE_FLAG_END,
  DATE_FLAG_START,
  HOSTED_REFUSAL_END,
  HOSTED_REFUSAL_SENTENCE,
  HOSTED_REFUSAL_START,
  fileLookup,
  renderDateFlagBlock,
  renderFiguresBlock,
  renderHostedRefusalBlock,
  replaceBlock,
} from "../../../scripts/writeReadme";

const readme = readFileSync("README.md", "utf8");

const header = { date: "2026-01-02T03:04:05.000Z", browser: "Invented Browser 1", script: "x.ts", scriptVersion: "1" };
const score = (caught: number, total: number) => ({ caught, total, falseMasks: 2, byKind: {} });
const invented = {
  "catch-rate": {
    ...header, setSize: 40, seed: 1,
    exact: score(30, 80), near: score(5, 80), exactAndNear: score(33, 80),
    device: { status: "not measured", reason: "Invented reason" }, merged: { status: "not measured", reason: "Invented reason" },
  },
};
const lookup = (n: string) => (invented as unknown as Record<string, never>)[n];

describe("README figures block (measurement R7.1, R9.1)", () => {
  it("holds the limits line and one list item per figure, from the results files", () => {
    const block = renderFiguresBlock(lookup);
    expect(block).toContain(strings.figures.limits);
    const items = block.split("\n").filter((l) => l.startsWith("- "));
    expect(items).toHaveLength(figureLines(lookup).length);
    expect(items[0]).toBe("- Exact match caught 30 of 80 identifiers on the invented set (2026-01-02, Invented Browser 1). False masks: 2.");
    expect(items[3]).toBe("- Device model pass: not measured. Invented reason.");
  });

  it("states the two screen lines before the list, from the same function as the page (R11.3)", () => {
    const block = renderFiguresBlock(lookup);
    const { one, two } = screenFigureLines(lookup);
    expect(block).toContain(one);
    expect(block).toContain(two);
    expect(block.indexOf(one)).toBeLessThan(block.indexOf("- Exact match"));
    expect(one).toContain("On 40 invented notes her list alone found 33 of 80");
  });

  it("states both device runs side by side when the file holds two, and says nothing of it with one (R12.5)", () => {
    expect(renderFiguresBlock(lookup)).not.toContain("first run");
    const run = (label: string, caught: number, falseMasks: number) => ({
      label, n: 40, N: 40, date: "2026-02-03T00:00:00.000Z", browser: "Invented Chrome 2", caught, total: 90, falseMasks, merged: score(60, 90),
    });
    const two = { "catch-rate": { ...invented["catch-rate"], deviceRuns: [run("first run, before the prompt change", 50, 9), run("second run, after the prompt change", 55, 3)] } };
    const l = (n: string) => (two as unknown as Record<string, never>)[n];
    const line = compareRuns(deviceRuns(l))!;
    expect(line).toBe("False masks: first run 9, second run 3. Identifiers caught: first run 50, second run 55.");
    expect(renderFiguresBlock(l)).toContain(line);
  });

  it("reads 'not measured' for every figure with no results files", () => {
    const items = renderFiguresBlock(() => undefined).split("\n").filter((l) => l.startsWith("- "));
    expect(items).toHaveLength(6);
    for (const i of items) expect(i).toMatch(/not measured/);
  });

  it("replaces only what is between the markers, and gives the same text when run twice", () => {
    const doc = `before\n${BLOCK_START}\nold\n${BLOCK_END}\nafter\n`;
    const once = replaceBlock(doc, "NEW");
    expect(once).toBe(`before\n${BLOCK_START}\nNEW\n${BLOCK_END}\nafter\n`);
    expect(replaceBlock(once, "NEW")).toBe(once);
  });

  it("refuses a document without both markers, in the right order", () => {
    expect(() => replaceBlock("no markers", "x")).toThrow(/markers/);
    expect(() => replaceBlock(`${BLOCK_END}\n${BLOCK_START}\n`, "x")).toThrow(/markers/);
    expect(() => replaceBlock(`${BLOCK_START}\nonly start`, "x")).toThrow(/markers/);
  });

  it("reads files from a folder and gives undefined for a missing or unreadable one", () => {
    const l = fileLookup(process.cwd());
    expect(l("no-such-results-file")).toBeUndefined();
  });

  it("is what the README holds now: the block cannot drift from the results files", () => {
    const start = readme.indexOf(BLOCK_START);
    const end = readme.indexOf(BLOCK_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const held = readme.slice(start + BLOCK_START.length, end).trim();
    expect(held).toBe(renderFiguresBlock(fileLookup(process.cwd())).trim());
  });

  it("holds the two date-flag lines the generator writes", () => {
    const start = readme.indexOf(DATE_FLAG_START);
    const end = readme.indexOf(DATE_FLAG_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(readme.slice(start + DATE_FLAG_START.length, end).trim()).toBe(renderDateFlagBlock());
  });

  it("quotes the sentence build:hosted prints when the local config file is missing", () => {
    const start = readme.indexOf(HOSTED_REFUSAL_START);
    const end = readme.indexOf(HOSTED_REFUSAL_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = readme.slice(start + HOSTED_REFUSAL_START.length, end).trim();
    expect(block).toBe(renderHostedRefusalBlock());
    expect(block).toContain("`npm run build:hosted`");
    expect(block).toContain(HOSTED_REFUSAL_SENTENCE);
    const printer = readFileSync("scripts/buildHosted.ts", "utf8");
    expect(printer).toContain("HOSTED BUILD REFUSED: ${what}");
    expect(printer).toContain('refuse("the local config file is missing")');
  });
});

// ---- Number audit (measurement R7, ruling 22) ----

function pinnedVersions(): string[] {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return Object.values({ ...pkg.dependencies, ...pkg.devDependencies });
}

function constantNumbers(): Set<string> {
  const out = new Set<string>();
  for (const [name, value] of Object.entries(constants)) if (name !== "CONSTANT_SOURCES" && typeof value === "number") out.add(String(value));
  return out;
}

/** Every number written in the values of the files that feed a figure. */
function numbersInFile(name: string): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number") out.add(String(v));
    else if (typeof v === "string") for (const m of v.matchAll(/\d+(?:\.\d+)*/g)) out.add(m[0]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(readResults(name));
  return out;
}

/** Numbers in a text that are neither a named constant, a pinned version, a date being cited, nor a list marker. */
export function unexplained(text: string, allowed: Set<string>): string[] {
  // A thousands separator is how the page writes a number from a file: "1,141" is 1141.
  // A file path in backticks under results/ or docs/ names a source; its digits are not a figure.
  // The cloud model names (constant strings, DEFAULT_CLOUD_MODEL and READER_CLOUD_MODEL) carry a version; they are names, not figures.
  const body = text.split(constants.DEFAULT_CLOUD_MODEL).join("").split(constants.READER_CLOUD_MODEL).join("").replace(/`(?:results|docs)\/[^`\s]+`/g, "").replace(/\]\(docs\/[^)\s]+\)/g, "").replace(/^\s*\d+\.\s/gm, "").replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
  const versions = new Set(pinnedVersions());
  return [...body.matchAll(/\d+(?:\.\d+)*/g)].map((m) => m[0]).filter((n) => !allowed.has(n) && !versions.has(n));
}

describe("README number audit (measurement R7.2)", () => {
  const start = readme.indexOf(BLOCK_START);
  const end = readme.indexOf(BLOCK_END) + BLOCK_END.length;
  // The not-needed sentence has its own markers and its own file (measurement R14.2); its numbers are audited below.
  const nStart = readme.indexOf("<!-- notneeded:start");
  const nEnd = readme.indexOf("<!-- notneeded:end -->") + "<!-- notneeded:end -->".length;
  const notNeeded = readme.slice(nStart, nEnd);
  // The status block has its own markers and its own files (measurement R16); its numbers are audited below.
  const sStart = readme.indexOf("<!-- status:start");
  const sEnd = readme.indexOf("<!-- status:end -->") + "<!-- status:end -->".length;
  const statusBlock = readme.slice(sStart, sEnd);
  const outside = (readme.slice(0, start) + readme.slice(end))
    .replace(notNeeded, "")
    .replace(statusBlock, "")
    // H22d: "How this was measured" cites the film records; its numbers are audited against those records in the test below.
    .replace(/## How this was measured[\s\S]*?(?=\n## )/, "")
    // H13: the call-site and by-kind blocks have their own markers and are checked against a fresh scan and the results file (tests/unit/readmeFirstScreen.test.ts).
    .replace(/<!-- calls:start[\s\S]*?<!-- calls:end -->/, "")
    .replace(/<!-- kinds:start[\s\S]*?<!-- kinds:end -->/, "");
  const inside = readme.slice(start, end);

  it("has only numbers in the status block that come from the cloud results files, or a constant", () => {
    expect(statusBlock).toContain("status:start");
    const allowed = new Set([
      ...constantNumbers(),
      ...numbersInFile(newestResultName(fileLookup(process.cwd()), "cloud-draft")),
      ...numbersInFile(newestResultName(fileLookup(process.cwd()), "rewrite-real-service")),
      ...numbersInFile(newestResultName(fileLookup(process.cwd()), "second-reader-real-service")),
      // session H15: the two lines of the newest dated records (measurement R17.5)
      ...numbersInFile(newestResultName(fileLookup(process.cwd()), "h2-part-b")),
      ...numbersInFile(newestResultName(fileLookup(process.cwd()), "draft-network-drop")),
    ]);
    expect(unexplained(statusBlock, allowed)).toEqual([]);
  });

  it("has only numbers in 'How this was measured' that come from the film records, the H22b rehearsal record, or a session name", () => {
    const section = /## How this was measured[\s\S]*?(?=\n## )/.exec(readme)?.[0] ?? "";
    const film = JSON.parse(readFileSync("results/film-run-2026-11-14-h22f.json", "utf8")) as { filmAttempt: { k: number } };
    expect(section).toContain(`attempt ${film.filmAttempt.k} of 3`);
    const files = ["film-run-2026-11-14-h22f", "film-rehearsal-2026-11-14-h22b", "ds-r8-return", "e2e-cloud-on-2026-11-21-h23"];
    // 22 is the session number in H22, H22b, H22c, H22d, H22e and H22f; 256 is the name of the hash (SHA-256); 7 is the seven steps of the walk.
    // ds-r8-return and e2e-cloud-on-2026-11-21-h23 are named in this section; their own figures are allowed.
    const allowed = new Set(["22", "256", "7", ...constantNumbers(), ...files.flatMap((f) => [...numbersInFile(f)])]);
    expect(unexplained(section, allowed)).toEqual([]);
  });

  it("finds a number that is not a constant", () => {
    expect(unexplained("It caught 97 of 100.", new Set(["12"]))).toEqual(["97", "100"]);
    expect(unexplained("12 names, read 2026-11-13", new Set(["12"]))).toEqual([]);
    // A cited path is skipped, a number beside it is not.
    expect(unexplained("see `results/real-browser-2026-11-13-c05.json`", new Set())).toEqual([]);
    expect(unexplained("97 in `results/real-browser-2026-11-13-c05.json`", new Set())).toEqual(["97"]);
    expect(unexplained("see results/real-browser-c05.json", new Set())).toEqual(["05"]);
  });

  it("has no number outside the figures block that is not a named constant, a pinned version or a cited date", () => {
    // The digits of the quoted sources (address, dates) are explained by docs/sources.md, as in readme.test.ts.
    const sourceDigits = [...readFileSync("docs/sources.md", "utf8").matchAll(/\d+(?:\.\d+)*/g)].map((m) => m[0]);
    // The unit pass count cites results/unit-clean-2026-11-23.json. Its figures are allowed.
    expect(unexplained(outside, new Set([...constantNumbers(), ...sourceDigits, ...numbersInFile("unit-clean-2026-11-23")]))).toEqual([]);
  });

  it("has only numbers inside the block that come from the catch-rate or cold-start files, or a constant", () => {
    const allowed = new Set([...constantNumbers(), ...numbersInFile("catch-rate"), ...numbersInFile("cold-start")]);
    expect(unexplained(inside, allowed)).toEqual([]);
  });

  it("has only numbers in the not-needed sentence that come from results/not-needed-kinds.json", () => {
    expect(notNeeded).toContain("notneeded:start");
    expect(unexplained(notNeeded, numbersInFile("not-needed-kinds"))).toEqual([]);
  });

  it("says the figures describe an invented set", () => {
    expect(inside).toContain("invented notes");
    expect(inside).toContain("do not predict real use");
  });

  it("keeps the miss lists out of the README: they stay in the results files", () => {
    expect(readme).toContain("results/misses.json");
  });
});

// ---- V2: the page and the README hold the numbers of results/catch-rate.json ----

describe("page and README agree with results/catch-rate.json (measurement R11.3, V2)", () => {
  const real = fileLookup(process.cwd());
  const file = readResults("catch-rate") as Record<string, any>;
  const block = readme.slice(readme.indexOf(BLOCK_START), readme.indexOf(BLOCK_END));
  const page = screenFigureLines(real);
  const grouped = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const runs: any[] = Array.isArray(file["deviceRuns"]) ? file["deviceRuns"] : [{ ...file["device"], merged: file["merged"] }];
  // The run that stands: a run marked `stands: false` tried a rule that was taken out again (measurement R15.2).
  const later = [...runs].reverse().find((r) => r.stands !== false);

  it("the README block holds both screen lines word for word", () => {
    expect(block).toContain(page.one);
    expect(block).toContain(page.two);
  });

  it("line one holds the file's numbers: the set size, the list alone, the model with it", () => {
    expect(page.one).toContain(`On ${file["setSize"]} invented notes`);
    expect(page.one).toContain(`found ${grouped(file["exactAndNear"].caught)} of ${grouped(file["exactAndNear"].total)}`);
    expect(page.one).toContain(`With the model on this device: ${grouped(later.merged.caught)} of ${grouped(later.merged.total)}`);
    expect(page.one).toContain(`on ${later.n} of ${file["setSize"]} invented notes`);
  });

  it("line two holds the false masks of the device pass in the file", () => {
    expect(page.two).toContain(`suggested ${grouped(later.falseMasks)} thing`);
  });

  it("every number in the README block's two lines is a number in the file", () => {
    const numbers = new Set<string>();
    const walk = (v: unknown) => {
      if (typeof v === "number") numbers.add(String(v));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(file);
    const shown = (page.one + " " + page.two).replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").replace(/(?<=\d),(?=\d{3}(?!\d))/g, "").replace(/v\d+(\.\d+)*|\d+\.\d+(\.\d+)*/g, "");
    for (const m of shown.matchAll(/\d+/g)) expect(numbers.has(m[0]), m[0]).toBe(true);
  });
});
