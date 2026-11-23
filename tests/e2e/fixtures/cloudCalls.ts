// Counts the real calls a bundled run makes to the cloud model, and stops them at a budget
// (shell-and-offline R41.3). Every bundled test gets this through `test` in base.ts.
//
// A call is a request to the cloud model host for generateContent. Each one is counted before it
// leaves. When the count is already at the budget the request is aborted, so a run can never pass
// the budget, and the ledger says the run was stopped. The ledger accumulates across runs in one
// session: results/e2e-cloud-on-<date>-h23.json (H23). The reporter adds each spec's outcome at the end.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BrowserContext } from "@playwright/test";
import { CLOUD_MODEL_HOST } from "../../../src/constants";

/** The session's budget of real cloud calls (the product owner's limit for chain H11, item 2). */
export const CLOUD_CALL_BUDGET = 40;
/** Named release-day override cap granted by the product owner (ORDER H42d). */
export const RELEASE_DAY_CLOUD_CALL_BUDGET = 100;
/** UTC dates (`YYYY-MM-DD`) ruled as Doorstep release days. */
export const RELEASE_DAY_UTC_DATES: ReadonlySet<string> = new Set(["2026-11-16"]);

const RELEASE_DAY_LEDGER_RE = /e2e-cloud-on-(\d{4}-\d{2}-\d{2})-h23\.json$/;

/**
 * H20: this session's ledger is its own file; the file of the session before is kept as it was. The budget of a session that
 * has less than 40 calls is set in E2E_CLOUD_BUDGET (the order's cap less the calls made outside this counter).
 */
export function cloudCallsFile(now = new Date()): string {
  return `results/e2e-cloud-on-${now.toISOString().slice(0, 10)}-h23.json`;
}

export const CLOUD_CALLS_FILE = cloudCallsFile();

function resolveBudget(file?: string): { budget: number; capInForce: string; isReleaseDayOverride: boolean } {
  const raw = process.env["E2E_CLOUD_BUDGET"];
  const n = Number(raw);
  if (raw !== undefined && raw !== "" && Number.isInteger(n) && n >= 0) {
    return { budget: n, capInForce: "E2E_CLOUD_BUDGET", isReleaseDayOverride: false };
  }
  const matchedDate = file ? RELEASE_DAY_LEDGER_RE.exec(file)?.[1] : undefined;
  const isReleaseDay =
    process.env["DOORSTEP_RELEASE_DAY"] === "1" || (matchedDate !== undefined && RELEASE_DAY_UTC_DATES.has(matchedDate));
  if (isReleaseDay) {
    return {
      budget: RELEASE_DAY_CLOUD_CALL_BUDGET,
      capInForce: `RELEASE_DAY_CLOUD_CALL_BUDGET (${RELEASE_DAY_CLOUD_CALL_BUDGET})`,
      isReleaseDayOverride: true,
    };
  }
  return {
    budget: CLOUD_CALL_BUDGET,
    capInForce: `CLOUD_CALL_BUDGET (${CLOUD_CALL_BUDGET})`,
    isReleaseDayOverride: false,
  };
}
/** The specs that test the cloud path. Each reads the number of its own calls and checks the answer. */
export const CLOUD_PATH_SPECS = ["cloudDraft.spec.ts", "shorterReal.spec.ts", "secondReaderReal.spec.ts"];
export const REAL_CLOUD_BUNDLED_SPECS = new Set([...CLOUD_PATH_SPECS, "secondReaderLoop.spec.ts", "h51gCloudAfterDevice.spec.ts"]);
const APP_CHECK_HOST = "content-firebaseappcheck.googleapis.com";

export interface SpecEntry {
  /** real calls to generateContent made by this spec in this session */
  calls: number;
  /** test titles with their call counts */
  tests: Record<string, number>;
  /** outcome of the latest run, added by the reporter */
  outcome?: "passed" | "failed" | "skipped" | "missed";
  /** which side of R41.2 the spec is on */
  kind?: "stand-in" | "cloud-path" | "no-cloud";
}

export interface CloudCallLedger {
  date: string;
  browser: string;
  script: string;
  scriptVersion: string;
  what: string;
  budget: number;
  /** name and value of the cap in force (CLOUD_CALL_BUDGET (40), RELEASE_DAY_CLOUD_CALL_BUDGET (100), or E2E_CLOUD_BUDGET) */
  capInForce?: string;
  /** real calls to generateContent this session */
  total: number;
  /** requests to the App Check exchange host this session; not counted against the budget */
  appCheckExchanges: number;
  /** true when a request was aborted because the budget was reached */
  stoppedAtBudget: boolean;
  specs: Record<string, SpecEntry>;
}

export function emptyLedger(
  browser = "Chromium (Playwright 1.65.0 bundled, headless)",
  file?: string,
): CloudCallLedger {
  const { budget, capInForce } = resolveBudget(file);
  return {
    date: new Date().toISOString(),
    browser,
    script: "tests/e2e/fixtures/cloudCalls.ts",
    scriptVersion: "1",
    what: "Real calls to the cloud model made by the bundled real-browser specs, counted in this file, on the day in date, with the cloud switch on. Invented people only. A spec that tests the stand-in sets the stand-in and makes none.",
    budget,
    capInForce,
    total: 0,
    appCheckExchanges: 0,
    stoppedAtBudget: false,
    specs: {},
  };
}

export function readLedger(file = cloudCallsFile()): CloudCallLedger {
  const base = emptyLedger(undefined, file);
  if (!existsSync(file)) return base;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<CloudCallLedger>;
    const merged: CloudCallLedger = { ...base, ...parsed };
    const resolved = resolveBudget(file);
    if (resolved.isReleaseDayOverride) {
      merged.budget = resolved.budget;
      merged.capInForce = resolved.capInForce;
      if (merged.total < merged.budget) merged.stoppedAtBudget = false;
    } else if (!merged.capInForce) {
      merged.capInForce = resolved.capInForce;
    }
    return merged;
  } catch {
    return base;
  }
}

export function writeLedger(ledger: CloudCallLedger, file = cloudCallsFile()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(ledger, null, 2) + "\n");
}

/** Pure: count one call for a spec and test, or refuse when the budget is reached. */
export function countCall(ledger: CloudCallLedger, spec: string, title: string): { ledger: CloudCallLedger; allowed: boolean } {
  if (ledger.total >= ledger.budget) return { ledger: { ...ledger, stoppedAtBudget: true }, allowed: false };
  const entry = ledger.specs[spec] ?? { calls: 0, tests: {} };
  const next: SpecEntry = { ...entry, calls: entry.calls + 1, tests: { ...entry.tests, [title]: (entry.tests[title] ?? 0) + 1 } };
  return { ledger: { ...ledger, total: ledger.total + 1, specs: { ...ledger.specs, [spec]: next } }, allowed: true };
}

/** Checks remaining daily budget on the cloud-call ledger without advancing the counter. */
export function checkDailyCloudBudget(file = cloudCallsFile()): {
  allowed: boolean;
  remaining: number;
  ledger: CloudCallLedger;
  file: string;
} {
  const ledger = readLedger(file);
  const remaining = Math.max(0, ledger.budget - ledger.total);
  return { allowed: remaining > 0, remaining, ledger, file };
}

/** Counts one `:generateContent` call on the daily ledger before the request leaves. */
export function recordDailyCloudCall(
  spec: string,
  title: string,
  browser: string,
  file = cloudCallsFile(),
): { allowed: boolean; ledger: CloudCallLedger } {
  const before = readLedger(file);
  if (before.total >= before.budget && before.stoppedAtBudget) {
    return { allowed: false, ledger: before };
  }
  const { ledger, allowed } = countCall({ ...before, browser }, spec, title);
  writeLedger(ledger, file);
  return { allowed, ledger };
}

/** Counts one App Check exchange on the daily ledger when allowed for real-cloud runs (kept apart from the model budget). */
export function recordDailyAppCheck(file = cloudCallsFile(), spec?: string): boolean {
  if (spec !== undefined && !REAL_CLOUD_BUNDLED_SPECS.has(spec) && process.env["DOORSTEP_CLOUD_E2E"] !== "1") {
    return false;
  }
  const l = readLedger(file);
  writeLedger({ ...l, appCheckExchanges: l.appCheckExchanges + 1 }, file);
  return true;
}

const isModelCall = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.hostname === CLOUD_MODEL_HOST && u.pathname.includes(":generateContent");
  } catch {
    return false;
  }
};

/** Counts and, at the budget, blocks the calls to the cloud model made in this context. */
export async function guardCloudCalls(context: BrowserContext, spec: string, title: string, browser: string): Promise<void> {
  await context.route(
    (url) => isModelCall(url.toString()),
    async (route) => {
      const { allowed } = recordDailyCloudCall(spec, title, browser);
      if (!allowed) {
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    },
  );
  context.on("request", (r) => {
    try {
      if (new URL(r.url()).hostname !== APP_CHECK_HOST) return;
    } catch {
      return;
    }
    recordDailyAppCheck(undefined, spec);
  });
}
