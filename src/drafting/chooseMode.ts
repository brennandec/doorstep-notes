// Which mode the draft job is called with (ruling 12, drafting design "Mode choice").
// Offline is decided by the app from the browser's online state plus one failed
// probe, not left to the SDK's fallback.
import { isOffline, type OnlineDeps } from "../net/online";
import type { DeviceModelState, DraftMode } from "../inference/types";

export type ProbeResult = "passed" | "failed" | "notRun";

export interface ModeInput {
  browserOnline: boolean;
  probe: ProbeResult;
  device: DeviceModelState;
}

export type ModeChoice =
  | { kind: "cloud"; mode: Extract<DraftMode, "PREFER_IN_CLOUD"> }
  | { kind: "device"; mode: Extract<DraftMode, "ONLY_ON_DEVICE"> }
  | { kind: "none"; reason: "noModel" | "downloading" };

export function chooseMode(input: ModeInput): ModeChoice {
  if (input.browserOnline && input.probe === "passed") return { kind: "cloud", mode: "PREFER_IN_CLOUD" };
  if (input.device === "available") return { kind: "device", mode: "ONLY_ON_DEVICE" };
  // Offline with a download in progress: the draft would wait for minutes, so say so instead (R4.3).
  return { kind: "none", reason: input.device === "downloading" ? "downloading" : "noModel" };
}

/** Reads the online state, runs the one probe when the browser says online, and chooses. */
export async function decideMode(deps: OnlineDeps, device: DeviceModelState): Promise<ModeChoice> {
  if (!deps.navigatorOnLine()) return chooseMode({ browserOnline: false, probe: "notRun", device });
  const offline = await isOffline(deps);
  return chooseMode({ browserOnline: true, probe: offline ? "failed" : "passed", device });
}
