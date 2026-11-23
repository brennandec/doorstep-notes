// The one DEVICE MODEL fixture. It follows "The launch that works" in
// docs/decisions/2026-11-13-browser-on-this-computer.md and copies the launch and the
// request recorder of docs/probes/probe-firebase-sdk-on-device.mjs.
//   - the installed Google Chrome, by path, with a persistent profile in .browser-profile/
//   - ignoreDefaultArgs: true, because Playwright's own switches turn the component
//     updater off, and with them the model was reported unavailable
//   - headless unless DEVICE_MODEL_HEADED=1; no window opens in a build session
//   - the first step reads LanguageModel.availability() under 15 seconds
//   - create() only from a click and only when the state is available
//   - nothing here starts a download; with any state but available it stops
//   - every request is recorded; anything outside the served page is refused and listed
// One browser at a time on the profile: openDevice() hands back a close() that stops
// the browser and the server, and every file calls it.
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { CLOUD_MODEL_HOST, DEVICE_AVAILABILITY_TIMEOUT_MS } from "../../../src/constants";
import { startStaticServer, type RunningServer } from "./staticServer";
import { inspectServedBundle, setServedBundle, writeRecord, type ServedBundleIdentity } from "./records";
import { checkDailyCloudBudget, recordDailyAppCheck, recordDailyCloudCall } from "./cloudCalls";

export const PROFILE_DIR = ".browser-profile";
export const RESULTS_DIR = "results";
export const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Invented values only. Device jobs make no call to the project, so any config will do. */
const INVENTED_CONFIG = "tests/fixtures/firebase.config.invented.json";
const CONFIG_URL_PATH = "/firebase.config.local.json";
/** The server stops itself after this long, under the 300 second limit every file runs with. */
const DEVICE_SERVER_LIMIT_MS = 285_000;

export interface LaunchOptions {
  executablePath: string;
  headless: boolean;
  ignoreDefaultArgs: true;
  args: string[];
  viewport: { width: number; height: number };
}

/** Reads only DEVICE_MODEL_HEADED. Anything other than "1" is headless. */
export function deviceLaunchOptions(env: Record<string, string | undefined> = process.env): LaunchOptions {
  const headless = env["DEVICE_MODEL_HEADED"] !== "1";
  return {
    executablePath: CHROME_PATH,
    headless,
    ignoreDefaultArgs: true,
    args: [
      `--user-data-dir=${resolve(PROFILE_DIR)}`,
      "--remote-debugging-pipe",
      "--no-first-run",
      "--no-default-browser-check",
      "--use-mock-keychain",
      "--password-store=basic",
      ...(headless ? ["--headless=new"] : []),
      "about:blank",
    ],
    viewport: { width: 1440, height: 900 },
  };
}

export type Availability = "unavailable" | "downloadable" | "downloading" | "available" | "no answer" | "no LanguageModel";

export interface ResultBody {
  status: "pass" | "fail" | "miss";
  reason?: string;
  [key: string]: unknown;
}

/**
 * Writes the record of a check as results/<name>-<UTC date>-<session suffix>.json (H20 R8) with the date (UTC, day only), the time
 * and the browser. It never replaces a record from an earlier run: readers take the newest through newestResult.
 */
export function writeResult(name: string, body: ResultBody, browser: string, root = process.cwd()): string {
  const now = new Date().toISOString();
  return writeRecord(name, { date: now.slice(0, 10), time: now, browser, ...body }, root);
}

/** A plain description of this computer: system, chip, memory. No name, no address. */
export function describeMachine(): string {
  const chip = cpus()[0]?.model ?? "unknown chip";
  const gb = Math.round(totalmem() / 1024 ** 3);
  return `${platform()} ${release()} (${arch()}), ${chip}, ${cpus().length} cores, ${gb} GB memory`;
}

/** Reads LanguageModel.availability() for text in and out, English, under the 15 second limit. */
export async function readAvailability(page: Page, limitMs = DEVICE_AVAILABILITY_TIMEOUT_MS): Promise<Availability> {
  const answer = await page.evaluate(async (limit) => {
    const lm = (globalThis as { LanguageModel?: { availability(o: unknown): Promise<string> } }).LanguageModel;
    if (!lm) return "no LanguageModel";
    return await Promise.race([
      lm.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] }),
      new Promise<string>((resolveLimit) => setTimeout(() => resolveLimit("no answer"), limit)),
    ]);
  }, limitMs);
  return answer as Availability;
}

/** Calls LanguageModel.create() from a real click, and only when the state is available. */
export async function createFromClick(page: Page): Promise<"created" | "not available" | "failed"> {
  if ((await readAvailability(page)) !== "available") return "not available";
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.id = "device-create";
    b.textContent = "create";
    b.addEventListener("click", () => {
      const lm = (globalThis as unknown as { LanguageModel: { create(o: unknown): Promise<unknown> } }).LanguageModel;
      (window as unknown as { __created: Promise<unknown> }).__created = lm.create({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      });
    });
    document.body.append(b);
  });
  await page.click("#device-create");
  try {
    await page.evaluate(() => (window as unknown as { __created: Promise<unknown> }).__created);
    return "created";
  } catch {
    return "failed";
  } finally {
    await page.evaluate(() => document.getElementById("device-create")?.remove());
  }
}

// ---- the request recorder (copied from the probe) -------------------------------------------------------------

export interface RecordedRequest {
  url: string;
  method: string;
  bodyBytes: number;
  refused: boolean;
  /** "local file" when the answer came from a file on this computer (the SDK files of an SDK check) */
  served?: "local file";
  /** the body, kept in memory for the leak assertions only; never written to a file */
  body?: Buffer;
  /** how the request was answered: the HTTP status, "no answer" when it failed, "refused by the recorder" when aborted here */
  status?: number | "no answer" | "refused by the recorder";
  /** why an outside request was let through (H15) */
  allowedBy?: "host" | "App Check script" | "reCAPTCHA call";
  /** H28b: length of the response body of an App Check exchange. The body itself is never kept. */
  responseBodyBytes?: number;
}

// ---- the allow list of an outside request (H15 item 1) -------------------------------------------------------

/** The two hosts a real-cloud check may reach: the App Check exchange and the cloud model. */
export const ALLOWED_HOSTS: readonly string[] = ["content-firebaseappcheck.googleapis.com", CLOUD_MODEL_HOST];
/** App Check script loads: GET only, no body. */
export const APP_CHECK_SCRIPT_PREFIXES: readonly string[] = ["https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"];

/** Says why an outside request may pass, or null when it must be aborted and listed. */
export function allowedOutside(
  url: string,
  method: string,
  hasBody: boolean,
  extra?: { recaptchaCalls?: boolean },
): "host" | "App Check script" | "reCAPTCHA call" | null {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  if (ALLOWED_HOSTS.includes(host)) return "host";
  if (method.toUpperCase() === "GET" && !hasBody && APP_CHECK_SCRIPT_PREFIXES.some((p) => url.startsWith(p))) return "App Check script";
  // H28b: reCAPTCHA Enterprise's own calls from the hosted page may be POSTs with a body. Only that path, only with the option.
  if (extra?.recaptchaCalls === true && method.toUpperCase() === "POST" && url.startsWith(RECAPTCHA_ENTERPRISE_PREFIX)) return "reCAPTCHA call";
  return null;
}

/** H28b: where reCAPTCHA Enterprise's own calls go. Allowed as POSTs only when a hosted run asks for it. */
export const RECAPTCHA_ENTERPRISE_PREFIX = "https://www.google.com/recaptcha/enterprise/";

export interface RequestSummary {
  total: number;
  sameOrigin: number;
  /** Addresses outside the served page, with the query part removed. */
  outside: { url: string; method: string; bodyBytes: number; refused: boolean; served?: "local file" }[];
  cloudModelHost: number;
}

export function summariseRequests(requests: RecordedRequest[], origin: string): RequestSummary {
  const outside = requests
    .filter((r) => !r.url.startsWith(origin))
    .map((r) => {
      const q = r.url.indexOf("?");
      return {
        url: (q > 0 ? r.url.slice(0, q) + "?<query removed>" : r.url).slice(0, 200),
        method: r.method,
        bodyBytes: r.bodyBytes,
        refused: r.refused,
        ...(r.served ? { served: r.served } : {}),
      };
    });
  return {
    total: requests.length,
    sameOrigin: requests.length - outside.length,
    outside,
    cloudModelHost: requests.filter((r) => {
      try {
        return new URL(r.url).host === CLOUD_MODEL_HOST;
      } catch {
        return false;
      }
    }).length,
  };
}

export interface Recorder {
  requests: RecordedRequest[];
  /** Forget what was recorded so far (a step of a check starts clean). */
  mark(): number;
  since(mark: number): RecordedRequest[];
  /** generateContent requests that were let through (H15: counted against the cap of the session) */
  generateContentCount(): number;
  /** requests to the App Check exchange host, counted apart from the cloud model calls */
  appCheckCount(): number;
  /** true when a generateContent request was stopped here because the cap was reached */
  stoppedAtCap(): boolean;
  /** waits until App Check response lengths have been read, or the read has failed and left them unset */
  responseBodies(): Promise<void>;
}

/**
 * Records every request the context makes (page and service worker). Anything outside the
 * served origin is refused, so nothing can leave this computer during a check, and listed.
 */
export async function installRecorder(
  context: BrowserContext,
  origin: string,
  local: Record<string, Buffer> = {},
  options: {
    allowOutside?: boolean;
    generateContentCap?: number;
    recaptchaCalls?: boolean;
    cloudLedger?: { file?: string; spec?: string; title?: string; browser?: string };
  } = {},
): Promise<Recorder> {
  const requests: RecordedRequest[] = [];
  const byRequest = new Map<unknown, RecordedRequest>();
  const bodyReads: Promise<void>[] = [];
  let generateContent = 0;
  let appCheck = 0;
  let capped = false;
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    const file = local[url];
    if (file !== undefined) {
      requests.push({ url, method: req.method(), bodyBytes: 0, refused: false, served: "local file" });
      return route.fulfill({ contentType: "text/javascript", body: file });
    }
    const inside = url.startsWith(origin);
    const buffer = req.postDataBuffer() ?? undefined;
    const allowedBy = !inside && options.allowOutside ? allowedOutside(url, req.method(), (buffer?.length ?? 0) > 0, { recaptchaCalls: options.recaptchaCalls === true }) : null;
    const refused = !inside && allowedBy === null;
    // The cap of cloud model calls: the one after the cap does not leave (H15). App Check exchanges are counted apart.
    const isGenerate = !refused && url.includes(`//${CLOUD_MODEL_HOST}/`) && url.includes(":generateContent");
    const sessionOverCap = isGenerate && options.generateContentCap !== undefined && generateContent >= options.generateContentCap;
    let ledgerDenied = false;
    if (isGenerate && !sessionOverCap) {
      const ledgerRes = recordDailyCloudCall(
        options.cloudLedger?.spec ?? "deviceModel.installRecorder",
        options.cloudLedger?.title ?? "device cloud run",
        options.cloudLedger?.browser ?? "Google Chrome",
        options.cloudLedger?.file,
      );
      if (!ledgerRes.allowed) ledgerDenied = true;
    }
    const overCap = sessionOverCap || ledgerDenied;
    if (isGenerate && !overCap) generateContent += 1;
    if (overCap) capped = true;
    if (!refused && url.includes("//content-firebaseappcheck.googleapis.com/")) {
      appCheck += 1;
      recordDailyAppCheck(options.cloudLedger?.file);
    }
    const stop = refused || overCap;
    const entry: RecordedRequest = {
      url,
      method: req.method(),
      bodyBytes: buffer?.length ?? (req.postData() ?? "").length,
      refused: stop,
      ...(buffer ? { body: buffer } : {}),
      ...(allowedBy ? { allowedBy } : {}),
      ...(stop ? { status: "refused by the recorder" as const } : {}),
    };
    requests.push(entry);
    byRequest.set(req, entry);
    if (stop) return route.abort();
    return route.continue();
  });
  context.on("response", async (res) => {
    const entry = byRequest.get(res.request());
    if (!entry) return;
    entry.status = res.status();
    // H28b: the length of an App Check exchange answer, never its content.
    const readBody = (res as { body?: () => Promise<Buffer> }).body;
    if (entry.url.includes("//content-firebaseappcheck.googleapis.com/") && typeof readBody === "function") {
      bodyReads.push(
        readBody.call(res).then(
          (buf) => {
            entry.responseBodyBytes = buf.length;
          },
          () => undefined,
        ),
      );
    }
  });
  context.on("requestfailed", (req) => {
    const entry = byRequest.get(req);
    if (entry && entry.status === undefined) entry.status = "no answer";
  });
  return {
    requests,
    mark: () => requests.length,
    since: (m) => requests.slice(m),
    generateContentCount: () => generateContent,
    appCheckCount: () => appCheck,
    stoppedAtCap: () => capped,
    responseBodies: () => Promise.all(bodyReads).then(() => undefined),
  };
}

// ---- the served bundle (H35a item 0) ---------------------------------------------------------------------------
// The guard lives in records.ts, which imports no Playwright, so a unit check can run it. Exported here for the specs.
export { inspectServedBundle, moduleEntryOf } from "./records";

// ---- opening the browser -------------------------------------------------------------------------------------

export interface DeviceSession {
  context: BrowserContext;
  page: Page;
  server: RunningServer;
  origin: string;
  recorder: Recorder;
  /** "Google Chrome 157.0.8103.79" */
  browser: string;
  availability: "available";
  /** Date.now() just before the launch. */
  startedAt: number;
  /** Milliseconds from just before the launch to the page being open. */
  launchMs: number;
  /** The bundle this page was served: folder (or "hosted"), main chunk, build time. Null for an SDK check page. */
  servedBundle: ServedBundleIdentity | null;
  /** Stops the browser, then the server. Safe to call twice. */
  close(): Promise<void>;
}

export type DeviceOutcome =
  | { ok: true; session: DeviceSession }
  | { ok: false; reason: string; browser: string; availability: Availability | "none" };

/**
 * Serves the built app (dist/) on port 4311, launches Chrome on the profile, opens the page and
 * reads the model state. With Chrome absent, or any state but "available", it closes everything
 * and says why. It never calls create() and nothing it does starts a download.
 */
export async function openDevice(
  options: {
    dir?: "dist" | "dist-e2e";
    url?: string;
    files?: Record<string, string | Buffer>;
    local?: Record<string, Buffer>;
    /** H15: let the App Check and cloud model hosts through (see `allowedOutside`); all else stays refused */
    allowOutside?: boolean;
    /** H15: stop the generateContent request after this many (the cap of the session); the stopped one is listed */
    generateContentCap?: number;
    /** H15: the registered App Check debug token, set in the page before the app starts. Held in memory, never written. */
    debugToken?: string;
    /** H28b: a hosted address (no trailing slash). No static server is started; files and debugToken must be absent. */
    hostedOrigin?: string;
    /** H42b: attribution and optional ledger path for daily cloud-call budget enforcement. */
    cloudLedger?: { file?: string; spec?: string; title?: string };
    /** Local server lifetime. The single-check default is 285s; a multi-visit measure passes its own. */
    serverLimitMs?: number;
  } = {},
): Promise<DeviceOutcome> {
  if (options.hostedOrigin !== undefined && (options.debugToken !== undefined || options.files !== undefined)) {
    throw new Error("A hosted run takes no local files and no debug token.");
  }
  const hosted = options.hostedOrigin;
  if ((options.allowOutside === true || hosted !== undefined) && (options.generateContentCap ?? 1) > 0) {
    const budget = checkDailyCloudBudget(options.cloudLedger?.file);
    if (!budget.allowed) {
      return {
        ok: false,
        reason: `Daily cloud call cap reached (${budget.ledger.total}/${budget.ledger.budget} in ${budget.file}); refusing before launching Chrome (0 network calls).`,
        browser: "none",
        availability: "none",
      };
    }
  }
  if (!existsSync(CHROME_PATH)) {
    return { ok: false, reason: `Google Chrome is not installed at ${CHROME_PATH}`, browser: "none", availability: "none" };
  }
  // H35a item 0: a local build older than the newest source file stops here, with no server, no browser and no request.
  let localBundle: ServedBundleIdentity | null = null;
  if (hosted === undefined && options.url !== "/__sdk-check.html") {
    const inspected = inspectServedBundle(options.dir ?? (options.debugToken ? "dist-e2e" : "dist"));
    localBundle = { folder: inspected.dir, mainChunk: inspected.mainChunk, buildTime: inspected.buildTime };
  }
  const server: RunningServer = hosted
    ? { url: hosted + "/", port: 0, stop: async () => {} }
    : await startStaticServer({
        // A run that carries a debug token needs the e2e build: a production build has no debug path (H19).
        dir: options.dir ?? (options.debugToken ? "dist-e2e" : "dist"),
        files: { [CONFIG_URL_PATH]: readFileSync(INVENTED_CONFIG), ...(options.files ?? {}) },
        limitMs: options.serverLimitMs ?? DEVICE_SERVER_LIMIT_MS,
      });
  const origin = server.url;
  const launch = deviceLaunchOptions();
  const started = Date.now();
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(resolve(PROFILE_DIR), launch);
  } catch (error) {
    await server.stop();
    const first = String((error as Error).message ?? error).split("\n")[0] ?? "launch failed";
    return { ok: false, reason: `Google Chrome could not be launched: ${first}`, browser: "none", availability: "none" };
  }
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.race([context.close().catch(() => undefined), new Promise((r) => setTimeout(r, 15000))]);
    await server.stop();
  };
  try {
    const version = context.browser()?.version() ?? "unknown";
    const browser = `Google Chrome ${version}`;
    const recorder = await installRecorder(context, origin, options.local, {
      allowOutside: options.allowOutside === true || hosted !== undefined,
      ...(hosted !== undefined ? { recaptchaCalls: true } : {}),
      ...(options.generateContentCap !== undefined ? { generateContentCap: options.generateContentCap } : {}),
      cloudLedger: { ...options.cloudLedger, browser },
    });
    if (options.debugToken) {
      await context.addInitScript((t) => {
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
      }, options.debugToken);
    }
    const page = context.pages()[0] ?? (await context.newPage());
    // Start each check as a first visit: site data of the served origin only (page storage, caches, service
    // workers). The model lives in the browser profile, not in site data, and is not touched.
    const cdp = await context.newCDPSession(page);
    {
      // A hosted run clears the address without its trailing slash; a local run keeps what it always cleared.
      const origin = hosted !== undefined ? hosted : server.url;
      await cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
    }
    await cdp.detach();
    // A hosted run names the bundle by what the page loaded: the main chunk and its last-modified header.
    const chunkHeaders = new Map<string, string>();
    if (hosted !== undefined) {
      page.on("response", (res) => {
        let path = "";
        try {
          path = new URL(res.url()).pathname;
        } catch {
          return;
        }
        if (!/\.js$/.test(path)) return;
        const h = res.headers();
        chunkHeaders.set(path, h["last-modified"] ?? h["date"] ?? "");
      });
    }
    await page.goto(hosted !== undefined ? hosted + "/" : origin + (options.url ?? "/"));
    let servedBundle: ServedBundleIdentity | null = localBundle;
    if (hosted !== undefined) {
      const src = await page.evaluate(() => document.querySelector('script[type="module"][src]')?.getAttribute("src") ?? "");
      const mainChunk = src.replace(/^https?:\/\/[^/]+/, "").replace(/^\.?\//, "").replace(/[?#].*$/, "");
      const header = chunkHeaders.get(`/${mainChunk}`) ?? "";
      const parsed = header === "" ? NaN : Date.parse(header);
      servedBundle = { folder: "hosted", mainChunk: mainChunk === "" ? "unknown" : mainChunk, buildTime: Number.isNaN(parsed) ? "unknown" : new Date(parsed).toISOString() };
    }
    setServedBundle(servedBundle);
    const launchMs = Date.now() - started;
    const availability = await readAvailability(page);
    if (availability !== "available") {
      await close();
      return { ok: false, reason: `The device model reported: ${availability}`, browser, availability };
    }
    return { ok: true, session: { context, page, server, origin, recorder, browser, availability, startedAt: started, launchMs, servedBundle, close } };
  } catch (error) {
    await close();
    const first = String((error as Error).message ?? error).split("\n")[0] ?? "failed";
    return { ok: false, reason: `Google Chrome opened but the page did not load: ${first}`, browser: "Google Chrome", availability: "none" };
  }
}

// ---- what a record may say about a request (H15 item 7) ----------------------------------------------------------

export interface RequestRecord {
  host: string;
  method: string;
  /** the path with the query removed; project and app ids replaced */
  path: string;
  bodyBytes: number;
  sha256: string;
  status: number | "no answer" | "refused by the recorder" | "not seen";
  /** "refused" when the recorder aborted it, else why it passed */
  passedBy: "refused" | "host" | "App Check script" | "reCAPTCHA call" | "served page";
}

/**
 * The path of an address, never the address. The query is dropped (the App Check exchange carries the API key
 * and the app id there), and the project and app ids in the path become <project> and <app>.
 */
export function redactedPath(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return "<unreadable address>";
  }
  return pathname
    .replace(/(\/projects\/)[^/:]+/g, "$1<project>")
    // An app id holds colons ("1:<number>:web:<hash>"); the action after the last colon stays.
    .replace(/(\/apps\/)[^/]+(:[A-Za-z]+)$/, "$1<app>$2")
    .replace(/(\/apps\/)[^/:]+(?=\/|$)/g, "$1<app>");
}

/** One entry of a record, from one recorded request. Holds no address, no query, no body. */
export function describeRequest(r: RecordedRequest, origin: string): RequestRecord {
  let host = "";
  try {
    host = new URL(r.url).host;
  } catch {
    host = "";
  }
  return {
    host,
    method: r.method,
    path: redactedPath(r.url),
    bodyBytes: r.bodyBytes,
    sha256: createHash("sha256").update(r.body ?? Buffer.alloc(0)).digest("hex"),
    status: r.status ?? "not seen",
    passedBy: r.refused ? "refused" : r.url.startsWith(origin) ? "served page" : (r.allowedBy ?? "refused"),
  };
}

/** Minimum length of a contiguous base64/base64url token considered an opaque run (H37a). */
export const OPAQUE_RUN_MIN_LENGTH = 40;
/** Maximum share of separator characters (- _ / +) allowed in an opaque token run (H37c). */
export const OPAQUE_RUN_MAX_SEPARATOR_RATIO = 0.08;
/** Hosts where opaque-token relaxation applies: App Check exchange and reCAPTCHA API hosts seen in records (H37c/H37d). */
export const OPAQUE_TOKEN_HOST_ALLOWLIST: readonly string[] = [
  "content-firebaseappcheck.googleapis.com",
  "www.google.com",
];

export type WireRunClass = "model text" | "address" | "opaque" | "body text";
export type NeighbourClass = "L" | "D" | "S" | null;

export interface WireFinding {
  requestIndex: number;
  host: string;
  path: string;
  field: "address" | "body";
  byteOffset: number;
  runClass: WireRunClass;
  runLength?: number;
  valueIndex: number;
  valueLength: number;
  beforeClass: NeighbourClass;
  afterClass: NeighbourClass;
  kind: "stop" | "observation";
}

export interface WireScanResult {
  stops: WireFinding[];
  observations: WireFinding[];
}

const OPAQUE_RUN_RE = /[A-Za-z0-9+/_-]+={0,2}/g;
const OPAQUE_SEPARATORS = new Set(["-", "_", "/", "+"]);
const PCT_BYTE_RE = /^%[0-9A-Fa-f]{2}/;
const SENTINEL_CHUNK_RE = /(\u0001\d+\u0001)/;
const escapeRegExp = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface DecodedSourceMap {
  decoded: string;
  starts: number[];
  ends: number[];
}

/**
 * Decodes valid UTF-8 `%XX` sequences in `input` one code point / byte sequence at a time and tracks
 * the `[start, end)` indices in `input` for every UTF-16 code unit of the decoded string.
 */
export function decodeWithSourceSpans(input: string, plusAsSpace = false): DecodedSourceMap {
  let decoded = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === "%") {
      let decodedChunk: string | null = null;
      let usedEnd = i;
      for (let b = 1; b <= 4 && i + 3 * b <= input.length; b++) {
        const end = i + 3 * b;
        if (!PCT_BYTE_RE.test(input.slice(end - 3, end))) break;
        try {
          decodedChunk = decodeURIComponent(input.slice(i, end));
          usedEnd = end;
          break;
        } catch {
          // continue up to 4 UTF-8 continuation bytes
        }
      }
      if (decodedChunk !== null) {
        for (const unit of decodedChunk) {
          for (let u = 0; u < unit.length; u++) {
            starts.push(i);
            ends.push(usedEnd);
          }
        }
        decoded += decodedChunk;
        i = usedEnd;
        continue;
      }
    }
    const ch = plusAsSpace && input[i] === "+" ? " " : input[i]!;
    decoded += ch;
    starts.push(i);
    ends.push(i + 1);
    i += 1;
  }
  return { decoded, starts, ends };
}

function requestHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function prevCodePoint(text: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  return [...text.slice(Math.max(0, index - 2), index)].at(-1);
}

function nextCodePoint(text: string, endIndex: number): string | undefined {
  if (endIndex >= text.length) return undefined;
  return [...text.slice(endIndex, Math.min(text.length, endIndex + 2))][0];
}

function classifyNeighbour(ch: string | undefined): NeighbourClass {
  if (ch === undefined) return null;
  if (/\p{L}/u.test(ch)) return "L";
  if (/\p{N}/u.test(ch)) return "D";
  return "S";
}

interface OpaqueSpan {
  start: number;
  end: number;
  length: number;
}

/** True iff `run` has >= 40 chars, <= 8% separators (- _ / +), >= 1 digit, and both letter cases (H37c). */
export function isOpaqueTokenRun(run: string): boolean {
  if (run.length < OPAQUE_RUN_MIN_LENGTH) return false;
  let seps = 0;
  let hasDigit = false;
  let hasLower = false;
  let hasUpper = false;
  for (const ch of run) {
    if (OPAQUE_SEPARATORS.has(ch)) seps++;
    else if (ch >= "0" && ch <= "9") hasDigit = true;
    else if (ch >= "a" && ch <= "z") hasLower = true;
    else if (ch >= "A" && ch <= "Z") hasUpper = true;
  }
  return seps / run.length <= OPAQUE_RUN_MAX_SEPARATOR_RATIO && hasDigit && hasLower && hasUpper;
}

function findOpaqueSpans(text: string): OpaqueSpan[] {
  const spans: OpaqueSpan[] = [];
  for (const m of text.matchAll(OPAQUE_RUN_RE)) {
    const start = m.index ?? 0;
    const length = m[0].length;
    if (isOpaqueTokenRun(m[0])) spans.push({ start, end: start + length, length });
  }
  return spans;
}

function valueMatchPattern(value: string): RegExp {
  const letters = [...value].filter((c) => /\p{L}/u.test(c)).length;
  const escaped = escapeRegExp(value);
  return letters >= 5
    ? new RegExp(escaped, "giu")
    : new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu");
}

function itemMatchPattern(value: string, respectWordBoundary: boolean): RegExp {
  if (!respectWordBoundary) return new RegExp(escapeRegExp(value), "giu");
  return valueMatchPattern(value);
}

export interface RedactPathItem {
  text: string;
  marker: string;
}

/**
 * Percent-decodes `path` safely before redacting, then replaces raw, percent-decoded, and `+`-for-space
 * occurrences of `items` strictly longest-first so neither `path` nor `decodeURIComponent(path)` retains
 * matched substrings (H37c/H37d).
 */
export function redactPathItems(
  path: string,
  items: readonly RedactPathItem[],
  respectWordBoundary = true,
): string {
  const active = items.filter((item) => item.text.trim() !== "");
  const decodedInput = decodeWithSourceSpans(path, false).decoded;
  if (active.length === 0) return decodedInput;

  const markerById = active.map((item) => item.marker);
  const longestItems = active
    .map((item, idx) => ({
      text: item.text,
      sentinel: `\u0001${idx}\u0001`,
      hasSpace: /\s/.test(item.text),
      patterns: [itemMatchPattern(item.text, respectWordBoundary)],
    }))
    .sort((a, b) => b.text.length - a.text.length || Number(a.sentinel.slice(1, -1)) - Number(b.sentinel.slice(1, -1)));

  const redactSegment = (seg: string): string => {
    if (seg === "") return seg;
    let best: { srcStart: number; srcEnd: number; sentinel: string; matchLen: number } | null = null;
    const forms: { text: string; starts: number[] | null; ends: number[] | null; plusAsSpace: boolean }[] = [
      { text: seg, starts: null, ends: null, plusAsSpace: false },
    ];
    if (seg.includes("+")) {
      const plusDecoded = decodeWithSourceSpans(seg, true);
      forms.push({ text: plusDecoded.decoded, starts: plusDecoded.starts, ends: plusDecoded.ends, plusAsSpace: true });
    }
    for (const form of forms) {
      for (const item of longestItems) {
        if (form.plusAsSpace && !item.hasSpace) continue;
        if (best !== null && item.text.length < best.matchLen) break;
        const m = item.patterns[0]!.exec(form.text);
        if (!m || m[0].length === 0) continue;
        const srcStart = form.starts ? form.starts[m.index]! : m.index;
        const srcEnd = form.ends ? form.ends[m.index + m[0].length - 1]! : m.index + m[0].length;
        if (
          best === null ||
          item.text.length > best.matchLen ||
          (item.text.length === best.matchLen && srcStart < best.srcStart)
        ) {
          best = { srcStart, srcEnd, sentinel: item.sentinel, matchLen: item.text.length };
        }
      }
    }
    if (best === null) return seg;
    const next = seg.slice(0, best.srcStart) + best.sentinel + seg.slice(best.srcEnd);
    return next
      .split(SENTINEL_CHUNK_RE)
      .map((chunk) => (SENTINEL_CHUNK_RE.test(chunk) ? chunk : redactSegment(chunk)))
      .join("");
  };

  const redacted = redactSegment(decodedInput);
  return redacted.replace(/\u0001(\d+)\u0001/g, (_, idx: string) => markerById[Number(idx)] ?? "");
}

/** Replaces every checked value matched in a percent-decoded path with `[value#<valueIndex>]` (H37c/H37d). */
export function redactPathValues(path: string, values: readonly string[]): string {
  return redactPathItems(
    path,
    values.map((text, valueIndex) => ({ text, marker: `[value#${valueIndex}]` })),
    true,
  );
}

/** The text of every address and body of the given requests, for the leak assertions. Kept in memory only. */
export function wireTexts(requests: RecordedRequest[]): string[] {
  return requests.flatMap((r) => [r.url, r.body ? r.body.toString("utf8") : ""]);
}

interface FieldMatchHit {
  srcStart: number;
  srcEnd: number;
  byteOffset: number;
  before: string | undefined;
  after: string | undefined;
}

function collectFieldMatchHits(
  text: string,
  value: string,
  letters: number,
  opaqueSpans: readonly OpaqueSpan[],
): FieldMatchHit[] {
  const hits: FieldMatchHit[] = [];
  const overlapsExisting = (start: number, end: number): boolean =>
    hits.some((h) => !(end <= h.srcStart || start >= h.srcEnd));

  for (const m of text.matchAll(valueMatchPattern(value))) {
    const mStart = m.index ?? 0;
    const mEnd = mStart + m[0].length;
    hits.push({
      srcStart: mStart,
      srcEnd: mEnd,
      byteOffset: Buffer.byteLength(text.slice(0, mStart), "utf8"),
      before: prevCodePoint(text, mStart),
      after: nextCodePoint(text, mEnd),
    });
  }

  const hasSpace = /\s/.test(value);
  for (const plusAsSpace of [false, true]) {
    if (plusAsSpace && (!text.includes("+") || !hasSpace)) continue;
    const { decoded, starts, ends } = decodeWithSourceSpans(text, plusAsSpace);
    for (const m of decoded.matchAll(valueMatchPattern(value))) {
      const dmStart = m.index ?? 0;
      const dmEnd = dmStart + m[0].length;
      const srcStart = starts[dmStart]!;
      const srcEnd = ends[dmEnd - 1]!;
      if (overlapsExisting(srcStart, srcEnd)) continue;
      hits.push({
        srcStart,
        srcEnd,
        byteOffset: Buffer.byteLength(text.slice(0, srcStart), "utf8"),
        before: prevCodePoint(decoded, dmStart),
        after: nextCodePoint(decoded, dmEnd),
      });
    }
  }

  // H37d item 2: inside allowlisted opaque runs, match <5-letter values even when adjacent to letters or digits.
  if (letters < 5 && opaqueSpans.length > 0) {
    const subRe = new RegExp(escapeRegExp(value), "giu");
    for (const span of opaqueSpans) {
      const slice = text.slice(span.start, span.end);
      for (const m of slice.matchAll(subRe)) {
        const srcStart = span.start + (m.index ?? 0);
        const srcEnd = srcStart + m[0].length;
        if (overlapsExisting(srcStart, srcEnd)) continue;
        hits.push({
          srcStart,
          srcEnd,
          byteOffset: Buffer.byteLength(text.slice(0, srcStart), "utf8"),
          before: prevCodePoint(text, srcStart),
          after: nextCodePoint(text, srcEnd),
        });
      }
    }
  }

  return hits;
}

/**
 * H37a/H37c/H37d wire scanner: locates listed values in raw, percent-decoded, and `+`-decoded addresses and bodies
 * without returning matched value strings or raw bodies. Under five letters in a tightened opaque >=40-char token run
 * (<=8% separators, digit, both cases) on an allowlisted host (`content-firebaseappcheck.googleapis.com` or
 * `www.google.com`) always yields an observation (including when adjacent to a letter or digit); addresses, model-host
 * bodies, non-allowlisted hosts, non-opaque bodies, and >=5-letter values stop strictly, with address paths
 * percent-decoded before redaction and redacting checked values to `[value#<index>]`.
 */
export function scanWire(
  requests: readonly RecordedRequest[],
  values: readonly string[],
  modelHost: string = CLOUD_MODEL_HOST,
  opaqueHostAllowlist: readonly string[] = OPAQUE_TOKEN_HOST_ALLOWLIST,
): WireScanResult {
  const stops: WireFinding[] = [];
  const observations: WireFinding[] = [];

  for (let requestIndex = 0; requestIndex < requests.length; requestIndex++) {
    const r = requests[requestIndex]!;
    const host = requestHost(r.url);
    const path = redactPathValues(redactedPath(r.url), values);
    const bodyText = r.body ? r.body.toString("utf8") : "";
    const isModelHost = host === modelHost;
    const isOpaqueHost = !isModelHost && opaqueHostAllowlist.includes(host);

    const fields: { field: "address" | "body"; text: string; opaqueSpans: OpaqueSpan[] }[] = [
      { field: "address", text: r.url, opaqueSpans: [] },
      {
        field: "body",
        text: bodyText,
        opaqueSpans: !isOpaqueHost || bodyText.length < OPAQUE_RUN_MIN_LENGTH ? [] : findOpaqueSpans(bodyText),
      },
    ];

    for (const { field, text, opaqueSpans } of fields) {
      if (text === "") continue;
      for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
        const value = values[valueIndex]!;
        if (value.trim() === "") continue;
        const letters = [...value].filter((c) => /\p{L}/u.test(c)).length;

        for (const hit of collectFieldMatchHits(text, value, letters, opaqueSpans)) {
          const { srcStart: mStart, srcEnd: mEnd, byteOffset, before, after } = hit;
          const enclosing = opaqueSpans.find((s) => s.start <= mStart && mEnd <= s.end);

          let runClass: WireRunClass;
          let runLength: number | undefined;
          let kind: "stop" | "observation" = "stop";

          if (field === "address") {
            runClass = "address";
          } else if (isModelHost) {
            runClass = "model text";
          } else if (enclosing !== undefined) {
            runClass = "opaque";
            runLength = enclosing.length;
            if (letters < 5) {
              kind = "observation";
            }
          } else {
            runClass = "body text";
          }

          const finding: WireFinding = {
            requestIndex,
            host,
            path,
            field,
            byteOffset,
            runClass,
            ...(runLength !== undefined ? { runLength } : {}),
            valueIndex,
            valueLength: value.length,
            beforeClass: classifyNeighbour(before),
            afterClass: classifyNeighbour(after),
            kind,
          };
          if (kind === "stop") stops.push(finding);
          else observations.push(finding);
        }
      }
    }
  }

  return { stops, observations };
}

/** The values found as stops in any address or body, folded for case (H37a). */
export function findInWire(requests: RecordedRequest[], values: string[]): string[] {
  const { stops } = scanWire(requests, values);
  return values.filter((_, idx) => stops.some((f) => f.valueIndex === idx));
}

/** The short commit the build stands on, from read-only git; "unknown" when git cannot say. */
export function buildCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

/** results/<name>-<UTC date>.json, or -2, -3 and so on; never an existing file. */
export function nextFreeRecord(name: string, root = process.cwd(), suffix?: string): { file: string; date: string } {
  const date = new Date().toISOString().slice(0, 10);
  // A session suffix (H17) names the file outright; writeNewRecord still refuses to overwrite it.
  if (suffix !== undefined) return { file: join(root, RESULTS_DIR, `${name}-${date}-${suffix}.json`), date };
  let file = join(root, RESULTS_DIR, `${name}-${date}.json`);
  for (let n = 2; existsSync(file); n++) file = join(root, RESULTS_DIR, `${name}-${date}-${n}.json`);
  return { file, date };
}

/** Writes a record that does not exist yet. Throws, rather than overwrite, when the file is there. It adds servedBundle (H35a item 0). */
export { writeNewRecord } from "./records";

/**
 * The inputs a real-cloud check takes from this computer, read into memory: the served config and the
 * App Check debug token. Nothing here prints, logs or writes a value. Returns null with a reason when absent.
 */
export function readCloudInputs(): { files: Record<string, Buffer>; debugToken: string } | { missing: string } {
  const CONFIG = "firebase.config.local.json";
  const TOKEN = "appcheck-debug-token.local";
  if (!existsSync(CONFIG)) return { missing: "The local Firebase config file is not in the project root." };
  if (!existsSync(TOKEN)) return { missing: "The local App Check debug token file is not in the project root." };
  return { files: { [CONFIG_URL_PATH]: readFileSync(CONFIG) }, debugToken: readFileSync(TOKEN, "utf8").trim() };
}
