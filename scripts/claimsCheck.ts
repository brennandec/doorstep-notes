// One source for every number a judge can read.
// claims.json is that source. This check fails when the readme, the story,
// the about lines, or a later description, testing note or film script
// shows a number that has no entry. --self-red plants one number and must fail.
// The about fetch time is a clock reading, so it is not scanned.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { aboutLines } from "../src/app/aboutView";
import { compiledDefaults } from "../src/firebase/remoteConfig";

export interface Claim {
  value: string;
  unit: string;
  n: number | null;
  runFile: string;
  date: string;
  sourceTreeHash: string;
  browser: string;
}

export const SURFACES: { id: string; path: string; required: boolean }[] = [
  { id: "readme", path: "README.md", required: true },
  { id: "story", path: "docs/submission/STORY.md", required: true },
  { id: "description", path: "docs/submission/DESCRIPTION.md", required: false },
  { id: "testing", path: "TESTING.md", required: false },
  { id: "film", path: "docs/submission/FILM.md", required: false },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// SHA-256 of the run file's bytes. A commit id is not a binding: a history-1
// clone has one commit for every file, so a commit id cannot name the file.
const HASH = /^[0-9a-f]{64}$/;
const PLANT = "999001";

/** Digits a reader sees. A thousands separator is not part of the number. A leading list marker is not a number. */
export function numberTokens(text: string): string[] {
  const body = text.replace(/^\s*\d+\.\s/gm, "").replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
  return [...body.matchAll(/\d+(?:\.\d+)*/g)].map((m) => m[0]);
}

/** Policy name and version only. The fetch time changes with the clock. */
export function aboutClaimText(): string {
  const lines = aboutLines(compiledDefaults("1970-01-01T00:00:00.000Z"));
  return `${lines.name}\n${lines.version}`;
}

export function lineCount(text: string): number {
  if (text.length === 0) return 0;
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts.length;
}

export interface CheckInput {
  texts: { id: string; text: string }[];
  claims: Claim[];
  readFile: (path: string) => string;
  tracked: (path: string) => boolean;
  fileHash: (path: string) => string;
}

export function checkClaims(input: CheckInput): { missing: string[]; bad: string[] } {
  const bad: string[] = [];
  const byValue = new Map<string, Claim>();
  for (const c of input.claims) {
    if (byValue.has(c.value)) bad.push(`${c.value}: duplicate`);
    byValue.set(c.value, c);
    if (c.unit.trim() === "") bad.push(`${c.value}: unit empty`);
    if (!(c.n === null || (Number.isInteger(c.n) && (c.n as number) >= 0))) bad.push(`${c.value}: n`);
    if (c.runFile.trim() === "") bad.push(`${c.value}: run file empty`);
    if (!DATE.test(c.date)) bad.push(`${c.value}: date`);
    if (!HASH.test(c.sourceTreeHash)) bad.push(`${c.value}: hash`);
    if (c.browser.trim() === "") bad.push(`${c.value}: browser empty`);
    if (c.runFile.trim() === "") continue;
    if (!input.tracked(c.runFile)) {
      bad.push(`${c.value}: not tracked`);
      continue;
    }
    if (input.fileHash(c.runFile) !== c.sourceTreeHash) bad.push(`${c.value}: hash differs`);
    let text = "";
    try {
      text = input.readFile(c.runFile);
    } catch {
      bad.push(`${c.value}: unreadable`);
      continue;
    }
    if (c.unit === "line") {
      const value = Number(c.value);
      if (!Number.isInteger(value) || lineCount(text) < value) bad.push(`${c.value}: line short`);
    } else if (!numberTokens(text).includes(c.value)) {
      bad.push(`${c.value}: not in run file`);
    }
  }
  const tokens = new Set<string>();
  for (const t of input.texts) for (const n of numberTokens(t.text)) tokens.add(n);
  const missing = [...tokens].filter((n) => !byValue.has(n)).sort();
  return { missing, bad };
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const hashCache = new Map<string, string>();
const trackedCache = new Map<string, boolean>();

export function loadDisk(plant = false): { input: CheckInput; absent: string[] } {
  const raw = JSON.parse(readFileSync("claims.json", "utf8")) as { entries: Claim[] };
  const texts: { id: string; text: string }[] = [];
  const absent: string[] = [];
  for (const s of SURFACES) {
    if (!existsSync(s.path)) {
      if (s.required) throw new Error(`CLAIMS_RED missing surface ${s.id}`);
      absent.push(s.id);
      continue;
    }
    let text = readFileSync(s.path, "utf8");
    if (plant && s.id === "readme") text += `\nPlanted ${PLANT}.\n`;
    texts.push({ id: s.id, text });
  }
  texts.push({ id: "about", text: aboutClaimText() });
  const input: CheckInput = {
    texts,
    claims: raw.entries,
    readFile: (p) => readFileSync(p, "utf8"),
    tracked: (p) => {
      const hit = trackedCache.get(p);
      if (hit !== undefined) return hit;
      let ok = false;
      try {
        git(["ls-files", "--error-unmatch", "--", p]);
        ok = true;
      } catch {
        ok = false;
      }
      trackedCache.set(p, ok);
      return ok;
    },
    fileHash: (p) => {
      const hit = hashCache.get(p);
      if (hit !== undefined) return hit;
      const hash = createHash("sha256").update(readFileSync(p)).digest("hex");
      hashCache.set(p, hash);
      return hash;
    },
  };
  return { input, absent };
}

export function main(): void {
  const selfRed = process.argv.includes("--self-red");
  const disk = loadDisk(false);
  const base = checkClaims(disk.input);
  if (selfRed) {
    if (base.missing.length > 0 || base.bad.length > 0) {
      throw new Error(`CLAIMS_RED self-red base not green\n${[...base.missing, ...base.bad].join("\n")}`);
    }
    const planted = checkClaims(loadDisk(true).input);
    const caught = planted.missing.length === 1 && planted.missing[0] === PLANT && planted.bad.length === 0;
    if (!caught) throw new Error(`CLAIMS_RED self-red missed ${planted.missing.join(",")}`);
    console.log(`SELF_RED_CAUGHT planted=${PLANT}`);
    return;
  }
  if (base.missing.length > 0 || base.bad.length > 0) {
    throw new Error(`CLAIMS_RED\n${[...base.missing.map((m) => `missing ${m}`), ...base.bad].join("\n")}`);
  }
  const absent = disk.absent.length === 0 ? "none" : disk.absent.join(",");
  console.log(`CLAIMS_GREEN entries=${disk.input.claims.length} absent=${absent}`);
}
