// DEVICE MODEL, with the real cloud. The story-order film take of 2026-11-17 for the film "After the Last Door": one
// continuous walk on a local test build (dist-e2e) with the App Check debug provider and emulated offline, at
// 1920 x 1080 CSS and 2x pixel density, recorded at 3840 x 2160 so that tight crops can be cut from it.
//
// The walk, in story order (the film panel, section 3c, and the take script of the film desk):
//   0  her client list (12 invented names) is already kept in this browser; the page is ready and connected
//   1  offline (emulated: Playwright context.setOffline)
//   2  the seven-line example note, typed key by key
//   3  Make the record (ONLY_ON_DEVICE)
//   4  Add to Seen, only when the page lists a line the record left out
//   5  Mask: the device pass suggests more; she accepts "Bea suggested" (and the date of birth, when it is suggested)
//   6  online
//   7  Ask a second reader, Send to the second reader (cloud call 1)
//   8  she presses the quote chip about the neighbour
//   9  Ask again, Send to the second reader (cloud call 2)
//   10 Draft, Send (cloud call 3)
//   11 the finished note with its names put back, and the verdict line of the egress card
// Left out: Try an invented visit, Try to send a listed name, an offline Draft, Shorter, the ledger.
//
// Cap: 3 generateContent calls. No attempt starts when the day's ledger total is at the film's stop line (34).
// The take stops at the first keep condition it misses and writes why: before step 6 that costs no cloud call, and a
// pass 1 with no quote about the neighbour costs one. A model answer is never staged; the next take starts fresh.
// DOORSTEP_FILM_STORY_REHEARSAL=1 walks steps 0 to 5 with a cap of 0 and stops while offline.
//
// Needs DOORSTEP_FILM_RAW_DIR (outside the repo: the videos) and DOORSTEP_FILM_BUILD_ROOT (a folder that holds the
// dist-e2e build and its BUILD.json). Records: results/film-story-take-<date>-s<n>.json and
// results/film-story-rehearsal-<date>-r<n>.json, never an existing file.
// Invented people only. The config and the debug token are read into memory; no value is printed or written.
import { chromium, expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readLedger } from "../fixtures/cloudCalls";
import {
  CHROME_PATH,
  PROFILE_DIR,
  describeMachine,
  deviceLaunchOptions,
  inspectServedBundle,
  installRecorder,
  readAvailability,
  readCloudInputs,
  redactedPath,
} from "../fixtures/deviceModel";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";
import { fetchNetworkEntryScript, setServedBundle, verifyLoadedRelease, writeRecord } from "../fixtures/records";
import { checkVideo, chooseH39Chip, isReaderPassSettled, recoverShotARecord, requireFilmRawRoot } from "./filmHelpers";
import { readDebugTokenGlobal, readServiceWorker } from "./hostedSupport";
import { draftProblems, finishedZoneCheck, leakCheck, leakProblems, readCard, words, type LeakResult } from "./hybridSupport";
import {
  STORY_CLIENT_LIST,
  STORY_NOTE,
  STORY_TAKE_CAP,
  STORY_TYPED_PHRASE,
  STORY_ZONES,
  budgetStop,
  dobSuggested,
  firstWords,
  householdGuess,
  likelyWordAction,
  listedChip,
  selectStorySuffix,
  splitAroundPhrase,
  storyGates,
} from "./storyTake";
import { appReady, press, seconds, settleShell } from "./support";

declare global {
  interface Window {
    __lmLog?: { head: string; output: string }[];
  }
}

const SPEC = "filmStoryTake.spec.ts";
const VIEWPORT = { width: 1920, height: 1080 };
const VIDEO = { width: 3840, height: 2160 };
const DEVICE_SCALE_FACTOR = 2;
/** Milliseconds between two keystrokes of the typed note. */
const KEY_DELAY_MS = 55;
const CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;

const clean = (t: string): string => t.replace(/\s+/g, " ").trim();
const first = (e: unknown): string => String((e as Error).message ?? e).split("\n")[0] ?? "failed";
const sourceOf = (label: string): "ON_DEVICE" | "IN_CLOUD" | "none" => (label.includes("in the cloud") ? "IN_CLOUD" : label.includes("on this device") ? "ON_DEVICE" : "none");
/** The record block of an outgoing text: everything before the first blank line, so the fixed instructions are not searched. */
const recordPart = (text: string): string => text.split(/\n\s*\n/)[0] ?? text;
const holdsWord = (text: string, word: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text);

class Stop extends Error {}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface CropWindow {
  crop: number;
  beat: string;
  fromS: number;
  toS: number;
  words: string;
  /** the subject's box in video pixels (3840 x 2160) during the hold, or null when it could not be read */
  boxVideoPx: Box | null;
  inView: boolean | null;
}
interface GuessRead {
  description: string;
  why: string | null;
  kind: string | null;
  quotes: string[];
  pressable: string[];
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
      pressable: await card.locator('button[data-quote][aria-pressed="false"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-quote") ?? "")),
    });
  }
  return out;
}

/** The served config is checked for presence only: booleans and two hashes, never a value. */
async function localPreflight(page: Page, origin: string): Promise<Record<string, unknown>> {
  const res = await page.request.get(`${origin}/firebase.config.local.json`);
  let configParses = false;
  let sixKeys = false;
  try {
    const obj = (await res.json()) as Record<string, unknown>;
    configParses = obj !== null && typeof obj === "object" && !Array.isArray(obj);
    sixKeys = configParses && CONFIG_KEYS.every((k) => typeof obj[k] === "string" && (obj[k] as string).length > 0);
  } catch {
    configParses = false;
  }
  const sha = async (path: string): Promise<string> => createHash("sha256").update(await (await page.request.get(`${origin}${path}`)).body()).digest("hex");
  return { configStatus200: res.status() === 200, configParses, sixKeys, indexHtmlSha256: await sha("/index.html"), swJsSha256: await sha("/sw.js") };
}

test("Story take: After the Last Door, one walk in story order at 1920x1080 CSS recorded at 3840x2160, built-in model and real cloud", async () => {
  test.setTimeout(600_000);
  const t0 = Date.now();
  const rehearsal = process.env["DOORSTEP_FILM_STORY_REHEARSAL"] === "1";
  // H50b: a film take runs on purpose. In a whole-suite run without its inputs it is skipped and says why.
  test.skip(!(process.env["DOORSTEP_FILM_RAW_DIR"] ?? "").trim(), "DOORSTEP_FILM_RAW_DIR is not set: the film take runs on purpose with its raw folder and build root (npm run e2e:film-story).");
  const rawRoot = requireFilmRawRoot();
  const buildRoot = resolve((process.env["DOORSTEP_FILM_BUILD_ROOT"] ?? "").trim() || "DOORSTEP_FILM_BUILD_ROOT-not-set");
  const { suffix, rawDir, record: recordName } = selectStorySuffix(rehearsal ? "rehearsal" : "take", "results", rawRoot);
  expect(relative(process.cwd(), rawDir).startsWith("..")).toBe(true);
  const cap = rehearsal ? 0 : STORY_TAKE_CAP;
  const now = new Date().toISOString();
  const specCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const fileSha = (p: string): string => createHash("sha256").update(readFileSync(p)).digest("hex");
  const specFiles = ["tests/e2e/device/filmStoryTake.spec.ts", "tests/e2e/device/storyTake.ts"].map((p) => ({
    path: p,
    sha256: fileSha(p),
    committedAsIs: execFileSync("git", ["status", "--porcelain", "--", p], { encoding: "utf8" }).trim() === "",
  }));
  const problems: string[] = [];
  const steps: Record<string, unknown>[] = [];
  const crops: CropWindow[] = [];
  const leaks: { step: number; result: LeakResult }[] = [];
  const cloudCalls: Record<string, unknown> = { generateContent: 0, cap, appCheckExchanges: 0 };
  const ledgerBefore = readLedger();
  const rec: Record<string, unknown> = {
    status: "started",
    rehearsal,
    film: "After the Last Door",
    date: now.slice(0, 10),
    time: now,
    takeSuffix: suffix,
    browser: "not yet launched",
    machine: describeMachine(),
    build: "dist-e2e (mode=e2e), served from DOORSTEP_FILM_BUILD_ROOT",
    buildRoot,
    buildStamp: null,
    specCommit,
    specFiles,
    address: "not yet served",
    check: rehearsal
      ? "Rehearsal of the story take: steps 0 to 5 offline on the device model, cap 0, no cloud call. Invented people only."
      : "Story take for the film After the Last Door: one continuous walk in story order on the local test build with the built-in model, the real cloud and the App Check debug provider, offline emulated. Invented people only.",
    viewport: VIEWPORT,
    videoSize: VIDEO,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    keyDelayMs: KEY_DELAY_MS,
    ledgerBefore: { file: `results/e2e-cloud-on-${now.slice(0, 10)}-h23.json`, total: ledgerBefore.total, budget: ledgerBefore.budget },
    instrumentation: {
      outputLogger: "a LanguageModel output logger installed as an init script. It logs each session.prompt output and changes nothing.",
      networkOff: "offline = Playwright context.setOffline (emulated), on the walk page after it was ready and connected",
      clientList: "the 12 invented names were put into the client list box on the preflight page, outside the recorded walk, and kept in this browser's own store; the walk page opens with them",
      noStyleInjected: "no style, zoom or script is added to the page beyond the debug token global and the output logger",
    },
    decisions: [
      "Step 5: when the device pass also suggests the date of birth, it is accepted after Bea, so no date of birth leaves; it is not a crop.",
      "Step 10: a capital-letter guess at Draft is masked when it names a person of the note and kept otherwise.",
      "No sign-in exists in this build: her list is the one kept in this browser.",
    ],
    problems,
    steps,
    crops,
    cloudCalls,
    gates: null,
    keep: false,
    missed: [],
  };
  const save = (): void => void writeRecord(recordName, rec, process.cwd(), suffix);
  const stopNow = (status: "fail" | "miss", reason: string): void => {
    rec["status"] = status;
    rec["reason"] = reason;
    problems.push(reason);
    save();
  };
  save();

  try {
    rec["buildStamp"] = JSON.parse(readFileSync(join(buildRoot, "BUILD.json"), "utf8")) as unknown;
  } catch {
    return stopNow("miss", `${join(buildRoot, "BUILD.json")} could not be read; the build served must say what it is.`);
  }
  if (!rehearsal) {
    const stop = budgetStop(ledgerBefore.total);
    if (stop !== null) return stopNow("miss", `${stop} No attempt started.`);
  }
  const cloudInputs = readCloudInputs();
  if ("missing" in cloudInputs) return stopNow("miss", cloudInputs.missing);
  try {
    lstatSync(join(PROFILE_DIR, "SingletonLock"));
    return stopNow("fail", ".browser-profile has a SingletonLock.");
  } catch {
    // no lock
  }
  if (!existsSync(CHROME_PATH)) return stopNow("miss", `Google Chrome is not installed at ${CHROME_PATH}`);
  const inspected = inspectServedBundle("dist-e2e", buildRoot);
  setServedBundle({ folder: "dist-e2e", mainChunk: inspected.mainChunk, buildTime: inspected.buildTime });
  mkdirSync(rawDir, { recursive: true });
  if (readdirSync(rawDir).length > 0) return stopNow("fail", `${rawDir} holds a file before the launch.`);

  let staticServer: RunningServer | null = null;
  let context: BrowserContext | null = null;
  let walkPage: Page | null = null;
  let syncAtEnd: (() => void) | null = null;
  let walkPath: string | null = null;
  let finished = false;
  let videoT0 = Date.now();
  // What the gates read.
  let proposedChips: string[] = [];
  let pass1Chip: { rule: string; quote: string } | null = null;
  let pass2: { settled: boolean; guesses: number; error: string | null } | null = null;
  let finishedNote: { labels: string; text: string } | null = null;
  let verdict: string | null = null;

  try {
    staticServer = await startStaticServer({ dir: join(buildRoot, "dist-e2e"), files: cloudInputs.files, limitMs: 590_000 });
    const targetUrl = staticServer.url;
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
      generateContentCap: cap,
      cloudLedger: { spec: SPEC, title: `story take ${suffix}${rehearsal ? " (rehearsal)" : ""} (local dist-e2e)`, browser: String(rec["browser"]) },
    });
    const syncCounts = (): void => {
      cloudCalls["generateContent"] = recorder.generateContentCount();
      cloudCalls["appCheckExchanges"] = recorder.appCheckCount();
      cloudCalls["stoppedAtCap"] = recorder.stoppedAtCap();
    };
    syncAtEnd = syncCounts;
    await ctx.addInitScript((token: string) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = token;
    }, cloudInputs.debugToken);
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

    // ---- Preflight, outside the recorded walk: a clean origin, the served build, her list kept in this browser ----
    const initial = ctx.pages()[0] ?? (await ctx.newPage());
    {
      const cdp0 = await ctx.newCDPSession(initial);
      await cdp0.send("Storage.clearDataForOrigin", { origin: targetUrl, storageTypes: "all" });
      await cdp0.detach();
    }
    await initial.goto(targetOrigin);
    const pre = await localPreflight(initial, targetUrl);
    rec["served"] = pre;
    if (!pre["configStatus200"] || !pre["configParses"] || !pre["sixKeys"]) throw new Stop("the local config is not served complete");
    await settleShell(initial);
    const initWorker = await readServiceWorker(initial);
    if ((await readDebugTokenGlobal(initial)) !== "string") throw new Stop("the App Check debug token global is not set");
    if (initWorker.build !== "e2e") throw new Stop(`data-build was "${initWorker.build}", not "e2e"`);
    if (!initWorker.registered || !initWorker.active || initWorker.cachedFiles < 1) throw new Stop("the service worker is not active with a cache");
    await expect(initial.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 40_000 });
    await expect(initial.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 40_000 });
    const avail = await readAvailability(initial);
    rec["deviceModelAvailability"] = avail;
    if (avail !== "available") throw new Stop(`device model availability was "${avail}"`);
    await initial.locator("#client-list").fill(STORY_CLIENT_LIST);
    await initial.waitForTimeout(1000);
    await initial.reload();
    await appReady(initial);
    await expect(initial.locator("#client-list"), "the client list is kept in this browser after a reload").toHaveValue(STORY_CLIENT_LIST, { timeout: 15_000 });
    if (recorder.generateContentCount() !== 0) throw new Stop(`the preflight made ${recorder.generateContentCount()} generateContent call(s)`);

    // ---- The recorded walk: one page, one video ----
    videoT0 = Date.now();
    const page: Page = await ctx.newPage();
    walkPage = page;
    await initial.close();
    await initial.video()?.delete().catch(() => undefined);
    await page.bringToFront();
    const sinceS = (): number => seconds(Date.now() - videoT0);
    const hold = (ms: number): Promise<void> => page.waitForTimeout(ms);
    const step = (n: number, label: string, source: "ON_DEVICE" | "IN_CLOUD" | "none", shown: Record<string, unknown>): void => {
      steps.push({ step: n, label, time: new Date().toISOString(), secondsFromStart: sinceS(), inferenceSource: source, shown });
      syncCounts();
      save();
    };
    const boxOf = async (locators: Locator[]): Promise<{ box: Box | null; inView: boolean | null }> => {
      // No subject: the whole frame.
      if (locators.length === 0) return { box: { x: 0, y: 0, width: VIDEO.width, height: VIDEO.height }, inView: true };
      const boxes: Box[] = [];
      for (const l of locators) {
        const b = (await l.count()) > 0 ? await l.first().boundingBox() : null;
        if (b) boxes.push(b);
      }
      if (boxes.length === 0) return { box: null, inView: null };
      const x0 = Math.min(...boxes.map((b) => b.x));
      const y0 = Math.min(...boxes.map((b) => b.y));
      const x1 = Math.max(...boxes.map((b) => b.x + b.width));
      const y1 = Math.max(...boxes.map((b) => b.y + b.height));
      const inView = x0 >= 0 && y0 >= 0 && x1 <= VIEWPORT.width && y1 <= VIEWPORT.height;
      const k = DEVICE_SCALE_FACTOR;
      return { box: { x: Math.round(x0 * k), y: Math.round(y0 * k), width: Math.round((x1 - x0) * k), height: Math.round((y1 - y0) * k) }, inView };
    };
    /** Holds the frame still for a crop and writes where, when and which words. */
    const holdForCrop = async (crop: number, beat: string, ms: number, cropWords: string, subject: Locator[]): Promise<void> => {
      const { box, inView } = await boxOf(subject);
      const fromS = sinceS();
      await hold(ms);
      crops.push({ crop, beat, fromS, toS: sinceS(), words: cropWords, boxVideoPx: box, inView });
      save();
    };
    const center = async (l: Locator): Promise<void> => {
      await l.first().evaluate((e) => e.scrollIntoView({ block: "center", inline: "nearest" }));
    };
    const outgoing = (): Promise<string> => page.locator("[data-outgoing]").innerText();
    const checkLeaks = (n: number, since: number, sent: string): void => {
      const result = leakCheck(recorder.since(since), sent);
      leaks.push({ step: n, result });
      const lp = leakProblems(result);
      if (lp.length > 0) throw new Stop(`step ${n}: ${lp.join("; ")}`);
    };

    // 0. Her list is kept in this browser. The page is ready and connected.
    await page.goto(targetOrigin);
    await appReady(page);
    const loadedRelease = await verifyLoadedRelease({
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
    rec["loadedRelease"] = loadedRelease;
    if (!loadedRelease.matches) throw new Stop(`loaded release mismatch: ${loadedRelease.loadedScript ?? "none"} / ${loadedRelease.networkScript ?? "none"}`);
    if (loadedRelease.loadedScript !== inspected.mainChunk) {
      throw new Stop(`the page loaded ${loadedRelease.loadedScript ?? "none"}, the build holds ${inspected.mainChunk}`);
    }
    if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) throw new Stop("the walk page has no service worker controller");
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 30_000 });
    await expect(page.locator("#client-list"), "the walk page opens with her client list").toHaveValue(STORY_CLIENT_LIST, { timeout: 15_000 });
    if ((await page.locator("#try-example").count()) > 0) throw new Stop('"Try an invented visit" is on the page; the walk leaves it out');
    await page.evaluate(() => window.scrollTo(0, 0));
    await hold(3000);
    step(0, "her client list kept in this browser; page ready and connected", "none", {
      listNames: STORY_CLIENT_LIST.split("\n").length,
      listFirstLine: STORY_CLIENT_LIST.split("\n")[0],
      statusBar: { network: await words(page, "network"), deviceModel: await words(page, "device"), cloud: await words(page, "cloud") },
    });

    // 1. Offline (emulated).
    await ctx.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
    const offlineMark = recorder.mark();
    const zones = (await page.locator("[data-zone] h2").allInnerTexts()).map(clean);
    const boundary = clean(await page.locator("[data-boundary]").innerText());
    const status1 = { network: await words(page, "network"), deviceModel: await words(page, "device"), cloud: await words(page, "cloud") };
    if (zones.join("|") !== STORY_ZONES.join("|")) throw new Stop(`the zone headings read ${JSON.stringify(zones)}`);
    if (status1.network !== "offline" || status1.deviceModel !== "ready") throw new Stop(`the status bar read ${JSON.stringify(status1)}`);
    await holdForCrop(1, "B6", 3500, `${zones.join(" · ")} | ${boundary}`, []);
    await holdForCrop(2, "B6", 2500, `Network: ${status1.network} · Device model: ${status1.deviceModel}`, [
      page.locator('[data-state="network"]'),
      page.locator('[data-state="device"]'),
    ]);
    step(1, "offline (emulated)", "none", { zones, boundary, statusBar: status1 });

    // 2. The seven-line note, typed key by key.
    const note = page.locator("#note");
    await note.click();
    const typedStart = sinceS();
    const parts = splitAroundPhrase(STORY_NOTE, STORY_TYPED_PHRASE);
    await page.keyboard.type(parts.before, { delay: KEY_DELAY_MS });
    const phraseFrom = sinceS();
    await page.keyboard.type(parts.phrase, { delay: KEY_DELAY_MS });
    const phraseTo = sinceS();
    const noteBox = await boxOf([note]);
    crops.push({ crop: 3, beat: "B7", fromS: phraseFrom, toS: phraseTo, words: STORY_TYPED_PHRASE, boxVideoPx: noteBox.box, inView: noteBox.inView });
    await page.keyboard.type(parts.after, { delay: KEY_DELAY_MS });
    await expect(note).toHaveValue(STORY_NOTE);
    await hold(2000);
    step(2, "the seven-line note typed key by key", "none", { typedChars: STORY_NOTE.length, lines: STORY_NOTE.split("\n").length, typingSeconds: seconds((sinceS() - typedStart) * 1000), phraseWindowS: [phraseFrom, phraseTo] });

    // 3. Make the record (ONLY_ON_DEVICE).
    await press(page, "#make-record");
    const alert = page.locator('[data-zone="note"] [role="alert"], [data-zone="note"] p.error');
    await expect(page.locator("[data-record]").or(alert).first()).toBeVisible({ timeout: 120_000 });
    if ((await page.locator("[data-record]").count()) === 0) throw new Stop(`no record: ${clean(await alert.first().innerText())}`);
    const recordTitle = clean(await page.locator("[data-record] .record-title").first().innerText());
    const recordLabel = (await page.locator("[data-record] .source-label").count()) > 0 ? clean(await page.locator("[data-record] .source-label").first().innerText()) : "not shown";
    if (sourceOf(recordLabel) !== "ON_DEVICE") throw new Stop(`the record was labelled "${recordLabel}"`);
    await center(page.locator("[data-record] .record-title"));
    await holdForCrop(4, "B7", 3000, `${recordTitle} · ${recordLabel}`, [page.locator("[data-record] .record-title"), page.locator("[data-record] .source-label")]);
    step(3, "Make the record", "ON_DEVICE", { recordTitle, recordLabel, structureReply: (await page.evaluate(() => window.__lmLog ?? [])).map((e) => e.output).slice(-1)[0] ?? null });

    // 4. Add to Seen, only when the page lists a line the record left out.
    const recovery = await recoverShotARecord(page, hold);
    step(4, recovery.shotAPath === "added-to-seen" ? "Add to Seen: the page listed a line the record left out" : "no line left out: skipped", "none", { path: recovery.shotAPath, addedLines: recovery.addedLines });

    // 5. Mask. The device pass suggests more; she accepts "Bea suggested".
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] .mask-chip").first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          if ((await page.locator("[data-mask-section] .source-label").count()) > 0) return "label";
          const line = (await page.locator("[data-device-pass-line]").count()) > 0 ? await page.locator("[data-device-pass-line]").first().innerText() : "";
          return /could not suggest|too long for the device pass/.test(line) ? "failed" : "waiting";
        },
        { timeout: 120_000, intervals: [500] },
      )
      .not.toBe("waiting");
    const suggestionsLabel = (await page.locator("[data-mask-section] .source-label").count()) > 0 ? clean(await page.locator("[data-mask-section] .source-label").first().innerText()) : "not shown";
    const allChips = (await page.locator("[data-mask-view] .mask-chip").allInnerTexts()).map(clean);
    proposedChips = (await page.locator('[data-mask-view] [data-chip="proposed"]').allInnerTexts()).map(clean);
    const listed = listedChip(allChips);
    rec["maskView"] = { suggestionsLabel, chips: allChips, proposed: proposedChips, maskText: (await page.locator("[data-mask-view]").innerText()).replace(/\s+/g, " ").trim() };
    save();
    if (listed === null) throw new Stop(`no "[Person N] on your list" chip: ${JSON.stringify(allChips)}`);
    const listedLocator = page.locator('[data-mask-view] [data-chip="listed"]').first();
    await center(listedLocator);
    await holdForCrop(5, "B8", 3000, listed, [listedLocator]);
    const bea = page.locator('[data-mask-view] [data-chip="proposed"]').filter({ has: page.locator(".chip-text", { hasText: /^Bea$/ }) }).first();
    if ((await bea.count()) === 0) throw new Stop(`the device pass did not suggest Bea (offered: ${JSON.stringify(proposedChips)}); 0 cloud calls spent`);
    await center(bea);
    const beaBox = await boxOf([bea]);
    const beaFrom = sinceS();
    await hold(2500);
    const beaStart = await bea.getAttribute("data-start");
    await bea.click();
    await expect(page.locator(`[data-mask-view] .mask-chip[data-start="${beaStart}"][aria-pressed="true"]`)).toHaveCount(1);
    await hold(2500);
    crops.push({ crop: 6, beat: "B8", fromS: beaFrom, toS: sinceS(), words: "Bea suggested", boxVideoPx: beaBox.box, inView: beaBox.inView });
    // The date of birth, when it is suggested, is accepted too: not a crop.
    let dobAccepted = false;
    if (dobSuggested(proposedChips)) {
      const dob = page.locator('[data-mask-view] [data-chip="proposed"]').filter({ hasText: "3/3/87" }).first();
      if ((await dob.count()) > 0) {
        const dobStart = await dob.getAttribute("data-start");
        await dob.click();
        await expect(page.locator(`[data-mask-view] .mask-chip[data-start="${dobStart}"][aria-pressed="true"]`)).toHaveCount(1);
        dobAccepted = true;
        await hold(1000);
      }
    }
    const leftProposed = (await page.locator('[data-mask-view] [data-chip="proposed"]').allInnerTexts()).map(clean);
    step(5, 'Mask: the device pass suggested more; "Bea suggested" accepted', "ON_DEVICE", { suggestionsLabel, listedChip: listed, proposed: proposedChips, dobAccepted, leftNotAccepted: leftProposed });
    if (sourceOf(suggestionsLabel) !== "ON_DEVICE") throw new Stop(`the suggestions were labelled "${suggestionsLabel}"`);
    const outsideOffline = recorder.since(offlineMark).filter((r) => !r.url.startsWith(targetOrigin));
    rec["requestsOutsideThePageWhileOffline"] = outsideOffline.length;
    if (outsideOffline.length > 0) throw new Stop(`${outsideOffline.length} request(s) left the page while offline`);
    if (recorder.generateContentCount() !== 0) throw new Stop(`${recorder.generateContentCount()} generateContent call(s) before going online`);

    if (rehearsal) {
      await hold(1500);
      finished = true;
      rec["rehearsalEnd"] = "stopped after step 5, still offline, by design";
    } else {
      // 6. Online.
      await ctx.setOffline(false);
      await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
      await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 45_000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await hold(3000);
      step(6, "online", "none", { network: await words(page, "network"), cloud: await words(page, "cloud") });

      // 7. Ask a second reader, Send (cloud call 1).
      let mark = recorder.mark();
      await press(page, "#ask-reader");
      await expect(page.locator("[data-reader-prepared]")).toBeVisible({ timeout: 15_000 });
      const sendLabel1 = clean(await page.locator("#send").innerText());
      await hold(2500);
      const readerText1 = await outgoing();
      const before1 = recorder.generateContentCount();
      await press(page, "#send");
      await expect
        .poll(
          async () =>
            isReaderPassSettled({
              generateContentCount: recorder.generateContentCount(),
              beforeCount: before1,
              errorCount: await page.locator("[data-reader-error]").count(),
              workingCount: await page.locator("[data-reader] [data-working]").count(),
              askEnabled: await page.locator("#ask-reader").isEnabled(),
            }),
          { timeout: 120_000, intervals: [500] },
        )
        .toBe(true);
      syncCounts();
      const error1 = (await page.locator("[data-reader-error]").count()) > 0 ? clean(await page.locator("[data-reader-error]").first().innerText()) : null;
      const label1 = (await page.locator(".reader-source .source-label").count()) > 0 ? clean(await page.locator(".reader-source .source-label").first().innerText()) : "not shown";
      const line1 = (await page.locator("[data-reader-pass]").count()) > 0 ? clean(await page.locator("[data-reader-pass]").first().innerText()) : null;
      const guesses1 = await readGuesses(page);
      const card1 = (await page.locator("[data-egress-line]").count()) > 0 ? await readCard(page) : null;
      const choice = chooseH39Chip(guesses1, guesses1.map((g) => g.pressable));
      pass1Chip = choice ? { rule: choice.rule, quote: choice.pressedQuote } : null;
      rec["pass1"] = { sendLabel: sendLabel1, label: label1, passLine: line1, error: error1, guesses: guesses1, card: card1, choice, readerText: readerText1 };
      save();
      checkLeaks(7, mark, readerText1);
      if (await page.locator("[data-reader]").count()) await center(page.locator("[data-reader] [data-guess]").first().or(page.locator("[data-reader]")));
      await hold(2500);
      step(7, "second reader, pass 1", sourceOf(label1), { label: label1, passLine: line1, guesses: guesses1.length, chosen: pass1Chip });
      if (error1 !== null) throw new Stop(`pass 1: the reader showed an error: ${error1}`);
      if (sourceOf(label1) !== "IN_CLOUD") throw new Stop(`pass 1 was labelled "${label1}"`);
      if (choice === null || choice.rule !== "neighbour-quote") {
        throw new Stop(`pass 1 quoted no phrase about the neighbour that she can mask (pressable: ${JSON.stringify(guesses1.map((g) => g.pressable))}); 1 cloud call spent, no quote staged`);
      }

      // 8. She presses the quote chip about the neighbour.
      const chip = page.locator("[data-reader] [data-guess]").nth(choice.pressedIndex).locator('button[data-quote][aria-pressed="false"]').nth(choice.pressedQuoteIndex);
      await center(chip);
      const chipBox = await boxOf([chip]);
      const chipFrom = sinceS();
      await hold(3000);
      await chip.click();
      const pressedChip = page.locator(`[data-reader] button[data-quote="${choice.pressedQuote.replace(/"/g, '\\"')}"][aria-pressed="true"]`).first();
      await expect(pressedChip).toBeVisible({ timeout: 10_000 });
      const pressedText = clean(await pressedChip.innerText());
      await hold(3000);
      crops.push({ crop: 7, beat: "B11", fromS: chipFrom, toS: sinceS(), words: pressedText, boxVideoPx: chipBox.box, inView: chipBox.inView });
      const maskedWords = choice.pressedQuote.split(/\[[^\]]*\]/).map((p) => p.trim()).filter((p) => /[\p{L}\p{N}]/u.test(p));
      step(8, "the neighbour quote chip pressed", "none", { quote: choice.pressedQuote, chipReads: pressedText, kind: choice.pressedKind, maskedWords });

      // 9. Ask again, Send (cloud call 2).
      mark = recorder.mark();
      await press(page, "#ask-reader");
      await expect(page.locator("[data-reader-prepared]")).toBeVisible({ timeout: 15_000 });
      await hold(2000);
      const readerText2 = await outgoing();
      const stillThere = maskedWords.filter((w) => holdsWord(recordPart(readerText2), w));
      const before2 = recorder.generateContentCount();
      await press(page, "#send");
      let settled2 = false;
      await expect
        .poll(
          async () =>
            (settled2 = isReaderPassSettled({
              generateContentCount: recorder.generateContentCount(),
              beforeCount: before2,
              errorCount: await page.locator("[data-reader-error]").count(),
              workingCount: await page.locator("[data-reader] [data-working]").count(),
              askEnabled: await page.locator("#ask-reader").isEnabled(),
            })),
          { timeout: 120_000, intervals: [500] },
        )
        .toBe(true);
      syncCounts();
      const error2 = (await page.locator("[data-reader-error]").count()) > 0 ? clean(await page.locator("[data-reader-error]").first().innerText()) : null;
      const label2 = (await page.locator(".reader-source .source-label").count()) > 0 ? clean(await page.locator(".reader-source .source-label").first().innerText()) : "not shown";
      const line2 = (await page.locator("[data-reader-pass]").count()) > 0 ? clean(await page.locator("[data-reader-pass]").first().innerText()) : null;
      const guesses2 = await readGuesses(page);
      pass2 = { settled: settled2, guesses: guesses2.length, error: error2 };
      const household = householdGuess(guesses2.map((g) => g.description));
      rec["pass2"] = { label: label2, passLine: line2, error: error2, guesses: guesses2, householdGuess: household, maskedWordsStillInTheText: stillThere, readerText: readerText2 };
      save();
      checkLeaks(9, mark, readerText2);
      if (stillThere.length > 0) throw new Stop(`pass 2: the text sent still held the pressed words: ${stillThere.join(", ")}`);
      if (error2 !== null) throw new Stop(`pass 2: the reader showed an error: ${error2}`);
      if (sourceOf(label2) !== "IN_CLOUD") throw new Stop(`pass 2 was labelled "${label2}"`);
      const householdCard = household === null ? null : page.locator("[data-reader] [data-guess] .reader-who").filter({ hasText: household.slice(0, 40) }).first();
      if (householdCard !== null && (await householdCard.count()) > 0) {
        await center(householdCard);
        await holdForCrop(8, "B11", 5000, household ?? "", [householdCard]);
      } else {
        await center(page.locator("[data-reader] [data-guess]").first().or(page.locator("[data-reader]")));
        await hold(5000);
      }
      step(9, "second reader, pass 2 (ask again)", sourceOf(label2), { label: label2, passLine: line2, guesses: guesses2.length, householdGuess: household });
      if (guesses2.length === 0) throw new Stop("pass 2 showed no guess");

      // 10. Draft, Send (cloud call 3).
      mark = recorder.mark();
      await press(page, "#draft");
      const likelyHandled: { word: string; action: "mask" | "keep" }[] = [];
      for (let n = 0; n < 20; n++) {
        await page.waitForTimeout(300);
        const likely = page.locator("[data-likely-word]");
        if ((await likely.count()) === 0) break;
        const word = clean(await likely.first().innerText());
        const action = likelyWordAction(word);
        likelyHandled.push({ word, action });
        if (action === "mask") await likely.first().click();
        else await page.locator(`[data-keep-likely="${word.replace(/"/g, '\\"')}"]`).first().click();
        await hold(800);
      }
      await expect(page.locator("#send")).toBeEnabled({ timeout: 60_000 });
      const draftText = await outgoing();
      await center(page.locator("[data-outgoing]"));
      await hold(2500);
      const before3 = recorder.generateContentCount();
      await press(page, "#send");
      const sheet = page.locator('[data-zone="finished"] .sheet-text');
      const noDraft = page.locator("[data-no-draft]");
      await expect(sheet.or(noDraft).or(alert).first()).toBeVisible({ timeout: 150_000 });
      syncCounts();
      if ((await sheet.count()) === 0) throw new Stop(`no finished note: ${clean(await noDraft.or(alert).first().innerText())}`);
      await expect(page.locator('[data-zone="finished"] .source-label').first()).toBeVisible({ timeout: 30_000 });
      const finishedLabels = clean((await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + "));
      const finishedText = (await sheet.first().innerText()).trim();
      finishedNote = { labels: finishedLabels, text: finishedText };
      const zone = await finishedZoneCheck(page, "step 10");
      checkLeaks(10, mark, draftText);
      if (recorder.generateContentCount() <= before3) problems.push("step 10: no generateContent request was made for the draft");
      rec["draft"] = { likelyHandled, draftText, finishedLabels, finishedText, finishedNotes: zone.flags, copyDisabled: zone.copyDisabled, putBackButtons: zone.putBackButtons, firstSixWords: firstWords(finishedText, 6) };
      problems.push(...zone.problems, ...draftProblems("step 10: the finished note", finishedText));
      const labelLocator = page.locator('[data-zone="finished"] .source-label').first();
      // The finished note stands at the top of its column; the column below it holds the second reader.
      await page.evaluate(() => window.scrollTo(0, 0));
      await holdForCrop(9, "B12", 3000, clean(await labelLocator.innerText()), [labelLocator]);
      await holdForCrop(10, "B12", 3500, firstWords(finishedText, 6), [sheet.first()]);
      step(10, "Draft and Send", sourceOf(finishedLabels), { finishedLabels, firstSixWords: firstWords(finishedText, 6), likelyHandled });

      // 11. The verdict line of the egress card.
      const card = (await page.locator("[data-egress-line]").count()) > 0 ? await readCard(page) : null;
      verdict = card?.verdict ?? null;
      rec["egressCard"] = card;
      const headline = page.locator("[data-egress-line] .egress-headline").first();
      if ((await headline.count()) > 0) {
        await center(headline);
        await holdForCrop(11, "B12", 4000, verdict ?? "", [headline]);
      }
      step(11, "the finished note and the verdict line", "none", { verdict, rows: card?.rows ?? null });
      await hold(2000);
      finished = true;
    }
  } catch (error) {
    problems.push(error instanceof Stop ? `stopped: ${error.message}` : `The run stopped: ${first(error)}`);
  } finally {
    syncAtEnd?.();
    if (context) {
      // Only the walk page's video is the take; a stop before the walk page leaves the preflight video, named as such below.
      const video = walkPage?.video() ?? null;
      await Promise.race([context.close().catch(() => undefined), new Promise((r) => setTimeout(r, 30_000))]);
      try {
        walkPath = video ? await video.path() : null;
      } catch {
        walkPath = null;
      }
      context = null;
    }
    if (staticServer) await staticServer.stop().catch(() => undefined);
  }

  rec["leakChecks"] = leaks.map((l) => ({ step: l.step, problems: leakProblems(l.result), checked: l.result.checkedCount }));
  const files = existsSync(rawDir) ? readdirSync(rawDir).sort().map((n) => join(rawDir, n)).filter((p) => statSync(p).isFile()) : [];
  rec["videos"] = files.map((p) => ({ path: p, sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), bytes: statSync(p).size }));
  const vc = walkPath !== null && existsSync(walkPath) ? await checkVideo(walkPath) : { frames: [], fills: false, checkerAborted: 0, durationS: null, error: "no walk video file" };
  rec["videoCheck"] = vc;
  if (files.length !== 1) problems.push(`expected 1 video file, saw ${files.length}`);
  if (vc.error) problems.push(`video check: ${vc.error}`);
  else if (!vc.fills || vc.frames.some((f) => f.width !== VIDEO.width || f.height !== VIDEO.height)) problems.push("video check: the frames are not 3840 x 2160 filled");
  for (const c of crops) if (c.inView === false) problems.push(`crop ${c.crop}: the subject was not wholly in view during its hold`);

  const g = storyGates({ finished, problems, proposedChips, pass1Chip, pass2, finishedNote, verdict });
  rec["gates"] = rehearsal ? null : g.gates;
  rec["keep"] = rehearsal ? false : g.keep;
  rec["missed"] = rehearsal ? [] : g.missed;
  rec["elapsedS"] = Math.round((Date.now() - t0) / 1000);
  rec["status"] = finished && problems.length === 0 ? "pass" : "fail";
  if (rec["status"] === "fail" && rec["reason"] === undefined) rec["reason"] = problems[0] ?? "the walk did not finish";
  rec["ledgerAfter"] = { total: readLedger().total };
  save();
  expect(problems).toEqual([]);
});
