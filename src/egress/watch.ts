// Which recorded requests are cloud model calls (egress-check task 17, browser
// document fact 3). A device job makes no request at all, so for a device job the
// recorder should see none, on this host or any other.
import { CLOUD_MODEL_HOST } from "../constants";

export function isCloudModelUrl(url: string): boolean {
  try {
    return new URL(url).hostname === CLOUD_MODEL_HOST;
  } catch {
    return false;
  }
}

export function cloudModelRequests<T extends { url: string }>(requests: readonly T[]): T[] {
  return requests.filter((r) => isCloudModelUrl(r.url));
}
