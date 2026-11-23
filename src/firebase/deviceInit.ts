// Wires GenerativeModel.initializeDeviceModel (sdk-facts 10) for the "Get the
// device model" press. It uses the Firebase modules loaded at page start (deviceApp.ts) and makes no
// call to the Firebase project: initializing the device model downloads through
// the browser, so it uses the device-only app (deviceApp.ts).
import { deviceOnlyService } from "./deviceApp";
import { DEVICE_INITIALIZE_TIMEOUT_MS } from "../constants";
import { DeviceModelAbsentError } from "../inference/deviceAbsentError";
import { DownloadContinuing } from "../inference/downloadContinuing";
import { setDownloadProgressFeed } from "../inference/downloadProgress";

export async function initializeDeviceModelFromPress(onProgress: (fraction: number) => void): Promise<void> {
  const { ai, service } = await deviceOnlyService();
  const model = ai.getGenerativeModel(service, { mode: ai.InferenceMode.ONLY_ON_DEVICE });
  // R19: a download that never settles must not leave the control on "starting" for good.
  // A download that has reported progress still returns at the same bound, and the original
  // promise is kept so the page can switch the device jobs on when it finishes. No reload.
  let sawProgress = false;
  const report = (fraction: number) => {
    if (Number.isFinite(fraction) && fraction >= 0 && fraction < 1) sawProgress = true;
    onProgress(fraction);
  };
  setDownloadProgressFeed(report);
  const download = model.initializeDeviceModel(report);
  void download.then(() => undefined, () => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let continuing = false;
  const bound = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeviceModelAbsentError()), DEVICE_INITIALIZE_TIMEOUT_MS);
  });
  try {
    await Promise.race([download, bound]);
  } catch (e) {
    if (sawProgress && e instanceof DeviceModelAbsentError) {
      continuing = true;
      throw new DownloadContinuing(download);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (!continuing) setDownloadProgressFeed(null);
  }
}
