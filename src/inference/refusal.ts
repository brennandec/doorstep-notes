// Tells a refusal by the cloud service from any other failure. The recorded case
// (results/cloud-probe-2026-11-13.json) is HTTP 403 with the words "The Gemini API
// free tier is not available for this project". A refusal is not a network fault:
// the service answered, and accepted nothing.
/** True when Firebase App Check rejected the browser (e.g. HTTP 403 from App Check exchange). */
export function isBrowserRefusal(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: unknown; message?: unknown };
  if (err.code === "appCheck/fetch-status-error") return true;
  return typeof err.message === "string" && /AppCheck/i.test(err.message) && /\b403\b/.test(err.message);
}

export function isCloudRefusal(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if (isBrowserRefusal(e)) return true;
  const err = e as { kind?: unknown; status?: unknown; customErrorData?: { status?: unknown }; message?: unknown };
  if (err.kind === "cloudRefused") return true;
  if (err.status === 403 || err.customErrorData?.status === 403) return true;
  return typeof err.message === "string" && (/\[403\b/.test(err.message) || /HTTP status:\s*403\b/i.test(err.message));
}

const APP_CHECK_HOST = "content-firebaseappcheck.googleapis.com";
const APP_CHECK_EXCHANGE_PATH_RE = /:exchange[A-Za-z]*Token$/i;
const active403Watchers = new Set<() => void>();
let wrappedOriginalFetch: typeof globalThis.fetch | undefined;
let installed403Wrapper: typeof globalThis.fetch | undefined;

function attach403Watcher(on403: () => void): (() => void) | undefined {
  if (typeof globalThis.fetch !== "function") return undefined;
  if (wrappedOriginalFetch === undefined) {
    const baseFetch = globalThis.fetch;
    wrappedOriginalFetch = baseFetch;
    installed403Wrapper = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await baseFetch(input, init);
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      try {
        const parsed = new URL(url);
        if (res.status === 403 && parsed.host === APP_CHECK_HOST && APP_CHECK_EXCHANGE_PATH_RE.test(parsed.pathname)) {
          for (const listener of active403Watchers) listener();
        }
      } catch {
        // Ignore unparseable relative URLs.
      }
      return res;
    };
    globalThis.fetch = installed403Wrapper;
  }
  active403Watchers.add(on403);
  return () => {
    active403Watchers.delete(on403);
    if (active403Watchers.size === 0) {
      // H43c c5: always restore the fetch this wrapper found, even when something else swapped
      // globalThis.fetch while the watcher was installed. Leaving the swapped fetch in place
      // would strand the wrapper underneath it and double-wrap on the next attach.
      if (wrappedOriginalFetch) {
        globalThis.fetch = wrappedOriginalFetch;
      }
      wrappedOriginalFetch = undefined;
      installed403Wrapper = undefined;
    }
  };
}

/**
 * Runs `fn` while watching `globalThis.fetch` responses for HTTP 403 from Firebase App Check token-exchange
 * endpoints (`content-firebaseappcheck.googleapis.com` `:exchange*Token` paths) via a single refcounted wrapper.
 * Because browser JS has no `AsyncLocalStorage`, concurrent `watchAppCheck403` scopes share the process-wide
 * listener set (and see other page fetches hitting App Check exchange); in production, `send()` serializes
 * overlapping sends through `withCapture` (`CaptureBusyError`).
 */
export async function watchAppCheck403<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T; saw403: boolean } | { ok: false; error: unknown; saw403: boolean }> {
  let saw403 = false;
  const detach = attach403Watcher(() => {
    saw403 = true;
  });
  try {
    return { ok: true, value: await fn(), saw403 };
  } catch (error) {
    return { ok: false, error, saw403 };
  } finally {
    detach?.();
  }
}
