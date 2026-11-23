// DEVICE MODEL, H36e rehearsal on the hosted page: device only, filmed at 1920 x 1080, 0 cloud calls.
//
// Runs preflight, origin clear, initial load, hostedPreflight, and service-worker cache warm-up on the
// initial page outside the recorded walk video, then opens the walk page from context.newPage(), closes
// the initial page and deletes its video. Runs MAX_ATTEMPTS = 1 offline attempt on the hosted page
// (complete record or Add-to-Seen recovery on omitted note lines), confirming both "Bea" and "3/3/87"
// are proposed by the device pass, then decodes the walk video in bundled Chromium to reject grey borders.
//
// Online route policy allows ONLY same-origin GET requests starting with hostedPage + "/" and aborts
// every outside host (0 generateContent, 0 App Check, 0 reCAPTCHA). The record is
// results/film-rehearsal-<UTC date>-h36r-2.json and is never overwritten. Invented people only.
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { CHROME_PATH, PROFILE_DIR, describeMachine, deviceLaunchOptions, readAvailability } from "../fixtures/deviceModel";
import { newRecordPath, setServedBundle, writeRecord } from "../fixtures/records";
import {
  checkVideo,
  devicePassClaimStopProblems,
  extractServedBundle,
  forbiddenCopyProblems,
  holdsBeaIn,
  holdsDobIn,
  readHostedOrigin,
  recoverShotARecord,
  requireFilmRawRoot,
  type FilmObservation,
  type FrameCheck,
} from "./filmHelpers";
import { hostedPreflight, readDebugTokenGlobal, readServiceWorker } from "./hostedSupport";
import { press, seconds, settleShell } from "./support";

declare global {
  interface Window {
    __lmLog?: { head: string; output: string }[];
  }
}

const RECORD_NAME = "film-rehearsal";
const SUFFIX = "h36r-2";
const VIDEO = { width: 1920, height: 1080 };
const CAP = 0;
const MAX_ATTEMPTS = 1;
const START_LIMIT_S = 240;
const ATTEMPT_RESERVE_S = 60;
const WAIT_CAP_MS = 60_000;
const MIN_SUCCESSES = 1;

type SeenCase = "omitted" | "empty" | "present-without-dob" | "present-with-dob" | "unparsed";

interface Attempt {
  k: number;
  startS: number;
  endS: number;
  durationS: number;
  recordText: string;
  maskRaw: string | null;
  seenCase: SeenCase;
  recordHasDob: boolean;
  recordHasDobAfterRecovery: boolean;
  recordHasDobFrom: "maskRaw" | "recordText";
  shotAPath: "complete" | "added-to-seen";
  addedLines: string[];
  proposed: string[];
  modelCandidates: string[];
  beaByModel: boolean;
  dobByModel: boolean;
  outcome: string;
  structureReply: string | null;
  proposalReplies: string[];
}

const clean = (t: string): string => t.replace(/\s+/g, " ").trim();
const first = (e: unknown): string => String((e as Error).message ?? e).split("\n")[0] ?? "failed";

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

/** What the model returned, from the output logger: the structure reply, how its "seen" reads, and the pass's own candidates. */
function readReplies(log: { head: string; output: string }[]): { structure: string | null; seenCase: SeenCase; candidates: string[]; proposals: string[] } {
  let structureAt = -1;
  log.forEach((e, i) => {
    const p = parseJson(e.output);
    if (e.head.includes("Make the visit record") || (p !== null && ("visitDate" in p || "present" in p || "seen" in p))) structureAt = i;
  });
  const structure = structureAt >= 0 ? (log[structureAt]?.output ?? null) : null;
  let seenCase: SeenCase = "unparsed";
  if (structure !== null) {
    const p = parseJson(structure);
    if (p !== null) {
      if (!("seen" in p)) seenCase = "omitted";
      else if (Array.isArray(p["seen"])) {
        const items = (p["seen"] as unknown[]).filter((x): x is string => typeof x === "string");
        seenCase = (p["seen"] as unknown[]).length === 0 ? "empty" : items.join(" ").includes("3/3/87") ? "present-with-dob" : "present-without-dob";
      }
    }
  }
  const candidates: string[] = [];
  const proposals: string[] = [];
  log.forEach((e, i) => {
    if (i <= structureAt) return;
    const p = parseJson(e.output);
    if (p !== null && Array.isArray(p["candidates"])) {
      proposals.push(e.output);
      for (const c of p["candidates"] as unknown[]) {
        const t = (c as Record<string, unknown> | null)?.["text"];
        if (typeof t === "string") candidates.push(t);
      }
    }
  });
  return { structure, seenCase, candidates, proposals };
}

const holdsBea = holdsBeaIn;
const holdsDob = holdsDobIn;

test("H36b rehearsal: hosted page, device only, filmed, 0 cloud calls", async () => {
  test.setTimeout(320_000);
  test.skip(!(process.env["DOORSTEP_FILM_RAW_DIR"] ?? "").trim(), "DOORSTEP_FILM_RAW_DIR is not set: this filmed check runs only when that folder is set.");
  const t0 = Date.now();
  const elapsedS = (): number => (Date.now() - t0) / 1000;
  const rawRoot = requireFilmRawRoot();
  const videoDir = join(rawRoot, `rehearsal-${SUFFIX}`);
  const recordFile = newRecordPath(RECORD_NAME, process.cwd(), SUFFIX);
  if (existsSync(recordFile)) throw new Error(`${recordFile} exists. H36b rehearsal runs once; it is not run again.`);
  expect(relative(process.cwd(), videoDir).startsWith("..")).toBe(true);

  const hosted = readHostedOrigin();
  const now = new Date().toISOString();
  const rec: Record<string, unknown> = {
    status: "started",
    date: now.slice(0, 10),
    time: now,
    browser: "not yet launched",
    machine: describeMachine(),
    buildCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    hostedOrigin: hosted.ok ? hosted.hostedPage : "invalid",
    check: "H36b rehearsal on the hosted page. Device only, filmed at 1920x1080, 0 cloud calls. Invented people only.",
    generateContent: 0,
    cloudCalls: { generateContent: 0, appCheck: 0, recaptcha: 0, cap: CAP },
    nonLocalAborts: 0,
    nonLocalThrough: 0,
    preflight: null,
    debugTokenGlobal: null,
    serviceWorker: null,
    maxAttemptS: 0,
    shotAPath: null,
    addedLines: [],
    observations: [] as FilmObservation[],
    attempts: [] as Attempt[],
    videoCheck: null,
    viewport: VIDEO,
    videoSize: VIDEO,
    videoDir: relative(rawRoot, videoDir),
    instrumentation: {
      outputLogger: "a LanguageModel output logger installed as an init script. It logs each session.prompt output and changes nothing.",
      networkOff: "network off = Playwright context.setOffline (emulated) after SW ready/controller + ready + connected",
      launchSequence: "preflight and SW cache warm-up on initial page, then walk = context.newPage(), initial closed and its video deleted.",
    },
  };
  const save = (): void => {
    writeRecord(RECORD_NAME, rec, process.cwd(), SUFFIX);
  };
  const stop = (status: "fail" | "miss", reason: string): void => {
    rec["status"] = status;
    rec["reason"] = reason;
    rec["gate"] = { passed: false, reason };
    save();
  };
  save();

  if (!hosted.ok) return stop("fail", hosted.reason);
  const { hostedPage, hostedOrigin } = hosted;

  if (!existsSync(CHROME_PATH)) return stop("miss", `Google Chrome is not installed at ${CHROME_PATH}`);
  try {
    lstatSync(join(PROFILE_DIR, "SingletonLock"));
    return stop("fail", ".browser-profile has a SingletonLock: another Chrome may hold the profile.");
  } catch {
    // no lock: go on
  }
  mkdirSync(videoDir, { recursive: true });
  const before = readdirSync(videoDir);
  if (before.length > 0) return stop("fail", `${relative(rawRoot, videoDir)} holds ${before.length} file(s) before the launch.`);

  let context: BrowserContext | null = null;
  let walkVideoPath: string | null = null;
  let nonLocalThrough = 0;
  let genThrough = 0;
  let appCheckThrough = 0;
  let recaptchaThrough = 0;

  try {
    context = await chromium.launchPersistentContext(resolve(PROFILE_DIR), {
      ...deviceLaunchOptions(),
      viewport: VIDEO,
      recordVideo: { dir: videoDir, size: VIDEO },
    });
    const ctx = context;
    rec["browser"] = `Google Chrome ${ctx.browser()?.version() ?? "unknown"}`;
    rec["headed"] = process.env["DEVICE_MODEL_HEADED"] === "1";

    // Allow only same-origin GET starting with hostedPage + "/" while online; abort every outside host.
    let offline = false;
    let aborts = 0;
    const chunkHeaders = new Map<string, string>();
    await ctx.route("**/*", (route) => {
      const req = route.request();
      const url = req.url();
      if (!offline && req.method() === "GET" && url.startsWith(hostedOrigin)) {
        return route.continue();
      }
      if (!url.startsWith(hostedOrigin)) {
        aborts += 1;
        rec["nonLocalAborts"] = aborts;
      }
      return route.abort();
    });
    ctx.on("response", (res) => {
      const url = res.url();
      if (!url.startsWith(hostedOrigin)) {
        nonLocalThrough += 1;
        rec["nonLocalThrough"] = nonLocalThrough;
        if (url.includes(":generateContent")) genThrough += 1;
        if (url.includes("content-firebaseappcheck.googleapis.com")) appCheckThrough += 1;
        if (url.includes("google.com/recaptcha") || url.includes("gstatic.com/recaptcha")) recaptchaThrough += 1;
        return;
      }
      try {
        const path = new URL(url).pathname;
        if (/\.js$/.test(path)) {
          const h = res.headers();
          chunkHeaders.set(path, h["last-modified"] ?? h["date"] ?? "");
        }
      } catch {
        // ignore unparseable URL
      }
    });

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

    // Warm up and verify hosted preflight, production build, debugTokenGlobal === "undefined", and SW outside video.
    const initial = ctx.pages()[0] ?? (await ctx.newPage());
    {
      const cdp = await ctx.newCDPSession(initial);
      await cdp.send("Storage.clearDataForOrigin", { origin: hostedPage, storageTypes: "all" });
      await cdp.detach();
    }
    await initial.goto(hostedOrigin);
    const pre = await hostedPreflight(initial);
    rec["preflight"] = pre;
    if (![pre.configStatus200, pre.configParses, pre.sixKeys, pre.siteKeyServed].every(Boolean)) {
      throw new Error("hosted preflight failed: config or site key is incomplete");
    }
    await settleShell(initial);
    const initWorker = await readServiceWorker(initial);
    const initDebugToken = await readDebugTokenGlobal(initial);
    rec["serviceWorker"] = initWorker;
    rec["debugTokenGlobal"] = initDebugToken;
    setServedBundle(await extractServedBundle(initial, chunkHeaders));
    if (initDebugToken !== "undefined") throw new Error(`FIREBASE_APPCHECK_DEBUG_TOKEN is ${initDebugToken}, expected undefined`);
    if (initWorker.build !== "production") throw new Error(`data-build is "${initWorker.build}", expected "production"`);
    if (!initWorker.registered || !initWorker.active || initWorker.cachedFiles < 1) {
      throw new Error(`initial service worker invalid: registered=${initWorker.registered} active=${initWorker.active} cached=${initWorker.cachedFiles}`);
    }
    await expect(initial.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 40_000 });
    await expect(initial.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 40_000 });
    const initAvailability = await readAvailability(initial);
    if (initAvailability !== "available") {
      rec["modelState"] = initAvailability;
      throw new Error(`the device model reported ${initAvailability}`);
    }
    save();

    // Start the recorded walk on a fresh page and delete the initial page's video.
    const videoT0 = Date.now();
    const walk: Page = await ctx.newPage();
    await initial.close();
    await initial.video()?.delete().catch(() => undefined);
    await walk.bringToFront();
    const sinceVideoS = (): number => seconds(Date.now() - videoT0);
    const attempts = rec["attempts"] as Attempt[];

    for (let k = 1; k <= MAX_ATTEMPTS; k++) {
      if (elapsedS() + ATTEMPT_RESERVE_S > START_LIMIT_S) {
        rec["stoppedBeforeAttempt"] = { k, elapsedS: Math.round(elapsedS()), reason: "out of time" };
        break;
      }
      const wait = (): number => Math.max(5_000, Math.min(WAIT_CAP_MS, START_LIMIT_S * 1000 - (Date.now() - t0) - 20_000));
      const a: Attempt = {
        k, startS: sinceVideoS(), endS: 0, durationS: 0, recordText: "", maskRaw: null, seenCase: "unparsed",
        recordHasDob: false, recordHasDobAfterRecovery: false, recordHasDobFrom: "recordText", shotAPath: "complete",
        addedLines: [], proposed: [], modelCandidates: [], beaByModel: false, dobByModel: false, outcome: "",
        structureReply: null, proposalReplies: [],
      };
      attempts.push(a);
      try {
        // 1. Online goto + settleShell + SW ready/active/cachedFiles + ready + connected BEFORE setOffline(true).
        offline = false;
        await ctx.setOffline(false);
        const cdp = await ctx.newCDPSession(walk);
        await cdp.send("Storage.clearDataForOrigin", { origin: hostedPage, storageTypes: "all" });
        await cdp.detach();
        await walk.goto(hostedOrigin);
        await settleShell(walk);
        const worker = await readServiceWorker(walk);
        const dbg = await readDebugTokenGlobal(walk);
        rec["serviceWorker"] = worker;
        rec["debugTokenGlobal"] = dbg;
        if (dbg !== "undefined") throw new Error(`debug token global was ${dbg}`);
        if (worker.build !== "production") throw new Error(`data-build was "${worker.build}"`);
        if (!worker.registered || !worker.active || worker.cachedFiles < 1) {
          throw new Error(`service worker not cached: active=${worker.active} cached=${worker.cachedFiles}`);
        }
        await expect(walk.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: wait() });
        await expect(walk.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: wait() });

        offline = true;
        await ctx.setOffline(true);
        await expect(walk.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
        const offlineCopy = forbiddenCopyProblems({ pageText: await walk.locator("main, body").first().innerText(), offline: true });
        for (const seen of offlineCopy) {
          (rec["observations"] as FilmObservation[]).push({ step: "Shot A offline opening", rule: "forbiddenCopyProblems", seen });
        }

        // 2. The invented visit and the record.
        await press(walk, "#try-example");
        await press(walk, "#make-record");
        await expect(walk.locator("[data-record]").or(walk.locator('[role="alert"]')).or(walk.locator("p.error")).first()).toBeVisible({ timeout: wait() });

        // 3. What the page shows and what the model returned.
        const errEl = walk.locator('[role="alert"], p.error').first();
        const failure = (await errEl.count()) > 0 ? clean(await errEl.innerText()) : null;
        const hasRecord = (await walk.locator("[data-record]").count()) > 0;
        a.recordText = hasRecord ? clean(await walk.locator("[data-record]").first().innerText()) : "";
        a.maskRaw = (await walk.locator("[data-mask-text]").count()) > 0 ? clean(await walk.locator("[data-mask-text]").first().innerText()) : null;
        const replies1 = readReplies(await walk.evaluate(() => window.__lmLog ?? []));
        a.structureReply = replies1.structure;
        a.seenCase = replies1.seenCase;
        a.recordHasDobFrom = a.maskRaw !== null ? "maskRaw" : "recordText";
        a.recordHasDob = (a.maskRaw ?? a.recordText).includes("3/3/87");
        if (!hasRecord) {
          a.outcome = `failed:record missing${failure ? `: ${failure.slice(0, 120)}` : ""}`;
        } else {
          if (failure !== null) {
            (rec["observations"] as FilmObservation[]).push({ step: "Shot A record", rule: "recordAlert", seen: failure });
          }
          const recovery = await recoverShotARecord(walk, (ms) => walk.waitForTimeout(ms));
          a.shotAPath = recovery.shotAPath;
          a.addedLines = recovery.addedLines;
          rec["shotAPath"] = a.shotAPath;
          rec["addedLines"] = a.addedLines;
          if (a.shotAPath === "added-to-seen") {
            a.recordText = (await walk.locator("[data-record]").count()) > 0 ? clean(await walk.locator("[data-record]").first().innerText()) : a.recordText;
          }
          a.recordHasDobAfterRecovery = (a.maskRaw ?? a.recordText).includes("3/3/87");
          // 4. The device pass.
          await press(walk, "#mask");
          await expect
            .poll(
              async () => {
                if ((await walk.locator("[data-mask-section] .source-label").count()) > 0) return "label";
                const line = (await walk.locator("[data-device-pass-line]").count()) > 0 ? await walk.locator("[data-device-pass-line]").first().innerText() : "";
                return /could not suggest|too long for the device pass/.test(line) ? "proposeFailed" : "waiting";
              },
              { timeout: wait(), intervals: [500] },
            )
            .not.toBe("waiting");
          const failedPass = (await walk.locator("[data-mask-section] .source-label").count()) === 0;
          a.maskRaw = (await walk.locator("[data-mask-text]").count()) > 0 ? clean(await walk.locator("[data-mask-text]").first().innerText()) : a.maskRaw;
          if (failedPass) {
            a.outcome = "failed:proposeFailed line";
          } else {
            a.proposed = (await walk.locator('[data-mask-view] [data-chip="proposed"]').allInnerTexts()).map(clean);
            const replies2 = readReplies(await walk.evaluate(() => window.__lmLog ?? []));
            a.modelCandidates = replies2.candidates;
            a.proposalReplies = replies2.proposals;
            a.beaByModel = holdsBea(a.modelCandidates);
            a.dobByModel = holdsDob(a.modelCandidates);
            if (!a.beaByModel || !a.dobByModel) {
              (rec["observations"] as FilmObservation[]).push({
                step: "Shot A device pass",
                rule: "devicePassRawModelSpy",
                seen: `beaByModel=${a.beaByModel} dobByModel=${a.dobByModel} proposed=${JSON.stringify(a.proposed)}`,
              });
            }
            const claimStops = devicePassClaimStopProblems(a.proposed);
            if (claimStops.length === 0) a.outcome = "success";
            else a.outcome = `pass-missed: ${claimStops.join("; ")}`;
          }
        }
      } catch (error) {
        a.outcome = `failed:${first(error).slice(0, 160)}`;
      }
      a.endS = sinceVideoS();
      a.durationS = seconds((a.endS - a.startS) * 1000);
      rec["maxAttemptS"] = Math.max(...attempts.map((x) => x.durationS));
      save();
      if (a.outcome.startsWith("failed:the device model reported")) break;
    }

    // Close the browser: the video is final only then.
    walkVideoPath = null;
    const video = walk.video();
    await Promise.race([ctx.close().catch(() => undefined), new Promise((r) => setTimeout(r, 30_000))]);
    context = null;
    try {
      walkVideoPath = video ? await video.path() : null;
    } catch {
      walkVideoPath = null;
    }
    rec["walkVideo"] = walkVideoPath === null ? null : relative(rawRoot, walkVideoPath);
    rec["videoFiles"] = readdirSync(videoDir);
    save();
  } catch (error) {
    rec["runError"] = first(error);
  } finally {
    if (context) await Promise.race([context.close().catch(() => undefined), new Promise((r) => setTimeout(r, 15_000))]);
  }

  rec["generateContent"] = genThrough;
  rec["cloudCalls"] = { generateContent: genThrough, appCheck: appCheckThrough, recaptcha: recaptchaThrough, cap: CAP };
  rec["nonLocalThrough"] = nonLocalThrough;

  const attempts = rec["attempts"] as Attempt[];
  const vc =
    walkVideoPath !== null && existsSync(walkVideoPath)
      ? await checkVideo(walkVideoPath)
      : { frames: [] as FrameCheck[], fills: false, checkerAborted: 0, durationS: null, error: "no walk video file" };
  rec["videoCheck"] = vc;
  const successes = attempts.filter((a) => a.outcome === "success").length;
  rec["attemptsRun"] = attempts.length;
  rec["successes"] = successes;
  const videoCount = Array.isArray(rec["videoFiles"]) ? (rec["videoFiles"] as string[]).length : 0;
  const zeroCloud = nonLocalThrough === 0 && genThrough === 0 && appCheckThrough === 0 && recaptchaThrough === 0;
  const underCeiling = vc.durationS === null || vc.durationS < 180;
  const passed = successes >= MIN_SUCCESSES && vc.fills === true && underCeiling && zeroCloud && videoCount === 1;
  rec["gate"] = { passed, successes, attemptsRun: attempts.length, minSuccesses: MIN_SUCCESSES, videoFills: vc.fills, underCeiling, zeroCloud, videoCount };
  rec["outcomes"] = attempts.map((a) => ({ k: a.k, outcome: a.outcome }));
  rec["status"] = passed ? "pass" : "fail";
  rec["elapsedS"] = Math.round(elapsedS());
  save();
  expect(rec["status"]).toBe("pass");
});
