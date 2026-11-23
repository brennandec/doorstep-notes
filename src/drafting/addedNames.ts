// Names the device model added to the record (ruling 24, capture-and-record task 20).
// A name in the record that is in neither the rough note nor the client list was
// not given by her, so the record view marks it "added by the model", the outgoing
// text masks it, and the finished note keeps it as a tag until she presses to put
// it back. Plain string work on this device; no model, no network.
//
// Best effort: it looks at the labels of the people present and at runs of
// capitalised words inside the text fields. A single capitalised word at the start
// of a sentence is not taken for a name. Week days and months are not names.
import type { VisitRecord } from "../inference/types";
import type { ClientEntry } from "../masking/clientList";
import { fold } from "../masking/fold";

const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu;
// Parts of a word that count separately, so "Okonkwo-Reyes" matches "Okonkwo" and "Reyes".
const parts = (word: string) => fold(word).split(/['’-]+/).filter((p) => p !== "");

const NOT_NAMES = new Set(
  [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  ],
);

function knownParts(note: string, clients: ClientEntry[]): Set<string> {
  const known = new Set<string>();
  for (const m of note.matchAll(WORD)) for (const p of parts(m[0])) known.add(p);
  for (const c of clients) {
    for (const name of [c.fullName, ...c.otherNames]) for (const m of name.matchAll(WORD)) for (const p of parts(m[0])) known.add(p);
  }
  return known;
}

const isCapital = (word: string) => /^\p{Lu}/u.test(word);

/** Runs of capitalised words, separated by single spaces. A lone word at a sentence start is dropped. */
function capitalisedRuns(text: string): string[] {
  const words = [...text.matchAll(WORD)].map((m) => ({ word: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length }));
  const runs: string[] = [];
  let run: typeof words = [];
  const flush = () => {
    if (run.length === 0) return;
    const first = run[0]!;
    const before = text.slice(0, first.start).trimEnd();
    const atSentenceStart = before === "" || /[.!?:;\n]$/.test(before);
    if (!(run.length === 1 && atSentenceStart)) runs.push(text.slice(first.start, run[run.length - 1]!.end));
    run = [];
  };
  for (const w of words) {
    if (!isCapital(w.word)) { flush(); continue; }
    const last = run[run.length - 1];
    if (last && text.slice(last.end, w.start) !== " ") flush();
    run.push(w);
  }
  flush();
  return runs;
}

function unknownIn(candidate: string, known: Set<string>): boolean {
  for (const m of candidate.matchAll(WORD)) {
    for (const p of parts(m[0])) {
      if (p.length < 2 || NOT_NAMES.has(p)) continue;
      if (!known.has(p)) return true;
    }
  }
  return false;
}

/** Names in the record that are in neither the rough note nor the client list, each once, as written in the record. */
export function findAddedNames(record: VisitRecord, noteText: string, clients: ClientEntry[]): string[] {
  const known = knownParts(noteText, clients);
  const found: string[] = [];
  const seen = new Set<string>();
  const take = (candidate: string) => {
    const key = fold(candidate);
    if (seen.has(key) || !unknownIn(candidate, known)) return;
    seen.add(key);
    found.push(candidate);
  };

  for (const p of record.present) {
    if (p.role === "worker") continue; // the worker is written as "worker" in the outgoing text
    const label = p.label.trim();
    if (label !== "" && isCapital(label)) take(label);
  }
  for (const field of [record.seen, record.agreed, record.risks, record.nextSteps]) {
    for (const line of field) for (const run of capitalisedRuns(line)) take(run);
  }
  return found;
}

const TOKEN = /[\p{L}\p{N}\p{M}]+/gu;
const HAS_DIGIT = /\p{N}/u;

/** The folded words and numbers of a text. Single letters are not counted as words. */
function tokensOf(text: string): string[] {
  return [...fold(text).matchAll(TOKEN)].map((m) => m[0]).filter((w) => HAS_DIGIT.test(w) || [...w].length >= 2);
}

/**
 * True when a value a model wrote stands in what she gave the app (third review, X1):
 * the rough note or the client list. A value made of letters is known when each of its
 * words is a word of the note or the list. A value with a digit in it (a date, a house
 * number) is known only when it stands whole in the note, so a number the model changed is not.
 * Plain string work on this device; no model, no network.
 */
export function isKnownValue(value: string, noteText: string, clients: ClientEntry[]): boolean {
  const own = tokensOf(value);
  if (own.length === 0) return false;
  const note = fold(noteText).replace(/\s+/g, " ");
  if (HAS_DIGIT.test(value)) {
    const whole = fold(value).trim().replace(/\s+/g, " ");
    const at = note.indexOf(whole);
    if (at === -1) return false;
    const before = note.slice(0, at).match(/.$/su)?.[0] ?? "";
    const after = note.slice(at + whole.length).match(/^./su)?.[0] ?? "";
    return !/[\p{L}\p{N}\p{M}]/u.test(before) && !/[\p{L}\p{N}\p{M}]/u.test(after);
  }
  const known = new Set(tokensOf(noteText));
  for (const c of clients) for (const name of [c.fullName, ...c.otherNames]) for (const w of tokensOf(name)) known.add(w);
  return own.every((w) => known.has(w));
}
