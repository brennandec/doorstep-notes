import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as constants from "../../src/constants";
import { flattenStrings, strings } from "../../src/app/strings";
import { NO_COST_NOTICE, PAID_NOTICE } from "../../src/app/sendNotice";
import { newestResult } from "../../src/app/figures";
import { fileLookup } from "../../scripts/writeReadme";

const readme = readFileSync("README.md", "utf8");
const design = readFileSync(".kiro/specs/shell-and-offline/design.md", "utf8");

function tableRows(markdown: string, heading: string): string[][] {
  const start = markdown.indexOf(heading);
  const lines = markdown.slice(start).split("\n").slice(1);
  const rows: string[][] = [];
  let seen = false;
  for (const line of lines) {
    if (line.startsWith("|")) {
      seen = true;
      rows.push(line.split("|").slice(1, -1).map((c) => c.trim()));
    } else if (seen) break;
  }
  return rows.filter((r) => !r.every((c) => /^-+$/.test(c)));
}

describe("README (task 22)", () => {
  it("holds a table of the five jobs that matches the design table", () => {
    const mine = tableRows(readme, "## The five jobs");
    const theirs = tableRows(design, "## Inference summary (README table source)");
    expect(mine).toHaveLength(6);
    expect(mine).toEqual(theirs);
    expect(mine.slice(1).map((r) => r[0])).toEqual([
      "Structure the note or photo into the record",
      "Propose more things to mask",
      "Draft the formal note",
      "Rewrite one masked sentence",
      "Second reader",
    ]);
  });

  it("says it is a writing aid with an egress check", () => {
    expect(readme).toContain("A writing aid with an egress check on listed names. Unlisted details can still identify a person.");
  });

  it("says the tier is paid, says what the paid tier does, and still warns about the unpaid tier", () => {
    expect(readme).toContain("paid tier of the Gemini Developer API");
    expect(readme).toContain("may be used by the provider to improve its products and may be read by reviewers");
    expect(NO_COST_NOTICE).toContain("may be used by the provider to improve its products and may be read by reviewers");
    expect(readme).toContain("This demo uses invented people only.");
    expect(PAID_NOTICE).toContain("paid tier of the Gemini Developer API");
    expect(PAID_NOTICE).toContain("does not use prompts or responses on the paid tier to improve its products");
  });

  it("says where the page is hosted and, until part B has run, not yet checked against the real service", () => {
    expect(readme).toContain(strings.standing.hosted);
    const partB = newestResult(fileLookup(process.cwd()), "h2-part-b");
    const line = "Not yet checked against the real service.";
    if (partB?.status === "pass") expect(readme).not.toContain(line);
    else expect(readme).toContain(line);
  });

  it("matches the cloud switch: off while off, the tier line when on", () => {
    if (constants.AI_SERVICE_ENABLED) expect(readme).toContain(`Cloud tier: ${constants.CLOUD_TIER}.`);
    else expect(readme).toContain("The cloud is off.");
  });

  it("makes no compliance claim and uses no banned word", () => {
    expect(readme).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
  });
});

/** Numbers allowed in the README and the string table: named constants and pinned package versions. */
function allowedNumbers(): Set<string> {
  const allowed = new Set<string>();
  for (const [name, value] of Object.entries(constants)) {
    if (name !== "CONSTANT_SOURCES" && typeof value === "number") allowed.add(String(value));
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  for (const v of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) allowed.add(v);
  // Figures filled from results files, when any exist.
  // Quoted sources carry the digits of their own addresses and dates (docs/sources.md).
  if (existsSync("docs/sources.md")) for (const m of readFileSync("docs/sources.md", "utf8").matchAll(/\d+(?:\.\d+)*/g)) allowed.add(m[0]);
  if (existsSync("results")) {
    // The synthetic set and the miss lists hold note text, so their digits explain nothing.
    for (const f of readdirSync("results").filter((n) => n.endsWith(".json") && n !== "synthetic-set.json" && n !== "misses.json")) {
      for (const m of readFileSync(`results/${f}`, "utf8").matchAll(/\d+(?:\.\d+)*/g)) allowed.add(m[0]);
    }
  }
  return allowed;
}

export function unexplainedNumbers(text: string, allowed: Set<string>): string[] {
  // Numbered-list markers at the start of a line are not figures.
  // A thousands separator is how the page writes a number from a file: "1,141" is 1141.
  const body = text.replace(/^\s*\d+\.\s/gm, "").replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
  return [...body.matchAll(/\d+(?:\.\d+)*/g)].map((m) => m[0]).filter((n) => !allowed.has(n));
}

describe("number audit (task 21)", () => {
  it("finds a number that is not a constant or a results figure", () => {
    expect(unexplainedNumbers("It caught 97 of 100.", new Set(["12"]))).toEqual(["97", "100"]);
    expect(unexplainedNumbers("12 names", new Set(["12"]))).toEqual([]);
  });

  it("every number in the README is a named constant, a pinned version or from a results file", () => {
    expect(unexplainedNumbers(readme.replace(/<!-- calls:start[\s\S]*?<!-- calls:end -->/, ""), allowedNumbers())).toEqual([]);
  });

  it("every number in the string table, the notices and the standing statements is explained", () => {
    const all = [...flattenStrings(strings), NO_COST_NOTICE, PAID_NOTICE].join("\n");
    expect(unexplainedNumbers(all, allowedNumbers())).toEqual([]);
  });

  it("a measured-sounding word in the README has a results file behind it", () => {
    if (!existsSync("results")) expect(readme).toContain("not measured");
  });
});
