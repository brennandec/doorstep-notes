// Shell-and-offline task 54 (R28.2, fourth review K2): the README says how the page keeps things, in the
// footer's words, and does not claim a reload works in a real browser before that check has passed.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strings } from "../../src/app/strings";

const readme = readFileSync("README.md", "utf8");
const section = (heading: string) => {
  const at = readme.indexOf(heading);
  expect(at, heading).toBeGreaterThan(-1);
  const rest = readme.slice(at + heading.length);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
};

/** The reload check in a real browser (fourth review L1). Its task writes this file; until it passes the README says it has not run. */
function reloadCheckPassed(): boolean {
  const file = "results/kept-reload.json";
  if (!existsSync(file)) return false;
  return (JSON.parse(readFileSync(file, "utf8")) as { status?: string }).status === "pass";
}

describe("README: how it is kept (task 54)", () => {
  const kept = section("## Kept in this browser");

  it("says it in the words of the footer", () => {
    expect(kept).toContain(strings.kept.howKept);
  });

  it("names the three clear controls and what the page does with data it cannot read", () => {
    for (const label of [strings.kept.clearVisit, strings.kept.clearList, strings.kept.clearAll]) expect(kept).toContain(label);
    expect(kept).toContain("version");
    expect(kept).toContain(strings.kept.unknownVersion);
    expect(kept).toContain(strings.kept.notKept);
  });

  it("uses no stronger word than the footer does", () => {
    expect(kept).not.toMatch(/\b(secure|protected|safe|private|hidden|locked)\b/i);
    expect(kept).not.toMatch(/guarantee/i);
  });

  it("no longer says the client list is lost on a reload", () => {
    expect(readme).not.toContain("The client list is not kept across a reload");
  });

  it("says the reload check in a real browser has not run, until its result file passes", () => {
    const line = "The reload check in a real browser has not been run since this was built.";
    if (reloadCheckPassed()) expect(readme).not.toContain(line);
    else expect(readme).toContain(line);
  });

  it("states what the unit tests used, so no one reads them as a browser run", () => {
    expect(kept).toContain("stand-in");
  });
});
