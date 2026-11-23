// The agency case note. Headings are the record fields. The model writes only the
// prose inside each part. A bare pronoun after a second person is replaced here,
// on this device, when exactly one listed person has those pronouns.
import { strings } from "../app/strings";
import { isMissedVisitText } from "../inference/missedVisit";
import type { VisitRecord } from "../inference/types";
import type { ClientEntry } from "../masking/clientList";

export interface CaseParts {
  purpose: string;
  observed: string;
  agreed: string;
  risks: string;
  next: string;
}

export const CASE_HEADINGS = [
  strings.caseNote.purpose,
  strings.caseNote.observed,
  strings.caseNote.agreed,
  strings.recordFields.risks,
  strings.caseNote.nextContact,
] as const;

const FAMILY: Readonly<Record<string, ClientEntry["pronouns"]>> = {
  he: "he/him", him: "he/him", his: "he/him",
  she: "she/her", her: "she/her", hers: "she/her",
  they: "they/them", them: "they/them", their: "they/them", theirs: "they/them",
};

const BARE = /\b(?:he|she|him|her|his|hers|they|them|their|theirs)\b/gi;
const PERSON_TAG = /\[Person[ \t]+\d+\]/gi;

function canonTag(raw: string): string {
  const m = /person[ \t]+(\d+)/i.exec(raw);
  return m ? `[Person ${m[1]}]` : raw;
}

function insideMark(text: string, offset: number): boolean {
  const before = text.slice(0, offset);
  const open = Math.max(before.lastIndexOf("{"), before.lastIndexOf("["));
  if (open < 0) return false;
  const close = Math.max(before.lastIndexOf("}"), before.lastIndexOf("]"));
  return open > close;
}

function lookup(clientByTag: ReadonlyMap<string, ClientEntry>, tag: string): ClientEntry | undefined {
  return clientByTag.get(tag) ?? clientByTag.get(canonTag(tag));
}

/**
 * A bare pronoun that does not match the nearest person tag is unclear once a
 * second person is in the draft. It becomes that other person's tag when only
 * one listed person uses those pronouns. A pronoun that matches the nearest
 * person is left as written.
 */
export function repairUnclearPronoun(draft: string, clientByTag: ReadonlyMap<string, ClientEntry>): string {
  const draftTags = [...new Set([...draft.matchAll(PERSON_TAG)].map((m) => canonTag(m[0])))];
  return draft.replace(BARE, (word, offset: number) => {
    if (insideMark(draft, offset)) return word;
    const family = FAMILY[word.toLowerCase()];
    if (family === undefined || family === "") return word;
    const before = draft.slice(0, offset);
    const prior = [...before.matchAll(PERSON_TAG)];
    if (prior.length === 0) return word;
    const nearest = canonTag(prior[prior.length - 1]![0]);
    const nearestClient = lookup(clientByTag, nearest);
    if (nearestClient !== undefined && nearestClient.pronouns === family) return word;
    const matches = draftTags.filter((tag) => tag !== nearest && lookup(clientByTag, tag)?.pronouns === family);
    // The nearest person is not on the list, so the pronoun may be theirs. Do not guess.
    if (matches.length === 1 && nearestClient !== undefined) return matches[0]!;
    // "their" after two people matches nobody when both are she or he. Repeat the two tags.
    if (matches.length === 0) {
      const start = sentenceStart(draft, offset);
      const tags = [...new Set([...draft.slice(start, offset).matchAll(PERSON_TAG)].map((m) => canonTag(m[0])))];
      if (tags.length === 2) {
        const pair = `${tags[0]} and ${tags[1]}`;
        const lower = word.toLowerCase();
        return lower === "their" || lower === "theirs" ? `${pair}'s` : pair;
      }
    }
    return word;
  });
}

function sentenceStart(text: string, offset: number): number {
  const before = text.slice(0, offset);
  const cut = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n"));
  return cut + 1;
}

const REPORTING_VERB = /\b(reported|stated|noted|said|explained|advised|mentioned|confirmed|claimed|indicated|informed)\b/gi;

/** The first reporting verb in the draft that the worker's note does not contain. */
export function reportingVerbAbsentFromNote(text: string, note: string): string | null {
  const match = firstAbsentReportingVerb(text, note);
  return match === null ? null : match[1]!.toLowerCase();
}

const REPORTING_PREPOSITION = /^(?:by|on|in|at|with|for|from|to|about|of|after|before)$/i;

function firstAbsentReportingVerb(text: string, note: string): RegExpExecArray | null {
  REPORTING_VERB.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REPORTING_VERB.exec(text)) !== null) {
    const verb = match[1]!;
    if (!new RegExp(`\\b${verb}\\b`, "i").test(note)) return match;
  }
  return null;
}

function frameStart(before: string): number {
  const worker = /the\s+worker\s+$/i.exec(before);
  if (worker !== null) return worker.index;
  const name = /(?:[A-Z][A-Za-z'-]*\s+)+$/.exec(before);
  return name === null ? before.length : name.index;
}

function tidyRepaired(text: string): string {
  const collapsed = text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^[ \t]+/gm, "");
  return collapsed.replace(/(^|[.!?]\s+)([a-z])/g, (_all, lead: string, letter: string) => lead + letter.toUpperCase());
}

/**
 * A reporting verb the note does not contain is removed before the case note is
 * shown. No word is added. A name or "the worker" in front of that verb goes
 * with it, unless the next word is a preposition ("noted by", "noted on").
 * The result can be empty. repairCasePart is what the screen calls, and that
 * one keeps the part.
 */
export function repairReportingVerb(text: string, note: string): string {
  let out = text;
  for (let guard = 0; guard < 12; guard++) {
    const match = firstAbsentReportingVerb(out, note);
    if (match === null) break;
    const verbEnd = match.index + match[0].length;
    const after = out.slice(verbEnd);
    const that = /^\s+that\b/i.exec(after);
    const nextWord = /^\s+([A-Za-z]+)/.exec(after);
    const preposition = nextWord !== null && that === null && REPORTING_PREPOSITION.test(nextWord[1]!);
    const cutFrom = preposition ? match.index : frameStart(out.slice(0, match.index));
    const cutTo = that === null ? verbEnd : verbEnd + that[0].length;
    out = `${out.slice(0, cutFrom)}${out.slice(cutTo)}`;
  }
  return tidyRepaired(out);
}

const PLACEHOLDER = /\((?:name|place|date|detail|pronoun) not put back\)/gi;
const INVENTED_OWNER =
  /\b(?:sent\s+by\s+(?!the\s+worker\b)[A-Za-z][A-Za-z'-]*|(?:(?!worker\b)[A-Za-z][A-Za-z'-]*['’]s|his|her|their|its)\s+(?:benefits\s+)?(?:list|form)|(?:worker|record|note)\s+(?:says?|states?|shows?|lists?|indicates?))\b/i;
const VISIT_ACTION =
  /\b(?:visited(?!\s+(?:a\s+)?relative\b)|attended\s+(?:the\s+)?visit|went\s+to\s+)/i;
const WORKER_VISIT =
  /\b(?:the\s+)?worker\b[^.!?;,]*(?:visited|went\s+to\b)/i;
const WAS_PRESENT = /\b(?:(?:was|were)\s+present|present\s+(?:for|at|during)\b)\b/i;
const NEGATED_PRESENCE =
  /\b(?:no\s+(?:household\s+members?|individuals?|people|persons?|residents?|clients?|one|body)|nobody|not\s+present|none\s+present)\b/i;
const REPORTING_VERB_WORD = /\b(?:reported|stated|noted|said|explained|advised|mentioned|confirmed|claimed|indicated|informed)\b/i;

function hasWord(text: string): boolean {
  return /[A-Za-z0-9]/.test(text);
}

function normForNote(text: string): string {
  return text.replace(PLACEHOLDER, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function noteHolds(sentence: string, note: string): boolean {
  const s = normForNote(sentence);
  return s !== "" && normForNote(note).includes(s);
}

/** An attribution the note does not contain. A sentence the note already has is kept. */
function attributionSentence(sentence: string, note: string): boolean {
  const s = sentence.trim();
  if (s === "" || noteHolds(s, note)) return false;
  if (INVENTED_OWNER.test(s)) return true;
  if (!isMissedVisitText(note)) return false;
  if (WAS_PRESENT.test(s) && !NEGATED_PRESENCE.test(s) && !/^\s*(?:the\s+)?worker\s+(?:was|were)\s+present\b/i.test(s)) {
    return true;
  }
  for (const clause of s.split(/\s*(?:;|,(?=\s*(?:and|but|so)\b)|\band\b)\s*/i)) {
    if (!VISIT_ACTION.test(clause)) continue;
    if (NEGATED_PRESENCE.test(clause) || /\bdid\s+not\s+attend\b/i.test(clause)) continue;
    if (WORKER_VISIT.test(clause)) continue;
    return true;
  }
  return false;
}

function dropAttribution(text: string, note: string): string {
  const lines = text.split(/\n/).map((line) => {
    const kept = line
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence !== "" && !attributionSentence(sentence, note));
    return kept.join(" ");
  });
  return tidyRepaired(lines.filter((line) => line.trim() !== "").join("\n"));
}

function keptPart(text: string, note: string): string {
  return dropAttribution(repairReportingVerb(text, note), note);
}

function firstNoteSpan(note: string): string {
  const spans = note
    .split(/\n+|(?<=[.!?])\s+/)
    .map((span) => span.trim())
    .filter((span) => hasWord(span));
  return (spans.find((span) => !REPORTING_VERB_WORD.test(span)) ?? spans[0] ?? "").trim();
}

/**
 * The screen's repair. A reporting verb or an attribution sentence the note
 * does not contain is not shown. A part that had words does not become empty:
 * the record line is used, then a span of the note. No word is added that is
 * outside those three.
 */
export function repairCasePart(text: string, note: string, fallback = ""): string {
  const kept = keptPart(text, note);
  if (hasWord(kept)) return kept;
  if (!hasWord(text)) return "";
  const fromRecord = keptPart(fallback, note);
  if (hasWord(fromRecord)) return fromRecord;
  const span = firstNoteSpan(note);
  return hasWord(span) ? span : text.trim();
}

function stripHeading(block: string, heading: string): string {
  const lines = block.split(/\n/);
  const first = lines[0]?.trim().replace(/[:.]$/, "") ?? "";
  if (first.toLowerCase() === heading.toLowerCase()) return lines.slice(1).join("\n").trim();
  return block.trim();
}

/** Five paragraphs, one blank line between them. Fewer or more is not a case note. */
export function splitDraftProse(text: string): CaseParts | null {
  const blocks = text.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s !== "");
  if (blocks.length !== 5) return null;
  const parts: CaseParts = {
    purpose: stripHeading(blocks[0]!, CASE_HEADINGS[0]),
    observed: stripHeading(blocks[1]!, CASE_HEADINGS[1]),
    agreed: stripHeading(blocks[2]!, CASE_HEADINGS[2]),
    risks: stripHeading(blocks[3]!, CASE_HEADINGS[3]),
    next: stripHeading(blocks[4]!, CASE_HEADINGS[4]),
  };
  if (Object.values(parts).some((p) => p === "")) return null;
  return parts;
}

function joinLines(lines: readonly string[] | undefined): string {
  return (lines ?? []).map((s) => s.trim()).filter((s) => s !== "").join("\n");
}

export function partsFromRecord(record: VisitRecord): CaseParts {
  return {
    purpose: joinLines(record.purpose),
    observed: joinLines(record.seen),
    agreed: joinLines(record.agreed),
    risks: joinLines(record.risks),
    next: joinLines(record.nextSteps),
  };
}

export function casePartsFor(finishedText: string | undefined, record: VisitRecord | null): CaseParts {
  if (finishedText !== undefined && finishedText.trim() !== "") {
    const split = splitDraftProse(finishedText);
    if (split !== null) return split;
  }
  if (record !== null) return partsFromRecord(record);
  return { purpose: "", observed: "", agreed: "", risks: "", next: "" };
}

/** Headings plus the prose under them. No Markdown. */
export function plainCaseNote(parts: CaseParts): string {
  const rows: Array<[string, string]> = [
    [CASE_HEADINGS[0], parts.purpose],
    [CASE_HEADINGS[1], parts.observed],
    [CASE_HEADINGS[2], parts.agreed],
    [CASE_HEADINGS[3], parts.risks],
    [CASE_HEADINGS[4], parts.next],
  ];
  return rows
    .filter((row, index) => index !== 0 || row[1].trim() !== "")
    .map(([heading, body]) => `${heading}\n${body}`)
    .join("\n\n");
}

const UNCLEAR = /\b(?:he|she|him|her|his|hers|they|them|their|theirs)\b/gi;

/** Bare third-person pronouns still in the text after names are put back. */
export function unclearPronounCount(text: string): number {
  return [...text.matchAll(UNCLEAR)].length;
}
