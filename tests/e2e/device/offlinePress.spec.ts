// DEVICE MODEL, H29: the press with the network off. Device only. 0 cloud calls.
//
// A trim of H24c's command R. For each press: a first visit (every storage type cleared before the first navigation), the
// page loaded online, the Firebase modules loaded at page start (#app[data-device-modules="ready"]), then the network off,
// then "Make the visit record". The check counts device structuring calls and asset fetches during the press. It does not
// measure the date of birth the record keeps.
//
// The run is chosen by H29_RUN ("1", "2" or "3"). Its record is results/offline-press-<UTC date>-h29-<run>.json, written at the
// first step and after every press. A record that exists, in any status, means that run has happened and no browser starts.
// Every request whose host is not 127.0.0.1 or localhost is aborted and counted. Invented people only.
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CHROME_PATH, PROFILE_DIR, describeMachine, deviceLaunchOptions, readAvailability } from "../fixtures/deviceModel";
import { newRecordPath, writeRecord } from "../fixtures/records";
import { startStaticServer } from "../fixtures/staticServer";
import { appReady, press, seconds } from "./support";

declare global {
  interface Window {
    __lmLog?: { head: string; output: string }[];
  }
}

const RECORD_NAME = "offline-press";
const INVENTED_CONFIG = "tests/fixtures/firebase.config.invented.json";
const CONFIG_URL_PATH = "/firebase.config.local.json";
const PRESSES = 10;
const START_LIMIT_S = 340;
const PRESS_RESERVE_S = 60;
const WAIT_CAP_MS = 60_000;
const MODULES_WAIT_MS = 20_000;

interface Call {
  head: string;
  outputChars: number;
  dobInReply: boolean;
}
interface PressRecord {
  k: number;
  seconds: number;
  modulesReady: boolean;
  outcome: string;
  calls: number;
  callList: Call[];
  newAssetEntries: string[];
  sameOriginRequestsDuringPress: { path: string; status: number | "failed" }[];
  zeroCallStop: boolean;
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

/** The structuring calls in the output logger: the head holds "Make the visit record", or the output has visitDate, present or seen. */
function structuringCalls(log: { head: string; output: string }[]): Call[] {
  return log
    .filter((e) => {
      const p = parseJson(e.output);
      return e.head.includes("Make the visit record") || (p !== null && ("visitDate" in p || "present" in p || "seen" in p));
    })
    .map((e) => ({ head: e.head.slice(0, 120), outputChars: e.output.length, dobInReply: e.output.includes("3/3/87") }));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[m] ?? 0) : Math.round((((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2) * 10) / 10;
}

test("H29: the press with the network off makes its device call", async () => {
  test.setTimeout(400_000);
  const run = process.env["H29_RUN"];
  // H50b: a run-on-purpose check. In a whole-suite run without its input it is skipped and says why; a wrong value still fails.
  test.skip(run === undefined || run === "", 'H29_RUN is not set: this check runs on purpose with H29_RUN="1", "2" or "3" (npm run e2e:offline-press).');
  if (run !== "1" && run !== "2" && run !== "3") throw new Error('H29_RUN must be "1", "2" or "3".');
  const t0 = Date.now();
  const elapsedS = (): number => (Date.now() - t0) / 1000;
  const startedAt = new Date();
  // A run starts only before 23:50 UTC of its day. Nothing is written when it is later.
  if (startedAt.getUTCHours() * 60 + startedAt.getUTCMinutes() >= 23 * 60 + 50) throw new Error(`The UTC time is ${startedAt.toISOString()}: 23:50 or later. No run starts.`);
  const suffix = `h29-${run}`;
  const recordFile = newRecordPath(RECORD_NAME, process.cwd(), suffix);
  if (existsSync(recordFile)) throw new Error(`${recordFile} exists. Run ${run} has happened; it is not run again.`);

  // The main JavaScript file the built page loads.
  const html = readFileSync("dist-e2e/index.html", "utf8");
  const mainName = /src="\/assets\/([^"]+\.js)"/.exec(html)?.[1];
  const mainChunkSha256 = mainName ? createHash("sha256").update(readFileSync(`dist-e2e/assets/${mainName}`)).digest("hex") : null;

  const rec: Record<string, unknown> = {
    status: "started",
    run: Number(run),
    date: startedAt.toISOString().slice(0, 10),
    time: startedAt.toISOString(),
    browser: "not yet launched",
    machine: describeMachine(),
    buildCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    mainChunkSha256,
    check: "H29: the press with the network off. Device only. The modules are loaded at page start. Invented people only.",
    generateContent: 0,
    cloudCalls: { generateContent: 0, cap: 0 },
    nonLocalAborts: 0,
    nonLocalThrough: 0,
    presses: [] as PressRecord[],
  };
  const save = (): void => {
    writeRecord(RECORD_NAME, rec, process.cwd(), suffix);
  };
  const stop = (status: "fail" | "miss", reason: string): void => {
    rec["status"] = status;
    rec["reason"] = reason;
    rec["gate"] = { passed: false, reason };
    save();
  };
  save();

  if (!existsSync(CHROME_PATH)) return stop("miss", `Google Chrome is not installed at ${CHROME_PATH}`);
  try {
    lstatSync(join(PROFILE_DIR, "SingletonLock"));
    return stop("fail", ".browser-profile has a SingletonLock: another Chrome may hold the profile.");
  } catch {
    // no lock: go on
  }
  if (mainChunkSha256 === null) return stop("fail", "dist-e2e/index.html names no main JavaScript file.");

  const server = await startStaticServer({ dir: "dist-e2e", files: { [CONFIG_URL_PATH]: readFileSync(INVENTED_CONFIG) }, limitMs: 395_000 });
  const origin = server.url;
  let context: BrowserContext | null = null;
  const presses = rec["presses"] as PressRecord[];
  let modelState = "unknown";
  try {
    context = await chromium.launchPersistentContext(resolve(PROFILE_DIR), { ...deviceLaunchOptions(), viewport: { width: 1440, height: 900 } });
    const ctx = context;
    rec["browser"] = `Google Chrome ${ctx.browser()?.version() ?? "unknown"}`;
    let aborts = 0;
    await ctx.route("**/*", (route) => {
      let host = "";
      try {
        host = new URL(route.request().url()).hostname;
      } catch {
        host = "";
      }
      if (host === "127.0.0.1" || host === "localhost") return route.continue();
      aborts += 1;
      rec["nonLocalAborts"] = aborts;
      return route.abort();
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
    const page: Page = ctx.pages()[0] ?? (await ctx.newPage());
    const requests: { path: string; status: number | "failed" }[] = [];
    let recording = false;
    const pathOf = (u: string): string => {
      try {
        const x = new URL(u);
        return x.pathname;
      } catch {
        return u;
      }
    };
    const isLocal = (u: string): boolean => {
      try {
        return new URL(u).origin === origin;
      } catch {
        return false;
      }
    };
    page.on("response", (r) => {
      if (recording && isLocal(r.url())) requests.push({ path: pathOf(r.url()), status: r.status() });
    });
    page.on("requestfailed", (r) => {
      if (recording && isLocal(r.url())) requests.push({ path: pathOf(r.url()), status: "failed" });
    });
    const assetNames = (): Promise<string[]> => page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.includes("/assets/")));

    for (let k = 1; k <= PRESSES; k++) {
      if (elapsedS() + PRESS_RESERVE_S > START_LIMIT_S) {
        rec["stoppedBeforePress"] = { k, elapsedS: Math.round(elapsedS()), reason: "out of time" };
        break;
      }
      const wait = (): number => Math.max(5_000, Math.min(WAIT_CAP_MS, START_LIMIT_S * 1000 - (Date.now() - t0) - 20_000));
      const p: PressRecord = { k, seconds: 0, modulesReady: false, outcome: "", calls: 0, callList: [], newAssetEntries: [], sameOriginRequestsDuringPress: [], zeroCallStop: false };
      presses.push(p);
      const pressT0 = Date.now();
      try {
        // a. Network on; every storage type cleared; the page loaded; the device model ready.
        recording = false;
        await ctx.setOffline(false);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
        await cdp.detach();
        await page.goto(origin);
        await appReady(page);
        if (k === 1) {
          modelState = await readAvailability(page);
          rec["modelState"] = modelState;
          if (modelState !== "available") throw new Error(`the device model reported ${modelState}`);
        }
        await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: wait() });
        // b. The modules, loaded at page start.
        try {
          await page.locator('#app[data-device-modules="ready"]').waitFor({ state: "attached", timeout: MODULES_WAIT_MS });
          p.modulesReady = true;
        } catch {
          p.modulesReady = false;
        }
        if (!p.modulesReady) {
          p.outcome = "modules-not-ready";
        } else {
          // c. What was fetched so far.
          const before = await assetNames();
          // d. Network off; every same-origin request recorded.
          await ctx.setOffline(true);
          recording = true;
          // e. The press.
          await press(page, "#try-example");
          await press(page, "#make-record");
          await expect(page.locator("[data-record]").or(page.locator("p.error")).first()).toBeVisible({ timeout: wait() });
          const failure = (await page.locator("p.error").count()) > 0 ? clean(await page.locator("p.error").first().innerText()) : null;
          const calls = structuringCalls(await page.evaluate(() => window.__lmLog ?? []));
          p.callList = calls;
          p.calls = calls.length;
          // f. What was fetched since.
          const after = await assetNames();
          p.newAssetEntries = after.filter((n) => !before.includes(n));
          p.outcome = failure !== null ? `failed: ${failure.slice(0, 160)}` : "record-shown";
        }
      } catch (error) {
        p.outcome = p.outcome === "modules-not-ready" ? p.outcome : /Timeout|timeout/.test(first(error)) ? "timeout" : `failed: ${first(error).slice(0, 160)}`;
      }
      recording = false;
      p.sameOriginRequestsDuringPress = [...requests];
      requests.length = 0;
      p.zeroCallStop = p.calls === 0;
      p.seconds = seconds(Date.now() - pressT0);
      save();
      if (p.outcome.startsWith("failed: the device model reported")) break;
    }
  } catch (error) {
    rec["runError"] = first(error);
  } finally {
    if (context) await Promise.race([context.close().catch(() => undefined), new Promise((r) => setTimeout(r, 15_000))]);
    await server.stop();
  }

  // The gate. A press that fetched a module, or that made no call, fails the run.
  const secs = presses.map((x) => x.seconds);
  const withCall = presses.filter((x) => x.calls >= 1).length;
  const zeroStops = presses.filter((x) => x.zeroCallStop).length;
  const modulesReadyCount = presses.filter((x) => x.modulesReady).length;
  const assetFetches = presses.reduce((n, x) => n + x.newAssetEntries.length + x.sameOriginRequestsDuringPress.filter((r) => r.status === "failed").length, 0);
  rec["summary"] = {
    pressesRun: presses.length,
    withCall,
    zeroCallStops: zeroStops,
    modulesReady: modulesReadyCount,
    assetFetchesDuringPresses: assetFetches,
    medianSeconds: median(secs),
    maxSeconds: secs.length > 0 ? Math.max(...secs) : 0,
  };
  const passed =
    modelState === "available" &&
    presses.length === PRESSES &&
    modulesReadyCount === PRESSES &&
    withCall === PRESSES &&
    zeroStops === 0 &&
    assetFetches === 0 &&
    rec["generateContent"] === 0 &&
    rec["nonLocalThrough"] === 0;
  rec["gate"] = { passed, modelAvailable: modelState === "available", pressesRun: presses.length, withCall, modulesReady: modulesReadyCount, assetFetches, zeroCallStops: zeroStops };
  rec["status"] = passed ? "pass" : "fail";
  rec["elapsedS"] = Math.round(elapsedS());
  save();
  expect(rec["status"]).toBe("pass");
});
