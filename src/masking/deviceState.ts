// What the masking steps do in each device model state (masking R10).
// Exact, near and tap masking never wait for the model and never use the network.
import { fill, strings } from "../app/strings";

/** Same four states as the browser reports. Kept here so masking imports no inference module. */
export type DeviceState = "unavailable" | "downloadable" | "downloading" | "available";

export interface DevicePassPlan {
  /** exact, near and tap masking: always true */
  exactAndNear: true;
  /** run the device pass now */
  runDevicePass: boolean;
  /** the device pass runs on its own when the model is ready */
  queued: boolean;
  /** show a progress figure */
  showProgress: boolean;
  /** one plain line for the note zone */
  line: string;
}

/**
 * `starting`: the first check of the device model has not answered yet (status bar "starting"). The state is still the
 * initial "unavailable", which is not an answer: the device pass waits for the check and runs if it answers available (H51c).
 * `noAnswer`: the first check ended at its bound without an answer (H51e); the page goes on as with no device model.
 */
export function planDevicePass(state: DeviceState, percent = 0, starting = false, noAnswer = false): DevicePassPlan {
  if (noAnswer && state === "unavailable") {
    return { exactAndNear: true, runDevicePass: false, queued: false, showProgress: false, line: strings.masking.deviceNoAnswer };
  }
  if (starting && state === "unavailable") {
    return { exactAndNear: true, runDevicePass: false, queued: true, showProgress: false, line: strings.masking.deviceStarting };
  }
  switch (state) {
    case "available":
      return { exactAndNear: true, runDevicePass: true, queued: false, showProgress: false, line: strings.masking.deviceReady };
    case "downloading":
      return {
        exactAndNear: true,
        runDevicePass: false,
        queued: true,
        showProgress: true,
        line: fill(strings.masking.deviceDownloading, { percent: Math.round(percent) }),
      };
    case "downloadable":
    case "unavailable":
      return { exactAndNear: true, runDevicePass: false, queued: false, showProgress: false, line: strings.masking.deviceAbsent };
  }
}
