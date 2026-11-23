// The rewrite job: one masked sentence, shorter or plainer. PREFER_ON_DEVICE:
// instant and free on the device; the cloud answers only if there is no device
// model and the cloud service is enabled.
//
// While the cloud service is off, the SDK is called with ONLY_ON_DEVICE, so the
// SDK cannot fall back to a cloud call that is not allowed yet (browser document,
// ruling 23). With the service on, the call is PREFER_ON_DEVICE as the table says.
//
// The reply must be exactly one sentence (a bare prompt returns a list of
// options, browser document fact 5) and must keep every tag (R7.5).
import { strings } from "../../app/strings";
import { tagsIn } from "../../masking/tags";
import { cloudModelName } from "../config";
import { DeviceModelAbsentError } from "../deviceAbsentError";
import { isCloudRefusal } from "../refusal";
import { normaliseSource } from "../source";
import type { DeviceModelState, JobResult, RewriteInput, RewriteJob } from "../types";

export interface RewriteCreateOptions {
  expectedInputs: { type: "text"; languages: string[] }[];
  expectedOutputs: { type: "text"; languages: string[] }[];
  initialPrompts: { role: "system"; content: { type: "text"; value: string }[] }[];
}

export interface RewriteCall {
  mode: "PREFER_ON_DEVICE" | "ONLY_ON_DEVICE";
  inCloudModel: string;
  createOptions: RewriteCreateOptions;
  /** the fixed instructions and the one masked sentence, unchanged */
  text: string;
}

/** The one SDK call the job needs, implemented in src/firebase/rewriteSdk.ts. */
export interface RewriteSdk {
  generate(call: RewriteCall): Promise<{ text: string; inferenceSource: string }>;
}

export type RewriteFailureKind = "absent" | "tagChanged" | "notOneSentence" | "notOnDevice" | "cloudRefused" | "failed";

export class RewriteFailure extends Error {
  constructor(readonly kind: RewriteFailureKind, readonly line: string) {
    super(line);
    this.name = "RewriteFailure";
  }
}

export interface RewriteDeps {
  sdk: RewriteSdk;
  state(): Promise<DeviceModelState>;
  /** AI_SERVICE_ENABLED. Off: the SDK is never allowed to answer from the cloud. */
  cloudEnabled: boolean;
  cloudModel?: () => string | undefined;
}

export const REWRITE_SYSTEM_PROMPT =
  "You rewrite one sentence for a case note. Reply with exactly one rewritten sentence and nothing else. " +
  "No list, no options, no explanation, no quotation marks. " +
  "Keep every tag such as [Person 1] exactly as written. Keep every fact. " +
  "Do not add a person, place, date, number or object. If the note is two sentences, join them with and.";

export function buildRewriteCreateOptions(): RewriteCreateOptions {
  return {
    expectedInputs: [{ type: "text", languages: ["en"] }],
    expectedOutputs: [{ type: "text", languages: ["en"] }],
    initialPrompts: [{ role: "system", content: [{ type: "text", value: REWRITE_SYSTEM_PROMPT }] }],
  };
}

/** The mode the SDK is called with, for the ledger as well as the call. */
export function rewriteCallMode(input: { cloudEnabled: boolean; device: DeviceModelState }): RewriteCall["mode"] {
  // H45b: with the page's cloud switch off, nothing may reach the cloud, whatever the device state.
  // The device state decides only whether the call can be made (the job refuses on "unavailable").
  return input.cloudEnabled ? "PREFER_ON_DEVICE" : "ONLY_ON_DEVICE";
}

/**
 * Exactly one sentence, no list. Returns the sentence (one pair of surrounding
 * quotation marks removed) or null when the reply is not a single sentence.
 */
export function singleSentence(reply: string): string | null {
  let s = reply.trim();
  if (s.length > 2 && /^(["'\u201C\u2018]).*(["'\u201D\u2019])$/s.test(s)) s = s.slice(1, -1).trim();
  if (s === "") return null;
  if (/[\r\n]/.test(s)) return null;
  if (/^(?:[*\-\u2022]\s|\d+[.)]\s|#)/.test(s) || s.includes("**")) return null;
  // A second sentence starts after a full stop, question mark or exclamation mark, then a capital letter or a tag.
  if (/[.!?]["')\]]?\s+(?=[A-Z[{])/.test(s)) return null;
  return s;
}

/** True when the reply holds every tag of the input, and no other tag or half tag. */
export function tagsKept(tags: string[], reply: string): boolean {
  const found = tagsIn(reply);
  if (found.some((t) => !tags.includes(t))) return false;
  if (tags.some((t) => !found.includes(t))) return false;
  // A bracket that opens like a tag and does not close as one is a changed tag.
  const stripped = found.reduce((text, t) => text.split(t).join(""), reply);
  return !/\[(?:Person|Place|Date|Detail)\b/i.test(stripped);
}

export function makeRewriteJob(deps: RewriteDeps): RewriteJob {
  return {
    mode: "PREFER_ON_DEVICE",
    async run(_ticket, input: RewriteInput): Promise<JobResult<string>> {
      const device = await deps.state();
      const mode = rewriteCallMode({ cloudEnabled: deps.cloudEnabled && input.deviceOnly !== true, device });

      // H45b: a device-only call with no usable device ends here, in the existing device-absent outcome. No SDK, no request.
      if (mode === "ONLY_ON_DEVICE" && device === "unavailable") throw new RewriteFailure("absent", strings.deviceModelAbsent);

      let reply: { text: string; inferenceSource: string };
      try {
        reply = await deps.sdk.generate({
          mode,
          inCloudModel: cloudModelName({ cloudModel: deps.cloudModel?.() }),
          createOptions: buildRewriteCreateOptions(),
          text: input.text,
        });
      } catch (e) {
        if (e instanceof DeviceModelAbsentError) throw new RewriteFailure("absent", strings.deviceModelAbsent);
        if (isCloudRefusal(e)) throw new RewriteFailure("cloudRefused", strings.cloud.refused);
        throw new RewriteFailure("failed", strings.drafting.rewriteFailed);
      }

      const source = normaliseSource(reply.inferenceSource);
      if (source === null) throw new RewriteFailure("failed", strings.drafting.rewriteFailed);
      if (mode === "ONLY_ON_DEVICE" && source !== "ON_DEVICE") {
        throw new RewriteFailure("notOnDevice", strings.drafting.notOnDevice);
      }

      const sentence = singleSentence(reply.text);
      if (sentence === null) throw new RewriteFailure("notOneSentence", strings.drafting.rewriteNotOneSentence);
      if (!tagsKept(input.tags, sentence)) throw new RewriteFailure("tagChanged", strings.drafting.rewriteTagChanged);
      return { value: sentence, inferenceSource: source, connected: true };
    },
  };
}
