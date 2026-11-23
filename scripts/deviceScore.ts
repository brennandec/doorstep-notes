// Scoring side of the device measure (measurement task 7, R2, R4, R5). No browser here.
// The device pass, the exact pass and the merge are each scored on the raw note, over the
// same notes: those the device model answered. A note it did not answer is listed as failed
// and is left out of every score, so the passes are compared on equal ground.
import { DEVICE_MEASURE_LIMIT_MIN } from "../src/constants";
import { checkCandidates } from "../src/inference/proposeMasks/proposeMasks.schema";
import { parseReply } from "../src/inference/proposeMasks/proposeMasks.real";
import { findExact } from "../src/masking/exact";
import { mergeProposals, type Proposal } from "../src/masking/merge";
import { exactAndNear } from "../src/masking/passes";
import type { MaskPolicy } from "../src/masking/policy";
import type { SyntheticNote } from "./buildSet";
import type { ResultsHeader } from "./results";
import { scorePass, type PassResult, type Span } from "./score";

export type NoteReply =
  | { noteId: string; ok: true; candidates: Proposal[]; ms: number }
  | { noteId: string; ok: false; reason: string; ms: number };

export type ParsedReply = { ok: true; candidates: Proposal[] } | { ok: false; reason: string };

/** The same reading of the reply as the job in the app (code fence removed, shape checked). */
export function parseDeviceReply(text: string): ParsedReply {
  let parsed: unknown;
  try {
    parsed = parseReply(text);
  } catch {
    return { ok: false, reason: "The reply was not JSON." };
  }
  const check = checkCandidates(parsed);
  return check.ok ? { ok: true, candidates: check.candidates } : { ok: false, reason: "The reply did not have the shape the schema asks for." };
}

/**
 * The time box in minutes. DEVICE_MEASURE_LIMIT_MIN in the environment may shorten it for one
 * session; it can never lengthen the constant (ruling 7). Anything else falls back to the constant.
 */
export function limitMinutes(env: Record<string, string | undefined> = process.env): number {
  const raw = env["DEVICE_MEASURE_LIMIT_MIN"];
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 && n <= DEVICE_MEASURE_LIMIT_MIN ? n : DEVICE_MEASURE_LIMIT_MIN;
}

export interface DeviceRun {
  /** notes the device model answered, scored below */
  n: number;
  /** notes tried, answered or not */
  attempted: number;
  failed: { noteId: string; reason: string }[];
  /** exact pass alone, on the answered notes */
  exact: PassResult;
  /** exact and near together, on the answered notes */
  exactAndNear: PassResult;
  /** the device pass alone */
  device: PassResult;
  /** exact, near and device, joined as the app joins them */
  merged: PassResult;
}

const toSpans = (spans: Span[]): Span[] => spans.map((s) => ({ start: s.start, end: s.end }));

export function scoreDeviceRun(notes: SyntheticNote[], replies: NoteReply[], policy: MaskPolicy): DeviceRun {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const answered: { note: SyntheticNote; candidates: Proposal[] }[] = [];
  const failed: DeviceRun["failed"] = [];
  for (const r of replies) {
    const note = byId.get(r.noteId);
    if (!note) throw new Error(`Reply for an unknown note: ${r.noteId}`);
    if (r.ok) answered.push({ note, candidates: r.candidates });
    else failed.push({ noteId: r.noteId, reason: r.reason });
  }
  const scored = answered.map((a) => a.note);
  const exactSpans = new Map<string, Span[]>();
  const comboSpans = new Map<string, Span[]>();
  const deviceSpans = new Map<string, Span[]>();
  const mergedSpans = new Map<string, Span[]>();
  for (const { note, candidates } of answered) {
    const raw = note.text;
    const exact = findExact(raw, note.clientList, policy);
    const combo = exactAndNear(raw, note.clientList, policy);
    exactSpans.set(note.id, toSpans(exact));
    comboSpans.set(note.id, toSpans(combo));
    deviceSpans.set(note.id, toSpans(mergeProposals(raw, [], candidates, policy).spans));
    mergedSpans.set(note.id, toSpans(mergeProposals(raw, combo, candidates, policy).spans));
  }
  return {
    n: answered.length,
    attempted: replies.length,
    failed,
    exact: scorePass(scored, exactSpans),
    exactAndNear: scorePass(scored, comboSpans),
    device: scorePass(scored, deviceSpans),
    merged: scorePass(scored, mergedSpans),
  };
}

export interface RunTiming {
  elapsedMs: number;
  limitMin: number;
  stoppedAtLimit: boolean;
  /** Set when the run ended before the limit and before the last note, with the reason. */
  stoppedEarlyBecause?: string;
}

type Obj = Record<string, unknown>;
export interface FilePair {
  catchRate: Obj;
  misses: Obj;
}

/** Fills the device and merged parts of the two results files. Every other part is kept as it was. */
export function applyDeviceRun(
  earlierCatch: Obj,
  earlierMisses: Obj,
  run: DeviceRun,
  header: ResultsHeader,
  timing: RunTiming,
  model?: string,
): FilePair {
  if (run.n === 0) {
    const why = run.failed[0]?.reason ?? "No note was tried.";
    return deviceNotMeasured(earlierCatch, earlierMisses, `The device model answered no note. ${why}`);
  }
  const minutes = timing.elapsedMs / 60_000;
  const notesPerMinute = minutes > 0 ? Math.round((run.attempted / minutes) * 100) / 100 : 0;
  const own = { ...header, n: run.n, attempted: run.attempted, failedNotes: run.failed.length };
  const device = {
    ...own,
    ...run.device.score,
    notesPerMinute,
    elapsedSeconds: Math.round(timing.elapsedMs / 1000),
    limitMinutes: timing.limitMin,
    stoppedAtLimit: timing.stoppedAtLimit,
    ...(timing.stoppedEarlyBecause ? { stoppedEarlyBecause: timing.stoppedEarlyBecause } : {}),
    ...(model ? { model } : {}),
  };
  const merged = { ...own, ...run.merged.score };
  const falseMasks = { ...((earlierMisses["falseMasks"] as Obj | undefined) ?? {}), device: run.device.falseMaskItems };
  return {
    catchRate: {
      ...earlierCatch,
      device,
      merged,
      // The exact passes on the same n notes, so the three figures are compared on equal ground.
      exactOnDeviceNotes: { ...own, ...run.exact.score },
      exactAndNearOnDeviceNotes: { ...own, ...run.exactAndNear.score },
    },
    misses: {
      ...earlierMisses,
      device: run.device.misses,
      merged: run.merged.misses,
      exactOnDeviceNotes: run.exact.misses,
      falseMasks: { ...falseMasks, merged: run.merged.falseMaskItems },
      deviceNotesFailed: run.failed,
    },
  };
}

/** Device and merged read "not measured", with the reason and no number. */
export function deviceNotMeasured(earlierCatch: Obj, earlierMisses: Obj, reason: string): FilePair {
  const part = { status: "not measured", reason };
  const earlierFalse = (earlierMisses["falseMasks"] as Obj | undefined) ?? {};
  return {
    catchRate: { ...earlierCatch, device: part, merged: { ...part } },
    misses: { ...earlierMisses, device: "not measured", merged: "not measured", falseMasks: { ...earlierFalse, device: "not measured" } },
  };
}
