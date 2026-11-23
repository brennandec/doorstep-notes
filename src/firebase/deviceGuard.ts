// The one guard in front of every ONLY_ON_DEVICE call to the Firebase AI SDK (H45, SDK issue #10635).
//
// The SDK builds its on-device adapter only when globalThis.LanguageModel exists. Without it,
// callCloudOrDevice() and countTokens() go to the cloud whatever the mode says, so a "device only"
// call would send the text off the device. This guard runs first, reads the live global (not the
// reference the page captured at load), and throws the kit's own DeviceModelAbsentError before
// the SDK is touched. It makes no request and loads nothing.
//
// Any new ONLY_ON_DEVICE call, and any countTokens call, must call assertDeviceUsable() first.
import { DEVICE_AVAILABILITY_TIMEOUT_MS } from "../constants";
import { DeviceModelAbsentError } from "../inference/deviceAbsentError";

/** The states in which the device can answer now or after the download the job already waits for. */
const USABLE: readonly string[] = ["available", "downloadable", "downloading"];

interface LiveLanguageModel {
  availability?(options?: unknown): Promise<string>;
}

/** The two fields availability() takes, out of a job's create options. */
function availabilityOptionsOf(createOptions: unknown): unknown {
  if (typeof createOptions !== "object" || createOptions === null) return undefined;
  const { expectedInputs, expectedOutputs } = createOptions as { expectedInputs?: unknown; expectedOutputs?: unknown };
  return expectedInputs === undefined && expectedOutputs === undefined ? undefined : { expectedInputs, expectedOutputs };
}

/**
 * Resolves when the browser has the LanguageModel API now and reports a usable state. Throws
 * DeviceModelAbsentError otherwise (no API, no availability(), an unknown word, an error, a timeout).
 */
export async function assertDeviceUsable(createOptions?: unknown): Promise<void> {
  if (!("LanguageModel" in globalThis)) throw new DeviceModelAbsentError();
  const lm = (globalThis as { LanguageModel?: LiveLanguageModel }).LanguageModel;
  if (!lm || typeof lm.availability !== "function") throw new DeviceModelAbsentError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let answer: unknown;
  try {
    answer = await Promise.race([
      Promise.resolve().then(() => lm.availability!(availabilityOptionsOf(createOptions))),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), DEVICE_AVAILABILITY_TIMEOUT_MS);
      }),
    ]);
  } catch {
    throw new DeviceModelAbsentError();
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (typeof answer !== "string" || !USABLE.includes(answer)) throw new DeviceModelAbsentError();
}
