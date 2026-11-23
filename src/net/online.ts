// Offline is decided by the browser's online state plus one failed probe
// (ruling 17). The probe is a GET of /probe.txt on the same origin with no
// body and no query other than a time stamp. The service worker does not answer it.
import { PROBE_TIMEOUT_MS } from "../constants";

export interface OnlineDeps {
  navigatorOnLine(): boolean;
  fetch(url: string, init: RequestInit): Promise<{ ok: boolean }>;
  now(): number;
  timeoutMs?: number;
}

export function probeUrl(now: number): string {
  return `/probe.txt?t=${now}`;
}

/** True when offline: the browser says so, or one probe fails or times out. */
export async function isOffline(deps: OnlineDeps): Promise<boolean> {
  if (!deps.navigatorOnLine()) return true;
  const controller = new AbortController();
  const limit = deps.timeoutMs ?? PROBE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), limit);
  try {
    const response = await Promise.race([
      deps.fetch(probeUrl(deps.now()), { method: "GET", cache: "no-store", signal: controller.signal }),
      new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("probe timed out")))),
    ]);
    return !response.ok;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}

export function browserDeps(): OnlineDeps {
  return {
    navigatorOnLine: () => navigator.onLine,
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
  };
}
