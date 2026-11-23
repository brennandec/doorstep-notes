// The outgoing text (drafting design, "The outgoing string"; ruling 24).
// Smallest version, written by the egress-check session because the check needs a
// real text to look at. The drafting spec owns the rest of this module.
//
// One road out (ruling 24): every piece of record text goes through the masker
// before it is part of the outgoing text. A record field is not trusted to be
// clean because the rough note was. The masker reads the record's own text, so a
// listed surname that the device model put into a field (and that the rough note
// never held) is masked like any other.
//
// The record block is masked as ONE text, so the same person gets the same tag in
// every field. The fixed instructions hold no record text and are not masked.
import { isMissedVisitRecord } from "../inference/missedVisit";
import type { VisitRecord } from "../inference/types";
import type { ClientEntry } from "../masking/clientList";
import { fold } from "../masking/fold";
import { applyMask } from "../masking/apply";
import { runPasses } from "../masking/entry";
import type { MaskPolicy } from "../masking/policy";
import { maskPresentEntries } from "../masking/presentEntries";
import { maskText } from "../masking/toggle";
import type { MaskResult, MaskSpan } from "../masking/types";
import type { AddedName } from "./screenDraft";

export interface OutgoingInput {
  record: VisitRecord;
  clients: ClientEntry[];
  policy: MaskPolicy;
  /** values masked in the rough note by hand or accepted from the device pass, so the record is masked the same way */
  extraMasked?: string[];
  /** full names she chose to send on purpose (ruling 5) */
  sentOnPurpose?: string[];
  /** the spans she has after the masking step (chips and pressed words); computed from the record when absent */
  spans?: MaskSpan[];
  /** names the model put in the record that are in neither the note nor the list (ruling 24); masked like any other value */
  addedNames?: string[];
  /** optional rough-note text on this device used only to preserve missed-visit status for Present:; never sent or appended */
  noteText?: string;
}

export interface Outgoing {
  /** exactly what zone 2 shows and what the draft job is given */
  text: string;
  /** the masked record block alone (no instructions) */
  maskedRecord: string;
  /** map, surface forms and listed names; these stay on this device */
  mask: MaskResult;
  /** the tags that stand for names the model added; they are not put back without her press */
  addedNames: AddedName[];
}

/** Release 18's instruction block was 2,171 characters. This block stays at or under that. */
export const RELEASE_18_INSTRUCTION_CHARS = 2171;

export const INSTRUCTIONS =
  "Instructions: Write exactly five paragraphs separated by one blank line, in this order: purpose of the visit; what was observed; agreed actions, with who and when; risks; next contact. No headings, no Markdown, no lists. " +
  "Do not copy field labels or the words Visit date. When Visit date: is none, do not mention a visit date. " +
  "Keep every date, number, and tag such as [Date 1] and [Person 1] exactly as written. " +
  "For a pronoun that stands for a tagged person, write a single token in curly braces, such as {she:Person 1}, {him:Person 1} or {their:Person 1}. " +
  "When one action names two people, repeat each tag, as in [Person 3] offered to help [Person 1], and do not write he, she, they, him, her, them, or their after the second tag. " +
  "Never write hedged pronoun pairs or alternatives joined by or, /, or and/or, and never repeat an action with an alternative pronoun clause. " +
  "Treat 'I', 'my', or an unstated subject before a visit action (such as 'went to', 'rang', 'checked', 'left', or 'told by') as the worker, never as a tagged [Person N]. " +
  "Follow the Present: line strictly: if it lists any [Person N], state that each listed person was present, and never say nobody was present. " +
  "Only when Present: states no household member present, state that nobody answered because no household member was present, and never state that a [Person N] was present. " +
  "Use only facts in the record, and use only verbs the note already contains. Do not add a reporting verb the note does not contain. Never invent a speaker or owner, " +
  "and never turn 'my list' or 'the form' into a tagged person's possessive or 'sent by' attribution.";

/** Items joined by "; ". One trailing full stop is dropped from an item when another follows, so no ".;" is sent (drafting R15.6). */
const list = (items: string[]) =>
  items.length === 0 ? "none" : items.map((item, i) => (i < items.length - 1 ? item.replace(/\.$/, "") : item)).join("; ");

function presentSummary(record: VisitRecord, noteText?: string): string {
  const present = record.present.map((p) => (p.role === "worker" ? "worker" : p.label));
  const missed = isMissedVisitRecord(record, noteText);
  if (present.length === 0) return missed ? "no household member present (no answer / missed visit)" : "none";
  if (missed && record.present.every((p) => p.role === "worker")) {
    return `${present.join(", ")}; no household member present (no answer / missed visit)`;
  }
  return present.join(", ");
}

/**
 * The record as labelled lines, except empty fields (H46).
 *
 * An empty field used to render as `Agreed: none`, and the cloud model copied
 * the label straight back ("Agreed: none. Risks: none." — round of 12 on
 * 168ca63, n4 9/12, deterministic at temperature 0). The device never rewrites
 * the model's words (H44 2 stands), so the fix is here at the source: an empty
 * field is a plain sentence with no label to copy. A blank visit date omits its
 * line entirely — the instructions already forbid mentioning a visit date when
 * there is none, and a sentence would put the words back. Non-empty fields
 * keep their labels; the instruction's label list is unchanged.
 */
export function recordBlock(record: VisitRecord, noteText?: string): string {
  const lines: string[] = [];
  const visitDate = record.visitDate.trim();
  if (visitDate) lines.push(`Visit date: ${visitDate}`);
  const present = presentSummary(record, noteText);
  lines.push(present === "none" ? "No one was present." : `Present: ${present}`);
  lines.push(record.seen.length ? `Seen: ${list(record.seen)}` : "Nothing was seen.");
  lines.push(record.agreed.length ? `Agreed: ${list(record.agreed)}` : "Nothing was agreed.");
  lines.push(record.risks.length ? `Risks: ${list(record.risks)}` : "No risks were recorded.");
  lines.push(record.nextSteps.length ? `Next steps: ${list(record.nextSteps)}` : "No next steps were recorded.");
  return lines.join("\n");
}

/** Masks any text the same way as the record: exact, near, then the extra values. Returns the spans, tagged. */
function maskedSpans(raw: string, input: OutgoingInput): MaskSpan[] {
  let spans = input.spans ?? runPasses(raw, input.clients, input.policy).combined;
  for (const term of input.extraMasked ?? []) spans = maskText(raw, spans, term).spans;
  // Names the model added are people, so they get person tags.
  for (const name of input.addedNames ?? []) {
    const before = new Set(spans.map((s) => `${s.start}:${s.end}`));
    const key = `text:${fold(name.trim())}`;
    spans = maskText(raw, spans, name).spans.map((s) =>
      s.key === key && s.kind === "manual" && !before.has(`${s.start}:${s.end}`) ? { ...s, tagKind: "Person" as const } : s,
    );
  }
  // Present entries are people. A span already there (a listed name, a hand mask, an unmask) is not touched.
  spans = maskPresentEntries(raw, spans, input.record.present);
  const purpose = new Set((input.sentOnPurpose ?? []).map(fold));
  if (purpose.size === 0 || input.spans) return spans;
  const byId = new Map(input.clients.map((c) => [c.id, c]));
  return spans.map((s) => {
    const client = s.clientId ? byId.get(s.clientId) : undefined;
    const chosen = (s.kind === "listed" || s.kind === "near") && client !== undefined && purpose.has(fold(client.fullName));
    return chosen ? { ...s, accepted: false, sentOnPurpose: true } : s;
  });
}

export function buildOutgoing(input: OutgoingInput): Outgoing {
  const raw = recordBlock(input.record, input.noteText);
  const mask = applyMask(raw, maskedSpans(raw, input), input.clients);
  const addedNames: AddedName[] = [];
  for (const name of input.addedNames ?? []) {
    const span = mask.spans.find((s) => s.accepted && s.kind === "manual" && fold(s.surfaceForm) === fold(name));
    if (span && !addedNames.some((a) => a.tag === span.tag)) addedNames.push({ tag: span.tag, name: mask.map[span.tag] ?? name });
  }
  return { text: `${mask.maskedText}\n\n${INSTRUCTIONS}`, maskedRecord: mask.maskedText, mask, addedNames };
}
