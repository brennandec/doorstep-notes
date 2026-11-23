// What happens when she presses Draft (drafting R4, R5, ruling 12).
//   online:  wait for Send; the cloud call needs her press and the notice.
//   offline, model available: the device draft is made at once. Nothing leaves.
//   offline, no model or downloading: no call; the plain line and the masked record to copy.
// A text blocked by the preview check goes nowhere.
import { strings, fill } from "../app/strings";
import type { EgressLines } from "../egress/line";
import type { Ledger } from "../egress/ledger";
import type { OnlineDeps } from "../net/online";
import type { ClientEntry } from "../masking/clientList";
import type { DeviceModelState, DraftJob, DraftMode } from "../inference/types";
import { decideMode } from "./chooseMode";
import { sendDraft, type DraftOutcome, type Prepared } from "./draftFlow";
import type { ProposedText } from "./screenDraft";

export interface RequestDeps {
  online: OnlineDeps;
  /** the device model state, with the download percentage when there is one */
  device(): Promise<{ state: DeviceModelState; percent?: number }>;
  draft: DraftJob;
  ledger: Ledger;
  clients: ClientEntry[];
  /** the rough note, passed on to the screening of the returned draft */
  noteText?: string;
  now?: () => Date;
  findNames?: (draft: string) => Promise<ProposedText[]>;
  seedLeak?: (body: Uint8Array) => Uint8Array;
}

export type DraftStep =
  | { step: "blocked"; lines: EgressLines }
  | { step: "needsSend"; mode: Extract<DraftMode, "PREFER_IN_CLOUD"> }
  | { step: "done"; outcome: DraftOutcome }
  | { step: "noDraft"; reason: "noModel" | "downloading"; line: string; copyText: string };

export async function requestDraft(prep: Prepared, deps: RequestDeps): Promise<DraftStep> {
  if (!prep.preview.canSend && prep.preview.blockedLine) return { step: "blocked", lines: prep.preview.blockedLine };

  const device = await deps.device();
  const choice = await decideMode(deps.online, device.state);

  if (choice.kind === "cloud") return { step: "needsSend", mode: choice.mode };

  if (choice.kind === "device") {
    const outcome = await sendDraft(prep, choice.mode, {
      draft: deps.draft,
      ledger: deps.ledger,
      clients: deps.clients,
      ...(deps.noteText !== undefined ? { noteText: deps.noteText } : {}),
      ...(deps.now ? { now: deps.now } : {}),
      ...(deps.findNames ? { findNames: deps.findNames } : {}),
      ...(deps.seedLeak ? { seedLeak: deps.seedLeak } : {}),
    });
    return { step: "done", outcome };
  }

  const line =
    choice.reason === "downloading"
      ? device.percent === undefined
        ? `${strings.drafting.noDraft} ${strings.drafting.downloadingBare}`
        : `${strings.drafting.noDraft} ${fill(strings.drafting.downloadingPercent, { percent: Math.round(device.percent) })}`
      : strings.drafting.noDraft;
  return { step: "noDraft", reason: choice.reason, line, copyText: prep.outgoing.maskedRecord };
}
