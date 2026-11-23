// Redaction of the second reader's reply (R3, ruling 14). The reader is an outside
// model. Whatever it answers is text, and it can name a person from her list even
// though the text it was given held only tags. Before the reply is shown, every
// listed name, every near variant of one, and every recorded surface form in it is
// replaced by its tag, comparing with case folding.
//
// A person with a tag in the sent text gets that tag. A listed person with no tag
// there gets a new tag whose number is not used by the sent text. The same person
// gets the same tag in every field of the reply.
//
// Runs on this device. It reads the reply and returns a new one. It writes nothing:
// the raw reply is never stored and never put in the ledger (R3.3).
import type { Guess, SecondReaderOutput } from "../inference/types";
import type { ClientEntry } from "../masking/clientList";
import { runPasses } from "../masking/entry";
import { fold } from "../masking/fold";
import type { MaskPolicy } from "../masking/policy";
import { maskText } from "../masking/toggle";
import type { MaskResult, MaskSpan, TagKind } from "../masking/types";

export interface RedactedReply {
  guesses: Guess[];
  /** how many names were replaced by tags */
  replaced: number;
}

export interface RedactContext {
  /** the mask of the text that was sent: tags, surface forms and listed names */
  mask: MaskResult;
  clients: ClientEntry[];
  policy: MaskPolicy;
}

export function redactReply(reply: SecondReaderOutput, ctx: RedactContext): RedactedReply {
  const { mask, clients, policy } = ctx;

  const byClient = new Map(Object.entries(mask.clientByTag).map(([tag, id]) => [id, tag]));
  const byForm = new Map<string, string>();
  for (const [tag, value] of Object.entries(mask.map)) byForm.set(fold(value), tag);
  for (const s of mask.spans) if (s.accepted && s.tag !== "") byForm.set(fold(s.surfaceForm), s.tag);

  // Numbers already used in the sent text are never reused for a tag made here.
  const used: Record<TagKind, number> = { Person: 0, Place: 0, Date: 0, Detail: 0 };
  for (const tag of Object.keys(mask.map)) {
    const m = /^\[(Person|Place|Date|Detail) (\d+)\]$/.exec(tag);
    if (m) used[m[1] as TagKind] = Math.max(used[m[1] as TagKind], Number(m[2]));
  }
  const made = new Map<string, string>();
  let replaced = 0;

  const tagFor = (s: MaskSpan): string => {
    const known = (s.clientId ? byClient.get(s.clientId) : undefined) ?? byForm.get(fold(s.surfaceForm));
    if (known) return known;
    const kind: TagKind = s.clientId ? "Person" : "Detail";
    const key = s.clientId ? `client:${s.clientId}` : `text:${fold(s.surfaceForm)}`;
    const existing = made.get(key);
    if (existing) return existing;
    used[kind] += 1;
    const tag = `[${kind} ${used[kind]}]`;
    made.set(key, tag);
    return tag;
  };

  const redact = (text: string): string => {
    if (text === "") return text;
    let spans: MaskSpan[] = runPasses(text, clients, policy).combined;
    for (const form of mask.surfaceForms) spans = maskText(text, spans, form).spans;
    const found = spans.filter((s) => s.accepted).sort((a, b) => a.start - b.start);
    let out = "";
    let at = 0;
    for (const s of found) {
      if (s.start < at) continue;
      out += text.slice(at, s.start) + tagFor(s);
      at = s.end;
      replaced += 1;
    }
    return out + text.slice(at);
  };

  // description and why are redacted as who is (ruling 14). kind is one of six fixed words.
  const guesses = reply.guesses.map((g) => {
    const out: Guess = { who: redact(g.who), evidence: g.evidence.map(redact) };
    if (g.description !== undefined) out.description = redact(g.description);
    if (g.why !== undefined) out.why = redact(g.why);
    if (g.kind !== undefined) out.kind = g.kind;
    return out;
  });
  return { guesses, replaced };
}
