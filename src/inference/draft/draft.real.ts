// The draft job: the formal case note from the outgoing text (masked record plus
// fixed instructions). Online it is called with PREFER_IN_CLOUD; offline, with
// ONLY_ON_DEVICE, chosen by the app (ruling 12), not left to a fallback.
//
// The device call is real whenever the model is available, whether or not the
// cloud service is enabled (ruling 23). The cloud call is made by the kit only
// when the cloud flag is on; otherwise the kit uses draft.double.ts.
//
// The job is given the outgoing text and nothing else (R1.1). It is handed to
// the SDK unchanged, so the text she saw is the text that is sent (R2.2).
import { DRAFT_SENTENCES_DEVICE, DRAFT_SENTENCES_DEVICE_MAX } from "../../constants";
import { strings } from "../../app/strings";
import { cloudModelName } from "../config";
import { DeviceModelAbsentError } from "../deviceAbsentError";
import { isCloudRefusal } from "../refusal";
import { normaliseSource } from "../source";
import type { DeviceModelState, DraftInput, DraftJob, DraftMode, DraftOutput, JobResult } from "../types";

export interface DraftCreateOptions {
  expectedInputs: { type: "text"; languages: string[] }[];
  expectedOutputs: { type: "text"; languages: string[] }[];
  initialPrompts: { role: "system"; content: { type: "text"; value: string }[] }[];
}

export interface DraftCall {
  mode: DraftMode;
  /** the cloud model name; always set (sdk-facts difference 1) */
  inCloudModel: string;
  /** used by the device model, also when a cloud-first call is answered there */
  createOptions: DraftCreateOptions;
  /** the outgoing text, unchanged */
  text: string;
}

/** The one SDK call the job needs, implemented in src/firebase/draftSdk.ts. */
export interface DraftSdk {
  generate(call: DraftCall): Promise<{ text: string; inferenceSource: string }>;
}

export type DraftFailureKind = "absent" | "tooLong" | "notOnDevice" | "cloudRefused" | "failed";

export class DraftFailure extends Error {
  constructor(readonly kind: DraftFailureKind, readonly line: string) {
    super(line);
    this.name = "DraftFailure";
  }
}

export interface DraftDeps {
  sdk: DraftSdk;
  state(): Promise<DeviceModelState>;
  /** The cloud model name, set explicitly, never left to the SDK default; blank or missing gives the default. */
  cloudModel?: () => string | undefined;
  /** Called once when the call will wait for a device download. */
  onWaiting?: () => void;
}

const COUNT_WORDS: Record<number, string> = { 5: "five", 6: "six", 7: "seven", 8: "eight" };

export const DRAFT_SYSTEM_PROMPT =
  `You write a short formal case note from a visit record. Write ${COUNT_WORDS[DRAFT_SENTENCES_DEVICE]} to ${COUNT_WORDS[DRAFT_SENTENCES_DEVICE_MAX]} sentences in plain formal prose. ` +
  "Keep every tag such as [Person 1] exactly as written. " +
  "For pronouns use a token such as {he:Person 1}, {him:Person 1} or {his:Person 1}. " +
  "Use only what is in the record. Do not add names, places or dates. Reply with the note only.";

export function buildDraftCreateOptions(): DraftCreateOptions {
  return {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    initialPrompts: [{ role: "system", content: [{ type: "text", value: DRAFT_SYSTEM_PROMPT }] }],
  };
}

const isLengthError = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { name?: unknown }).name === "QuotaExceededError";

export function makeDraftJob(deps: DraftDeps): DraftJob {
  return {
    async run(_ticket, input: DraftInput, mode: DraftMode): Promise<JobResult<DraftOutput>> {
      if (mode === "ONLY_ON_DEVICE") {
        const state = await deps.state();
        if (state === "unavailable") throw new DraftFailure("absent", strings.deviceModelAbsent);
        // ONLY_ON_DEVICE waits for a download in progress (sdk-facts 12); that is not a failure.
        if (state === "downloading" || state === "downloadable") deps.onWaiting?.();
      }

      let reply: { text: string; inferenceSource: string };
      try {
        reply = await deps.sdk.generate({
          mode,
          inCloudModel: cloudModelName({ cloudModel: deps.cloudModel?.() }),
          createOptions: buildDraftCreateOptions(),
          text: input.text,
        });
      } catch (e) {
        if (e instanceof DeviceModelAbsentError) throw new DraftFailure("absent", strings.deviceModelAbsent);
        if (isLengthError(e)) throw new DraftFailure("tooLong", strings.drafting.tooLong);
        if (isCloudRefusal(e)) throw new DraftFailure("cloudRefused", strings.cloud.refused);
        throw new DraftFailure("failed", strings.drafting.failed);
      }

      const source = normaliseSource(reply.inferenceSource);
      if (source === null || reply.text.trim() === "") throw new DraftFailure("failed", strings.drafting.failed);
      // This must not happen in ONLY_ON_DEVICE. If it does, the draft is discarded.
      if (mode === "ONLY_ON_DEVICE" && source !== "ON_DEVICE") {
        throw new DraftFailure("notOnDevice", strings.drafting.notOnDevice);
      }
      return { value: { text: reply.text.trim(), short: source === "ON_DEVICE" }, inferenceSource: source, connected: true };
    },
  };
}
