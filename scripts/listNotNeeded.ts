// Lists the not-needed suggestions of the stored device run by kind (measurement R14.1, N4, P4).
// A "not needed" suggestion is a false mask: a span the device pass proposed that overlaps no known
// identifier. The strings are in results/misses.json under falseMasks.device. This script reads them,
// sorts each into one kind by plain rules, and writes the kinds with counts to
// results/not-needed-kinds.json. No model and no browser. If the stored run holds no strings, or
// the strings are not those of the stored run, it writes a miss with the reason and never a count.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INVENTED_FIRST_NAMES, INVENTED_NICKNAMES, INVENTED_OTHER_FIRST_NAMES } from "./buildSet";
import { makeHeader, nodeRuntime, readResults, writeMeasured } from "./results";

export const SCRIPT_VERSION = "1";
export const NOT_NEEDED_START = "<!-- notneeded:start (written by npm run measure:notneeded) -->";
export const NOT_NEEDED_END = "<!-- notneeded:end -->";

export const NOT_NEEDED_KINDS = ["common word", "first name nobody in the note", "place word", "number", "date word", "other"] as const;
export type NotNeededKind = (typeof NOT_NEEDED_KINDS)[number];

/** What each kind means, for the reader of the results file. */
export const KIND_LABELS: Record<NotNeededKind, string> = {
  "common word": "lower-case words with no digit and no capital after the first word, such as a role word",
  "first name nobody in the note": "one capitalised first name from the invented lists that is not an identifier in that note",
  "place word": "a word for a kind of place, such as clinic or house, with no digit",
  number: "has a digit and is not a date or a time",
  "date word": "a date, a time, a weekday, a month, a relative day or a span such as weeks",
  other: "none of the above",
};

const FIRST_NAMES = new Set(
  [...INVENTED_FIRST_NAMES, ...Object.values(INVENTED_NICKNAMES), ...INVENTED_OTHER_FIRST_NAMES].map((n) => n.toLowerCase()),
);

const DATE_WORDS = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "today", "tomorrow", "yesterday", "tonight", "morning", "afternoon", "evening", "night", "noon", "midday", "midnight",
  "day", "days", "week", "weeks", "month", "months", "year", "years", "fortnight", "weekend",
]);

const PLACE_WORDS = new Set([
  "clinic", "surgery", "hospital", "pharmacy", "school", "library", "office", "centre", "center", "hall", "park", "shop",
  "house", "lodge", "heights", "estate", "road", "lane", "street", "avenue", "close", "green", "gate", "flat",
]);

const words = (text: string): string[] => text.split(/[^\p{L}\p{N}/:.']+/u).filter((w) => w !== "");

export function classifyNotNeeded(text: string): NotNeededKind {
  const t = text.trim();
  if (t === "") return "other";
  const lower = t.toLowerCase();
  const ws = words(lower);
  if (/\d{1,2}[/.-]\d{1,2}/.test(t) || /\b\d{1,2}(?::\d{2})?\s?[ap]m\b/.test(lower) || ws.some((w) => DATE_WORDS.has(w))) return "date word";
  if (/\d/.test(t)) return "number";
  const original = words(t);
  if (original.length === 1 && /^\p{Lu}/u.test(original[0]!) && FIRST_NAMES.has(lower)) return "first name nobody in the note";
  if (ws.some((w) => PLACE_WORDS.has(w))) return "place word";
  if (!original.slice(1).some((w) => /^\p{Lu}/u.test(w))) return "common word";
  return "other";
}

export interface KindCount {
  kind: NotNeededKind;
  count: number;
  strings: { text: string; count: number }[];
}
export type NotNeededResult = { status: "pass"; total: number; kinds: KindCount[] } | { status: "miss"; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Reads the false masks of the device pass from a misses file, checked against the run in catch-rate. */
export function listNotNeeded(misses: unknown, catchRate: unknown): NotNeededResult {
  if (!isObject(misses) || !isObject(catchRate)) return { status: "miss", reason: "results/misses.json or results/catch-rate.json is missing or unreadable." };
  const falseMasks = misses["falseMasks"];
  const device = isObject(falseMasks) ? falseMasks["device"] : undefined;
  if (!Array.isArray(device) || device.length === 0) {
    return { status: "miss", reason: "The stored run holds no suggested strings (falseMasks.device in results/misses.json)." };
  }
  const texts: string[] = [];
  for (const entry of device) {
    if (!isObject(entry) || typeof entry["text"] !== "string") {
      return { status: "miss", reason: "The stored run holds no suggested strings: an entry of falseMasks.device has no text." };
    }
    texts.push(entry["text"]);
  }
  const deviceRun = catchRate["device"];
  const stored = isObject(deviceRun) ? deviceRun["falseMasks"] : undefined;
  if (stored !== texts.length) {
    return { status: "miss", reason: `The strings in results/misses.json number ${texts.length}; the stored run in results/catch-rate.json counts ${String(stored)}.` };
  }
  const byKind = new Map<NotNeededKind, Map<string, number>>();
  for (const text of texts) {
    const kind = classifyNotNeeded(text);
    const strings = byKind.get(kind) ?? new Map<string, number>();
    strings.set(text, (strings.get(text) ?? 0) + 1);
    byKind.set(kind, strings);
  }
  const kinds: KindCount[] = [...byKind.entries()].map(([kind, strings]) => ({
    kind,
    count: [...strings.values()].reduce((a, b) => a + b, 0),
    strings: [...strings.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || a.text.localeCompare(b.text)),
  }));
  kinds.sort((a, b) => b.count - a.count || NOT_NEEDED_KINDS.indexOf(a.kind) - NOT_NEEDED_KINDS.indexOf(b.kind));
  return { status: "pass", total: texts.length, kinds };
}

/** The one README sentence. Every word and number in it comes from the result. */
export function notNeededSentence(result: NotNeededResult | Record<string, unknown> | undefined): string {
  if (!result || result["status"] !== "pass" || !Array.isArray(result["kinds"])) {
    return "The kinds of the suggestions that were not needed: not measured.";
  }
  const top = (result["kinds"] as KindCount[]).slice(0, 3).map((k) => `${k.kind} (${k.count})`);
  const list = top.length > 1 ? `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}` : (top[0] ?? "none");
  return `Of the ${String(result["total"])} suggestions that were not needed in the third run, the three largest kinds were ${list}.`;
}

export function replaceNotNeeded(document: string, sentence: string): string {
  const start = document.indexOf(NOT_NEEDED_START);
  const end = document.indexOf(NOT_NEEDED_END);
  if (start === -1 || end === -1 || end < start) throw new Error("README.md needs the not-needed markers, start first and end after it.");
  return `${document.slice(0, start + NOT_NEEDED_START.length)}\n${sentence}\n${document.slice(end)}`;
}

export function writeNotNeeded(root = process.cwd()): string {
  const catchRate = readResults("catch-rate", root);
  const run = catchRate?.["device"] as Record<string, unknown> | undefined;
  const result = listNotNeeded(readResults("misses", root), catchRate);
  const header = makeHeader({ browser: nodeRuntime(), script: "scripts/listNotNeeded.ts", scriptVersion: SCRIPT_VERSION });
  const body =
    result.status === "pass"
      ? {
          status: "pass",
          source: "results/misses.json, falseMasks.device",
          runDate: run?.["date"],
          runBrowser: run?.["browser"],
          total: result.total,
          kindMeanings: KIND_LABELS,
          kinds: result.kinds,
        }
      : { status: "miss", reason: result.reason };
  return writeMeasured("not-needed-kinds", header, body, ["status", "source", "runDate", "runBrowser", "total", "kindMeanings", "kinds", "reason"], root);
}

export function main(): void {
  writeNotNeeded();
  const result = readResults("not-needed-kinds");
  console.log(notNeededSentence(result));
  const file = join(process.cwd(), "README.md");
  const next = replaceNotNeeded(readFileSync(file, "utf8"), notNeededSentence(result));
  writeFileSync(file, next);
}
