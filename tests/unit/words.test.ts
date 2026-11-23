import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flattenStrings, strings } from "../../src/app/strings";
import { NO_COST_NOTICE, PAID_NOTICE } from "../../src/app/sendNotice";

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((n) => walk(join(path, n)));
}
const TEXT = /\.(ts|tsx|js|css|html|json|md|txt|svg|webmanifest)$/;
function textOf(paths: string[]): [string, string][] {
  return paths.flatMap(walk).filter((f) => TEXT.test(f)).map((f) => [f, readFileSync(f, "utf8")]);
}

// The banned list is quoted here and nowhere else.
const BANNED = /\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i;
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
const DRAMATIC = /\b(injury|injured|court|police|arrest|abuse|blood)\b/i;

const readable = [...flattenStrings(strings), NO_COST_NOTICE, PAID_NOTICE];

describe("words", () => {
  it("has no emoji in src, public, README, the demo script or dist", () => {
    const hits = textOf(["src", "public", "README.md", "docs/demo-script.md", "dist"])
      .filter(([, t]) => EMOJI.test(t))
      .map(([f]) => f);
    expect(hits).toEqual([]);
  });

  it("uses no banned word in the string table, notices, public, README or demo script", () => {
    for (const text of readable) expect(text).not.toMatch(BANNED);
    const hits = textOf(["public", "README.md", "docs/demo-script.md"]).filter(([, t]) => BANNED.test(t)).map(([f]) => f);
    expect(hits).toEqual([]);
  });

  it("detects a banned word and an emoji when present", () => {
    expect(BANNED.test("This is guaranteed")).toBe(true);
    expect(BANNED.test("Private by design")).toBe(true);
    expect(BANNED.test("It is not unsafe")).toBe(false);
    expect(EMOJI.test("ok \u{1F600}")).toBe(true);
  });

  it("keeps the string table free of digits", () => {
    for (const text of readable) expect(text).not.toMatch(/\d/);
  });

  it("keeps fixtures, scripts and the invented visit undramatic", () => {
    // "Alder Court" is an invented street name in the owner's invented note
    // (capture-and-record R10.2); see OPEN-QUESTIONS. Only that phrase is exempt.
    const files = textOf(["tests/fixtures", "tests/e2e/fixtures", "scripts", "src/app/example", "docs/demo-script.md"]);
    const hits = files.filter(([, t]) => DRAMATIC.test(t.replaceAll("Alder Court", "Alder Close"))).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});
