// The draft flow (drafting design, "Flow"): build the outgoing text, check it,
// send it through src/egress/send.ts, restore names on this device, label the result.
// Every draft goes through send(), also the offline device draft, so any request
// would be captured and checked (R8.1).
import type { Captured, CheckResult } from "../egress/check";
import type { EgressLines } from "../egress/line";
import type { Ledger, LedgerEntry } from "../egress/ledger";
import { draftRunner, makePreview, send, type CheckValues, type Preview } from "../egress/send";
import { strings } from "../app/strings";
import { DraftFailure } from "../inference/draft/draft.real";
import type { ClientEntry } from "../masking/clientList";
import type { DraftJob, DraftMode, DraftOutput, JobResult } from "../inference/types";
import { buildOutgoing, type Outgoing, type OutgoingInput } from "./buildOutgoing";
import { draftLabels, type DraftLabels } from "./labels";
import { restoreDraft, type Restored } from "./restoreDraft";
import { screenDraft, type ProposedText } from "./screenDraft";
import type { MaskPolicy } from "../masking/policy";
import type { MaskResult } from "../masking/types";

export interface Prepared {
  outgoing: Outgoing;
  /** the check on the exact text zone 2 shows */
  preview: Preview;
  /** what the check compares against; stays on this device */
  values: CheckValues;
  /** the policy used to mask, so the returned draft is screened the same way (ruling 24) */
  policy: MaskPolicy;
}

export function checkValuesForMask(mask: MaskResult): CheckValues {
  return {
    listedNames: mask.listedNames,
    ...(mask.listedGroups ? { listedGroups: mask.listedGroups } : {}),
    surfaceForms: mask.surfaceForms,
    sentOnPurpose: mask.sentOnPurpose,
    ...(mask.entries ? { entries: mask.entries } : {}),
  };
}

export function prepareDraft(input: OutgoingInput): Prepared {
  const outgoing = buildOutgoing(input);
  const values = checkValuesForMask(outgoing.mask);
  return { outgoing, preview: makePreview(outgoing.text, values), values, policy: input.policy };
}

export interface DraftSendDeps {
  draft: DraftJob;
  ledger: Ledger;
  clients: ClientEntry[];
  /** the rough note, on this device only: a value the model wrote that is in it is known and is put back (third review, X1) */
  noteText?: string;
  now?: () => Date;
  /**
   * An ONLY_ON_DEVICE look at the returned draft for names the masker does not know
   * (ruling 24). Best effort: an error means no extra names are marked.
   */
  findNames?: (draft: string) => Promise<ProposedText[]>;
  /** Test-only. Passed to the send path to prove a leak is caught. Not set in a build for users. */
  seedLeak?: (body: Uint8Array) => Uint8Array;
}

export type DraftOutcome =
  | { status: "blocked"; lines: EgressLines }
  | {
      status: "drafted";
      result: JobResult<DraftOutput>;
      /** the draft with every name as a tag, for any later use */
      maskedDraft: string;
      restored: Restored;
      labels: DraftLabels;
      lines: EgressLines;
      check: CheckResult;
      entry: LedgerEntry;
      captured: Captured[];
    }
  | { status: "failed"; line: string; refused: boolean; lines: EgressLines; entry: LedgerEntry; captured: Captured[] };

export async function sendDraft(prep: Prepared, mode: DraftMode, deps: DraftSendDeps): Promise<DraftOutcome> {
  const out = await send<DraftOutput>(
    {
      preview: prep.preview,
      job: "draft",
      mode,
      run: draftRunner(deps.draft, mode),
    },
    { ...prep.values, ledger: deps.ledger, ...(deps.now ? { now: deps.now } : {}), ...(deps.seedLeak ? { seedLeak: deps.seedLeak } : {}) },
  );

  if (out.status === "blocked") return { status: "blocked", lines: out.lines };
  if (out.status === "failed") {
    const line = out.browserRefused
      ? strings.cloud.browserRefusedDraft
      : out.error instanceof DraftFailure
        ? out.error.line
        : strings.drafting.failed;
    return { status: "failed", line, refused: out.entry.outcome === "refused", lines: out.lines, entry: out.entry, captured: out.captured };
  }

  // The draft is model output, so it goes through the masker like the note did (ruling 24).
  let proposed: ProposedText[] = [];
  try {
    proposed = (await deps.findNames?.(out.result.value.text)) ?? [];
  } catch {
    proposed = [];
  }
  const screened = screenDraft({
    draft: out.result.value.text,
    outgoing: prep.outgoing,
    clients: deps.clients,
    policy: prep.policy,
    proposed,
    ...(deps.noteText !== undefined ? { noteText: deps.noteText } : {}),
  });
  const restored = restoreDraft({ draft: screened.maskedText, outgoing: prep.outgoing, clients: deps.clients, screened });
  return {
    status: "drafted",
    result: out.result,
    maskedDraft: screened.maskedText,
    restored,
    labels: draftLabels(out.result, Boolean(out.browserRefused)),
    lines: out.lines,
    check: out.check,
    entry: out.entry,
    captured: out.captured,
  };
}
