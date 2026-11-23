// The rewrite flow (drafting R7): one masked sentence, shorter or plainer.
//   prepareRewrite builds the text zone 2 shows: fixed instructions and that one sentence.
//   With the cloud service enabled and the network on, the cloud may answer, so it waits for
//   Send with the notice. With the cloud service off, or the network off, nothing can leave,
//   so it runs on this device without waiting (H16).
//   runRewrite always goes through src/egress/send.ts, so the preview check applies and
//   the ledger records the call.
import { strings } from "../app/strings";
import type { Captured } from "../egress/check";
import type { EgressLines } from "../egress/line";
import type { Ledger, LedgerEntry } from "../egress/ledger";
import { makePreview, rewriteRunner, send, type CheckValues, type Preview } from "../egress/send";
import { RewriteFailure, rewriteCallMode } from "../inference/rewrite/rewrite.real";
import { rewriteText, type RewriteKind } from "../inference/rewrite/instructions";
import { expandShorthand, replyPasses, shownText } from "../inference/rewrite/shorthand";
import type { DeviceModelState, InferenceSource, RewriteJob } from "../inference/types";
import type { ClientEntry } from "../masking/clientList";
import type { MaskPolicy } from "../masking/policy";
import { tagsIn } from "../masking/tags";
import type { MaskResult } from "../masking/types";
import { screenDraft } from "./screenDraft";

export { REWRITE_INSTRUCTIONS, type RewriteKind } from "../inference/rewrite/instructions";

export interface RewritePrepared {
  sentence: string;
  /** the sentence after the dictionary, which is what the model is given */
  expanded: string;
  kind: RewriteKind;
  /** exactly what zone 2 shows and what the job is given */
  text: string;
  /** the tags in the sentence, listed before the call and checked after it */
  tags: string[];
  preview: Preview;
  values: CheckValues;
  cloud: boolean;
  /** true when the cloud service is enabled: show the notice and wait for Send */
  requiresSend: boolean;
  /** what the answer is screened against (ruling 24); without it the answer is not screened */
  screen?: RewriteScreen;
}

export interface RewriteScreen {
  outgoing: { mask: MaskResult };
  clients: ClientEntry[];
  policy: MaskPolicy;
}

export function prepareRewrite(input: {
  sentence: string;
  kind: RewriteKind;
  cloud: boolean;
  /** false when the app finds the network off (H16): nothing can leave, so the cloud is not in play. Default true. */
  online?: boolean;
  values: CheckValues;
  screen?: RewriteScreen;
}): RewritePrepared {
  const expanded = expandShorthand(input.sentence);
  const text = rewriteText(input.kind, expanded);
  // With the network off, the sentence takes the on-device path and needs no Send, whatever the cloud switch says.
  const cloud = input.cloud && (input.online ?? true);
  return {
    sentence: input.sentence,
    expanded,
    kind: input.kind,
    text,
    tags: tagsIn(input.sentence),
    preview: makePreview(text, input.values),
    values: input.values,
    cloud,
    requiresSend: cloud,
    ...(input.screen ? { screen: input.screen } : {}),
  };
}

export interface RewriteDeps {
  rewrite: RewriteJob;
  ledger: Ledger;
  device: DeviceModelState;
  now?: () => Date;
}

export type RewriteOutcome =
  | { status: "blocked"; lines: EgressLines }
  | {
      status: "rewritten";
      value: string;
      source: InferenceSource;
      connected: boolean;
      lines: EgressLines;
      entry: LedgerEntry;
      captured: Captured[];
    }
  | { status: "refused" | "failed"; line: string; lines: EgressLines; entry: LedgerEntry; captured: Captured[] };

/**
 * H50b: on the device path a reply the product cannot use (not shorter, not one sentence, a changed tag)
 * is asked for once more. The device model answers differently each time; about 1 Shorter reply in 8
 * came back longer. Nothing leaves the computer on this path, and the ledger records both calls.
 * The cloud path is never asked twice.
 */
export const DEVICE_RETRIES = 1;

type Tried = { outcome: RewriteOutcome; retry: boolean; clean: boolean };

function spelledOut(prep: RewritePrepared, last: Exclude<RewriteOutcome, { status: "blocked" }>): RewriteOutcome {
  return {
    status: "rewritten",
    value: prep.expanded,
    source: "ON_DEVICE",
    connected: false,
    lines: last.lines,
    entry: last.entry,
    captured: last.captured,
  };
}

export async function runRewrite(prep: RewritePrepared, deps: RewriteDeps): Promise<RewriteOutcome> {
  // D-R8: a shorthand note is rewritten on the device first. The cloud sees the
  // masked sentence only when that reply fails the fact check, and only through send().
  if (prep.cloud && prep.expanded !== prep.sentence) {
    const deviceTried = await rewriteOnce({ ...prep, cloud: false }, deps);
    if (deviceTried.outcome.status === "blocked") return deviceTried.outcome;
    if (deviceTried.clean && deviceTried.outcome.status === "rewritten") return deviceTried.outcome;
    const cloudTried = await rewriteOnce(prep, deps);
    if (cloudTried.outcome.status === "blocked") return cloudTried.outcome;
    if (cloudTried.clean && cloudTried.outcome.status === "rewritten") return cloudTried.outcome;
    return spelledOut(prep, cloudTried.outcome);
  }
  let tried = await rewriteOnce(prep, deps);
  for (let n = 0; n < DEVICE_RETRIES && tried.retry && !prep.cloud; n++) tried = await rewriteOnce(prep, deps);
  // A shorthand note that the model cannot say cleanly shows the expanded note, not the refusal line.
  if (tried.outcome.status === "refused" && prep.expanded !== prep.sentence) {
    return {
      status: "rewritten",
      value: prep.expanded,
      source: prep.cloud ? "IN_CLOUD" : "ON_DEVICE",
      connected: true,
      lines: tried.outcome.lines,
      entry: tried.outcome.entry,
      captured: tried.outcome.captured,
    };
  }
  return tried.outcome;
}

async function rewriteOnce(prep: RewritePrepared, deps: RewriteDeps): Promise<Tried> {
  const out = await send<string>(
    {
      preview: prep.preview,
      job: "rewrite",
      mode: rewriteCallMode({ cloudEnabled: prep.cloud, device: deps.device }),
      run: rewriteRunner(deps.rewrite, prep.tags, !prep.cloud),
    },
    { ...prep.values, ledger: deps.ledger, ...(deps.now ? { now: deps.now } : {}) },
  );
  if (out.status === "blocked") return { outcome: { status: "blocked", lines: out.lines }, retry: false, clean: false };
  if (out.status === "failed") {
    const e = out.error;
    const refused = e instanceof RewriteFailure && (e.kind === "tagChanged" || e.kind === "notOneSentence");
    const line = e instanceof RewriteFailure ? e.line : strings.drafting.rewriteFailed;
    return { outcome: { status: refused ? "refused" : "failed", line, lines: out.lines, entry: out.entry, captured: out.captured }, retry: refused, clean: false };
  }
  // The answer is model output: it goes through the masker before it is shown or used again.
  let value = out.result.value;
  if (prep.screen) {
    const screened = screenDraft({ draft: value, ...prep.screen });
    // Any new tag, known or not, is refused: the outgoing text has no map entry for it.
    if (screened.addedTags.length > 0) {
      return { outcome: { status: "refused", line: strings.drafting.rewriteAddedName, lines: out.lines, entry: out.entry, captured: out.captured }, retry: false, clean: false };
    }
    value = screened.maskedText;
  }
  // Shorthand was expanded before the call. The screen gets a clean reply, or the expanded note.
  if (prep.expanded !== prep.sentence) {
    return {
      outcome: {
        status: "rewritten",
        value: shownText(prep.sentence, value),
        source: out.result.inferenceSource,
        connected: out.result.connected,
        lines: out.lines,
        entry: out.entry,
        captured: out.captured,
      },
      clean: replyPasses(prep.sentence, value),
      retry: false,
    };
  }
  // Shorter means fewer characters. A real answer that is not shorter is not used. The double
  // answers with the sentence unchanged and says "not connected", so the rule is for real answers.
  if (prep.kind === "shorter" && out.result.connected && value.length >= prep.sentence.length) {
    return { outcome: { status: "refused", line: strings.drafting.rewriteNotShorter, lines: out.lines, entry: out.entry, captured: out.captured }, retry: true, clean: false };
  }
  return {
    outcome: {
      status: "rewritten",
      value,
      source: out.result.inferenceSource,
      connected: out.result.connected,
      lines: out.lines,
      entry: out.entry,
      captured: out.captured,
    },
    clean: true,
    retry: false,
  };
}
