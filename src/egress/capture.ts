// Records the URL and body bytes of every request the page makes through `fetch`
// during one cloud call (egress-check R3.1, ruling 3). The wrapper is put in
// place for that call only and `fetch` is put back when the call settles, also
// when it throws. Only one capture runs at a time.
//
// Limit: this sees what goes through `fetch` in this page. A request made by
// other means, or by a service worker, is seen only by the real-browser recorder.
import type { Captured } from "./check";
import { needsCorsPreflight } from "./corsPreflight";

export class CaptureBusyError extends Error {
  constructor() {
    super("A send is already running.");
    this.name = "CaptureBusyError";
  }
}

export type CaptureOutcome<T> =
  | { ok: true; value: T; captured: Captured[] }
  | { ok: false; error: unknown; captured: Captured[] };

let running = false;

/** The preflight bit for one fetch call. Header values are not kept. */
export function preflightFromCall(input: RequestInfo | URL, init?: RequestInit): boolean {
  if (typeof Request !== "undefined" && input instanceof Request && init === undefined) {
    return needsCorsPreflight({ method: input.method, mode: input.mode, headers: input.headers, body: null });
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    const headers = init?.headers !== undefined ? new Headers(init.headers) : new Headers(input.headers);
    const body = init && "body" in init ? init.body : null;
    return needsCorsPreflight({
      method: init?.method ?? input.method,
      mode: init?.mode ?? input.mode,
      headers,
      body: headers.has("content-type") ? null : body,
    });
  }
  const headers = new Headers(init?.headers);
  return needsCorsPreflight({
    method: init?.method ?? "GET",
    mode: init?.mode ?? "cors",
    headers,
    body: headers.has("content-type") ? null : (init?.body ?? null),
  });
}

/** True while a capture is running. */
export function captureRunning(): boolean {
  return running;
}

async function bytesOf(body: unknown): Promise<Uint8Array> {
  if (body === undefined || body === null) return new Uint8Array(0);
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body.slice(0));
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  if (typeof Blob !== "undefined" && body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString());
  // FormData: the boundary the browser picks cannot be known here; the fields are recorded.
  return new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
}

/**
 * Runs `run` with `fetch` wrapped. Returns what it returned, or the error it
 * threw, together with the requests seen. Throws CaptureBusyError, before
 * anything runs, if another capture is active.
 */
export async function withCapture<T>(run: () => Promise<T>): Promise<CaptureOutcome<T>> {
  if (running) throw new CaptureBusyError();
  running = true;
  const original = globalThis.fetch;
  const captured: Captured[] = [];
  const reading: Promise<void>[] = [];

  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let forward: [RequestInfo | URL, RequestInit | undefined] = [input, init];
    let url: string;
    const index = captured.length;
    captured.push({ url: "", body: new Uint8Array(0), preflight: preflightFromCall(input, init) });

    if (typeof Request !== "undefined" && input instanceof Request) {
      url = input.url;
      const copy = input.clone();
      reading.push(copy.arrayBuffer().then((b) => void (captured[index]!.body = new Uint8Array(b))));
    } else {
      url = input instanceof URL ? input.href : String(input);
      const body = init?.body;
      if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
        const [forRecord, forSend] = body.tee();
        forward = [input, { ...init, body: forSend, duplex: "half" } as RequestInit];
        reading.push(new Response(forRecord).arrayBuffer().then((b) => void (captured[index]!.body = new Uint8Array(b))));
      } else {
        captured[index]!.body = await bytesOf(body);
      }
    }
    captured[index]!.url = url;
    try {
      const response = await original(...forward);
      captured[index]!.status = response.status;
      return response;
    } catch (error) {
      captured[index]!.status = "no answer";
      throw error;
    }
  };

  globalThis.fetch = wrapped as typeof fetch;
  try {
    const value = await run();
    await Promise.all(reading);
    return { ok: true, value, captured };
  } catch (error) {
    await Promise.allSettled(reading);
    return { ok: false, error, captured };
  } finally {
    globalThis.fetch = original;
    running = false;
  }
}
