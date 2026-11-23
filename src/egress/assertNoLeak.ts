// Shared by unit and real-browser tests (egress-check R8.1, R8.5).
// Given every request a run made, finds a listed name, the original of a masked
// value (a recorded surface form), or the raw note: the whole note, or any one of
// its lines of 20 characters or more. Case is folded on both sides. It uses the
// same scan as the egress check, plus the request headers.
import { checkEgress, type Captured } from "./check";

export interface RecordedRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** the body as text or bytes; absent or null for a request with no body */
  postData?: string | Uint8Array | null;
}

export interface LeakTarget {
  listedNames: string[];
  surfaceForms: string[];
  rawNote: string;
  /** shortest note line that is searched for, default 20 */
  minLineLength?: number;
}

export interface Leak {
  /** index into the requests */
  request: number;
  url: string;
  kind: "listed name" | "masked value" | "raw note";
  value: string;
}

const encode = (s: string) => new TextEncoder().encode(s);

function toCaptured(r: RecordedRequest): Captured[] {
  const body = r.postData == null ? new Uint8Array(0) : typeof r.postData === "string" ? encode(r.postData) : r.postData;
  const out: Captured[] = [{ url: r.url, body }];
  if (r.headers && Object.keys(r.headers).length > 0) out.push({ url: "", body: encode(JSON.stringify(r.headers)) });
  return out;
}

export function noteParts(rawNote: string, minLineLength = 20): string[] {
  const whole = rawNote.trim();
  if (whole === "") return [];
  const lines = rawNote.split(/\r?\n/).map((l) => l.trim()).filter((l) => [...l].length >= minLineLength);
  return [...new Set([whole, ...lines])];
}

export function findLeaks(requests: readonly RecordedRequest[], target: LeakTarget): Leak[] {
  const noteValues = noteParts(target.rawNote, target.minLineLength);
  const leaks: Leak[] = [];
  requests.forEach((r, request) => {
    const captured = toCaptured(r);
    const names = checkEgress({ captured, listedNames: target.listedNames, surfaceForms: target.surfaceForms, sentOnPurpose: [] });
    for (const value of names.listedFound) leaks.push({ request, url: r.url, kind: "listed name", value });
    for (const value of names.maskedFound) leaks.push({ request, url: r.url, kind: "masked value", value });
    const note = checkEgress({ captured, listedNames: [], surfaceForms: noteValues, sentOnPurpose: [] });
    for (const value of note.maskedFound) leaks.push({ request, url: r.url, kind: "raw note", value });
  });
  return leaks;
}

export class LeakError extends Error {
  constructor(public readonly leaks: Leak[]) {
    super(`${leaks.length} leak(s) found: ${leaks.map((l) => `${l.kind} "${l.value.slice(0, 40)}" in request ${l.request} (${l.url})`).join("; ")}`);
    this.name = "LeakError";
  }
}

/** Throws LeakError if any request carries a listed name, a masked value or the raw note. */
export function assertNoLeak(requests: readonly RecordedRequest[], target: LeakTarget): void {
  const leaks = findLeaks(requests, target);
  if (leaks.length > 0) throw new LeakError(leaks);
}
