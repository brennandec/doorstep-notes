// Shared parts of the DEVICE MODEL checks. Invented people only.
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { writeResult, type DeviceOutcome, type ResultBody } from "../fixtures/deviceModel";

export const SCREENS_DIR = "docs/screens";

/** Where an SDK check page lives. The page imports the Firebase SDK from these two addresses; the files come from node_modules. */
export const SDK_PAGE_PATH = "/__sdk-check.html";

export function sdkPageFiles(): { files: Record<string, string>; local: Record<string, Buffer> } {
  const version = (JSON.parse(readFileSync("node_modules/firebase/package.json", "utf8")) as { version: string }).version;
  const base = `https://www.gstatic.com/firebasejs/${version}/`;
  // The page makes the app and the AI service with a placeholder config: ONLY_ON_DEVICE makes no call to the project.
  const page = `<!doctype html><meta charset="utf-8"><title>SDK check</title><button id="go">go</button>
<script type="module">
import { initializeApp } from '${base}firebase-app.js';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from '${base}firebase-ai.js';
const app = initializeApp({ apiKey: 'placeholder-not-a-key', projectId: 'placeholder-project', appId: '1:000000000000:web:0000000000000000' });
const ai = getAI(app, { backend: new GoogleAIBackend() });
window.__generate = async (call) => {
  const t = performance.now();
  const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions: call.createOptions, promptOptions: call.promptOptions } });
  try {
    const r = await model.generateContent(call.parts);
    return { ok: true, text: r.response.text(), source: String(r.response.inferenceSource), ms: Math.round(performance.now() - t) };
  } catch (e) {
    return { ok: false, name: String(e && e.name), message: String(e && e.message).slice(0, 300), ms: Math.round(performance.now() - t) };
  }
};
window.__png = (w, h, lines) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.font = '34px Georgia';
  lines.forEach((l, i) => g.fillText(l, 20, 70 + i * 60));
  return c.toDataURL('image/png').split(',')[1];
};
window.__ready = true;
</script>`;
  const read = (name: string) => readFileSync(`node_modules/firebase/${name}`);
  return {
    files: { [SDK_PAGE_PATH]: page },
    local: { [`${base}firebase-app.js`]: read("firebase-app.js"), [`${base}firebase-ai.js`]: read("firebase-ai.js") },
  };
}

export interface GenerateCall {
  createOptions?: unknown;
  promptOptions?: unknown;
  parts: unknown;
}
export type GenerateOutcome = { ok: true; text: string; source: string; ms: number } | { ok: false; name: string; message: string; ms: number };

export async function waitForSdkPage(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, { timeout: 30000 });
  // One real press first, so the page has user activation before any model session is made.
  await page.click("#go");
}

export function generate(page: Page, call: GenerateCall): Promise<GenerateOutcome> {
  return page.evaluate((c) => (window as unknown as { __generate(c: unknown): Promise<GenerateOutcome> }).__generate(c), call);
}

/** Chrome's version number alone, from "Google Chrome 157.0.8103.79". */
export function chromeVersion(browser: string): string {
  return browser.replace(/^Google Chrome /, "");
}

/** Writes the miss (or, for H1 and H8, the failure) for a file that could not run, and says why. */
export function recordAbsent(name: string, out: Extract<DeviceOutcome, { ok: false }>, status: "miss" | "fail", extra: Record<string, unknown> = {}): string {
  const body: ResultBody = {
    status,
    reason: out.reason,
    deviceModelState: out.availability,
    ...extra,
  };
  return writeResult(name, body, out.browser);
}

/** The app is ready when the status bar has read the device model and the note zone is open. A cold open starts the visit first. */
export async function appReady(page: Page): Promise<void> {
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
  if ((await page.locator("#start-visit").count()) > 0) await press(page, "#start-visit");
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
}

/** First load of the built app: wait for the service worker, reload once so it serves the shell (as the BUNDLED install check does). */
export async function settleShell(page: Page): Promise<void> {
  const ready = await page.evaluate(
    (limitMs) =>
      new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), limitMs);
        void navigator.serviceWorker.ready.then(() => {
          clearTimeout(timer);
          resolve(true);
        });
      }),
    20_000,
  );
  if (!ready) throw new Error("the service worker was not ready within 20 s");
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await appReady(page);
}

export async function press(page: Page, selector: string): Promise<void> {
  const b = page.locator(selector);
  await expect(b).toBeEnabled();
  await b.click();
}

export function seconds(ms: number): number {
  return Math.round(ms / 100) / 10;
}

/** The invented visit to a record and masks, with the device model. Returns what was seen. */
export async function recordAndMask(page: Page): Promise<{ recordLabel: string; proposalLabel: string }> {
  await press(page, "#try-example");
  await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
  await press(page, "#make-record");
  const record = page.locator("[data-record]");
  await expect(record).toBeVisible({ timeout: 150_000 });
  const recordLabel = (await record.locator(".source-label").first().innerText()).trim();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] .mask-chip").first()).toBeVisible();
  await expect(page.locator("[data-mask-section] .source-label").first()).toBeVisible({ timeout: 150_000 });
  const proposalLabel = (await page.locator("[data-mask-section] .source-label").first().innerText()).trim();
  return { recordLabel, proposalLabel };
}

/** Draft with the network off: the app chooses ONLY_ON_DEVICE and the finished note appears at once. */
export async function deviceDraft(page: Page): Promise<{ label: string; shortLine: string; egressLine: string; textChars: number }> {
  await press(page, "#draft");
  const sheet = page.locator('[data-zone="finished"] .sheet-text');
  await expect(sheet).toBeVisible({ timeout: 150_000 });
  const label = (await page.locator('[data-zone="finished"] .source-label').first().innerText()).trim();
  const shortLine = (await page.locator("[data-short-draft]").innerText()).trim();
  const egressLine = (await page.locator(".egress-line").innerText()).replace(/\s+/g, " ").trim();
  const textChars = (await sheet.innerText()).length;
  return { label, shortLine, egressLine, textChars };
}
