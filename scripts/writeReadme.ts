// Fills the README figures block from the results files (measurement task 6, R7.1).
// The block between the two markers is written by this script only, so it cannot
// drift from the files. Everything outside the markers is left as it is.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { cloudStatusLines, compareRuns, deviceRuns, figureLines, notCheckedLine, screenFigureLines } from "../src/app/figureText";
import type { ResultFile, ResultsLookup } from "../src/app/figures";
import { strings } from "../src/app/strings";
import { readResults } from "./results";

export const BLOCK_START = "<!-- figures:start (written by npm run measure:readme) -->";
export const BLOCK_END = "<!-- figures:end -->";
export const STATUS_START = "<!-- status:start (written by npm run measure:readme) -->";
export const STATUS_END = "<!-- status:end -->";

/** The status bullets about the cloud half, from the three results files (measurement R16.1). */
export function renderStatusBlock(lookup: ResultsLookup): string {
  const not = notCheckedLine(lookup);
  return [...cloudStatusLines(lookup), ...(not ? [not] : [])].map((l) => `- ${l}`).join("\n");
}

function replaceBetween(document: string, startMark: string, endMark: string, block: string): string {
  const start = document.indexOf(startMark);
  const end = document.indexOf(endMark);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`README.md needs the markers ${startMark} and ${endMark}, start first and end after it.`);
  }
  return `${document.slice(0, start + startMark.length)}\n${block}\n${document.slice(end)}`;
}

export function renderFiguresBlock(lookup: ResultsLookup): string {
  // The two lines are the page's, from the same function (measurement R11.3).
  const { one, two } = screenFigureLines(lookup);
  const compare = compareRuns(deviceRuns(lookup));
  const items = figureLines(lookup).map((l) => `- ${l.text}`);
  return [strings.figures.limits, "", one, "", two, ...(compare ? ["", compare] : []), "", ...items].join("\n");
}

export function replaceBlock(document: string, block: string): string {
  const start = document.indexOf(BLOCK_START);
  const end = document.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("README.md needs the figures markers, start first and end after it.");
  }
  return `${document.slice(0, start + BLOCK_START.length)}\n${block}\n${document.slice(end)}`;
}

export const KINDS_START = "<!-- kinds:start (written by npm run measure:readme) -->";
export const KINDS_END = "<!-- kinds:end -->";
export const CALLS_START = "<!-- calls:start (written by npm run measure:readme) -->";
export const CALLS_END = "<!-- calls:end -->";
export const TRY_START = "<!-- try:start (written by npm run measure:readme from docs/submission/links.json) -->";
export const TRY_END = "<!-- try:end -->";
export const DATE_FLAG_START = "<!-- date-flag:start (written by npm run measure:readme) -->";
export const DATE_FLAG_END = "<!-- date-flag:end -->";
export const HOSTED_REFUSAL_START = "<!-- build-refusal:start (written by npm run measure:readme) -->";
export const HOSTED_REFUSAL_END = "<!-- build-refusal:end -->";
/** The sentence `npm run build:hosted` prints when the local config file is absent. */
export const HOSTED_REFUSAL_SENTENCE = "HOSTED BUILD REFUSED: the local config file is missing";

/** What the date flag does, and the limit a day and month alone is not flagged. */
export function renderDateFlagBlock(): string {
  return [
    "A date that carries a year is flagged in the text that would be sent, and a day and month, or a year, is flagged in a sentence that names a birth.",
    "A day and month alone is not flagged.",
  ].join("\n");
}

/** The hosted-build line that quotes the sentence the command prints. */
export function renderHostedRefusalBlock(): string {
  return `\`npm run build:hosted\` stops with "${HOSTED_REFUSAL_SENTENCE}".`;
}

/** The kinds of identifier in `results/catch-rate.json`, merged.byKind, in the order the README shows them. */
export const KIND_LABELS: [key: string, label: string][] = [
  ["listedName", "Listed names"],
  ["otherName", "Other names"],
  ["nearVariant", "Near variants"],
  ["place", "Places"],
  ["dob", "Dates of birth"],
  ["phrase", "Describing phrases"],
];

export const IN_SAMPLE_SENTENCE =
  "The lists of words the filter drops were adjusted on this same invented set, so these figures are in-sample and say little about other notes.";

const grouped = (n: number) => n.toLocaleString("en-US");

/** One line per identifier kind, from the file, or one "not measured" line. */
export function renderKindsBlock(lookup: ResultsLookup): string {
  const file = lookup("catch-rate") as Record<string, unknown> | undefined;
  const merged = file?.["merged"] as Record<string, unknown> | undefined;
  const byKind = merged?.["byKind"] as Record<string, { caught?: unknown; total?: unknown }> | undefined;
  const date = typeof merged?.["date"] === "string" ? merged["date"].slice(0, 10) : undefined;
  const browser = merged?.["browser"];
  const n = merged?.["n"];
  const attempted = merged?.["attempted"];
  if (!byKind || !date || typeof browser !== "string" || typeof n !== "number" || typeof attempted !== "number") {
    return "By kind of identifier: not measured.";
  }
  const lines: string[] = [];
  for (const [key, label] of KIND_LABELS) {
    const k = byKind[key];
    if (!k || typeof k.caught !== "number" || typeof k.total !== "number") {
      lines.push(`- ${label}: not measured.`);
      continue;
    }
    lines.push(`- ${label}: ${grouped(k.caught)} of ${grouped(k.total)} found by all passes together (${n} of ${attempted} invented notes, ${date}, ${browser}).`);
  }
  return [...lines, "", IN_SAMPLE_SENTENCE].join("\n");
}

export interface CallSite {
  file: string;
  line: number;
}

function walkTs(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkTs(path, out);
    else if (entry.name.endsWith(".ts")) out.push(path);
  }
}

/** Every call of getGenerativeModel under `<root>/src`, by file and line, comments left out. */
export function scanCallSites(root: string): CallSite[] {
  const files: string[] = [];
  walkTs(join(root, "src"), files);
  const sites: CallSite[] = [];
  for (const path of files.sort()) {
    readFileSync(path, "utf8").split("\n").forEach((text, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
      if (/\bgetGenerativeModel\s*\(/.test(text)) sites.push({ file: relative(root, path).split(sep).join("/"), line: i + 1 });
    });
  }
  return sites;
}

export function renderCallsBlock(sites: CallSite[]): string {
  if (sites.length === 0) return "No call of getGenerativeModel was found under `src/`.";
  return sites.map((s) => `- \`${s.file}:${s.line}\``).join("\n");
}

export interface Links {
  film: string | null;
  hostedPage: string | null;
}

/** Reads `docs/submission/links.json`. A missing or unreadable file means both links are null. */
export function readLinks(root: string): Links {
  try {
    const v = JSON.parse(readFileSync(join(root, "docs", "submission", "links.json"), "utf8")) as Partial<Links>;
    const text = (x: unknown) => (typeof x === "string" && x.trim() !== "" ? x : null);
    return { film: text(v.film), hostedPage: text(v.hostedPage) };
  } catch {
    return { film: null, hostedPage: null };
  }
}

/** One line per link that is set; nothing for a null. */
export function renderTryBlock(links: Links): string {
  const lines: string[] = [];
  if (links.film) lines.push(`- Film: ${links.film}`);
  if (links.hostedPage) lines.push(`- Hosted page: ${links.hostedPage}`);
  return lines.join("\n");
}

/** A results lookup that reads the files in `<root>/results/`, or undefined for a missing or unreadable one. */
export function fileLookup(root: string): ResultsLookup {
  const lookup = (name: string) => readResults(name, root) as ResultFile | undefined;
  const names = () => {
    try {
      return readdirSync(join(root, "results")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
    } catch {
      return [];
    }
  };
  return Object.assign(lookup, { names });
}

export function main(): void {
  const file = join(process.cwd(), "README.md");
  const lookup = fileLookup(process.cwd());
  const withFigures = replaceBlock(readFileSync(file, "utf8"), renderFiguresBlock(lookup));
  const withStatus = replaceBetween(withFigures, STATUS_START, STATUS_END, renderStatusBlock(lookup));
  const withKinds = replaceBetween(withStatus, KINDS_START, KINDS_END, renderKindsBlock(lookup));
  const withCalls = replaceBetween(withKinds, CALLS_START, CALLS_END, renderCallsBlock(scanCallSites(process.cwd())));
  const withTry = replaceBetween(withCalls, TRY_START, TRY_END, renderTryBlock(readLinks(process.cwd())));
  const withDateFlag = replaceBetween(withTry, DATE_FLAG_START, DATE_FLAG_END, renderDateFlagBlock());
  const withHosted = replaceBetween(withDateFlag, HOSTED_REFUSAL_START, HOSTED_REFUSAL_END, renderHostedRefusalBlock());
  writeFileSync(file, withHosted);
  console.log("Wrote the figures, status, by-kind, call-site, try-it, date-flag and build-refusal blocks in README.md.");
}
