// Session H27: the cut words are gone, the cloud-off words are plain, and the judge path is in place. Reads files only.
// Every pattern is built from fragments, so this file holds none of the cut words.
// The parser is the one Vite ships (rolldown). TypeScript 7 has no classic compiler API to walk the literals with.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseSync } from "rolldown/utils";
import { describe, expect, it } from "vitest";
import { flattenStrings, strings } from "../../src/app/strings";
import { LEDGER_KEYS, OUTCOMES, assertLedgerEntry, type LedgerEntry } from "../../src/egress/ledger";

const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|svg|webmanifest|txt|log)$/;

function filesUnder(path: string): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [path];
  const out: string[] = [];
  for (const name of readdirSync(full)) {
    if (name === "node_modules" || name === "test-results" || name === "dist" || name === ".git") continue;
    out.push(...filesUnder(join(path, name)));
  }
  return out;
}
const textFiles = (paths: string[]) => paths.flatMap(filesUnder).filter((f) => TEXT.test(f));

const re = (...parts: string[]) => new RegExp(parts.join(""), "i");
const OLD_WORDS = new RegExp(["test", " double"].join("") + "|" + ["not", " connected"].join(""), "i");

const CUT_WORDS = [
  re("anony", "mous"),
  re("signIn", "Anony", "mously"),
  re("ledger", " ?store"),
  re("fire", "store"),
  re("sync", "Ledger"),
  re("ledger", "Sync"),
  re("Save", " ledger"),
  re("save", "-ledger"),
];

const nameOf = (text: string) => text.match(/Gemini Nano(?: \d+)?/)?.[0] ?? null;
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Every string and template piece in a parsed file. */
function literalsOf(file: string): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== "object") return;
    const n = node as { type?: string; value?: unknown } & Record<string, unknown>;
    if (n.type === "Literal" && typeof n.value === "string") out.push(n.value);
    if (n.type === "TemplateElement") {
      const v = n.value as { cooked?: string | null; raw?: string };
      out.push(v.cooked ?? v.raw ?? "");
    }
    for (const key of Object.keys(n)) if (key !== "type") visit(n[key]);
  };
  const parsed = parseSync(file, read(file), { lang: "ts" });
  visit(parsed.program);
  return out;
}

describe("H27 text order", () => {
  it("(1) no string literal under src/ says the old cloud-off words", () => {
    const hits: string[] = [];
    for (const f of filesUnder("src").filter((p) => /\.ts$/.test(p))) {
      for (const lit of literalsOf(f)) if (OLD_WORDS.test(lit)) hits.push(`${f}: ${lit.slice(0, 80)}`);
    }
    expect(hits).toEqual([]);
  });

  it("(2) index.html and public/ hold neither phrase", () => {
    const hits = textFiles(["index.html", "public"]).filter((f) => OLD_WORDS.test(read(f)));
    expect(hits).toEqual([]);
  });

  it("(3) docs/sources.md item 4 holds a dated quotation with the model's name, and the README and STORY hold that name", () => {
    const sources = read("docs/sources.md");
    const lines = sources.split("\n");
    const at = lines.findIndex((l) => l.startsWith("4. Chrome for Developers"));
    expect(at, "docs/sources.md has no item 4").toBeGreaterThan(-1);
    expect(lines[at]).toMatch(/Read \d{4}-\d{2}-\d{2}/);
    expect(lines[at + 1]).toContain("https://developer.chrome.com/docs/ai/firebase-ai-logic");
    const quote = lines[at + 2] ?? "";
    expect(quote.trim().startsWith("> ")).toBe(true);
    const name = nameOf(quote);
    expect(name, "the quotation names no model").not.toBeNull();
    expect(read("README.md")).toContain(name!);
    expect(read("docs/submission/STORY.md")).toContain(name!);
  });

  it("(4) the cut words appear in none of the listed places", () => {
    const places = ["BRIEF.md", "README.md", "docs/submission", ".kiro/steering", "src", "scripts", "tests", "public", "index.html", "docs/sources.md", "firebase.config.example.json", "package.json"];
    const hits: string[] = [];
    for (const f of textFiles(places)) {
      let text = read(f);
      // The production checklist is the one place that names the two products that stay unused.
      if (f === "README.md") {
        const start = text.indexOf("## Production checklist");
        const end = start === -1 ? -1 : text.indexOf("\n## ", start + 1);
        if (start !== -1) text = text.slice(0, start) + text.slice(end === -1 ? text.length : end);
      }
      for (const w of CUT_WORDS) if (w.test(text)) hits.push(`${f}: ${w.source}`);
    }
    expect(hits).toEqual([]);
  });

  it("(5) the deleted files are gone, and the ledger entry rules live in src/egress/ledger.ts", () => {
    expect(existsSync(join(ROOT, ["src/firebase/", "remote", "Config.ts"].join(""))), "fetched settings module").toBe(true);
    for (const p of [
      ["src/firebase/", "auth.ts"],
      ["src/firebase/", "ledger", "Store.ts"],
      ["src/firebase/", "ledger", "StoreDouble.ts"],
      ["src/egress/", "sync", "Ledger.ts"],
      ["tests/unit/", "egress", "Sync", "Ledger.test.ts"],
      ["tests/unit/", "save", "Ledger.test.ts"],
    ]) {
      expect(existsSync(join(ROOT, p.join(""))), p.join("")).toBe(false);
    }
    expect(LEDGER_KEYS.length).toBeGreaterThan(0);
    expect(OUTCOMES).toEqual(["answered", "refused", "failed"]);
    const entry: LedgerEntry = {
      at: "2026-11-14T21:00:00.000Z",
      sha256: ["a".repeat(64)],
      byteLengths: [10],
      listedChecked: 1, listedFound: 0, maskedChecked: 1, maskedFound: 0, onPurpose: 0,
      job: "draft", mode: "PREFER_IN_CLOUD", inferenceSource: "IN_CLOUD", connected: true, outcome: "answered",
      requests: [],
    };
    expect(() => assertLedgerEntry(entry)).not.toThrow();
    expect(() => assertLedgerEntry({ ...entry, text: "a name" } as LedgerEntry)).toThrow(/extra field/);
  });

  it("(6) the README opening holds five lines, the judge path holds five lines, and the STORY opening three", () => {
    const readme = read("README.md").split("\n");
    const top = readme.slice(readme.indexOf("# Doorstep Notes") + 1, readme.indexOf("## Judge path")).filter((l) => l.trim());
    expect(top).toHaveLength(5);
    const path = readme.slice(readme.indexOf("## Judge path") + 1, readme.indexOf("## The five jobs")).filter((l) => l.trim() && l !== "Film:");
    expect(path).toHaveLength(5);
    const story = read("docs/submission/STORY.md").split("\n");
    const open = story.slice(story.indexOf("# Doorstep Notes") + 1, story.indexOf("## Dana's evening")).filter((l) => l.trim());
    expect(open).toHaveLength(3);
  });

  it("(7) the README keeps only the four lines that name a recorded double or notice, and the STORY none", () => {
    const keep = [
      "against the test doubles",
      "against the test double only",
      "the cloud half is not connected, as it does in a build with the cloud off",
      "Not connected. Nothing is sent, a test double answers",
    ];
    const lines = read("README.md").split("\n").filter((l) => OLD_WORDS.test(l));
    for (const l of lines) expect(keep.some((k) => l.includes(k)), l.slice(0, 80)).toBe(true);
    for (const k of keep) expect(lines.some((l) => l.includes(k)), k).toBe(true);
    expect(read("docs/submission/STORY.md")).not.toMatch(OLD_WORDS);
  });

  it("(8) STORY is at most 895 words", () => {
    expect(words(read("docs/submission/STORY.md"))).toBeLessThanOrEqual(895);
  });

  it("(9) the decision file exists and names the three parts", () => {
    const p = "docs/decisions/2026-11-14-cut-three-firebase-parts.md";
    expect(existsSync(join(ROOT, p))).toBe(true);
    const text = read(p);
    expect(text).toContain(["Remote", " Config"].join(""));
    expect(text).toContain(["anony", "mous sign-in"].join(""));
    expect(text).toContain(["cloud ledger", " store"].join(""));
  });

  it("(10) the ledger fold says once that the ledger is kept on this device", () => {
    expect(strings.egress.ledgerExplain).toContain("Kept on this device");
    const others = flattenStrings(strings).filter((s) => s !== strings.egress.ledgerExplain && /ledger/i.test(s) && /this device/i.test(s));
    expect(others).toEqual([]);
  });
});
