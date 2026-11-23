// Screen a draft through the masker (ruling 24). A model's output is text like any
// other, and it can add names: the draft goes through the same masking as the note
// before it is shown or used again.
//
//   - A listed name, a near variant, or the original of a masked value that already has a
//     tag in the sent record becomes that tag again.
//   - Anything else the masker finds, and anything the device model proposes from the
//     draft, becomes a NEW tag. If the value is in the rough note or on the client list it is
//     known: its tag is in the map and the finished note restores it (third review, X1).
//     Only a value that is in neither is marked "added by the model"; it is not put back into
//     the finished note without her press (restoreDraft, restoreAddedTag).
// Runs on this device and makes no network request.
import type { ClientEntry } from "../masking/clientList";
import { isKnownValue } from "./addedNames";
import { isPronounWord, protectedTokenSpans } from "./restoreDraft";
import { isNotNeeded, withoutRoleWord } from "../masking/notNeeded";
import { runPasses } from "../masking/entry";
import { fold } from "../masking/fold";
import type { MaskPolicy } from "../masking/policy";
import { tagsIn } from "../masking/tags";
import { maskText } from "../masking/toggle";
import type { MaskResult, MaskSpan, TagKind } from "../masking/types";

export type ProposedKind = "name" | "place" | "dob" | "phrase";

export interface ProposedText {
  text: string;
  kind: ProposedKind;
}

export interface AddedName {
  tag: string;
  /** the name as it stands in the draft; shown only on this device */
  name: string;
  clientId?: string;
}

export interface ScreenInput {
  draft: string;
  outgoing: { mask: MaskResult };
  clients: ClientEntry[];
  policy: MaskPolicy;
  /** things the device model found in the draft (an ONLY_ON_DEVICE look); optional */
  proposed?: ProposedText[];
  /** the rough note, on this device; values in it are known (X1). Absent means nothing but the list is known. */
  noteText?: string;
}

export interface Screened {
  /** the draft with every name as a tag; safe to use again as masked text */
  maskedText: string;
  /** the sent mask result, extended with the tags added here */
  mask: MaskResult;
  /** every new tag, known or not, in order of first appearance */
  addedTags: string[];
  /** the new tags that stand for a value in neither the note, the list nor the map: marked "added by the model" */
  added: AddedName[];
}

const TAG_KIND: Record<ProposedKind, TagKind> = { name: "Person", place: "Place", dob: "Date", phrase: "Detail" };
/** A bracket or brace, or the words of a tag ("Person 1"): what a device suggestion must not be made of (R16.5). */
const isTokenSyntax = (text: string): boolean => /[[\]{}]/.test(text) || /\b(?:Person|Place|Date|Detail)[ \t]*\d+\b/i.test(text);
/** A suggestion with no kind, or one the app does not know, is a describing phrase (X5). */
const kindOf = (kind: ProposedKind | undefined): TagKind => (kind !== undefined ? TAG_KIND[kind] : undefined) ?? "Detail";

export function screenDraft(input: ScreenInput): Screened {
  const { draft, clients, policy } = input;
  const sent = input.outgoing.mask;
  const protectedRanges = protectedTokenSpans(draft);
  const keepSpan = (s: MaskSpan): boolean => !protectedRanges.some((r) => s.start < r.end && s.end > r.start);

  let spans: MaskSpan[] = runPasses(draft, clients, policy).combined.filter(keepSpan);
  for (const form of sent.surfaceForms) spans = maskText(draft, spans, form).spans.filter(keepSpan);
  for (const p of input.proposed ?? []) {
    const wanted = withoutRoleWord(p.text.trim());
    // A weekday, a time, a relative day or a standalone pronoun is not something to mask (X5, H39).
    if (wanted === "" || tagsIn(wanted).length > 0 || isNotNeeded(wanted) || isPronounWord(wanted)) continue;
    // Token syntax is never a name or a detail (H17, R16.5): a tag, a pronoun token, or the words of one.
    if (isTokenSyntax(wanted)) continue;
    const key = `text:${fold(wanted)}`;
    const before = new Set(spans.map((s) => `${s.start}:${s.end}`));
    spans = maskText(draft, spans, wanted).spans
      .filter(keepSpan)
      .map((s) =>
        s.key === key && s.kind === "manual" && !before.has(`${s.start}:${s.end}`) ? { ...s, tagKind: kindOf(p.kind) } : s,
      );
  }
  const found = spans.filter((s) => s.accepted).sort((a, b) => a.start - b.start);

  // Numbers already used, in the sent record and in the draft itself, are never reused.
  const used: Record<TagKind, number> = { Person: 0, Place: 0, Date: 0, Detail: 0 };
  for (const tag of [...Object.keys(sent.map), ...tagsIn(draft)]) {
    const m = /^\[(Person|Place|Date|Detail) (\d+)\]$/i.exec(tag);
    if (m) {
      const kind = (m[1]![0]!.toUpperCase() + m[1]!.slice(1).toLowerCase()) as TagKind;
      used[kind] = Math.max(used[kind], Number(m[2]));
    }
  }

  const byClient = new Map(Object.entries(sent.clientByTag).map(([tag, id]) => [id, tag]));
  const sentByValue = new Map(Object.entries(sent.map).map(([tag, value]) => [fold(value), tag]));
  const newTags = new Map<string, string>();
  const map = { ...sent.map };
  const clientByTag = { ...sent.clientByTag };
  const surfaceForms = [...sent.surfaceForms];
  const added: AddedName[] = [];
  const newOrder: string[] = [];
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const tagFor = (s: MaskSpan): string => {
    const existing = (s.clientId ? byClient.get(s.clientId) : undefined) ?? sentByValue.get(fold(s.surfaceForm));
    if (existing) return existing;
    const kind: TagKind = s.clientId ? "Person" : s.tagKind;
    const key = `${kind}|${s.clientId ? `client:${s.clientId}` : `text:${fold(s.surfaceForm)}`}`;
    const known = newTags.get(key);
    if (known) return known;
    used[kind] += 1;
    const tag = `[${kind} ${used[kind]}]`;
    newTags.set(key, tag);
    const client = s.clientId ? clientById.get(s.clientId) : undefined;
    const name = client ? client.fullName : s.surfaceForm;
    map[tag] = name;
    if (client) clientByTag[tag] = client.id;
    newOrder.push(tag);
    // On the list, or in the rough note: she gave it to the app, so it is put back (X1).
    if (!client && !isKnownValue(name, input.noteText ?? "", clients)) added.push({ tag, name });
    return tag;
  };

  let maskedText = "";
  let at = 0;
  for (const s of found) {
    if (s.start < at) continue;
    maskedText += draft.slice(at, s.start) + tagFor(s);
    at = s.end;
    // Every form that was masked here is also checked in later egress checks.
    if (!surfaceForms.some((f) => fold(f) === fold(s.surfaceForm))) surfaceForms.push(s.surfaceForm);
  }
  maskedText += draft.slice(at);

  return {
    maskedText,
    mask: { ...sent, map, clientByTag, surfaceForms },
    addedTags: newOrder,
    added,
  };
}
