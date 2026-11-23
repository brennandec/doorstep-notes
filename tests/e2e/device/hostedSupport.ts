// H28b: open the hosted page. Reads the public address from links.json.
// Reads no local config and no debug token. Never returns or logs a config value.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { openDevice, type DeviceOutcome } from "../fixtures/deviceModel";
import { hostedAddress } from "./hostedAddress";
import type { HostedWorkerReading } from "./hostedVerdicts";

const CONFIG_KEYS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"] as const;

export type HostedOpen =
  | { ok: true; session: Extract<DeviceOutcome, { ok: true }>["session"] }
  | { ok: false; reason: string; browser: string };

/** The public address, then Chrome on that origin with the cap. No local config, no debug token. */
export async function openHostedDevice(
  cap: number,
  ledger?: { spec?: string; title?: string; file?: string },
): Promise<HostedOpen> {
  let hostedPage: unknown;
  try {
    hostedPage = JSON.parse(readFileSync("docs/submission/links.json", "utf8")).hostedPage;
  } catch {
    return { ok: false, reason: "docs/submission/links.json could not be read", browser: "none" };
  }
  if (typeof hostedPage !== "string" || !/^https:\/\/[a-z0-9.-]+$/.test(hostedPage)) {
    return { ok: false, reason: "hostedPage is not a hosted address", browser: "none" };
  }
  const out = await openDevice({
    hostedOrigin: hostedPage,
    generateContentCap: cap,
    cloudLedger: {
      spec: ledger?.spec ?? "hostedRun.spec.ts",
      title: ledger?.title ?? "hosted device run",
      ...(ledger?.file ? { file: ledger.file } : {}),
    },
  });
  return out.ok ? { ok: true, session: out.session } : { ok: false, reason: out.reason, browser: out.browser };
}

export interface HostedPreflight {
  configStatus200: boolean;
  configParses: boolean;
  sixKeys: boolean;
  siteKeyServed: boolean;
  indexHtmlSha256: string;
  swJsSha256: string;
}

async function sha256Of(page: Page, path: string): Promise<string> {
  const res = await page.request.get(hostedAddress(page.url(), path));
  return createHash("sha256").update(await res.body()).digest("hex");
}

/** The worker state and build mode of the page. Used by the full run and the preflight. */
export async function readServiceWorker(page: Page): Promise<HostedWorkerReading> {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    let cachedFiles = 0;
    for (const key of await caches.keys()) cachedFiles += (await (await caches.open(key)).keys()).length;
    return {
      registered: reg !== undefined,
      active: Boolean(reg?.active),
      cachedFiles,
      note: document.getElementById("app")?.getAttribute("data-sw") ?? "not set",
      build: document.getElementById("app")?.getAttribute("data-build") ?? "not set",
    };
  });
}

/** The type of the debug token global. "undefined" is the wanted answer on the hosted page. */
export async function readDebugTokenGlobal(page: Page): Promise<string> {
  return page.evaluate(() => typeof (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown }).FIREBASE_APPCHECK_DEBUG_TOKEN);
}

/** GET the hosted config through the page. Returns booleans and two hashes, never a config value. */
export async function hostedPreflight(page: Page): Promise<HostedPreflight> {
  const res = await page.request.get(hostedAddress(page.url(), "/firebase.config.local.json"));
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
  return {
    configStatus200: res.status() === 200,
    configParses,
    sixKeys,
    siteKeyServed,
    indexHtmlSha256: await sha256Of(page, "/index.html"),
    swJsSha256: await sha256Of(page, "/sw.js"),
  };
}

export {
  assertHostedPass,
  evaluateHostedVerdicts,
  finalizeHostedOutcome,
  hostedVerdictFields,
  type HostedDeviceHalf,
  type HostedExchangeSummary,
  type HostedOutcome,
  type HostedRobotCheck,
  type HostedStepSummary,
  type HostedWorkerReading,
} from "./hostedVerdicts";
