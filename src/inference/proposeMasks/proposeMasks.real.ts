// The propose-masks job: more things to mask, found by the device model on the
// raw note, on this device only (masking R4, ruling 6). ONLY_ON_DEVICE: the SDK
// makes no cloud call for this job. It is real whenever the browser reports the
// model available, whether or not the cloud service is enabled (ruling 23).
import { strings } from "../../app/strings";
import { DeviceModelAbsentError } from "../deviceAbsentError";
import { normaliseSource } from "../source";
import type { DeviceModelState, JobResult, Candidate, ProposeMasksJob } from "../types";
import { checkCandidates, CANDIDATES_SCHEMA, PROPOSE_SYSTEM_PROMPT } from "./proposeMasks.schema";

export interface ProposeCreateOptions {
  expectedInputs: { type: "text"; languages: string[] }[];
  expectedOutputs: { type: "text"; languages: string[] }[];
  initialPrompts: { role: "system"; content: { type: "text"; value: string }[] }[];
}

export interface ProposeCall {
  mode: "ONLY_ON_DEVICE";
  createOptions: ProposeCreateOptions;
  promptOptions: { responseConstraint: typeof CANDIDATES_SCHEMA };
  parts: { text: string }[];
}

/** The one SDK call the job needs, implemented in src/firebase/proposeSdk.ts. */
export interface ProposeSdk {
  generate(call: ProposeCall): Promise<{ text: string; inferenceSource: string }>;
}

export type ProposeFailureKind = "absent" | "tooLong" | "notClean" | "notOnDevice" | "failed";

export class ProposeFailure extends Error {
  constructor(readonly kind: ProposeFailureKind, readonly line: string) {
    super(line);
    this.name = "ProposeFailure";
  }
}

export interface ProposeDeps {
  sdk: ProposeSdk;
  state(): Promise<DeviceModelState>;
  /** Called once when the model is still downloading and the call will wait for it. */
  onWaiting?: () => void;
}

export const PROPOSE_TASK_TEXT = "List what could identify someone in this note:\n\n";

export function buildProposeCreateOptions(): ProposeCreateOptions {
  return {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    initialPrompts: [{ role: "system", content: [{ type: "text", value: PROPOSE_SYSTEM_PROMPT }] }],
  };
}

const isLengthError = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { name?: unknown }).name === "QuotaExceededError";

export function parseReply(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

export function makeProposeMasksJob(deps: ProposeDeps): ProposeMasksJob {
  return {
    mode: "ONLY_ON_DEVICE",
    async run(rawText: string): Promise<JobResult<Candidate[]>> {
      const state = await deps.state();
      if (state === "unavailable") throw new ProposeFailure("absent", strings.masking.deviceAbsent);
      // ONLY_ON_DEVICE waits for a download in progress (sdk-facts 12); that is not a failure.
      if (state === "downloading" || state === "downloadable") deps.onWaiting?.();

      let reply: { text: string; inferenceSource: string };
      try {
        reply = await deps.sdk.generate({
          mode: "ONLY_ON_DEVICE",
          createOptions: buildProposeCreateOptions(),
          promptOptions: { responseConstraint: CANDIDATES_SCHEMA },
          parts: [{ text: PROPOSE_TASK_TEXT + rawText }],
        });
      } catch (e) {
        if (e instanceof DeviceModelAbsentError) throw new ProposeFailure("absent", strings.masking.deviceAbsent);
        if (isLengthError(e)) throw new ProposeFailure("tooLong", strings.masking.proposeTooLong);
        throw new ProposeFailure("failed", strings.masking.proposeFailed);
      }
      // This must not happen in ONLY_ON_DEVICE. If it does, the result is discarded.
      if (normaliseSource(reply.inferenceSource) !== "ON_DEVICE") throw new ProposeFailure("notOnDevice", strings.masking.proposeNotOnDevice);

      let parsed: unknown;
      try {
        parsed = parseReply(reply.text);
      } catch {
        throw new ProposeFailure("notClean", strings.masking.proposeFailed);
      }
      const check = checkCandidates(parsed);
      if (!check.ok) throw new ProposeFailure("notClean", strings.masking.proposeFailed);
      return { value: check.candidates, inferenceSource: "ON_DEVICE", connected: true };
    },
  };
}
