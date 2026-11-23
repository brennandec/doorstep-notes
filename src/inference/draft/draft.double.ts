// The draft double: answers the cloud draft while the cloud flag is off. It makes
// no request. Every result says connected: false, which the screen shows as
// "not connected". It writes a fixed note from the labelled lines of the outgoing
// text, with the tags kept and pronoun tokens in the form the instructions ask for.
import type { DraftJob } from "../types";

const LABELS = ["Visit date", "Present", "Seen", "Agreed", "Risks", "Next steps"] as const;

function field(text: string, label: string): string {
  const m = new RegExp(`^${label}: (.*)$`, "m").exec(text);
  const value = m?.[1]?.trim() ?? "";
  return value === "none" ? "" : value;
}

const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
/** H51d: a record line lists its items with "; ". Each item becomes its own sentence, so two items never run together. */
const items = (s: string) => s.split(/;\s+/).map((i) => sentence(i.trim())).filter((i) => i !== ".").join(" ");

export function fixedNote(outgoing: string, short: boolean): string {
  const [date, present, seen, agreed, risks, next] = LABELS.map((l) => field(outgoing, l));
  const person = /\[Person \d+\]/.exec(present ?? "")?.[0]?.replace(/^\[|\]$/g, "");
  const lines = [`Case note for the visit on ${date || "an unrecorded date"}.`];
  if (present) lines.push(`Present: ${present}.`);
  if (seen) lines.push(`Seen: ${items(seen)}`);
  if (agreed) lines.push(`Agreed: ${items(agreed)}`);
  if (person) lines.push(`{They:${person}} took part in the visit, and {their:${person}} account was recorded.`);
  if (short) return lines.join(" ");
  if (risks) lines.push(`Risks: ${items(risks)}`);
  if (next) lines.push(`Next steps: ${items(next)}`);
  lines.push("This note was drafted from a fixed sample, not by a model.");
  return lines.join("\n");
}

export const draftDouble: DraftJob = {
  async run(_t, input, mode) {
    const device = mode === "ONLY_ON_DEVICE";
    return {
      value: { text: fixedNote(input.text, device), short: device },
      inferenceSource: device ? "ON_DEVICE" : "IN_CLOUD",
      connected: false,
    };
  },
};
