// Where a real-browser check writes its record (H20 R8). Never an existing file: a check that ran before keeps its
// record as it was, and the new run writes results/<name>-<UTC date>-<session suffix>.json. Readers take the newest
// record of each kind through newestResult (src/app/newest.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { newestResultName } from "../../../src/app/newest";

/** The body of the newest record of a kind (dated, with a suffix, or the old undated name), or {} when there is none. A read, never a write. */
export function readNewestRecord(name: string, root = process.cwd()): Record<string, unknown> {
  const dir = resolve(root, "results");
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
  } catch {
    return {};
  }
  const lookup = Object.assign(() => undefined, { names: () => names });
  const newest = newestResultName(lookup, name);
  const file = resolve(dir, `${newest}.json`);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** The session suffix of this order's records (H20). A suffix of the form h<number> ranks above numbered records. */
export const RECORD_SUFFIX = "h20";

/**
 * H35a item 0: which build the browser of this run was served. `folder` is "dist", "dist-e2e" or "hosted";
 * `mainChunk` is the file name of the module entry script; `buildTime` is when that bundle was written
 * (the folder's file time, or the hosted chunk's last-modified header). Every record carries it.
 */
export interface ServedBundleIdentity {
  folder: string;
  mainChunk: string;
  buildTime: string;
}

let currentBundle: ServedBundleIdentity | null = null;

/** Set by openDevice for the run it opens. Null clears it. */
export function setServedBundle(bundle: ServedBundleIdentity | null): void {
  currentBundle = bundle;
}

export function currentServedBundle(): ServedBundleIdentity | null {
  return currentBundle;
}

/**
 * The record body with `servedBundle` added when this run knows its bundle and the body does not already
 * carry one (a body may pass its own). Arrays and non-objects are left alone.
 */
export function withServedBundle<T>(body: T): T {
  if (currentBundle === null || typeof body !== "object" || body === null || Array.isArray(body)) return body;
  if ("servedBundle" in body) return body;
  return { ...body, servedBundle: { ...currentBundle } };
}

const writtenInThisRun = new Set<string>();

/** results/<name>-<date>-<suffix>.json */
export function newRecordPath(name: string, root = process.cwd(), suffix = RECORD_SUFFIX): string {
  return resolve(root, "results", `${name}-${new Date().toISOString().slice(0, 10)}-${suffix}.json`);
}

/**
 * Returns `base` when no dated record exists yet (or this run already wrote it), otherwise `<base>-2`, `<base>-3`, ...
 * matching `rankOf` in src/app/newest.ts so reruns never overwrite or fail on existing results files.
 */
/**
 * `fresh`: the caller writes with writeNewRecord, which never overwrites, so a file this run already wrote
 * (another spec's record of the same name, H50b) is not free either.
 */
export function nextRecordSuffix(name: string, base = RECORD_SUFFIX, root = process.cwd(), fresh = false): string {
  const free = (file: string): boolean => !existsSync(file) || (!fresh && writtenInThisRun.has(file));
  if (free(newRecordPath(name, root, base))) return base;
  for (let run = 2; ; run += 1) {
    const candidate = `${base}-${run}`;
    if (free(newRecordPath(name, root, candidate))) return candidate;
  }
}

/**
 * Writes a record of this run. The first write of a path refuses when the file exists; a later write of the same path in the
 * same run (a check that adds to its record as it goes) replaces what this run wrote.
 */
export function writeRecord(name: string, body: unknown, root = process.cwd(), suffix = RECORD_SUFFIX): string {
  const file = newRecordPath(name, root, suffix);
  if (!writtenInThisRun.has(file) && existsSync(file)) throw new Error(`${file} exists; records are never overwritten.`);
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(withServedBundle(body), null, 2) + "\n");
  writtenInThisRun.add(file);
  return file;
}

/** Writes a record that does not exist yet. Throws, rather than overwrite, when the file is there. Re-exported by deviceModel.ts. */
export function writeNewRecord(file: string, body: Record<string, unknown>): void {
  if (existsSync(file)) throw new Error(`${file} exists; records are never overwritten.`);
  mkdirSync(resolve(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(withServedBundle(body), null, 2) + "\n");
}

// ---- the served bundle (H35a item 0) ---------------------------------------------------------------------------
// Kept here, with no Playwright import, so a unit check can run it; deviceModel.ts re-exports it.

/** Normalizes a module entry script src ("/assets/index-<hash>.js" or URL) to "assets/index-<hash>.js", or null. */
export function normalizeModuleEntrySrc(src: string | null | undefined): string | null {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  try {
    const pathname =
      trimmed.startsWith("http://") || trimmed.startsWith("https://") ? new URL(trimmed).pathname : trimmed;
    return pathname.replace(/^\.?\//, "").replace(/[?#].*$/, "") || null;
  } catch {
    return trimmed.replace(/^\.?\//, "").replace(/[?#].*$/, "") || null;
  }
}

/** The module entry script of a built index.html, as a path inside the folder ("assets/index-<hash>.js"), or null. */
export function moduleEntryOf(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype\s*=\s*["']module["']/i.test(tag)) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (src !== undefined) return normalizeModuleEntrySrc(src);
  }
  return null;
}

/** Outcome of comparing the page's loaded entry script against a fresh Node fetch of /index.html. */
export interface LoadedReleaseCheck {
  loadedScript: string | null;
  networkScript: string | null;
  reloaded: boolean;
  matches: boolean;
}

/** Fetches the hosted /index.html strictly outside the page / service worker using Node fetch with no-store. */
export async function fetchNetworkEntryScript(origin: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const url = `${origin.replace(/\/$/, "")}/index.html`;
  const res = await fetcher(url, {
    cache: "no-store",
    headers: { "cache-control": "no-cache, no-store" },
  });
  if (!res.ok) {
    throw new Error(`network entry script check failed: ${url} returned HTTP ${res.status}`);
  }
  const html = await res.text();
  return moduleEntryOf(html);
}

/** Compares loadedScript vs networkScript; reloads once on mismatch and re-checks before stopping. */
export async function verifyLoadedRelease(ops: {
  readLoadedScript: () => Promise<string | null>;
  readNetworkScript: () => Promise<string | null>;
  reload: () => Promise<void>;
}): Promise<LoadedReleaseCheck> {
  const firstLoaded = normalizeModuleEntrySrc(await ops.readLoadedScript());
  const firstNetwork = normalizeModuleEntrySrc(await ops.readNetworkScript());
  if (firstLoaded !== null && firstLoaded === firstNetwork) {
    return {
      loadedScript: firstLoaded,
      networkScript: firstNetwork,
      reloaded: false,
      matches: true,
    };
  }
  await ops.reload();
  const secondLoaded = normalizeModuleEntrySrc(await ops.readLoadedScript());
  const secondNetwork = normalizeModuleEntrySrc(await ops.readNetworkScript());
  return {
    loadedScript: secondLoaded,
    networkScript: secondNetwork,
    reloaded: true,
    matches: secondLoaded !== null && secondLoaded === secondNetwork,
  };
}

/** The newest regular file under the paths a build reads: src/, index.html, public/ and scripts/vitePlugins.ts. */
function newestSource(root: string): { path: string; mtimeMs: number } {
  let best = { path: "(no source file found)", mtimeMs: 0 };
  const visit = (p: string): void => {
    let st;
    try {
      st = statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(p)) visit(join(p, name));
    } else if (st.isFile() && st.mtimeMs > best.mtimeMs) {
      best = { path: relative(root, p), mtimeMs: st.mtimeMs };
    }
  };
  for (const p of ["src", "index.html", "public", join("scripts", "vitePlugins.ts")]) visit(join(root, p));
  return best;
}

/**
 * Refuses a local build folder that is older than the newest source file, so a check never measures a bundle built
 * before the code it claims to measure (H35a item 0). Reads `<root>/<dir>/index.html`, finds the main chunk, and
 * compares the older of the two file times with the newest file under src/, index.html, public/ and
 * scripts/vitePlugins.ts. Throws with the folder, the main chunk, the build time, the newest source file and its time.
 */
export function inspectServedBundle(
  dir: "dist" | "dist-e2e",
  root = process.cwd(),
): { dir: "dist" | "dist-e2e"; mainChunk: string; buildTime: string } {
  const indexPath = join(root, dir, "index.html");
  const newest = newestSource(root);
  const newestAt = newest.mtimeMs > 0 ? new Date(newest.mtimeMs).toISOString() : "none";
  const fix = "rebuild with npm run build or npm run build:e2e first";
  if (!existsSync(indexPath)) {
    throw new Error(`TEST BUNDLE MISSING: ${dir}/index.html does not exist (mainChunk: none, buildTime: none, newest source ${newest.path} at ${newestAt}); ${fix}.`);
  }
  const mainChunk = moduleEntryOf(readFileSync(indexPath, "utf8"));
  const chunkPath = mainChunk === null ? null : join(root, dir, mainChunk);
  if (mainChunk === null || chunkPath === null || !existsSync(chunkPath)) {
    throw new Error(`TEST BUNDLE MISSING: ${dir} has no main chunk file (mainChunk: ${mainChunk ?? "none"}, buildTime: none, newest source ${newest.path} at ${newestAt}); ${fix}.`);
  }
  const bundleMtimeMs = Math.min(statSync(chunkPath).mtimeMs, statSync(indexPath).mtimeMs);
  const buildTime = new Date(bundleMtimeMs).toISOString();
  if (bundleMtimeMs < newest.mtimeMs) {
    throw new Error(
      `TEST BUNDLE STALE: ${dir} was built before the newest source file. ` +
        `dir: ${dir}, mainChunk: ${mainChunk}, buildTime: ${buildTime}, newestSourcePath: ${newest.path}, newestSourceTime: ${newestAt}; ${fix}.`,
    );
  }
  return { dir, mainChunk, buildTime };
}
