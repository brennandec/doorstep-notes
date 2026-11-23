// DEVICE MODEL, with the real cloud. H36b F: one continuous filmed walk on the hosted page (1920 x 1080).
//
// Hosted origin read from docs/submission/links.json. Preflight, origin clear, initial load, hostedPreflight,
// and service-worker cache warm-up all run on the initial page OUTSIDE the recorded walk video so the walk
// itself is K = 1 continuous take strictly under the 180 s ceiling (TOTAL_LIMIT_S = 175).
// No debug token is set and no local Firebase config is read; production reCAPTCHA Enterprise App Check runs.
//
// Walks: Opening -> Shot A (offline ONLY_ON_DEVICE: invented visit, record, mask Bea + 3/3/87, offline Draft)
// -> Shot B (scrollY=0 offline honesty check, back online -> connected)
// -> Shot C (C.1 online Draft -> PREFER_ON_DEVICE rewrite-shorter -> Send [0 cloud calls]; C.2 D5 #try-listed
//    -> chip; C.3 Cloud Call 1 PREFER_IN_CLOUD Draft -> D7 0px overlap + A6 checks; C.4 D6 #ask-reader ->
//    Cloud Calls 2 & 3 Second Reader with CSS zoom >= 24px / >= 18px cap height)
// -> Shot D (ledger fold zoomed, 4.0 s holds on each of all 4 distinct InferenceMode rows).
//
// Cap: CAP = 4 generateContent calls (3-4 expected, FailFast if <3 or >4 or stoppedAtCap).
// Take slots per A7 + H36e ("h36" through "h36-6"), stopping at the first pass; every take keeps its record and video.
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { findWholeWords } from "../../../src/masking/fold";
import { tagsIn } from "../../../src/masking/tags";
import { recordOf } from "../../../src/inference/secondReader/instructions";
import { checkDailyCloudBudget } from "../fixtures/cloudCalls";
import {
  CHROME_PATH,
  PROFILE_DIR,
  describeMachine,
  describeRequest,
  deviceLaunchOptions,
  inspectServedBundle,
  installRecorder,
  readAvailability,
  readCloudInputs,
  redactedPath,
  type RecordedRequest,
} from "../fixtures/deviceModel";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";
import { fetchNetworkEntryScript, newRecordPath, setServedBundle, verifyLoadedRelease, writeRecord, type LoadedReleaseCheck } from "../fixtures/records";
import {
  NO_DROP_STOP_STATUS,
  REQUIRED_LEDGER_MODES,
  checkSecondReaderMiddleColumn,
  checkVideo,
  classifyDraftOutcomeObservations,
  classifyReaderPassOutcome,
  classifySheetFaults,
  collectFinishedObservations,
  devicePassClaimStopProblems,
  doublesInText,
  extractServedBundle,
  resolveFilmTakeStatus,
  filmCandidateMark,
  forbiddenCopyProblems,
  holdsBeaIn,
  holdsDobIn,
  isReaderPassSettled,
  chooseH39Chip,
  ledgerClaimStopProblems,
  listedInNote,
  namesDebug,
  privacyWhatLeavesProblems,
  readHostedOrigin,
  recoverShotARecord,
  rehearsalGateFrom,
  requireFilmRawRoot,
  selectH37TakeSuffix,
  selectH39TakeSuffix,
  selectH42TakeSuffix,
  shouldStopOnNoDrop,
  tokensNamingThePreviousTag,
  walkCompletionStopProblems,
  type FilmObservation,
  type FrameCheck,
} from "./filmHelpers";
import { hostedPreflight, readDebugTokenGlobal, readServiceWorker, type HostedPreflight } from "./hostedSupport";
import { acceptAll, finishedZoneCheck, leakCheck, leakProblems, readCard, replyText, requestsSection, watchCloudReplies, words, type LeakResult } from "./hybridSupport";
import { appReady, press, seconds, settleShell } from "./support";

declare global {
  interface Window {
    __lmLog?: { head: string; output: string }[];
  }
}

const RECORD_NAME = "film-run";
const VIEWPORT = { width: 1920, height: 1080 };
const VIDEO = { width: 3840, height: 2160 };
const DEVICE_SCALE_FACTOR = 2;
const CAP = 4;
const K = 1;
const MIN_READER_PX = 24;
const MIN_CAP_PX = 18;
const MIN_LEDGER_PX = 24;
const PASS_2_HOLD_MS = 4500;
const LEDGER_ROW_HOLD_MS = 4000;
const TOTAL_LIMIT_S = 180;
const NO_REWRITE_STOP_STATUS = "stopped: no rewrite result" as const;

type SeenCase = "omitted" | "empty" | "present-without-dob" | "present-with-dob" | "unparsed";
interface Attempt {
  k: number; startS: number; endS: number; durationS: number; recordText: string; maskRaw: string | null; seenCase: SeenCase;
  recordHasDob: boolean; recordHasDobAfterRecovery: boolean; recordHasDobFrom: "maskRaw" | "recordText";
  shotAPath: "complete" | "added-to-seen"; addedLines: string[]; proposed: string[]; modelCandidates: string[]; beaByModel: boolean;
  dobByModel: boolean; outcome: string; recordLabel: string | null; chipsLabel: string | null; networkOnAtStart: string | null; structureReply: string | null;
}
interface GuessRead { description: string; why: string | null; kind: string | null; quotes: string[] }
interface PassFigures {
  line: string; hash: string | null; sentToModelBytes: number | null; sentToModelRequests: number | null;
  includingAppCheckBytes: number | null; includingAppCheckRequests: number | null;
}

const clean = (t: string): string => t.replace(/\s+/g, " ").trim();
const first = (e: unknown): string => String((e as Error).message ?? e).split("\n")[0] ?? "failed";
const fold = (t: string): string => t.normalize("NFKC").toLowerCase().replace(/[\s.,;:!?"']+/g, " ").trim();
const gen = (r: RecordedRequest): boolean => r.url.includes(`//${CLOUD_MODEL_HOST}/`) && r.url.includes(":generateContent");
const sourceOf = (label: string): "ON_DEVICE" | "IN_CLOUD" | "none" => (label.includes("in the cloud") ? "IN_CLOUD" : label.includes("on this device") ? "ON_DEVICE" : "none");
const asCount = (w: string | undefined): number | null => (w === undefined ? null : w === "one request" ? 1 : Number(w.replace(/\D/g, "")) || null);
const asBytes = (n: string | undefined): number | null => (n === undefined ? null : Number(n.replace(/,/g, "")));
const holdsBea = holdsBeaIn;
const holdsDob = holdsDobIn;
const listedIn = listedInNote;
const hasWords = (hay: string, w: string): boolean => ` ${hay} `.includes(` ${w} `);
const longWords = (t: string): Set<string> => new Set(fold(t).split(" ").filter((w) => /^\p{L}{4,}$/u.test(w)));

function readPassLine(line: string): PassFigures {
  const model = /Sent to the model: ([\d,]+) bytes in (one request|\d+ requests)/.exec(line);
  const all = /Including the App Check exchange: ([\d,]+) bytes in (one request|\d+ requests)/.exec(line);
  const hash = /Hash of the bytes begins ([0-9a-f]+)\./.exec(line);
  return { line, hash: hash?.[1] ?? null, sentToModelBytes: asBytes(model?.[1]), sentToModelRequests: asCount(model?.[2]), includingAppCheckBytes: asBytes(all?.[1]), includingAppCheckRequests: asCount(all?.[2]) };
}

function parseJson(text: string): Record<string, unknown> | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try {
    const v: unknown = JSON.parse(text.slice(a, b + 1));
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readReplies(log: { head: string; output: string }[]): { structure: string | null; seenCase: SeenCase; candidates: string[] } {
  let at = -1;
  log.forEach((e, i) => {
    const p = parseJson(e.output);
    if (e.head.includes("Make the visit record") || (p !== null && ("visitDate" in p || "present" in p || "seen" in p))) at = i;
  });
  const structure = at >= 0 ? (log[at]?.output ?? null) : null;
  let seenCase: SeenCase = "unparsed";
  const p = structure !== null ? parseJson(structure) : null;
  if (p !== null) {
    if (!("seen" in p)) seenCase = "omitted";
    else if (Array.isArray(p["seen"])) {
      const seen = p["seen"] as unknown[];
      seenCase = seen.length === 0 ? "empty" : seen.filter((x): x is string => typeof x === "string").join(" ").includes("3/3/87") ? "present-with-dob" : "present-without-dob";
    }
  }
  const candidates: string[] = [];
  log.forEach((e, i) => {
    const q = i > at ? parseJson(e.output) : null;
    if (q !== null && Array.isArray(q["candidates"])) for (const c of q["candidates"] as unknown[]) {
      const t = (c as Record<string, unknown> | null)?.["text"];
      if (typeof t === "string") candidates.push(t);
    }
  });
  return { structure, seenCase, candidates };
}

async function readGuesses(page: Page): Promise<GuessRead[]> {
  const cards = page.locator("[data-reader] [data-guess]");
  const out: GuessRead[] = [];
  for (let i = 0; i < (await cards.count()); i++) {
    const card = cards.nth(i);
    const optional = async (selector: string, prefix: RegExp): Promise<string | null> =>
      (await card.locator(selector).count()) > 0 ? clean(await card.locator(selector).first().innerText()).replace(prefix, "") : null;
    out.push({
      description: clean((await card.locator(".reader-who").first().innerText()).replace(/^Guess:\s*/, "")),
      why: await optional("[data-reader-why]", /^Why:\s*/),
      kind: await optional("[data-reader-kind]", /^Kind of clue:\s*/),
      quotes: await card.locator("[data-quote]").evaluateAll((els) => els.map((e) => e.getAttribute("data-quote") ?? "")),
    });
  }
  return out;
}

async function renderedTextSizes(page: Page): Promise<{ min: number; sizes: Record<string, number> }> {
  return page.evaluate(() => {
    const sizes: Record<string, number> = {};
    const card = document.querySelector("[data-reader] [data-guess]");
    if (!card) return { min: 0, sizes };
    for (const [name, selector] of [["description", ".reader-who"], ["why", ".reader-why"], ["kind", ".reader-kind"], ["wordsLabel", ".reader-words-label"], ["chipText", ".chip-text"]] as [string, string][]) {
      const target = card.querySelector(selector);
      if (!target) continue;
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:1em;height:1em;visibility:hidden;";
      target.appendChild(probe);
      sizes[name] = Math.round(probe.getBoundingClientRect().width * 10) / 10;
      probe.remove();
    }
    const v = Object.values(sizes);
    return { min: v.length > 0 ? Math.min(...v) : 0, sizes };
  });
}

async function acceptProposedMatching(page: Page, match: (chipText: string) => boolean): Promise<boolean> {
  const chips = page.locator('[data-mask-view] [data-chip="proposed"]');
  const texts = await chips.allInnerTexts();
  const idx = texts.findIndex((t) => match(clean(t)));
  if (idx < 0) return false;
  const target = chips.nth(idx);
  const start = await target.getAttribute("data-start");
  const end = await target.getAttribute("data-end");
  await target.click();
  if (start !== null && end !== null) {
    await expect(page.locator(`[data-mask-view] [data-chip="proposed"][data-start="${start}"][data-end="${end}"]`)).toHaveCount(0);
  }
  await expect.poll(async () => await chips.count()).toBeLessThan(texts.length);
  return true;
}

function chooseRewriteSentenceIndex(texts: readonly string[]): number {
  const indexed = texts.map((text, index) => ({ index, text: clean(text) }));
  const byLenDesc = (a: { text: string }, b: { text: string }) => b.text.length - a.text.length;
  const p1Long = indexed.filter((s) => s.text.includes("[Person 1]") && s.text.length > 40).sort(byLenDesc);
  if (p1Long.length > 0) return p1Long[0]!.index;
  const anyPersonLong = indexed.filter((s) => /\[Person \d+\]/.test(s.text) && s.text.length > 40).sort(byLenDesc);
  if (anyPersonLong.length > 0) return anyPersonLong[0]!.index;
  const p1Any = indexed.filter((s) => s.text.includes("[Person 1]")).sort(byLenDesc);
  if (p1Any.length > 0) return p1Any[0]!.index;
  return indexed.sort(byLenDesc)[0]?.index ?? 0;
}

const CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;

async function localPreflight(page: Page, baseUrl: string): Promise<HostedPreflight> {
  const origin = baseUrl.replace(/\/$/, "");
  const res = await page.request.get(`${origin}/firebase.config.local.json`);
  let configParses = false;
  let sixKeys = false;
  let siteKeyServed = false;
  try {
    const obj = (await res.json()) as Record<string, unknown>;
    configParses = obj !== null && typeof obj === "object" && !Array.isArray(obj);
    sixKeys = configParses && CONFIG_KEYS.every((k) => typeof obj[k] === "string" && (obj[k] as string).length > 0);
    const siteKey = obj["appCheckSiteKey"];
    siteKeyServed = typeof siteKey === "string" && siteKey.length > 0 && !siteKey.includes("<") && !siteKey.includes(">");
  } catch {
    configParses = false;
  }
  const sha = async (path: string): Promise<string> => {
    const r = await page.request.get(`${origin}${path}`);
    return createHash("sha256").update(await r.body()).digest("hex");
  };
  return {
    configStatus200: res.status() === 200,
    configParses,
    sixKeys,
    siteKeyServed,
    indexHtmlSha256: await sha("/index.html"),
    swJsSha256: await sha("/sw.js"),
  };
}

class FailFast extends Error {}

test("H37b: hosted page, single continuous walk at 1920x1080 CSS viewport and 3840x2160 video with built-in model and real cloud", async () => {
  test.setTimeout(280_000);
  test.skip(!(process.env["DOORSTEP_FILM_RAW_DIR"] ?? "").trim(), "DOORSTEP_FILM_RAW_DIR is not set: this filmed check runs only when that folder is set.");
  const t0 = Date.now();
  const elapsedS = (): number => (Date.now() - t0) / 1000;
  const rawRoot = requireFilmRawRoot();
  const takeSeries = process.env["DOORSTEP_FILM_TAKE_SERIES"] ?? "h39";
  const { suffix, rawDir } =
    takeSeries === "h42"
      ? selectH42TakeSuffix("results", undefined, rawRoot)
      : takeSeries === "h37"
        ? selectH37TakeSuffix("results", undefined, rawRoot)
        : selectH39TakeSuffix("results", undefined, rawRoot);
  const recordFile = newRecordPath(RECORD_NAME, process.cwd(), suffix);
  if (existsSync(recordFile)) throw new Error(`${recordFile} exists. Film takes never overwrite existing records.`);
  expect(relative(process.cwd(), rawDir).startsWith("..")).toBe(true);

  const localE2e = process.env["DOORSTEP_FILM_LOCAL_E2E"] === "1";
  const effectiveCap = localE2e ? 3 : CAP;
  const hosted = localE2e ? { ok: true as const, hostedPage: "", hostedOrigin: "" } : readHostedOrigin();
  const cloudInputs = localE2e ? readCloudInputs() : null;
  const now = new Date().toISOString();
  const buildCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const problems: string[] = [];
  const observations: FilmObservation[] = [];
  const steps: Record<string, unknown>[] = [];
  const attempts: Attempt[] = [];
  const figures: Record<string, unknown> = { hash: null, byteCounts: [], pass1: null, pass2: null, egressCard: null };
  const cloudCalls: Record<string, unknown> = { generateContent: 0, cap: effectiveCap, appCheckExchanges: 0, countAtSendPress: null, retryReason: "" };
  const rec: Record<string, unknown> = {
    status: "started", date: now.slice(0, 10), time: now, takeSeries, takeSuffix: suffix, browser: "not yet launched", machine: describeMachine(),
    build: localE2e ? "dist-e2e (mode=e2e)" : "dist (mode=production)",
    buildCommit,
    commit: buildCommit,
    address: localE2e ? "http://127.0.0.1:4311" : (hosted.ok ? hosted.hostedPage : "invalid"),
    hostedOrigin: localE2e ? null : (hosted.ok ? hosted.hostedPage : "invalid"),
    check: localE2e
      ? "H37b (A1.3): local dist-e2e walk at 1920x1080 CSS viewport recorded at 3840x2160 (2x pixel density) with the built-in model, real cloud, and App Check debug provider. Invented people only."
      : "H37b: hosted page walk at 1920x1080 CSS viewport recorded at 3840x2160 (2x pixel density) with the built-in model, real cloud, and reCAPTCHA Enterprise App Check. Invented people only.",
    viewport: VIEWPORT, videoSize: VIDEO, deviceScaleFactor: DEVICE_SCALE_FACTOR, problems, observations, steps, attempts, filmAttempt: null, shotAPath: null, addedLines: [], earlyStop: null, buildMode: null,
    served: null, debugTokenGlobal: null, serviceWorker: null, loadedScript: null, networkScript: null, loadedRelease: null, appCheck: null,
    offlineDraft: null, rewriteStep: null, secondReaderMiddleColumnCheck: null, step4: null, finishedText: null, repairedMarks: null, pronounDoubles: null,
    cloudReplyTokensNamingThePreviousTag: [], pass2Hold: null, readerType: null, ledgerType: null,
    pass2Descriptions: [], guessOfThatChip: null, pressedGuessRead: null, pass2SameKind: [],
    figures, cloudCalls, videoCheck: null, videos: [],
    instrumentation: {
      outputLogger: "a LanguageModel output logger installed as an init script. It logs each session.prompt output and changes nothing.",
      networkOff: "network off = Playwright context.setOffline (emulated) after preflight + SW ready/controller",
      readerZoom: { method: "an injected style .reader-panel { zoom: N }", value: null },
      ledgerZoom: { method: "an injected style [data-details=\"ledger\"] { zoom: N }", value: null },
      launchSequence: "preflight and SW cache warm-up on initial page, then walk page = context.newPage(), initial closed and its video deleted.",
    },
  };
  const save = (): void => void writeRecord(RECORD_NAME, rec, process.cwd(), suffix);
  const observe = (stepName: string, rule: string, seen: string): void => {
    observations.push({ step: stepName, rule, seen });
    save();
  };
  const stop = (status: "fail" | "miss", reason: string): void => {
    rec["status"] = status;
    rec["reason"] = reason;
    rec["candidate"] = filmCandidateMark({ finishedText: null, noteItems: null });
    problems.push(reason);
    save();
  };
  save();

  if (!hosted.ok) return stop("fail", hosted.reason);
  if (localE2e && cloudInputs && "missing" in cloudInputs) return stop("miss", cloudInputs.missing);
  if (!localE2e) {
    const gate = rehearsalGateFrom("results", hosted.hostedPage, "h36r-2");
    if (!gate.ok) return stop("fail", gate.reason);
  }
  try {
    lstatSync(join(PROFILE_DIR, "SingletonLock"));
    return stop("fail", ".browser-profile has a SingletonLock.");
  } catch {
    // no lock
  }
  if (!existsSync(CHROME_PATH)) return stop("miss", `Google Chrome is not installed at ${CHROME_PATH}`);
  const budget = checkDailyCloudBudget();
  if (!budget.allowed) {
    return stop("miss", `Daily cloud call cap reached (${budget.ledger.total}/${budget.ledger.budget} in ${budget.file}); refusing film walk before Chrome launch.`);
  }
  if (localE2e) {
    const inspected = inspectServedBundle("dist-e2e");
    setServedBundle({ folder: inspected.dir, mainChunk: inspected.mainChunk, buildTime: inspected.buildTime });
  }
  mkdirSync(rawDir, { recursive: true });
  if (readdirSync(rawDir).length > 0) return stop("fail", `${relative(rawRoot, rawDir)} holds a file before the launch.`);

  let staticServer: RunningServer | null = null;
  let context: BrowserContext | null = null;
  let walkPath: string | null = null;
  let finished = false;
  let earlyStopStatus: string | null = null;
  let videoT0 = Date.now();
  try {
    if (localE2e && cloudInputs && !("missing" in cloudInputs)) {
      staticServer = await startStaticServer({ dir: "dist-e2e", files: cloudInputs.files, limitMs: 285_000 });
    }
    const targetUrl = localE2e ? staticServer!.url : hosted.hostedPage;
    const targetOrigin = `${targetUrl}/`;
    rec["address"] = targetUrl;
    save();

    const launch = deviceLaunchOptions();
    context = await chromium.launchPersistentContext(resolve(PROFILE_DIR), {
      ...launch,
      args: [...launch.args.slice(0, -1), `--force-device-scale-factor=${DEVICE_SCALE_FACTOR}`, ...launch.args.slice(-1)],
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      recordVideo: { dir: rawDir, size: VIDEO },
    });
    const ctx = context;
    rec["browser"] = `Google Chrome ${ctx.browser()?.version() ?? "unknown"}`;
    rec["headed"] = process.env["DEVICE_MODEL_HEADED"] === "1";

    const recorder = await installRecorder(ctx, targetOrigin, {}, {
      allowOutside: true,
      ...(localE2e ? {} : { recaptchaCalls: true }),
      generateContentCap: effectiveCap,
      cloudLedger: {
        spec: "filmRun.spec.ts",
        title: `film walk ${suffix}${localE2e ? " (local dist-e2e A1.3)" : ""}`,
        browser: String(rec["browser"] ?? "Google Chrome"),
      },
    });
    const replyWatch = watchCloudReplies(ctx);
    const cloudTagStats: { step: string; total: number; byRole: Record<string, number> }[] = [];
    const statReads: Promise<void>[] = [];
    ctx.on("response", (res) => {
      const url = res.url();
      if (!url.includes(`//${CLOUD_MODEL_HOST}/`) || !url.includes(":generateContent")) return;
      const stepName = replyWatch.step;
      statReads.push(
        res
          .text()
          .then((body) => {
            const txt = replyText(body);
            if (txt !== null) {
              cloudTagStats.push({ step: stepName, ...tokensNamingThePreviousTag(txt) });
            }
          })
          .catch(() => undefined),
      );
    });

    const chunkHeaders = new Map<string, string>();
    ctx.on("response", (res) => {
      try {
        const u = new URL(res.url());
        if (!res.url().startsWith(targetOrigin) || !/\.js$/.test(u.pathname)) return;
        const h = res.headers();
        chunkHeaders.set(u.pathname, h["last-modified"] ?? h["date"] ?? "");
      } catch {
        // ignore unparseable URL
      }
    });

    const syncCounts = (): void => {
      cloudCalls["generateContent"] = recorder.generateContentCount();
      cloudCalls["appCheckExchanges"] = recorder.appCheckCount();
      save();
    };
    ctx.on("request", (r) => {
      if (r.url().includes(":generateContent")) setTimeout(syncCounts, 300);
    });
    ctx.on("response", (r) => {
      if (r.url().includes(":generateContent")) setTimeout(syncCounts, 50);
    });

    if (localE2e && cloudInputs && !("missing" in cloudInputs)) {
      await ctx.addInitScript((token: string) => {
        (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = token;
      }, cloudInputs.debugToken);
    }
    await ctx.addInitScript(() => {
      window.__lmLog = [];
      const w = window as unknown as { LanguageModel?: { create: (...a: unknown[]) => Promise<Record<string, unknown>> } };
      const lm = w.LanguageModel;
      if (!lm || typeof lm.create !== "function") return;
      const create = lm.create.bind(lm);
      lm.create = async (...args: unknown[]) => {
        const session = await create(...args);
        const original = session["prompt"] as ((...a: unknown[]) => Promise<string>) | undefined;
        if (typeof original === "function") {
          session["prompt"] = async (...a: unknown[]) => {
            const result = await original.apply(session, a);
            window.__lmLog!.push({ head: JSON.stringify(a[0]).slice(0, 160), output: String(result) });
            return result;
          };
        }
        return session;
      };
    });

    // ---- Preflight & SW warm-up OUTSIDE the recorded walk video ----
    const initial = ctx.pages()[0] ?? (await ctx.newPage());
    {
      const cdp0 = await ctx.newCDPSession(initial);
      await cdp0.send("Storage.clearDataForOrigin", { origin: targetUrl, storageTypes: "all" });
      await cdp0.detach();
    }
    await initial.goto(targetOrigin);
    const pre = localE2e ? await localPreflight(initial, targetUrl) : await hostedPreflight(initial);
    rec["served"] = {
      indexHtmlSha256: pre.indexHtmlSha256,
      swJsSha256: pre.swJsSha256,
      configServed: pre.configStatus200 && pre.configParses && pre.sixKeys,
      siteKeyServed: pre.siteKeyServed,
    };
    const configComplete = localE2e
      ? [pre.configStatus200, pre.configParses, pre.sixKeys].every(Boolean)
      : [pre.configStatus200, pre.configParses, pre.sixKeys, pre.siteKeyServed].every(Boolean);
    if (!configComplete) {
      throw new FailFast("the hosted config or site key is not served complete");
    }
    await settleShell(initial);
    const initWorker = await readServiceWorker(initial);
    const initDebugToken = await readDebugTokenGlobal(initial);
    const expectedDebugTokenType = localE2e ? "string" : "undefined";
    const expectedBuild = localE2e ? "e2e" : "production";
    if (initDebugToken !== expectedDebugTokenType) throw new FailFast(`FIREBASE_APPCHECK_DEBUG_TOKEN was "${initDebugToken}", expected "${expectedDebugTokenType}"`);
    if (initWorker.build !== expectedBuild) throw new FailFast(`initial data-build was "${initWorker.build}", not "${expectedBuild}"`);
    if (!initWorker.registered || !initWorker.active || initWorker.cachedFiles < 1) {
      throw new FailFast(`initial SW invalid: registered=${initWorker.registered} active=${initWorker.active} cached=${initWorker.cachedFiles}`);
    }
    await expect(initial.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 40_000 });
    await expect(initial.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 40_000 });
    const avail = await readAvailability(initial);
    if (avail !== "available") throw new FailFast(`device model availability was "${avail}"`);
    const initServed = await extractServedBundle(initial, chunkHeaders);
    setServedBundle(localE2e ? { ...initServed, folder: "dist-e2e" } : initServed);
    if (recorder.generateContentCount() !== 0) throw new FailFast(`preflight triggered ${recorder.generateContentCount()} generateContent call(s)`);

    // ---- Open continuous walk page (K = 1); close initial & delete initial video ----
    videoT0 = Date.now();
    const page: Page = await ctx.newPage();
    await initial.close();
    await initial.video()?.delete().catch(() => undefined);
    await page.bringToFront();

    const sinceS = (): number => seconds(Date.now() - videoT0);
    const step = (n: number, label: string, source: "ON_DEVICE" | "IN_CLOUD" | "none", shown: Record<string, unknown>): void => {
      steps.push({ step: n, label, time: new Date().toISOString(), secondsFromStart: sinceS(), inferenceSource: source, shown });
      save();
    };
    const outgoing = (): Promise<string> => page.locator("[data-outgoing]").innerText();
    const hold = (ms: number): Promise<void> => page.waitForTimeout(ms);
    const leaks: { step: number; result: LeakResult }[] = [];
    const checkLeaks = (n: number, since: number, sent: string): void => {
      const result = leakCheck(recorder.since(since), sent);
      leaks.push({ step: n, result });
      for (const obs of result.observations) {
        observe(`Step ${n}`, "opaqueWireTokenShortValue", JSON.stringify(obs));
      }
      const lp = leakProblems(result);
      if (lp.length > 0) throw new FailFast(`step ${n}: ${lp.join("; ")}`);
    };
    const fail = (reason: string): never => {
      throw new FailFast(reason);
    };
    const assertWalkBudget = (phase: string): void => {
      if (sinceS() >= TOTAL_LIMIT_S) fail(`walk exceeded ${TOTAL_LIMIT_S} s ceiling at ${phase} (${sinceS()} s)`);
    };
    let offlineMark: number | null = null;
    let offlineOutside = 0;
    const closeOfflineWindow = (): void => {
      if (offlineMark !== null) offlineOutside += recorder.since(offlineMark).filter((r) => !r.url.startsWith(targetOrigin)).length;
      offlineMark = null;
    };

    try {
      // Opening (0–4 s): warmed SW-controlled hosted shell, online, ready, connected.
      await page.goto(targetOrigin);
      await appReady(page);
      const loadedRelease: LoadedReleaseCheck = await verifyLoadedRelease({
        readLoadedScript: () =>
          page.evaluate(() => {
            const script = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null;
            return script?.getAttribute("src") ?? script?.src ?? null;
          }),
        readNetworkScript: () => fetchNetworkEntryScript(targetOrigin),
        reload: async () => {
          await page.reload();
          await page.waitForFunction(() => navigator.serviceWorker.controller !== null).catch(() => undefined);
          await appReady(page);
        },
      });
      rec["loadedScript"] = loadedRelease.loadedScript;
      rec["networkScript"] = loadedRelease.networkScript;
      rec["loadedRelease"] = loadedRelease;
      if (loadedRelease.reloaded) {
        const reloadServed = await extractServedBundle(page, chunkHeaders);
        setServedBundle(localE2e ? { ...reloadServed, folder: "dist-e2e" } : reloadServed);
      }
      if (!loadedRelease.matches) {
        save();
        fail(
          `loaded release mismatch after 1 reload: loadedScript=${loadedRelease.loadedScript ?? "none"} networkScript=${loadedRelease.networkScript ?? "none"}`,
        );
      }
      const serviceWorker = await readServiceWorker(page);
      const debugTokenGlobal = await readDebugTokenGlobal(page);
      rec["serviceWorker"] = serviceWorker;
      rec["debugTokenGlobal"] = debugTokenGlobal;
      if (debugTokenGlobal !== expectedDebugTokenType) fail(`debug token global was "${debugTokenGlobal}"`);
      if (serviceWorker.build !== expectedBuild) fail(`data-build was "${serviceWorker.build}", not "${expectedBuild}"`);
      if (!serviceWorker.registered || !serviceWorker.active || serviceWorker.cachedFiles < 1 || serviceWorker.note.startsWith("failed")) {
        fail(`walk page service worker invalid: active=${serviceWorker.active} cached=${serviceWorker.cachedFiles} note=${serviceWorker.note}`);
      }
      const swController = await page.evaluate(() => navigator.serviceWorker.controller !== null);
      if (!swController) fail("walk page opened without an active serviceWorker controller");

      await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
      await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 30_000 });
      const readBuild = async (): Promise<{ header: string; network: string; device: string; cloud: string }> => ({
        header: clean(await page.locator("[data-halves]").first().innerText({ timeout: 2_000 }).catch(() => "not shown")),
        network: await words(page, "network").catch(() => "not shown"),
        device: await words(page, "device").catch(() => "not shown"),
        cloud: await words(page, "cloud").catch(() => "not shown"),
      });
      const buildMode = await readBuild();
      rec["buildMode"] = buildMode;
      save();
      if (buildMode.header.includes("a fixed sample answers and nothing is sent")) {
        observe("Opening", "headerCopy", buildMode.header);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      const boundary = clean(await page.locator("[data-boundary]").innerText());
      await hold(2500);
      step(1, localE2e ? "Opening: local test build (dist-e2e) ready and connected" : "Opening: hosted page ready and connected", "none", {
        boundary,
        zones: (await page.locator("[data-zone] h2").allInnerTexts()).map(clean),
        statusBar: { network: await words(page, "network"), deviceModel: await words(page, "device"), cloud: await words(page, "cloud") },
      });
      if (!/this device/i.test(boundary) || !/the cloud/i.test(boundary)) {
        observe("Opening", "boundaryCopy", boundary);
      }

      // ---- Shot A (4–42 s, offline, 0 cloud calls): K = 1 attempt ----
      assertWalkBudget("Shot A start");
      await ctx.setOffline(true);
      await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
      offlineMark = recorder.mark();
      const offlineForbidden = forbiddenCopyProblems({ pageText: await page.locator("main, body").first().innerText(), offline: true });
      for (const seen of offlineForbidden) observe("Shot A offline opening", "forbiddenCopyProblems", seen);
      await hold(2000);

      const a: Attempt = {
        k: 1, startS: sinceS(), endS: 0, durationS: 0, recordText: "", maskRaw: null, seenCase: "unparsed", recordHasDob: false,
        recordHasDobAfterRecovery: false, recordHasDobFrom: "recordText", shotAPath: "complete", addedLines: [], proposed: [],
        modelCandidates: [], beaByModel: false, dobByModel: false, outcome: "", recordLabel: null, chipsLabel: null,
        networkOnAtStart: buildMode.network, structureReply: null,
      };
      attempts.push(a);

      await press(page, "#try-example");
      await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
      await hold(3000);

      await press(page, "#make-record");
      await expect(page.locator("[data-record]").or(page.locator('[role="alert"]')).or(page.locator("p.error")).first()).toBeVisible({ timeout: 60_000 });
      const recordErr = page.locator('[role="alert"], p.error').first();
      const failure = (await recordErr.count()) > 0 ? clean(await recordErr.innerText()) : null;
      const hasRecord = (await page.locator("[data-record]").count()) > 0;
      a.recordText = hasRecord ? clean(await page.locator("[data-record]").first().innerText()) : "";
      a.recordLabel = (await page.locator("[data-record] .source-label").count()) > 0 ? clean(await page.locator("[data-record] .source-label").first().innerText()) : null;
      a.maskRaw = (await page.locator("[data-mask-text]").count()) > 0 ? clean(await page.locator("[data-mask-text]").first().innerText()) : null;
      const r1 = readReplies(await page.evaluate(() => window.__lmLog ?? []));
      a.structureReply = r1.structure;
      a.seenCase = r1.seenCase;
      a.recordHasDobFrom = a.maskRaw !== null ? "maskRaw" : "recordText";
      a.recordHasDob = (a.maskRaw ?? a.recordText).includes("3/3/87");
      if (!hasRecord) {
        a.outcome = `failed:record missing${failure ? `: ${failure.slice(0, 120)}` : ""}`;
        fail(a.outcome);
      }
      if (failure !== null) observe("Shot A record", "recordAlert", failure);
      const recovery = await recoverShotARecord(page, hold);
      a.shotAPath = recovery.shotAPath;
      a.addedLines = recovery.addedLines;
      rec["shotAPath"] = a.shotAPath;
      rec["addedLines"] = a.addedLines;
      if (a.shotAPath === "added-to-seen") {
        a.recordText = (await page.locator("[data-record]").count()) > 0 ? clean(await page.locator("[data-record]").first().innerText()) : a.recordText;
      } else {
        await hold(2500);
      }
      a.recordHasDobAfterRecovery = (a.maskRaw ?? a.recordText).includes("3/3/87");

      await press(page, "#mask");
      await expect
        .poll(
          async () => {
            if ((await page.locator("[data-mask-section] .source-label").count()) > 0) return "label";
            const line = (await page.locator("[data-device-pass-line]").count()) > 0 ? await page.locator("[data-device-pass-line]").first().innerText() : "";
            return /could not suggest|too long for the device pass/.test(line) ? "failedPass" : "waiting";
          },
          { timeout: 60_000, intervals: [500] },
        )
        .not.toBe("waiting");
      if ((await page.locator("[data-mask-section] .source-label").count()) === 0) {
        a.outcome = "failed:proposeFailed line";
        fail("Shot A device pass failed; 0 cloud calls spent");
      }
      a.chipsLabel = clean(await page.locator("[data-mask-section] .source-label").first().innerText());
      a.maskRaw = (await page.locator("[data-mask-text]").count()) > 0 ? clean(await page.locator("[data-mask-text]").first().innerText()) : a.maskRaw;
      a.proposed = (await page.locator('[data-mask-view] [data-chip="proposed"]').allInnerTexts()).map(clean);
      a.modelCandidates = readReplies(await page.evaluate(() => window.__lmLog ?? [])).candidates;
      a.beaByModel = holdsBea(a.modelCandidates);
      a.dobByModel = holdsDob(a.modelCandidates);
      if (!a.beaByModel || !a.dobByModel) {
        observe(
          "Shot A device pass",
          "devicePassRawModelSpy",
          `beaByModel=${a.beaByModel} dobByModel=${a.dobByModel} proposed=${JSON.stringify(a.proposed)}`,
        );
      }
      const claimStops = devicePassClaimStopProblems(a.proposed);
      if (claimStops.length > 0) {
        a.outcome = "pass-missed";
        fail(`${claimStops.join("; ")}; 0 cloud calls spent`);
      }
      a.outcome = "success";
      await hold(3000);
      step(2, "Shot A: offline invented visit, record, and proposed chips", sourceOf(a.recordLabel ?? ""), {
        recordLabel: a.recordLabel, chipsLabel: a.chipsLabel, shotAPath: a.shotAPath, addedLines: a.addedLines, network: await words(page, "network"), chipsShown: a.proposed,
      });

      // H35a D2: Zone 2 shows "Nothing to send yet." until Draft is pressed.
      const preDraftZone2 = await page.locator('[data-zone="leaves"]').innerText();
      if (!preDraftZone2.includes("Nothing to send yet")) {
        observe("Shot A pre-Draft", "zone2EmptyCopy", preDraftZone2);
      }

      // Accept "3/3/87", hold 2.0 s; accept "Bea", hold 2.0 s; accept remaining dashed chips (never un-mask).
      if (!(await acceptProposedMatching(page, (t) => t.includes("3/3/87")))) fail('could not click proposed "3/3/87" chip');
      await hold(2000);
      if (!(await acceptProposedMatching(page, (t) => holdsBea([t])))) fail('could not click proposed "Bea" chip');
      await hold(2000);
      await acceptAll(page);

      // Still offline: Draft runs ONLY_ON_DEVICE sendDraft and renders Finished "on this device".
      await press(page, "#draft");
      while ((await page.locator("[data-keep-likely]").count()) > 0) {
        const keepPrompt = await page.locator("[data-likely-word]").allInnerTexts();
        if (holdsBea(keepPrompt)) observe("Shot A Keep gate", "keepPromptHeldBea", keepPrompt.join(" | "));
        await page.locator("[data-keep-likely]").first().click();
      }
      const offSheet = page.locator('[data-zone="finished"] .sheet-text');
      const offAlert = page.locator('[data-zone="note"] [role="alert"]');
      const offNoDraft = page.locator("[data-no-draft]");
      await expect(offSheet.or(offAlert).or(offNoDraft).first()).toBeVisible({ timeout: 60_000 });
      const hasOffSheet = (await offSheet.count()) > 0;
      const offAlertText = (await offAlert.count()) > 0 ? clean(await offAlert.first().innerText()) : null;
      const offNoDraftText = (await offNoDraft.count()) > 0 ? clean(await offNoDraft.first().innerText()) : null;
      observations.push(
        ...classifyDraftOutcomeObservations({
          step: "Shot A offline Draft",
          hasSheet: hasOffSheet,
          alertText: offAlertText,
          noDraftText: offNoDraftText,
        }).observations,
      );
      const offFinishedLabel =
        (await page.locator('[data-zone="finished"] .source-label').count()) > 0
          ? clean((await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + "))
          : "not shown";
      const offOutgoing = (await page.locator("[data-outgoing]").count()) > 0 ? await outgoing() : "";
      const offZone2Text = (await page.locator('[data-zone="leaves"]').count()) > 0 ? await page.locator('[data-zone="leaves"]').innerText() : "";
      if (hasOffSheet && sourceOf(offFinishedLabel) !== "ON_DEVICE") {
        observe("Shot A offline Draft", "finishedLabel", offFinishedLabel);
      }
      const offPrivacy = privacyWhatLeavesProblems("Shot A offline Draft", offOutgoing);
      if (offPrivacy.length > 0) fail(offPrivacy.join("; "));
      if (hasOffSheet && offZone2Text.includes("Nothing to send yet")) {
        observe("Shot A offline Draft", "zone2EmptyCopy", offZone2Text);
      }
      const deviceDraftText = hasOffSheet ? (await offSheet.first().innerText()).trim() : null;
      const deviceAboutLines = (await page.locator('[data-zone="finished"] .sheet-notes li').allInnerTexts())
        .map(clean)
        .filter((t) => t !== "");
      const deviceShortLine =
        (await page.locator('[data-zone="finished"] .sheet-short').count()) > 0
          ? clean(await page.locator('[data-zone="finished"] .sheet-short').first().innerText())
          : null;
      const offRepairedMarks = hasOffSheet
        ? Number((await page.locator('[data-zone="finished"] [data-sheet]').getAttribute("data-repaired-marks")) ?? "0")
        : 0;
      rec["offlineDraft"] = {
        finishedLabel: offFinishedLabel,
        outgoingClean: true,
        whatLeavesChars: offOutgoing.length,
        sheetPresent: hasOffSheet,
        deviceDraftText,
        deviceAboutLines,
        repairedMarks: offRepairedMarks,
        ...(deviceShortLine !== null ? { deviceShortLine } : {}),
      };
      await hold(2500);
      a.endS = sinceS();
      a.durationS = seconds((a.endS - a.startS) * 1000);
      rec["filmAttempt"] = { k: 1, K, startS: a.startS, endS: a.endS };
      step(3, "Shot A: chips accepted and offline Draft completed on this device", "ON_DEVICE", {
        finishedLabel: offFinishedLabel, whatLeavesHoldsBea: false, whatLeavesHoldsDob: false,
      });

      closeOfflineWindow();
      if (offlineOutside > 0) fail(`${offlineOutside} request(s) left the page while offline`);
      if (recorder.generateContentCount() !== 0) {
        observe("Shot A", "unexpectedGenerateContent", String(recorder.generateContentCount()));
      }
      rec["offlineOutsideRequests"] = offlineOutside;
      walkRest: {
      if (shouldStopOnNoDrop({ stopEnabled: process.env["DOORSTEP_FILM_STOP_NO_DROP"] === "1", addedLinesCount: a.addedLines.length })) {
        earlyStopStatus = NO_DROP_STOP_STATUS;
        rec["earlyStop"] = {
          status: NO_DROP_STOP_STATUS,
          switchEnv: "DOORSTEP_FILM_STOP_NO_DROP=1",
          shotAPath: a.shotAPath,
          addedLinesCount: a.addedLines.length,
          generateContentCount: recorder.generateContentCount(),
          atS: sinceS(),
        };
        step(3.5, `Stopped early (${NO_DROP_STOP_STATUS}): 0 lines added back, 0 cloud calls`, "ON_DEVICE", {
          shotAPath: a.shotAPath,
          addedLinesCount: 0,
          generateContentCount: recorder.generateContentCount(),
        });
        break walkRest;
      }

      // ---- Shot B (42–50 s, offline -> online honesty) ----
      assertWalkBudget("Shot B");
      await page.evaluate(() => window.scrollTo(0, 0));
      const offlineHalves = await page.locator("[data-halves]").first().innerText();
      if (offlineHalves.includes("The cloud half is connected")) {
        observe("Shot B", "offlineHalvesCopy", offlineHalves);
      }
      await hold(1500);

      await ctx.setOffline(false);
      await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
      await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 45_000 });
      await hold(2500);
      step(4, "Shot B: scroll top offline honesty, then network online and cloud connected", "none", {
        network: await words(page, "network"), cloud: await words(page, "cloud"),
      });

      // ---- Shot C.1 (PREFER_ON_DEVICE rewrite-shorter -> Send, 0 cloud calls) ----
      assertWalkBudget("Shot C.1");
      await press(page, "#draft");
      await expect(page.locator("#send")).toBeEnabled({ timeout: 60_000 });
      if ((await page.locator('[data-zone="finished"] .sheet-text').count()) > 0) {
        observe("Shot C.1", "previousFinishedRemaining", "online Draft left previous Finished sheet visible");
      }
      const sentences = page.locator("[data-outgoing] [data-sentence]");
      await expect(sentences.first()).toBeVisible();
      const sentenceTexts = await sentences.allInnerTexts();
      const chosenIdx = chooseRewriteSentenceIndex(sentenceTexts);
      const chosenSentence = clean(sentenceTexts[chosenIdx] ?? "");
      await sentences.nth(chosenIdx).click();
      await expect(page.locator("[data-rewrite-controls]")).toBeVisible();
      await hold(1500);

      await page.locator("#rewrite-shorter").click();
      await expect(page.locator("[data-rewrite-wait]").first()).toBeVisible();
      const gcBeforeRewrite = recorder.generateContentCount();
      await press(page, "#send");
      await expect(page.locator("[data-rewrite-result]").or(page.locator("[data-rewrite-line]")).first()).toBeVisible({ timeout: 60_000 });
      let rewriteLabel = "none";
      let rewrittenSentence = "";
      let rewriteApplied = false;
      if ((await page.locator("[data-rewrite-result]").count()) === 0) {
        const line = clean(await page.locator("[data-rewrite-line]").first().innerText());
        observe("Shot C.1", "rewriteNoResult", line);
      } else {
        rewriteLabel = clean(await page.locator("[data-rewrite-result] .source-label").first().innerText());
        if (sourceOf(rewriteLabel) !== "ON_DEVICE") observe("Shot C.1", "rewriteSourceLabel", rewriteLabel);
        const afterSentences = await page.locator("[data-outgoing] [data-sentence]").allInnerTexts();
        rewrittenSentence = clean(afterSentences[chosenIdx] ?? "");
        rewriteApplied = rewrittenSentence !== "";
      }
      if (recorder.generateContentCount() !== gcBeforeRewrite) {
        observe("Shot C.1", "rewriteCloudCall", String(recorder.generateContentCount() - gcBeforeRewrite));
      }
      rec["rewriteStep"] = { chosenSentence, rewrittenSentence, rewriteApplied, rewriteLabel, generateContentAfter: recorder.generateContentCount() };
      if (!rewriteApplied && process.env["DOORSTEP_FILM_STOP_NO_REWRITE"] === "1" && recorder.generateContentCount() === 0) {
        earlyStopStatus = NO_REWRITE_STOP_STATUS;
        rec["earlyStop"] = {
          status: NO_REWRITE_STOP_STATUS,
          switchEnv: "DOORSTEP_FILM_STOP_NO_REWRITE=1",
          chosenSentence,
          generateContentCount: 0,
          atS: sinceS(),
        };
        step(5.5, `Stopped early (${NO_REWRITE_STOP_STATUS}): rewrite gave no shorter sentence, 0 cloud calls`, "ON_DEVICE", {
          chosenSentence,
          generateContentCount: 0,
        });
        break walkRest;
      }
      await hold(2000);
      step(5, "Shot C.1: online Draft, rewrite shorter PREFER_ON_DEVICE on this device", "ON_DEVICE", {
        chosenChars: chosenSentence.length, rewriteLabel,
      });

      // ---- Shot C.2 (D5: #try-listed block -> click block chip -> unblocked) ----
      assertWalkBudget("Shot C.2");
      await press(page, "#try-listed");
      const block = page.locator("[data-block-line]");
      await expect(block).toBeVisible();
      const lineText = clean(await block.innerText());
      const chipNames = await block.locator("[data-block-chip]").evaluateAll((els) => els.map((e) => e.getAttribute("data-block-chip") ?? ""));
      const sendWhileBlocked = await page.locator("#send").isEnabled();
      const zone2BlockedText = await page.locator('[data-zone="leaves"]').innerText();
      if (sendWhileBlocked) {
        fail(`Shot C.2 privacy gate failed: #send enabled while listed name unmasked in What leaves`);
      }
      if (!lineText.startsWith("Not sent: 1 listed name is in the text. Mask it, then send.") || chipNames.length !== 1) {
        observe("Shot C.2", "blockLineCopy", `${lineText} (chips=${chipNames.length})`);
      }
      if (zone2BlockedText.includes("Send this name on purpose")) {
        observe("Shot C.2", "forbiddenPurposeCopy", zone2BlockedText);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await hold(2500);

      const outgoingAtPress = await outgoing();
      const pressedAt = Date.now();
      await block.locator("[data-block-chip] button").first().click();
      let goneSeconds: number | null = null;
      while (Date.now() - pressedAt < 10_000) {
        if ((await page.locator("[data-block-line]").count()) === 0) {
          goneSeconds = seconds(Date.now() - pressedAt);
          break;
        }
        await page.waitForTimeout(100);
      }
      const sendAfter = await page.locator("#send").isEnabled();
      const outgoingAfter = await outgoing();
      if (goneSeconds === null) fail("Shot C.2 unblock timed out after 10 s");
      if (!sendAfter) fail("Shot C.2 #send stayed disabled after masking block chip");
      const afterUnblockPrivacy = privacyWhatLeavesProblems("Shot C.2 after unmask chip", outgoingAfter);
      if (afterUnblockPrivacy.length > 0) fail(afterUnblockPrivacy.join("; "));
      rec["step4"] = { lineText, chipCount: chipNames.length, chipLabel: chipNames[0] ?? null, outgoingAtPress, goneSeconds, sendEnabledWhileBlocked: sendWhileBlocked, sendEnabledAfter: sendAfter, outgoingAfter };
      await hold(2000);
      step(6, "Shot C.2 (D5): Try to send a listed name blocked, chip pressed, Send back", "none", { lineText, chipNames, goneSeconds });
      checkLeaks(6, 0, "");
      if (recorder.generateContentCount() !== 0) {
        observe("Shot C.2", "unexpectedGenerateContent", String(recorder.generateContentCount()));
      }
      cloudCalls["countAtSendPress"] = 0;

      // ---- Shot C.3 (Cloud Call 1: PREFER_IN_CLOUD draft -> D7 + H36g stops/observations) ----
      assertWalkBudget("Shot C.3");
      let mark = recorder.mark();
      replyWatch.step = "draft";
      const sentDraft = await outgoing();
      const preSendPrivacy = privacyWhatLeavesProblems("Shot C.3 before Send", sentDraft);
      if (preSendPrivacy.length > 0) fail(preSendPrivacy.join("; "));
      await press(page, "#send");
      await expect(page.locator("[data-working]").first()).toBeVisible({ timeout: 10_000 }).catch(() => undefined);
      const sheet = page.locator('[data-zone="finished"] .sheet-text');
      const c3Alert = page.locator('[data-zone="note"] [role="alert"]');
      const c3NoDraft = page.locator("[data-no-draft]");
      await expect(sheet.or(c3Alert).or(c3NoDraft).first()).toBeVisible({ timeout: 150_000 });
      const hasC3Sheet = (await sheet.count()) > 0;
      const c3AlertText = (await c3Alert.count()) > 0 ? clean(await c3Alert.first().innerText()) : null;
      const c3NoDraftText = (await c3NoDraft.count()) > 0 ? clean(await c3NoDraft.first().innerText()) : null;
      observations.push(
        ...classifyDraftOutcomeObservations({
          step: "Shot C.3",
          hasSheet: hasC3Sheet,
          alertText: c3AlertText,
          noDraftText: c3NoDraftText,
        }).observations,
      );

      let finishedLabel =
        (await page.locator('[data-zone="finished"] .source-label').count()) > 0
          ? clean((await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + "))
          : "not shown";
      let finishedText = "";
      let c3RepairedMarks = 0;
      let card: { verdict: string; rows: Record<string, string>; kind: string | null } = {
        verdict: "not shown",
        rows: {},
        kind: null,
      };
      if (hasC3Sheet) {
        await expect(page.locator('[data-zone="finished"] .source-label').first()).toBeVisible();
        await expect(page.locator("[data-egress-card]").first()).toBeVisible();

        finishedLabel = clean((await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + "));
        finishedText = await sheet.innerText();
        const sheetEl = page.locator('[data-zone="finished"] [data-sheet]');
        const sheetText = await sheetEl.innerText();
        c3RepairedMarks = Number((await sheetEl.getAttribute("data-repaired-marks")) ?? "0");
        rec["finishedText"] = finishedText;
        rec["finishedNotes"] = (await page.locator('[data-zone="finished"] .sheet-notes li').allInnerTexts()).map((t) => clean(t));
        rec["repairedMarks"] = c3RepairedMarks;
        const doubles = doublesInText(finishedText);
        rec["pronounDoubles"] = doubles;
        save();

        card = (await page.locator("[data-egress-line]").count()) > 0 ? await readCard(page) : card;
        const zone = await finishedZoneCheck(page, "Shot C.3");
        await page.evaluate(() => window.scrollTo(0, 0));

        const d7Failure = await page.evaluate(() => {
          const c = document.querySelector("[data-egress-card]");
          if (!c) return "D7: [data-egress-card] missing";
          const cr = c.getBoundingClientRect();
          for (const sel of ["#draft", "#send", "#try-listed", "[data-outgoing]"]) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const er = el.getBoundingClientRect();
            if (er.width <= 0 || er.height <= 0) continue;
            const w = Math.max(0, Math.min(cr.right, er.right) - Math.max(cr.left, er.left));
            const h = Math.max(0, Math.min(cr.bottom, er.bottom) - Math.max(cr.top, er.top));
            if (w > 0 && h > 0) return `D7 overlap (${Math.round(w)}x${Math.round(h)} px) between [data-egress-card] and ${sel}`;
          }
          return null;
        });
        if (d7Failure !== null) observe("Shot C.3", "d7Overlap", d7Failure);

        const sheetFaults = classifySheetFaults({ sheetText, noteItems: zone.flags });
        if (sheetFaults.stops.length > 0) fail(sheetFaults.stops.join("; "));
        for (const obs of collectFinishedObservations({ finishedText, observedNotes: sheetFaults.observedNotes })) {
          observations.push(obs);
        }

        if (sourceOf(finishedLabel) !== "IN_CLOUD") observe("Shot C.3", "finishedLabel", finishedLabel);
        if (!/: 0 of \d+/.test(card.verdict)) observe("Shot C.3", "egressCardVerdict", card.verdict);
        if (!Object.keys(card.rows).some((r) => /request/i.test(r))) {
          observe("Shot C.3", "egressCardMissingRequestRow", JSON.stringify(card.rows));
        }
        if (!finishedText.includes("Maria Okonkwo-Reyes")) {
          observe("Shot C.3", "clientNameAbsent", finishedText.slice(0, 160));
        }
        if ((await page.locator("[data-put-back]").count()) > 0 || zone.putBackButtons.length > 0) {
          observe("Shot C.3", "putBackButtons", zone.putBackButtons.join(" | "));
        }
        if ((await page.locator("[data-copy-held]").count()) > 0 || zone.copyDisabled) {
          observe("Shot C.3", "copyHeld", String(zone.copyDisabled));
        }
        if ((await page.locator("[data-short-draft]").count()) > 0) {
          observe("Shot C.3", "shortDraft", await page.locator("[data-short-draft]").first().innerText());
        }
        for (const zp of zone.problems) observe("Shot C.3", "finishedZoneProblem", zp);

        const zone2AfterCloud = await page.locator('[data-zone="leaves"]').innerText();
        const zone3AfterCloud = await page.locator('[data-zone="finished"]').innerText();
        const pageBodyText = await page.locator("main, body").first().innerText();
        const fcp = forbiddenCopyProblems({
          pageText: pageBodyText,
          offline: false,
          finishedShown: true,
          outgoingPopulated: true,
          zone2Text: zone2AfterCloud,
          zone3Text: zone3AfterCloud,
          networkWords: await words(page, "network"),
        });
        for (const seen of fcp) observe("Shot C.3", "forbiddenCopyProblems", seen);
      } else {
        card = (await page.locator("[data-egress-line]").count()) > 0 ? await readCard(page) : card;
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      save();

      checkLeaks(7, mark, sentDraft);
      await hold(3500);
      figures["egressCard"] = card;
      step(7, "Shot C.3 (Cloud Call 1): finished note settled in cloud step", "IN_CLOUD", {
        finishedLabel, card, draftChars: finishedText.length, repairedMarks: hasC3Sheet ? c3RepairedMarks : 0, d7OverlapPx: 0, sheetPresent: hasC3Sheet,
      });

      // ---- Shot C.4 (Cloud Calls 2 & 3: Second Reader Pass 1 -> Chip -> Ask again -> Pass 2) ----
      assertWalkBudget("Shot C.4 Pass 1");
      mark = recorder.mark();
      replyWatch.step = "reader-pass-1";
      await press(page, "#ask-reader");
      await expect(page.locator("[data-reader-prepared]")).toBeVisible();
      const preparedText = clean(await page.locator("[data-reader-prepared]").innerText());
      if (preparedText !== "Request prepared. It is shown under What leaves. Press Send.") {
        observe("Shot C.4 D6", "preparedCopy", preparedText);
      }
      const sendLabelD6 = clean(await page.locator("#send").innerText());
      const sendFocused = await page.evaluate(() => document.activeElement?.id === "send");
      if (!sendFocused || sendLabelD6 !== "Send to the second reader") {
        observe("Shot C.4 D6", "sendLabelOrFocus", `label="${sendLabelD6}" focused=${sendFocused}`);
      }
      await hold(2000);

      const readerText1 = await outgoing();
      let pressedQuoteForCheck: string | null = null;
      let readerText2ForCheck: string | null = null;
      let pass2RanForCheck = false;
      await press(page, "#send");
      const passLocator = page.locator("[data-reader-pass]");
      const errorLocator = page.locator("[data-reader-error]");
      await expect(passLocator.or(errorLocator).first()).toBeVisible({ timeout: 120_000 });
      const pressable = page.locator('[data-reader] button[data-quote][aria-pressed="false"]');
      const lineNow = async (): Promise<string> => ((await passLocator.count()) > 0 ? clean(await passLocator.first().innerText()) : "");
      const optionalText = async (selector: string): Promise<string | null> =>
        (await page.locator(selector).count()) > 0 ? clean(await page.locator(selector).first().innerText()) : null;
      let line1 = await lineNow();
      let readerText = readerText1;
      if ((await errorLocator.count()) === 0 && (await pressable.count()) === 0 && recorder.generateContentCount() < (localE2e ? effectiveCap - 1 : effectiveCap)) {
        cloudCalls["retryReason"] = "pass 1 retry: no pressable quote";
        const beforeRetry = recorder.generateContentCount();
        await press(page, "#ask-reader");
        readerText = await outgoing();
        await press(page, "#send");
        await expect
          .poll(
            async () =>
              isReaderPassSettled({
                generateContentCount: recorder.generateContentCount(),
                beforeCount: beforeRetry,
                errorCount: await errorLocator.count(),
                workingCount: await page.locator("[data-reader] [data-working]").count(),
                askEnabled: await page.locator("#ask-reader").isEnabled(),
              }),
            { timeout: 120_000, intervals: [500] },
          )
          .toBe(true);
        line1 = await lineNow();
      }
      syncCounts();
      const readerError = await optionalText("[data-reader-error]");
      const readerNone = await optionalText("[data-reader-none]");
      const readerHidden = await optionalText("[data-reader-hidden]");
      const readerDropped = await optionalText("[data-reader-dropped]");
      const label1 =
        (await page.locator(".reader-source .source-label").count()) > 0
          ? clean(await page.locator(".reader-source .source-label").first().innerText())
          : "not shown";
      const guesses1 = await readGuesses(page);
      checkLeaks(8, mark, readerText);
      const pass1Privacy = privacyWhatLeavesProblems("Shot C.4 Pass 1", readerText);
      if (pass1Privacy.length > 0) fail(pass1Privacy.join("; "));
      if (line1 !== "") {
        const fig1 = readPassLine(line1);
        figures["pass1"] = fig1;
        figures["hash"] = fig1.hash;
        figures["byteCounts"] = [
          { what: "sentToTheModel", bytes: fig1.sentToModelBytes, requests: fig1.sentToModelRequests },
          { what: "includingTheAppCheckExchange", bytes: fig1.includingAppCheckBytes, requests: fig1.includingAppCheckRequests },
        ];
      }
      if (sourceOf(label1) !== "IN_CLOUD") observe("Shot C.4 Pass 1", "readerSourceLabel", label1);
      const pass1Outcome = classifyReaderPassOutcome({
        step: "Shot C.4 Pass 1",
        readerError,
        readerNone,
        readerHidden,
        readerDropped,
        guessesCount: guesses1.length,
        pressableCount: await pressable.count(),
        requirePressable: true,
      });
      observations.push(...pass1Outcome.observations);

      // CSS zoom on .reader-panel -> >= 24 px font & >= 18 px cap height, zero frame clipping.
      const guessCount1 = await page.locator("[data-reader] [data-guess]").count();
      const base = guessCount1 > 0 ? await renderedTextSizes(page) : { min: 0, sizes: {} };
      const zoom = base.min > 0 ? Math.min(3, Math.max(1.85, Math.ceil((26 / base.min) * 100) / 100)) : 1.85;
      (rec["instrumentation"] as { readerZoom: { value: number | null } }).readerZoom.value = zoom;
      const zoomStyle = await page.addStyleTag({ content: `.reader-panel { zoom: ${zoom}; }` });
      try {
        let readerType: Record<string, unknown>;
        if (guessCount1 > 0 && (await page.locator("[data-reader] [data-guess] .reader-who").count()) > 0) {
          await page.locator("[data-reader] [data-guess]").first().evaluate((e) => e.scrollIntoView({ block: "center" }));
          const rendered = await renderedTextSizes(page);
          const type = await page.locator("[data-reader] [data-guess] .reader-who").first().evaluate((e) => {
            const cs = getComputedStyle(e);
            const fontPx = parseFloat(cs.fontSize);
            const c = document.createElement("canvas").getContext("2d");
            let cap = 0;
            if (c) {
              c.font = `${cs.fontStyle} ${cs.fontWeight} ${fontPx}px ${cs.fontFamily}`;
              cap = c.measureText("H").actualBoundingBoxAscent;
            }
            const cardEl = document.querySelector("[data-reader] [data-guess]");
            const r = cardEl ? cardEl.getBoundingClientRect() : null;
            return {
              fontPx,
              capUnzoomed: cap,
              inFrame: r !== null && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
            };
          });
          readerType = {
            fontPx: type.fontPx,
            zoom,
            effectivePx: Math.round(type.fontPx * zoom * 10) / 10,
            capHeightPx: Math.round(type.capUnzoomed * zoom * 10) / 10,
            renderedMinPx: rendered.min,
            renderedSizes: rendered.sizes,
            baseSizes: base.sizes,
            guessCardInFrame: type.inFrame,
            frame: { width: type.innerWidth, height: type.innerHeight },
          };
          rec["readerType"] = readerType;
          const effPx = Number(readerType["effectivePx"] ?? 0);
          const capPx = Number(readerType["capHeightPx"] ?? 0);
          if (effPx < MIN_READER_PX || rendered.min < MIN_READER_PX) {
            observe("Shot C.4 Pass 1", "readerMinPx", `${Math.min(effPx, rendered.min)} < ${MIN_READER_PX}`);
          }
          if (capPx < MIN_CAP_PX) {
            observe("Shot C.4 Pass 1", "readerCapPx", `${capPx} < ${MIN_CAP_PX}`);
          }
          if (!type.inFrame) observe("Shot C.4 Pass 1", "readerCardClipped", JSON.stringify(readerType["frame"]));
        } else {
          if ((await page.locator("[data-reader]").count()) > 0) {
            await page.locator("[data-reader]").first().evaluate((e) => e.scrollIntoView({ block: "center" }));
          }
          readerType = {
            fontPx: null,
            zoom,
            effectivePx: null,
            capHeightPx: null,
            renderedMinPx: null,
            renderedSizes: {},
            baseSizes: {},
            guessCardInFrame: true,
            frame: null,
          };
          rec["readerType"] = readerType;
        }
        await hold(3000);

        if (pass1Outcome.canContinue) {
          const pressableQuotesPerCard = await page
            .locator("[data-reader] [data-guess]")
            .evaluateAll((els) =>
              els.map((e) =>
                [...e.querySelectorAll('button[data-quote][aria-pressed="false"]')].map(
                  (b) => b.getAttribute("data-quote") ?? "",
                ),
              ),
            );
          const choice = chooseH39Chip(guesses1, pressableQuotesPerCard);
          rec["chipChoice"] = choice === null ? null : {
            rule: choice.rule,
            pressedKind: choice.pressedKind,
            pressedIndex: choice.pressedIndex,
            pressedQuoteIndex: choice.pressedQuoteIndex,
            pressedQuote: choice.pressedQuote,
            candidates: choice.candidates,
          };
          const chip =
            choice === null
              ? pressable.first()
              : page
                  .locator("[data-reader] [data-guess]")
                  .nth(choice.pressedIndex)
                  .locator('button[data-quote][aria-pressed="false"]')
                  .nth(choice.pressedQuoteIndex);
          const pressedQuote = await chip.getAttribute("data-quote");
          pressedQuoteForCheck = pressedQuote;
          const pressedGuess = choice !== null ? (guesses1[choice.pressedIndex]?.description ?? null) : null;
          rec["guessOfThatChip"] = pressedGuess;
          await chip.click();
          await expect(page.locator('[data-reader] button[data-quote][aria-pressed="true"]').first()).toBeVisible();
          await hold(2000);

          assertWalkBudget("Shot C.4 Pass 2");
          const askLabel = clean(await page.locator("#ask-reader").innerText());
          if (askLabel !== "Ask again") observe("Shot C.4 Pass 2", "askAgainLabel", askLabel);
          const mark2 = recorder.mark();
          replyWatch.step = "reader-pass-2";
          await press(page, "#ask-reader");
          await hold(1500);
          const readerText2 = await outgoing();
          readerText2ForCheck = readerText2;
          const beforePass2 = recorder.generateContentCount();
          await press(page, "#send");
          await expect
            .poll(
              async () =>
                isReaderPassSettled({
                  generateContentCount: recorder.generateContentCount(),
                  beforeCount: beforePass2,
                  errorCount: await errorLocator.count(),
                  workingCount: await page.locator("[data-reader] [data-working]").count(),
                  askEnabled: await page.locator("#ask-reader").isEnabled(),
                }),
              { timeout: 120_000, intervals: [500] },
            )
            .toBe(true);
          syncCounts();

          const pass2Error = await optionalText("[data-reader-error]");
          const pass2None = await optionalText("[data-reader-none]");
          const pass2Hidden = await optionalText("[data-reader-hidden]");
          const pass2Dropped = await optionalText("[data-reader-dropped]");
          const line2 = await lineNow();
          const label2 =
            (await page.locator(".reader-source .source-label").count()) > 0
              ? clean(await page.locator(".reader-source .source-label").first().innerText())
              : "not shown";
          const guesses2 = await readGuesses(page);
          checkLeaks(8, mark2, readerText2);
          const pass2Privacy = privacyWhatLeavesProblems("Shot C.4 Pass 2", readerText2);
          if (pass2Privacy.length > 0) fail(pass2Privacy.join("; "));
          const pass2Outcome = classifyReaderPassOutcome({
            step: "Shot C.4 Pass 2",
            readerError: pass2Error,
            readerNone: pass2None,
            readerHidden: pass2Hidden,
            readerDropped: pass2Dropped,
            guessesCount: guesses2.length,
            pressableCount: 1,
            requirePressable: false,
          });
          observations.push(...pass2Outcome.observations);

          if (!pass2Outcome.hasError) {
            pass2RanForCheck = recorder.generateContentCount() > beforePass2;
            figures["pass2"] = line2 !== "" ? readPassLine(line2) : null;
            const inFrame2 =
              (await page.locator("[data-reader] [data-guess]").count()) > 0
                ? await page
                    .locator("[data-reader] [data-guess]")
                    .first()
                    .evaluate((e) => {
                      e.scrollIntoView({ block: "center" });
                      const r = e.getBoundingClientRect();
                      return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
                    })
                : true;
            const holdStart = sinceS();
            await hold(PASS_2_HOLD_MS);
            rec["pass2Hold"] = { startS: holdStart, endS: sinceS(), guessCardInFrame: inFrame2 };
            rec["pass2Descriptions"] = guesses2.map((g) => g.description);
            const pressedWords = longWords(pressedGuess ?? "");
            rec["sharedWithPressed"] = guesses2.map((g) => ({ description: g.description, words: [...longWords(g.description)].filter((w) => pressedWords.has(w)) }));
            if (sourceOf(label2) !== "IN_CLOUD") observe("Shot C.4 Pass 2", "readerSourceLabel", label2);
            if (!inFrame2) observe("Shot C.4 Pass 2", "readerCardClipped", "pass-2 guess card outside frame");
            const pq = fold(pressedQuote ?? "");
            if (pressedGuess !== null && guesses2.some((g) => fold(g.description) === fold(pressedGuess))) {
              observe("Shot C.4 Pass 2", "repeatedGuessDescription", pressedGuess);
            }
            const pressedRead = choice !== null ? (guesses1[choice.pressedIndex] ?? null) : null;
            rec["pressedGuessRead"] = pressedRead;
            rec["pass2SameKind"] = pressedRead?.kind
              ? guesses2.filter((g) => fold(g.kind ?? "") === fold(pressedRead.kind ?? "")).map((g) => ({ description: g.description, kind: g.kind, why: g.why, quotes: g.quotes }))
              : [];
            if (pq !== "" && guesses2.some((g) => g.quotes.some((q) => fold(q) !== "" && hasWords(fold(q), pq)))) {
              observe("Shot C.4 Pass 2", "repeatedQuote", pressedQuote ?? "");
            }
            if (pressedQuote !== null) {
              let rest = pressedQuote;
              for (const tag of tagsIn(pressedQuote)) rest = rest.split(tag).join("\n");
              const pieces = rest.split("\n").map((p) => p.trim()).filter((p) => /[\p{L}\p{N}]/u.test(p));
              const record2 = recordOf(readerText2);
              const standing = pieces.filter((p) => findWholeWords(record2, p).length > 0);
              if (standing.length > 0) observe("Shot C.4 Pass 2", "pressedWordsStanding", standing.join(" | "));
            }
            step(8, "Shot C.4 (Cloud Calls 2 & 3): Second Reader pass 1, quote chip, Ask again, pass 2", "IN_CLOUD", {
              pass1: { label: label1, line: line1, guesses: guesses1 }, chipPressed: pressedQuote, guessOfThatChip: pressedGuess, pass2: { label: label2, line: line2, guesses: guesses2, heldMs: PASS_2_HOLD_MS }, readerType,
            });
          } else {
            figures["pass2"] = null;
            await hold(PASS_2_HOLD_MS);
            step(8, "Shot C.4 (Cloud Calls 2 & 3): Second Reader pass 2 recorded error observation", "IN_CLOUD", {
              pass1: { label: label1, line: line1, guesses: guesses1 }, chipPressed: pressedQuote, guessOfThatChip: pressedGuess, pass2: null, readerType,
            });
          }
        } else {
          step(8, "Shot C.4 (Cloud Call 2): Second Reader pass 1 settled without Pass 2", "IN_CLOUD", {
            pass1: { label: label1, line: line1, guesses: guesses1 }, chipPressed: null, guessOfThatChip: null, pass2: null, readerType,
          });
        }
      } finally {
        await zoomStyle.evaluate((e) => (e as Element).remove()).catch(() => undefined);
      }

      const n8Check = checkSecondReaderMiddleColumn({
        chosenSentence,
        rewrittenSentence,
        rewriteApplied,
        readerText1,
        readerText2: readerText2ForCheck,
        pressedQuote: pressedQuoteForCheck,
        pass2Ran: pass2RanForCheck,
      });
      const n8RetryCheck =
        readerText !== readerText1
          ? checkSecondReaderMiddleColumn({
              chosenSentence,
              rewrittenSentence,
              rewriteApplied,
              readerText1: readerText,
              readerText2: readerText2ForCheck,
              pressedQuote: pressedQuoteForCheck,
              pass2Ran: pass2RanForCheck,
            })
          : null;
      rec["secondReaderMiddleColumnCheck"] = n8RetryCheck ? { ...n8Check, retryCheck: n8RetryCheck } : n8Check;
      if (!n8Check.ok || (n8RetryCheck !== null && !n8RetryCheck.ok)) {
        const msg = n8Check.reason ?? n8RetryCheck?.reason ?? "Shot C.4 middle column missing rewritten sentence";
        observe("Shot C.4 N8", "secondReaderMiddleColumn", msg);
        problems.push(msg);
      }

      // ---- Shot D (116–136 s, Egress Ledger zoomed across all 4 InferenceMode values) ----
      assertWalkBudget("Shot D");
      mark = recorder.mark();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator("#fold-ledger").click();
      await expect(page.locator('[data-details="ledger"] [data-ledger-entry]').first()).toBeVisible();

      const ledgerBase = await page.locator('[data-details="ledger"] [data-ledger-entry] td').first().evaluate((e) => {
        const cs = getComputedStyle(e);
        const fontPx = parseFloat(cs.fontSize);
        const c = document.createElement("canvas").getContext("2d");
        let cap = 0;
        if (c) {
          c.font = `${cs.fontStyle} ${cs.fontWeight} ${fontPx}px ${cs.fontFamily}`;
          cap = c.measureText("H").actualBoundingBoxAscent;
        }
        return { fontPx, cap };
      });
      const ledgerZoom = Math.min(2.4, Math.max(1.6, Math.ceil(Math.max(25 / (ledgerBase.fontPx || 16), 19 / (ledgerBase.cap || 11.5)) * 100) / 100));
      (rec["instrumentation"] as { ledgerZoom: { value: number | null } }).ledgerZoom.value = ledgerZoom;
      const ledgerStyle = await page.addStyleTag({ content: `[data-details="ledger"] { zoom: ${ledgerZoom}; }` });

      const ledgerFontPx = Math.round(ledgerBase.fontPx * ledgerZoom * 10) / 10;
      const ledgerCapPx = Math.round(ledgerBase.cap * ledgerZoom * 10) / 10;
      if (ledgerFontPx < MIN_LEDGER_PX) observe("Shot D", "ledgerMinPx", `${ledgerFontPx} < ${MIN_LEDGER_PX}`);
      if (ledgerCapPx < MIN_CAP_PX) observe("Shot D", "ledgerCapPx", `${ledgerCapPx} < ${MIN_CAP_PX}`);

      const shownModes: { mode: string; inFrame: boolean }[] = [];
      for (const mode of REQUIRED_LEDGER_MODES) {
        assertWalkBudget(`Shot D ${mode}`);
        const row = page
          .locator('[data-details="ledger"] [data-ledger-entry]')
          .filter({ has: page.locator("td", { hasText: new RegExp(`^${mode}$`) }) })
          .first();
        if ((await row.count()) === 0) continue;
        const inFrame = await row.evaluate((e) => {
          e.scrollIntoView({ block: "center" });
          const r = e.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
        });
        if (!inFrame) observe("Shot D", "ledgerRowClipped", mode);
        shownModes.push({ mode, inFrame });
        await hold(LEDGER_ROW_HOLD_MS);
      }
      const missingLedger = ledgerClaimStopProblems(shownModes.map((m) => m.mode));
      if (missingLedger.length > 0) fail(missingLedger.join("; "));
      await ledgerStyle.evaluate((e) => (e as Element).remove());
      await hold(1500);
      rec["ledgerType"] = { fontPx: ledgerBase.fontPx, zoom: ledgerZoom, effectivePx: ledgerFontPx, capHeightPx: ledgerCapPx, shownModes };
      const entryTexts = (await page.locator('[data-details="ledger"] [data-ledger-entry]').allInnerTexts()).map(clean);
      const summary = clean(await page.locator("#fold-ledger").innerText());
      step(9, "Shot D: Egress ledger opened and zoomed across all 4 InferenceModes", "none", { summary, entriesShown: entryTexts.length, shownModes });
      checkLeaks(9, mark, "");
      if (sinceS() >= TOTAL_LIMIT_S) fail(`walk reached ${sinceS()} s (limit ${TOTAL_LIMIT_S} s)`);
      finished = true;
      }
    } catch (error) {
      problems.push(error instanceof FailFast ? `fail-fast: ${error.message}` : `The run stopped: ${first(error)}`);
    }

    await Promise.all([replyWatch.done(), recorder.responseBodies(), ...statReads]);
    syncCounts();
    rec["cloudReplyTokensNamingThePreviousTag"] = cloudTagStats;

    const video = page.video();
    await Promise.race([ctx.close().catch(() => undefined), new Promise((r) => setTimeout(r, 30_000))]);
    context = null;
    try {
      walkPath = video ? await video.path() : null;
    } catch {
      walkPath = null;
    }

    const described = recorder.requests.map((r) => describeRequest(r, targetOrigin));
    const exchanges = recorder.requests
      .filter((r) => {
        try {
          return new URL(r.url).host === "content-firebaseappcheck.googleapis.com";
        } catch {
          return false;
        }
      })
      .map((r) => ({ path: redactedPath(r.url), status: r.status ?? "not seen", responseBodyBytes: r.responseBodyBytes }));
    const scriptLoaded = described.some((r) => r.passedBy === "App Check script");
    const expectedExchangeSuffix = localE2e ? ":exchangeDebugToken" : ":exchangeRecaptchaEnterpriseToken";
    const exchangeSeen = exchanges.some((e) => String(e.path).endsWith(expectedExchangeSuffix));
    const exchangeOk = exchanges.length >= 1 && exchanges.every((e) => e.status === 200) && exchangeSeen;
    rec["appCheck"] = { provider: localE2e ? "App Check debug provider" : "reCAPTCHA Enterprise", scriptLoaded, exchanges };
    if (!localE2e) {
      if (namesDebug(recorder.requests)) observe("Post-walk", "namesDebug", "request path or body named a debug token");
    } else if (cloudInputs && !("missing" in cloudInputs) && cloudInputs.debugToken.length >= 8) {
      const secretHit = recorder.requests.some((r) => {
        if (r.url.includes(cloudInputs.debugToken)) return true;
        // Firebase App Check debug provider exchanges its debug token in the POST body to :exchangeDebugToken only.
        if (redactedPath(r.url).endsWith(":exchangeDebugToken")) return false;
        return r.body ? r.body.toString("utf8").includes(cloudInputs.debugToken) : false;
      });
      if (secretHit) problems.push("non-exchange request URL or body leaked the local debug token secret value");
    }
    if (earlyStopStatus === null) {
      if (!exchangeOk) observe("Post-walk", "appCheckExchange", JSON.stringify(exchanges));
      if (!localE2e && !scriptLoaded) observe("Post-walk", "recaptchaScriptMissing", "reCAPTCHA Enterprise script was not loaded");
      if (localE2e && scriptLoaded) observe("Post-walk", "recaptchaScriptUnexpected", "reCAPTCHA Enterprise script loaded in local dist-e2e");
    }
    const refusedOutside = described.filter((r) => r.passedBy === "refused");
    if (refusedOutside.length > 0) observe("Post-walk", "refusedOutsideRequests", JSON.stringify(refusedOutside));

    rec["requests"] = requestsSection(recorder.requests, targetOrigin, {
      generateContent: recorder.generateContentCount(),
      appCheck: recorder.appCheckCount(),
      stoppedAtCap: recorder.stoppedAtCap(),
    });
    rec["leakChecks"] = leaks;
    const gc = recorder.generateContentCount();
    if (earlyStopStatus === null) {
      if (gc < 3) observe("Post-walk", "generateContentUnderThree", String(gc));
    } else if (gc !== 0) {
      problems.push(`${earlyStopStatus} expected 0 generateContent calls, saw ${gc}`);
    }
    const walkElapsedS = sinceS();
    rec["walkDurationS"] = walkElapsedS;
  } catch (error) {
    problems.push(`The run stopped: ${first(error)}`);
  } finally {
    if (context) await Promise.race([context.close().catch(() => undefined), new Promise((r) => setTimeout(r, 15_000))]);
    if (staticServer) await staticServer.stop().catch(() => undefined);
  }

  const files = existsSync(rawDir) ? readdirSync(rawDir).sort().map((n) => join(rawDir, n)).filter((p) => statSync(p).isFile()) : [];
  rec["videos"] = files.map((p) => ({ path: relative(rawRoot, p), sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), bytes: statSync(p).size }));

  const vc =
    walkPath !== null && existsSync(walkPath)
      ? await checkVideo(walkPath)
      : { frames: [] as FrameCheck[], fills: false, checkerAborted: 0, durationS: null, error: "no walk video file" };
  rec["videoCheck"] = vc;
  const wrongSizeFrames = vc.frames.filter((f) => f.width !== VIDEO.width || f.height !== VIDEO.height);
  if (earlyStopStatus === null) {
    problems.push(
      ...walkCompletionStopProblems({
        stoppedAtCap: Boolean((rec["requests"] as { stoppedAtCap?: boolean } | undefined)?.stoppedAtCap),
        generateContent: Number((rec["requests"] as { generateContentCalls?: number } | undefined)?.generateContentCalls ?? 0),
        cap: effectiveCap,
        walkDurationS: Number(rec["walkDurationS"] ?? 0),
        videoFilesCount: files.length,
        videoFileMatchesWalk: files.length === 1 && (walkPath === null || files[0] === walkPath),
        videoFills: vc.fills === true && wrongSizeFrames.length === 0,
        decodedDurationS: vc.durationS,
        videoError:
          wrongSizeFrames.length > 0
            ? `expected ${VIDEO.width}x${VIDEO.height} frames, got ${wrongSizeFrames.map((f) => `${f.width}x${f.height}`).join(",")}`
            : vc.error,
      }),
    );
  } else {
    if (files.length !== 1 || (walkPath !== null && files[0] !== walkPath)) {
      problems.push(`${earlyStopStatus} expected 1 matching video file, saw ${files.length}`);
    }
    if (vc.error) problems.push(`${earlyStopStatus} video check failed: ${vc.error}`);
    else if (!vc.fills || wrongSizeFrames.length > 0) {
      problems.push(
        `${earlyStopStatus} video frame check failed (${wrongSizeFrames.length > 0 ? wrongSizeFrames.map((f) => `${f.width}x${f.height}`).join(",") : "not filling"})`,
      );
    }
  }

  rec["elapsedS"] = Math.round(elapsedS());
  rec["status"] = resolveFilmTakeStatus({
    earlyStopStatus,
    finished,
    problems,
    middleCol: rec["secondReaderMiddleColumnCheck"] as
      | { status?: string; reason?: string | null; retryCheck?: { status?: string; reason?: string | null } | null }
      | undefined,
  });
  rec["candidate"] = filmCandidateMark({
    finishedText: typeof rec["finishedText"] === "string" ? (rec["finishedText"] as string) : null,
    noteItems: Array.isArray(rec["finishedNotes"]) ? (rec["finishedNotes"] as string[]) : null,
  });
  save();
  expect(problems).toEqual([]);
});
