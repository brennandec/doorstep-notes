// The reply the propose-masks job asks for, and the check on what comes back.
// Like the structure schema, this syntax is not checked in a real browser yet
// (docs/sdk-facts.md fact 40); the device-model task settles it.
import type { Candidate } from "../types";

export const CANDIDATE_KINDS = ["name", "place", "dob", "phrase"] as const;

export const CANDIDATES_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kind: { type: "string", enum: [...CANDIDATE_KINDS] },
        },
        required: ["text", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
} as const;

export const PROPOSE_SYSTEM_PROMPT =
  "You help a caseworker hide details that could identify a person before a note is shared. " +
  "Read the note and list the exact pieces of text that could identify someone: names of people, " +
  "places and addresses, dates of birth, and describing phrases such as a family relationship. " +
  "Reply with JSON only: a list called candidates, each with the text copied exactly as written in the note " +
  "and a kind of name, place, dob or phrase. List only text that appears in the note. " +
  "Do not suggest a weekday, a time or a relative day on its own. " +
  "If there is nothing to list, reply with an empty list.";

export type CandidateCheck = { ok: true; candidates: Candidate[] } | { ok: false };

export function checkCandidates(value: unknown): CandidateCheck {
  if (typeof value !== "object" || value === null) return { ok: false };
  const list = (value as { candidates?: unknown }).candidates;
  if (!Array.isArray(list)) return { ok: false };
  const out: Candidate[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) return { ok: false };
    const { text, kind } = item as { text?: unknown; kind?: unknown };
    if (typeof text !== "string") return { ok: false };
    // No kind from the model: keep it as a describing phrase, tagged [Detail n] (third review, X5).
    if (kind === undefined || kind === null || kind === "") {
      out.push({ text, kind: "phrase" });
      continue;
    }
    if (!(CANDIDATE_KINDS as readonly unknown[]).includes(kind)) return { ok: false };
    out.push({ text, kind: kind as Candidate["kind"] });
  }
  return { ok: true, candidates: out };
}
