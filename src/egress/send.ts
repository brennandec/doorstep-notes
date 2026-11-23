// The single path out (egress-check R1 to R3, rulings 3 and 5).
//
//   1. makePreview: the exact outgoing text, checked for listed names and surface
//      forms. A value that is not on purpose blocks Send.
//   2. send: checks again, makes the ticket, wraps `fetch` for this one call, calls
//      the job with the preview text and nothing else, then runs the egress check on
//      the bytes that were captured, builds the line and appends the ledger entry.
//
// Only this module makes an EgressTicket. Cloud jobs take one, so they cannot be
// called from anywhere else without a cast (checked by a test).
import { CLOUD_MODEL_HOST, MIN_NAME_PART_LENGTH } from "../constants";
import type {
  DraftJob,
  DraftMode,
  DraftOutput,
  InferenceSource,
  JobResult,
  RewriteJob,
  SecondReaderJob,
  SecondReaderOutput,
} from "../inference/types";
import { isBrowserRefusal, isCloudRefusal } from "../inference/refusal";
import { appliedEntries } from "../masking/entries";
import type { MaskEntry } from "../masking/types";
import type { EgressTicket } from "./ticket";
import { withCapture } from "./capture";
import { checkEgress, type Answer, type Captured, type CheckResult } from "./check";
import { sha256Hex } from "./hash";
import type { Ledger, LedgerEntry, LedgerRequest } from "./ledger";
import { buildBlockedLine, buildLines, type EgressLines } from "./line";

export type CloudJobName = LedgerEntry["job"];
export type JobMode = LedgerEntry["mode"];

/** What the check compares the text against. All of it stays on this device. */
export interface CheckValues {
  listedNames: string[];
  /** the listed names grouped by person; the block line shows one name for each person (egress-check R15) */
  listedGroups?: string[][];
  surfaceForms: string[];
  sentOnPurpose: string[];
  /** the mask-map entries; the ones whose tag stands in the text are counted and checked (X2) */
  entries?: MaskEntry[];
  minPartLength?: number;
}

export interface SendContext extends CheckValues {
  ledger: Ledger;
  now?: () => Date;
  /**
   * Test-only. Changes the body after the preview and before the check, to prove a
   * leak is caught. A build for users does not set it.
   */
  seedLeak?: (body: Uint8Array) => Uint8Array;
}

export interface Preview {
  /** exactly what zone 2 shows and what the job is given */
  readonly text: string;
  readonly result: CheckResult;
  readonly canSend: boolean;
  /** the blocking line; null when Send is allowed */
  readonly blockedLine: EgressLines | null;
}

const encode = (s: string) => new TextEncoder().encode(s);

function minPart(v: CheckValues): number {
  return v.minPartLength ?? MIN_NAME_PART_LENGTH;
}

export function makePreview(text: string, values: CheckValues): Preview {
  const result = checkEgress({
    captured: [{ url: "", body: encode(text) }],
    listedNames: values.listedNames,
    surfaceForms: values.surfaceForms,
    sentOnPurpose: values.sentOnPurpose,
    ...(values.entries ? { entries: appliedEntries(values.entries, text) } : {}),
    minPartLength: minPart(values),
  });
  return {
    text,
    result,
    canSend: result.passed,
    blockedLine: result.passed ? null : buildBlockedLine(result, values.listedGroups),
  };
}

/**
 * The body a cloud model call carries, in the request shape of the Gemini API.
 * Used only when a test double answers, so there is a body to check and to hash.
 */
export function bodyForDouble(text: string): Uint8Array {
  return encode(JSON.stringify({ contents: [{ role: "user", parts: [{ text }] }] }));
}

export interface SendRequest<T> {
  preview: Preview;
  job: CloudJobName;
  mode: JobMode;
  /** Calls the job. It must pass `text` on unchanged. */
  run(ticket: EgressTicket, text: string): Promise<JobResult<T>>;
}

export type SendOutcome<T> =
  | { status: "blocked"; preview: Preview; lines: EgressLines }
  | { status: "sent"; result: JobResult<T>; check: CheckResult; lines: EgressLines; entry: LedgerEntry; captured: Captured[]; browserRefused?: boolean }
  | { status: "failed"; error: unknown; check: CheckResult; lines: EgressLines; entry: LedgerEntry; captured: Captured[]; browserRefused?: boolean };

function sourceFromMode(mode: JobMode): InferenceSource {
  return mode === "ONLY_ON_DEVICE" || mode === "PREFER_ON_DEVICE" ? "ON_DEVICE" : "IN_CLOUD";
}

const issueTicket = (): EgressTicket => ({}) as EgressTicket;

const APP_CHECK_HOST = "content-firebaseappcheck.googleapis.com";

function pageHost(): string {
  try {
    return typeof location === "undefined" ? "" : location.host;
  } catch {
    return "";
  }
}

/** Off-page requests only. The preview text is compared and not stored. */
export function offPageRequests(bodies: Captured[], preview: string): LedgerRequest[] {
  const here = pageHost();
  const rows: LedgerRequest[] = [];
  for (const body of bodies) {
    let host = "";
    try {
      host = body.url === "" ? "" : new URL(body.url).host;
    } catch {
      host = "";
    }
    if (host === "" || (here !== "" && host === here)) continue;
    const text = new TextDecoder().decode(body.body);
    const escaped = JSON.stringify(preview).slice(1, -1);
    rows.push({
      host: host.toLowerCase(),
      bytes: body.body.byteLength,
      carriesNote: preview.length > 0 && (text.includes(preview) || (escaped !== preview && text.includes(escaped))),
      preflight: body.preflight === true,
    });
  }
  return rows;
}

function urlHost(url: string): string {
  try {
    return url === "" ? "" : new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * The calls of the cloud jobs live in this file, so no other module calls a cloud
 * job's run (checked by the import scan). Each returns the `run` for a SendRequest.
 */
export function draftRunner(job: DraftJob, mode: DraftMode): SendRequest<DraftOutput>["run"] {
  return (ticket, text) => job.run(ticket, { text }, mode);
}

/** The text is the one sentence plus its instructions; `tags` are the tags in the sentence (R7.2). */
export function rewriteRunner(job: RewriteJob, tags: string[], deviceOnly = false): SendRequest<string>["run"] {
  return (ticket, text) => job.run(ticket, { text, tags, deviceOnly });
}

/** The text is the masked record plus the fixed instructions, exactly as zone 2 shows it. */
export function secondReaderRunner(job: SecondReaderJob): SendRequest<SecondReaderOutput>["run"] {
  return (ticket, text) => job.run(ticket, { text });
}

/**
 * The host of the cloud model call when one was recorded, else the first recorded request's host,
 * or "" when none was made (a double or a device job). App Check makes its own request first
 * (sdk-facts 32 to 35), and the card is about the call that carries the text.
 */
export function hostOf(captured: Captured[]): string {
  const hosts: string[] = [];
  for (const c of captured) {
    try {
      if (c.url !== "") hosts.push(new URL(c.url).host);
    } catch {
      // Not an absolute address: no host to show.
    }
  }
  return hosts.find((h) => h === CLOUD_MODEL_HOST) ?? hosts[0] ?? "";
}

/**
 * How the request that carries the text was answered (egress-check R17): the last request to the cloud
 * model host, else the first request with an address. Undefined when no request was recorded or the
 * wrapper recorded no status.
 */
export function statusOf(captured: Captured[]): Answer | undefined {
  const withUrl = captured.filter((c) => c.url !== "");
  const toModel = withUrl.filter((c) => {
    try {
      return new URL(c.url).host === CLOUD_MODEL_HOST;
    } catch {
      return false;
    }
  });
  return (toModel.length > 0 ? toModel[toModel.length - 1] : withUrl[0])?.status;
}

export async function send<T>(req: SendRequest<T>, ctx: SendContext): Promise<SendOutcome<T>> {
  // Checked again here, so a caller cannot send a preview that was blocked.
  const again = makePreview(req.preview.text, ctx);
  if (!again.canSend) return { status: "blocked", preview: again, lines: again.blockedLine! };

  const outcome = await withCapture(() => req.run(issueTicket(), req.preview.text));
  const connected = outcome.ok ? outcome.value.connected : outcome.captured.length > 0;

  let bodies: Captured[] = outcome.captured;
  if (outcome.ok && !outcome.value.connected) {
    // A double made no request. Check, and hash, the body the send path built for it.
    bodies = [...outcome.captured, { url: "", body: bodyForDouble(req.preview.text) }];
  }
  if (ctx.seedLeak) {
    bodies = bodies.map((c, i) => (i === bodies.length - 1 ? { ...c, body: ctx.seedLeak!(c.body) } : c));
    if (bodies.length === 0) bodies = [{ url: "", body: ctx.seedLeak(new Uint8Array(0)) }];
  }

  const check = checkEgress({
    captured: bodies,
    listedNames: ctx.listedNames,
    surfaceForms: ctx.surfaceForms,
    sentOnPurpose: ctx.sentOnPurpose,
    ...(ctx.entries ? { entries: appliedEntries(ctx.entries, req.preview.text) } : {}),
    minPartLength: minPart(ctx),
  });

  const source = outcome.ok ? outcome.value.inferenceSource : sourceFromMode(req.mode);
  const deviceOnly = req.job === "draft" && source === "ON_DEVICE" && bodies.length === 0;
  const status = statusOf(outcome.captured);
  const lines = buildLines({
    result: check,
    connected,
    deviceOnly,
    minPartLength: minPart(ctx),
    host: hostOf(outcome.captured),
    ...(status !== undefined ? { status } : {}),
    source,
    seeded: ctx.seedLeak !== undefined,
  });

  const browserRefused =
    bodies.some((c) => urlHost(c.url) === APP_CHECK_HOST && c.status === 403) ||
    (!outcome.ok && isBrowserRefusal(outcome.error));

  const entry: LedgerEntry = {
    at: (ctx.now?.() ?? new Date()).toISOString(),
    sha256: await Promise.all(bodies.map((b) => sha256Hex(b.body))),
    byteLengths: bodies.map((b) => b.body.byteLength),
    listedChecked: check.listedChecked,
    listedFound: check.listedFound.length,
    maskedChecked: check.maskedChecked,
    maskedFound: check.maskedFound.length,
    onPurpose: check.onPurposeFound.length,
    job: req.job,
    mode: req.mode,
    inferenceSource: source,
    connected,
    outcome: outcome.ok ? "answered" : browserRefused || isCloudRefusal(outcome.error) ? "refused" : "failed",
    requests: offPageRequests(bodies, req.preview.text),
  };
  ctx.ledger.append(entry);

  if (outcome.ok) return { status: "sent", result: outcome.value, check, lines, entry, captured: bodies, ...(browserRefused ? { browserRefused } : {}) };
  return { status: "failed", error: outcome.error, check, lines, entry, captured: bodies, ...(browserRefused ? { browserRefused } : {}) };
}
