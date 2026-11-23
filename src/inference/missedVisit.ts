import type { VisitRecord } from "./types";

const NON_VISIT_MISSED_CLAUSE =
  /\b(?:no\s+answer\s+(?:from|by)\s+(?:the\s+)?(?:landlord|gp|doctor|council|housing|office|solicitor|agency|service|manager|team|reception|clinic|number|email)\b|(?:landlord|gp|doctor|council|housing|office|solicitor|agency|service)\b[^.\n;]*\bno\s+answer\b|missed\s+(?:a\s+|the\s+|an\s+|her\s+|his\s+|their\s+|[\w-]+\s+)?(?:deadline|bus|train|call|payment|dose|medication)\b|missed\s+(?:the\s+)?(?:landlord|gp|doctor|council|housing|office|hospital|dental|school)[^.\n;]*\bapp(?:ointment|t)?\b)/gi;

const MISSED_VISIT_CUE =
  /\b(?:missed\s+app(?:ointment|t)?|did\s+not\s+attend|no\s+answer|unanswered\s+(?:knock|call|visit|door)|no\s+response\s+at\s+(?:the\s+)?(?:door|flat|house)|not\s+(?:at\s+)?home|curtains\s+shut|nobody\s+(?:at\s+home|home|in|answered)|no\s+one\s+(?:at\s+home|home|in|answered)|left\s+a\s+card)\b/i;

const HOUSEHOLD_MET_CUE =
  /\b(?:let\s+(?:me|us)\s+in|welcomed\s+(?:me|us)\s+in|client\s+was\s+(?:at\s+)?home|spoke\s+(?:with|to)\s+(?:the\s+)?client\s+(?:in|at)|(?:was|were)\s+in\b|[A-Za-z][A-Za-z.-]+\s+in[.,;]|sat\s+with\b)\b/i;

/** Returns true when a rough note or field text describes a missed appointment or no-answer visit (ignoring third-party no-answer or deadline misses). */
export function isMissedVisitText(text: string): boolean {
  const cleaned = text.replace(NON_VISIT_MISSED_CLAUSE, " ");
  return MISSED_VISIT_CUE.test(cleaned);
}

/** Returns true when a structured visit record (or its originating note) describes a missed appointment or no-answer visit. */
export function isMissedVisitRecord(
  record: Pick<VisitRecord, "seen" | "agreed" | "risks" | "nextSteps">,
  noteText = "",
): boolean {
  const combined = [noteText, ...record.seen, ...record.agreed, ...record.risks, ...record.nextSteps].join("\n");
  return isMissedVisitText(combined) && !HOUSEHOLD_MET_CUE.test(noteText);
}

/**
 * Removes absent household and front-desk contacts from `present` when the note
 * describes a missed appointment or no-answer visit so drafting never presents them as attending.
 */
export function sanitizeMissedVisitPresent(noteText: string, record: VisitRecord): VisitRecord {
  if (!isMissedVisitRecord(record, noteText)) return record;
  const present = record.present.filter((p) => p.role === "worker");
  return present.length === record.present.length ? record : { ...record, present };
}
