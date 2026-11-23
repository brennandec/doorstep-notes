// Whether a cross-origin request makes the browser send a CORS preflight.
// The page never sees that OPTIONS call. The decision uses the method, the mode,
// and the header names the caller set. A Content-Type or Range value is read
// only to apply the safelist. No header name or value is returned.

const SAFE_METHODS = new Set(["GET", "HEAD", "POST"]);
const SAFE_NAMES = new Set(["accept", "accept-language", "content-language", "content-type", "range"]);
const SAFE_TYPES = new Set(["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"]);

function unsafeByte(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (
      c <= 0x08 ||
      (c >= 0x0a && c <= 0x1f) ||
      c === 0x22 || c === 0x28 || c === 0x29 || c === 0x3a || c === 0x3c || c === 0x3e ||
      c === 0x3f || c === 0x40 || c === 0x5b || c === 0x5c || c === 0x5d || c === 0x7b ||
      c === 0x7d || c === 0x7f
    ) return true;
  }
  return false;
}

function mime(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

export interface PreflightInput {
  method: string;
  mode?: string;
  headers: Headers;
  /** The body the caller passed, before the browser fills a default Content-Type. */
  body?: BodyInit | null;
}

/** True when this call is not CORS-safelisted. A no-cors or same-origin mode sends no preflight. */
export function needsCorsPreflight(input: PreflightInput): boolean {
  const mode = input.mode ?? "cors";
  if (mode === "no-cors" || mode === "same-origin") return false;
  if (!SAFE_METHODS.has(input.method.toUpperCase())) return true;
  const headers = new Headers(input.headers);
  if (!headers.has("content-type")) {
    const body = input.body;
    if (typeof body === "string") {
      headers.set("content-type", "text/plain;charset=UTF-8");
    } else if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
      headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
    } else if (typeof FormData !== "undefined" && body instanceof FormData) {
      headers.set("content-type", "multipart/form-data");
    } else if (typeof Blob !== "undefined" && body instanceof Blob && body.type !== "") {
      headers.set("content-type", body.type);
    }
  }
  let unsafe = false;
  headers.forEach((value, name) => {
    const n = name.toLowerCase();
    if (!SAFE_NAMES.has(n) || unsafeByte(value)) {
      unsafe = true;
      return;
    }
    if (n === "content-type" && !SAFE_TYPES.has(mime(value))) unsafe = true;
    if (n === "range" && !/^bytes=\d+-\d*$/.test(value)) unsafe = true;
  });
  return unsafe;
}
