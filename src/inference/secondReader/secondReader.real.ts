// The second reader job: who could this masked text be about, and which words point
// there. ONLY_IN_CLOUD: there is no device fallback, because the point is an outside
// reader (R1.2). The cloud model name is always set explicitly (sdk-facts difference 1).
//
// The job is given the outgoing text and nothing else. It is handed to the SDK
// unchanged, so the text she saw is the text that is sent. Only src/egress/send.ts
// calls this job's run; the kit uses the double while the cloud flag is off.
//
// The cloud schema syntax (responseJsonSchema) answered once against the real service on 2026-11-14
// (results/second-reader-real-service.json). H2 part B has not run.
import { strings } from "../../app/strings";
import { cloudModelName } from "../config";
import { isCloudRefusal } from "../refusal";
import { normaliseSource } from "../source";
import type { Guess, GuessKind, JobResult, SecondReaderInput, SecondReaderJob, SecondReaderOutput } from "../types";
import { GUESS_KINDS } from "../types";

export const SECOND_READER_SCHEMA = {
  type: "object",
  properties: {
    guesses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          who: { type: "string" },
          description: { type: "string" },
          why: { type: "string" },
          kind: { type: "string", enum: [...GUESS_KINDS] },
          evidence: { type: "array", items: { type: "string" } },
        },
        required: ["who", "description", "why", "kind", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["guesses"],
  additionalProperties: false,
} as const;

export interface SecondReaderCall {
  mode: "ONLY_IN_CLOUD";
  /** the cloud model name; always set */
  inCloudModel: string;
  schema: typeof SECOND_READER_SCHEMA;
  /** the outgoing text, unchanged */
  text: string;
}

/** The one SDK call the job needs, implemented in src/firebase/secondReaderSdk.ts. */
export interface SecondReaderSdk {
  generate(call: SecondReaderCall): Promise<{ text: string; inferenceSource: string }>;
}

export type SecondReaderFailureKind = "unreachable" | "badReply" | "notInCloud" | "cloudRefused";

export class SecondReaderFailure extends Error {
  constructor(readonly kind: SecondReaderFailureKind, readonly line: string) {
    super(line);
    this.name = "SecondReaderFailure";
  }
}

export interface SecondReaderDeps {
  sdk: SecondReaderSdk;
  /** The cloud model name, set explicitly, never left to the SDK default; blank or missing gives the default. */
  cloudModel?: () => string | undefined;
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Reads the reply as the guess list, keeping the five fields asked for; null when it is not that shape. */
export function parseReply(raw: string): SecondReaderOutput | null {
  let text = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
  if (fenced) text = fenced[1]!;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const list = (value as { guesses?: unknown }).guesses;
  if (!Array.isArray(list)) return null;
  const guesses: Guess[] = [];
  for (const g of list) {
    if (typeof g !== "object" || g === null) return null;
    const { who, evidence, description, why, kind } = g as Record<string, unknown>;
    if (typeof who !== "string" || !isStrings(evidence)) return null;
    // description and why are text or absent; a reply with only who and evidence still reads, with both empty.
    if ((description !== undefined && typeof description !== "string") || (why !== undefined && typeof why !== "string")) return null;
    const guess: Guess = { who, description: description ?? "", why: why ?? "", evidence: [...evidence] };
    if (typeof kind === "string" && (GUESS_KINDS as readonly string[]).includes(kind)) guess.kind = kind as GuessKind;
    guesses.push(guess);
  }
  return { guesses };
}

export function makeSecondReaderJob(deps: SecondReaderDeps): SecondReaderJob {
  return {
    mode: "ONLY_IN_CLOUD",
    async run(_ticket, input: SecondReaderInput): Promise<JobResult<SecondReaderOutput>> {
      let reply: { text: string; inferenceSource: string };
      try {
        reply = await deps.sdk.generate({
          mode: "ONLY_IN_CLOUD",
          inCloudModel: cloudModelName({ cloudModel: deps.cloudModel?.() }),
          schema: SECOND_READER_SCHEMA,
          text: input.text,
        });
      } catch (e) {
        if (isCloudRefusal(e)) throw new SecondReaderFailure("cloudRefused", strings.cloud.refused);
        throw new SecondReaderFailure("unreachable", strings.secondReader.needsConnection);
      }
      const source = normaliseSource(reply.inferenceSource);
      if (source === null) throw new SecondReaderFailure("badReply", strings.secondReader.failed);
      // This must not happen in ONLY_IN_CLOUD. If it does, the answer is discarded.
      if (source !== "IN_CLOUD") throw new SecondReaderFailure("notInCloud", strings.secondReader.failed);
      const value = parseReply(reply.text);
      if (value === null) throw new SecondReaderFailure("badReply", strings.secondReader.failed);
      return { value, inferenceSource: source, connected: true };
    },
  };
}
