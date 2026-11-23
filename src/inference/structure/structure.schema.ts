// The visit record: its JSON Schema (passed to the device model as the
// response constraint) and the check applied to whatever comes back.
// Missing items are empty lists or an empty date, never invented text (R4.2).
import type { PersonTag, VisitRecord } from "../types";

const ROLES = ["client", "worker", "other"] as const;

export const VISIT_RECORD_SCHEMA = {
  type: "object",
  properties: {
    visitDate: {
      type: "string",
      description:
        "Copy the date words exactly as written in the note, for example 12/11. " +
        "Never convert, complete or add a year or a month name. Empty if the note has no date.",
    },
    present: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, role: { type: "string", enum: [...ROLES] } },
        required: ["label", "role"],
        additionalProperties: false,
      },
    },
    seen: { type: "array", items: { type: "string" } },
    agreed: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    nextSteps: { type: "array", items: { type: "string" } },
  },
  required: ["visitDate", "present", "seen", "agreed", "risks", "nextSteps"],
  additionalProperties: false,
} as const;

export function emptyRecord(): VisitRecord {
  return { visitDate: "", present: [], seen: [], agreed: [], risks: [], nextSteps: [] };
}

export type RecordCheck =
  | { ok: true; record: VisitRecord }
  | { ok: false; problems: string[]; partial: Partial<VisitRecord> };

const LIST_FIELDS = ["seen", "agreed", "risks", "nextSteps"] as const;

export function checkVisitRecord(value: unknown): RecordCheck {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, problems: ["The reply is not a record."], partial: {} };
  }
  const input = value as Record<string, unknown>;
  const record = emptyRecord();
  const partial: Partial<VisitRecord> = {};
  const problems: string[] = [];

  if (input.visitDate !== undefined) {
    if (typeof input.visitDate === "string") {
      record.visitDate = input.visitDate;
      partial.visitDate = input.visitDate;
    } else problems.push("visitDate is not text.");
  }

  if (input.present !== undefined) {
    const tags: PersonTag[] = [];
    let good = Array.isArray(input.present);
    if (good) {
      for (const item of input.present as unknown[]) {
        const t = item as Record<string, unknown> | null;
        if (
          t && typeof t === "object" && typeof t.label === "string" && t.label.trim() !== "" &&
          typeof t.role === "string" && (ROLES as readonly string[]).includes(t.role)
        ) tags.push({ label: t.label, role: t.role as PersonTag["role"] });
        else good = false;
      }
    }
    if (good) {
      record.present = tags;
      partial.present = tags;
    } else problems.push("present is not a list of tags.");
  }

  for (const field of LIST_FIELDS) {
    const v = input[field];
    if (v === undefined) continue;
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      record[field] = v as string[];
      partial[field] = v as string[];
    } else problems.push(`${field} is not a list of text.`);
  }

  // Optional. The structure schema does not ask the model for it. A record that
  // already carries it, including the invented example, keeps the lines.
  if (Array.isArray(input.purpose) && input.purpose.every((x) => typeof x === "string") && input.purpose.length > 0) {
    record.purpose = input.purpose as string[];
    partial.purpose = input.purpose as string[];
  }

  return problems.length === 0 ? { ok: true, record } : { ok: false, problems, partial };
}
