// Labels for a draft result (R1.4). Taken from inferenceSource and the result's own
// short flag, never from the mode asked for: a cloud-first call the SDK
// answered on the device is a device draft.
import { strings } from "../app/strings";
import type { DraftOutput, InferenceSource, JobResult } from "../inference/types";

export interface DraftLabels {
  source: InferenceSource;
  /** false when a test double answered: the screen shows "not connected" */
  connected: boolean;
  /** "Shorter draft made on this device." for a device draft, otherwise null */
  shortLine: string | null;
}

export function draftLabels(result: JobResult<DraftOutput>, browserRefused = false): DraftLabels {
  const device = result.inferenceSource === "ON_DEVICE" || result.value.short;
  return {
    source: result.inferenceSource,
    connected: result.connected,
    shortLine: device
      ? browserRefused
        ? strings.drafting.browserRefusedDeviceDraft
        : strings.drafting.shortDraft
      : null,
  };
}
