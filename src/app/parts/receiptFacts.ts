// The two lines under the finished mark. One says where the masked record was sent and whether that
// call answered with this draft. The other says what produced the draft. Neither line may fight the mark.
import { CLOUD_MODEL_HOST } from "../../constants";
import type { LedgerEntry } from "../../egress/ledger";
import type { InferenceSource } from "../../inference/types";
import { strings } from "../strings";

export interface ReceiptFacts {
  sent: string;
  produced: string;
}

function lastDraft(entries: readonly LedgerEntry[] | null | undefined): LedgerEntry | undefined {
  if (!entries) return undefined;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i]?.job === "draft") return entries[i];
  }
  return undefined;
}

function sentToCloud(entry: LedgerEntry | undefined): boolean {
  return entry?.requests.some((row) => row.host === CLOUD_MODEL_HOST) === true;
}

export function receiptFacts(
  finished: { source: InferenceSource; connected: boolean },
  entries?: readonly LedgerEntry[] | null,
): ReceiptFacts {
  const s = strings.receiptFacts;
  if (!finished.connected && finished.source !== "ON_DEVICE") {
    return { sent: s.notSent, produced: s.fixedSample };
  }
  if (finished.source === "ON_DEVICE") {
    return {
      sent: sentToCloud(lastDraft(entries)) ? s.sentCloudNotThisDraft : s.notSent,
      produced: s.writtenOnDevice,
    };
  }
  return { sent: s.sentCloudAnswered, produced: s.writtenInCloud };
}
