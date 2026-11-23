// The SDK reports inferenceSource as "on_device" or "in_cloud" (browser document,
// "Facts the code must use" 1). The app compares against the SDK's own export, not
// against upper-case text. The type import costs nothing at run time and makes the
// compiler check that these values are the export's values; a unit test compares
// them with the real export. This is the one place that maps the SDK's strings to
// the app's names.
import type { InferenceSource as SdkInferenceSource } from "firebase/ai";
import type { InferenceSource } from "./types";

export const SDK_SOURCE = {
  ON_DEVICE: "on_device",
  IN_CLOUD: "in_cloud",
} as const satisfies { readonly [K in "ON_DEVICE" | "IN_CLOUD"]: SdkInferenceSource };

export function normaliseSource(raw: unknown): InferenceSource | null {
  if (raw === SDK_SOURCE.ON_DEVICE) return "ON_DEVICE";
  if (raw === SDK_SOURCE.IN_CLOUD) return "IN_CLOUD";
  return null;
}
