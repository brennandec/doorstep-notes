// Chrome fires `downloadprogress` on the monitor passed to LanguageModel.create.
// `loaded` is a fraction from 0 to 1. The bar reads that event, not a timer.
import type { LanguageModelLike } from "./deviceModel";

type Feed = (fraction: number) => void;

const wrapped = new WeakSet<object>();
let feed: Feed | null = null;

/** The press sets this. A later `downloadprogress` calls it with `loaded`. */
export function setDownloadProgressFeed(next: Feed | null): void {
  feed = next;
}

/** One listener. `loaded` is forwarded only when it is a finite number. */
export function listenDownloadProgress(monitor: EventTarget, onProgress: Feed): void {
  monitor.addEventListener("downloadprogress", (event) => {
    const loaded = (event as Event & { loaded?: number }).loaded;
    if (typeof loaded === "number" && Number.isFinite(loaded)) onProgress(loaded);
  });
}

/**
 * Wraps `create` so the one session the download starts also feeds the bar.
 * A second wrap is a no-op. The original monitor still runs.
 */
export function installDownloadProgressWatch(languageModel: LanguageModelLike): void {
  if (typeof languageModel.create !== "function" || wrapped.has(languageModel)) return;
  const create = languageModel.create.bind(languageModel);
  languageModel.create = async (options?: unknown) => {
    const record = options !== null && typeof options === "object" ? (options as { monitor?: (m: EventTarget) => void }) : {};
    const user = record.monitor;
    return create({
      ...record,
      monitor(target: EventTarget) {
        listenDownloadProgress(target, (fraction) => feed?.(fraction));
        user?.(target);
      },
    });
  };
  wrapped.add(languageModel);
}
