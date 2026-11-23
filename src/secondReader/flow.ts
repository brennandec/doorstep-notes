// The second reader flow (design, "Flow"). She asks; zone 2 shows the outgoing text and
// the notice; the preview check runs; she presses Send. Then:
//   send() captures the body, calls the job, checks the captured body and appends a
//   ledger entry with job "secondReader" (rulings 3, 4).
//   redact replaces any listed name or recorded surface form in the reply by its tag (ruling 14).
//   keepEvidence drops quotes that are not in the masked text.
// The raw reply lives in this function only. What is returned is the redacted reply.
// Nothing here writes to storage, and the ledger entry holds counts and hashes only (R3.3).
import { strings } from "../app/strings";
import type { Captured } from "../egress/check";
import type { EgressLines } from "../egress/line";
import type { Ledger, LedgerEntry } from "../egress/ledger";
import { sha256Hex } from "../egress/hash";
import { hostOf, makePreview, secondReaderRunner, send, type CheckValues, type Preview } from "../egress/send";
import { isCloudModelUrl } from "../egress/watch";
import { secondReaderText } from "../inference/secondReader/instructions";
import { SecondReaderFailure } from "../inference/secondReader/secondReader.real";
import type { Guess, InferenceSource, SecondReaderJob } from "../inference/types";
import type { ClientEntry } from "../masking/clientList";
import type { MaskPolicy } from "../masking/policy";
import { isOffline, type OnlineDeps } from "../net/online";
import type { MaskResult } from "../masking/types";
import { PLACE_CLUE, RELATION_CLUE } from "../app/example/inventedVisit";
import { keepEvidence } from "./evidence";
import { rankGuesses } from "./rank";
import { redactReply } from "./redact";

export interface ReaderPrepared {
  /** exactly what zone 2 shows and what the job is given */
  text: string;
  /** the masked record alone; quotes must be found in it */
  maskedRecord: string;
  preview: Preview;
  /** what the check compares against; stays on this device */
  values: CheckValues;
  mask: MaskResult;
}

/** The masked record is what she already sees in zone 2; the fixed instructions are added. */
export function prepareSecondReader(outgoing: { maskedRecord: string; mask: MaskResult }): ReaderPrepared {
  const text = secondReaderText(outgoing.maskedRecord);
  const values: CheckValues = {
    listedNames: outgoing.mask.listedNames,
    ...(outgoing.mask.listedGroups ? { listedGroups: outgoing.mask.listedGroups } : {}),
    surfaceForms: outgoing.mask.surfaceForms,
    sentOnPurpose: outgoing.mask.sentOnPurpose,
    ...(outgoing.mask.entries ? { entries: outgoing.mask.entries } : {}),
  };
  return { text, maskedRecord: outgoing.maskedRecord, preview: makePreview(text, values), values, mask: outgoing.mask };
}

export interface ReaderDeps {
  reader: SecondReaderJob;
  ledger: Ledger;
  clients: ClientEntry[];
  policy: MaskPolicy;
  now?: () => Date;
}

/**
 * What one second-reader pass did on the wire, read from the bytes the send path captured.
 * A pass "left" only when a request with an address was captured and it carried bytes. A double
 * makes no request, so it never leaves. `read` is the text she saw and the cloud was given.
 */
export interface ReaderPass {
  left: boolean;
  host: string;
  model: string;
  /** requests to the cloud model alone (the call that carries the masked text) */
  modelRequests: number;
  /** bytes of the bodies of those requests */
  modelBytes: number;
  /** every captured request that had an address and a body, the App Check exchange included */
  requests: number;
  /** total bytes of those bodies */
  bytes: number;
  /** SHA-256 of the body of the call to the cloud model, or of the first body; empty when none left */
  sha256: string;
  at: string;
  /** the text of the pass as shown before Send */
  read: string;
}

const modelOf = (url: string): string => /\/models\/([^/:?]+):/.exec(url)?.[1] ?? "";

export async function readPass(captured: Captured[], text: string, at: string): Promise<ReaderPass> {
  const wire = captured.filter((c) => c.url !== "" && c.body.byteLength > 0);
  if (wire.length === 0) return { left: false, host: "", model: "", modelRequests: 0, modelBytes: 0, requests: 0, bytes: 0, sha256: "", at, read: "" };
  const host = hostOf(wire);
  const call = wire.find((c) => c.url.includes(":generateContent")) ?? wire.find((c) => safeHost(c.url) === host) ?? wire[0]!;
  const toModel = wire.filter((c) => isCloudModelUrl(c.url));
  return {
    left: true,
    host,
    model: modelOf(call.url),
    modelRequests: toModel.length,
    modelBytes: toModel.reduce((n, c) => n + c.body.byteLength, 0),
    requests: wire.length,
    bytes: wire.reduce((n, c) => n + c.body.byteLength, 0),
    sha256: await sha256Hex(call.body),
    at,
    read: text,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export interface ReaderResult {
  /** redacted, with quotes found in the masked text only */
  guesses: Guess[];
  /** names replaced by tags; when above zero the panel shows the redaction line */
  replaced: number;
  /** every quote was dropped: the panel shows the nothing-to-tap line */
  allDropped: boolean;
  source: InferenceSource;
  connected: boolean;
  /** what this pass did on the wire */
  pass: ReaderPass;
}

export type ReaderOutcome =
  | { status: "blocked"; lines: EgressLines }
  | { status: "answered"; result: ReaderResult; lines: EgressLines; entry: LedgerEntry; captured: Captured[] }
  | { status: "failed"; line: string; lines: EgressLines; entry: LedgerEntry; captured: Captured[] };

export async function askSecondReader(prep: ReaderPrepared, deps: ReaderDeps): Promise<ReaderOutcome> {
  const out = await send(
    {
      preview: prep.preview,
      job: "secondReader",
      mode: "ONLY_IN_CLOUD",
      run: secondReaderRunner(deps.reader),
    },
    { ...prep.values, ledger: deps.ledger, ...(deps.now ? { now: deps.now } : {}) },
  );

  if (out.status === "blocked") return { status: "blocked", lines: out.lines };
  if (out.status === "failed") {
    const line = out.browserRefused
      ? strings.secondReader.browserRefused
      : out.error instanceof SecondReaderFailure
        ? out.error.line
        : strings.secondReader.needsConnection;
    return { status: "failed", line, lines: out.lines, entry: out.entry, captured: out.captured };
  }

  const redacted = redactReply(out.result.value, { mask: prep.mask, clients: deps.clients, policy: deps.policy });
  const kept = keepEvidence(redacted.guesses, prep.maskedRecord);
  // keepEvidence keeps who and the quotes it found; the description, why and kind are carried over by position.
  const guesses = rankGuesses(
    kept.guesses.map((g, i) => {
      const from = redacted.guesses[i]!;
      return { ...from, evidence: g.evidence };
    }),
    { place: PLACE_CLUE, relation: RELATION_CLUE },
  );
  return {
    status: "answered",
    result: {
      guesses,
      replaced: redacted.replaced,
      allDropped: kept.allDropped,
      source: out.result.inferenceSource,
      connected: out.result.connected,
      pass: await readPass(out.captured, prep.text, out.entry.at),
    },
    lines: out.lines,
    entry: out.entry,
    captured: out.captured,
  };
}

export type ReaderAvailability = { available: true } | { available: false; line: string };

/**
 * Whether a second reader can be asked now (R4.1). Offline is the browser's online state
 * plus one failed probe (ruling 17). The device model plays no part: this job does not use it (R4.2).
 */
export async function readerAvailability(online: OnlineDeps): Promise<ReaderAvailability> {
  return (await isOffline(online)) ? { available: false, line: strings.secondReader.needsConnection } : { available: true };
}

export type AskOutcome = ReaderOutcome | { status: "offline"; line: string };

/** Checks the connection first. Offline, nothing is called, nothing is written to the ledger, and the text is kept. */
export async function askWhenOnline(prep: ReaderPrepared, deps: ReaderDeps & { online: OnlineDeps }): Promise<AskOutcome> {
  const a = await readerAvailability(deps.online);
  if (!a.available) return { status: "offline", line: a.line };
  return askSecondReader(prep, deps);
}
