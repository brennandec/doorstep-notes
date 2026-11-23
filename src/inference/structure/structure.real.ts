// The structure job: rough note (and photo) to visit record, on the device only.
//
// Option names: the response schema goes in onDeviceParams.promptOptions.responseConstraint,
// as the SDK's own types show (docs/sdk-facts.md fact 40) and as observed in
// Chrome 157 through the SDK on 2026-11-13 (browser document, section "Observed
// through the Firebase SDK": JSON that parses, with exactly the schema's keys).
// The separate capture-and-record task 8 results file is still to be written.
import { strings } from "../../app/strings";
import { sanitizeMissedVisitPresent } from "../missedVisit";
import { DeviceModelAbsentError } from "../deviceAbsentError";
import { normaliseSource } from "../source";
import type { DeviceModelState, JobResult, StructureInput, StructureJob, VisitRecord } from "../types";
import { buildCreateOptions, type DeviceCreateOptions } from "./createOptions";
import { checkVisitRecord, VISIT_RECORD_SCHEMA } from "./structure.schema";

export type StructurePart = { text: string } | { inlineData: { data: string; mimeType: string } };

export interface StructureCall {
  mode: "ONLY_ON_DEVICE";
  createOptions: DeviceCreateOptions;
  promptOptions: { responseConstraint: typeof VISIT_RECORD_SCHEMA };
  parts: StructurePart[];
}

/** The one SDK call the job needs, implemented in src/firebase/structureSdk.ts. */
export interface StructureSdk {
  generate(call: StructureCall): Promise<{ text: string; inferenceSource: string }>;
  /**
   * The model session's own measure of this call's input: `measureInputUsage(promptInput)` and `inputQuota`.
   * Null when no session can be made or the session does not offer both (H35a D3).
   */
  measure?(call: StructureCall): Promise<{ usage: number; quota: number } | null>;
}

export type StructureFailureKind = "absent" | "tooLong" | "notClean" | "notOnDevice" | "failed";

export class StructureFailure extends Error {
  constructor(
    readonly kind: StructureFailureKind,
    readonly line: string,
    readonly partial?: Partial<VisitRecord>,
    readonly rawText?: string,
    /** For kind "failed": the name of the error the model call threw, shown to her (H35a D3). */
    readonly errorName?: string,
  ) {
    super(line);
    this.name = "StructureFailure";
  }
}

export interface StructureDeps {
  sdk: StructureSdk;
  state(kind: { hasPhoto: boolean }): Promise<DeviceModelState>;
  /** Called once when the model is still downloading and the call will wait for it. */
  onWaiting?: () => void;
}

// A bare request returns prose or a list of options (browser fact 5), so the
// task states the exact output wanted, next to the note.
export const TASK_TEXT =
  "Make the visit record from the note below. " +
  "Reply with only the record, as one JSON object with these fields: " +
  "visitDate, present, seen, agreed, risks, nextSteps. No other text. " +
  "Never change, convert or complete a date, a weekday or a relative day, in any field: " +
  "12/11, 26/11, Mon, Fri and tomorrow stay exactly as the note writes them. " +
  "Never add a year or a month name. Leave visitDate empty if the note has no date.\n\nNote:\n";

/** The name of a thrown value, or "Error" when it has none (H35a D3). */
export function errorNameOf(e: unknown): string {
  return e instanceof Error && e.name ? e.name : "Error";
}

/**
 * True only when the model's own numbers say the input is over the limit: a QuotaExceededError that
 * carries numeric `requested` above numeric `contextWindow` (with `contextWindow` above zero). A
 * QuotaExceededError with no such numbers is not a length finding (H35a D3).
 */
export function overContextWindow(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const x = e as { name?: unknown; requested?: unknown; contextWindow?: unknown };
  return (
    x.name === "QuotaExceededError" &&
    typeof x.requested === "number" &&
    typeof x.contextWindow === "number" &&
    x.contextWindow > 0 &&
    x.requested > x.contextWindow
  );
}

async function isTooLong(e: unknown, call: StructureCall, sdk: StructureSdk): Promise<boolean> {
  if (overContextWindow(e)) return true;
  // A QuotaExceededError without numbers: ask the session's own measure of this input.
  if (typeof e === "object" && e !== null && (e as { name?: unknown }).name === "QuotaExceededError" && sdk.measure) {
    try {
      const m = await sdk.measure(call);
      return m !== null && m.usage > m.quota;
    } catch {
      return false;
    }
  }
  return false;
}

function parseReply(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

export function makeStructureJob(deps: StructureDeps): StructureJob {
  return {
    mode: "ONLY_ON_DEVICE",
    async run(input: StructureInput): Promise<JobResult<VisitRecord>> {
      const hasPhoto = input.photo !== undefined;
      const state = await deps.state({ hasPhoto });
      if (state === "unavailable") throw new StructureFailure("absent", strings.deviceModelAbsent);
      // ONLY_ON_DEVICE waits for a download in progress (sdk-facts 12); that is not a failure.
      if (state === "downloading" || state === "downloadable") deps.onWaiting?.();

      const parts: StructurePart[] = [{ text: TASK_TEXT + input.noteText }];
      if (input.photo) parts.push({ inlineData: { data: input.photo.base64, mimeType: input.photo.mimeType } });

      let reply: { text: string; inferenceSource: string };
      const call: StructureCall = {
        mode: "ONLY_ON_DEVICE",
        createOptions: buildCreateOptions({ hasPhoto }),
        promptOptions: { responseConstraint: VISIT_RECORD_SCHEMA },
        parts,
      };
      try {
        reply = await deps.sdk.generate(call);
      } catch (e) {
        if (e instanceof DeviceModelAbsentError) throw new StructureFailure("absent", strings.deviceModelAbsent);
        if (await isTooLong(e, call, deps.sdk)) throw new StructureFailure("tooLong", strings.record.tooLong);
        throw new StructureFailure("failed", strings.record.failed, undefined, undefined, errorNameOf(e));
      }

      // Guard: this must not happen in ONLY_ON_DEVICE. If it does, the record is discarded.
      if (normaliseSource(reply.inferenceSource) !== "ON_DEVICE") {
        throw new StructureFailure("notOnDevice", strings.record.notOnDevice);
      }

      let parsed: unknown;
      try {
        parsed = parseReply(reply.text);
      } catch {
        throw new StructureFailure("notClean", strings.record.cleanFail, {}, reply.text);
      }
      const check = checkVisitRecord(parsed);
      if (!check.ok) throw new StructureFailure("notClean", strings.record.cleanFail, check.partial, reply.text);
      const record = sanitizeMissedVisitPresent(input.noteText, check.record);
      return { value: record, inferenceSource: "ON_DEVICE", connected: true, fromModel: true } as JobResult<VisitRecord> & { fromModel: true };
    },
  };
}
