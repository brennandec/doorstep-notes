// BUNDLED. Order H45 item 4: Firebase JS SDK issue #10635. In Playwright's bundled Chromium (no LanguageModel API)
// no ONLY_ON_DEVICE job may put any part of the note on the network. Two walks over the e2e build:
//   A  the browser as it is: no LanguageModel from page start.
//   B  the stale-state walk: a stand-in LanguageModel is there at page start (the page reads "available", the
//      structure and propose jobs run), then the API is deleted before the presses, as an extension or a policy
//      could. Without the guard the SDK would send the note to the cloud host; with it the jobs end "absent".
// Every request is recorded. The cloud hosts are also blocked at the context (abort), so a failure of the guard
// could not reach the network either. This spec makes no cloud call, never sets E2E_CLOUD_BUDGET or
// DOORSTEP_RELEASE_DAY, and does not use the cloud-call ledger (plain @playwright/test, not fixtures/base).
// Run: npm run build:e2e && npx playwright test -c tests/e2e/playwright.config.ts --project=bundled --reporter=list tests/e2e/bundled/h45OnlyOnDevice.spec.ts
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

const NAME = "Zephyra Quillfeather";
const NOTE_WORDS = ["Zephyra", "Quillfeather", "back lock", "Visited 12/11"];
const NOTE = `Visited 12/11. ${NAME} said the back lock is broken and Bea let me in.`;
// Built from parts: tests/unit/e2eCloudOn.test.ts keeps the host name out of specs that are not cloud-path specs.
const CLOUD_HOSTS = [["firebase", "vertexai"].join("") + ".googleapis.com", "generativelanguage.googleapis.com", "aiplatform.googleapis.com", "firebaseml.googleapis.com"];

interface Seen {
  url: string;
  host: string;
  method: string;
  bodyBytes: number;
  bodyHasNote: boolean;
  blocked: boolean;
}

let server: RunningServer;
test.beforeAll(async () => {
  server = await startStaticServer({ dir: "dist-e2e" });
});
test.afterAll(async () => {
  await server?.stop();
});

function nextFreeRecord(): string {
  const base = "results/only-on-device-guard-2026-11-17-h45";
  for (let n = 1; ; n++) {
    const f = n === 1 ? `${base}.json` : `${base}-${n}.json`;
    if (!existsSync(f)) return f;
  }
}

async function watch(context: BrowserContext, seen: Seen[]): Promise<void> {
  context.on("request", (r: Request) => {
    const body = r.postData() ?? "";
    seen.push({
      url: r.url().slice(0, 200),
      host: new URL(r.url()).host,
      method: r.method(),
      bodyBytes: body.length,
      bodyHasNote: NOTE_WORDS.some((w) => body.includes(w)) || NOTE_WORDS.some((w) => r.url().includes(encodeURIComponent(w))),
      blocked: false,
    });
  });
  for (const host of CLOUD_HOSTS) {
    await context.route(`**://${host}/**`, async (route) => {
      const entry = seen.find((s) => s.url === route.request().url().slice(0, 200) && !s.blocked);
      if (entry) entry.blocked = true;
      await route.abort();
    });
  }
}

async function standIn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __cloudStandIn?: boolean }).__cloudStandIn = true;
  });
}

async function fillNoteAndList(page: Page): Promise<void> {
  await page.goto(server.url);
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
  await page.locator("#client-list").fill(`${NAME}; ; she/her\nTomas Brandvold; ; he/him`);
  await page.locator("#note").fill(NOTE);
}

function summarise(seen: Seen[], origin: string) {
  const cloud = seen.filter((s) => CLOUD_HOSTS.includes(s.host));
  const outside = seen.filter((s) => !s.url.startsWith(origin) && !s.url.startsWith("data:") && !s.url.startsWith("blob:"));
  return {
    total: seen.length,
    hosts: [...new Set(seen.map((s) => s.host))],
    toCloudHosts: cloud.length,
    outsideThePageOrigin: outside.map((s) => `${s.method} ${s.host}`),
    withAnyPartOfTheNote: seen.filter((s) => s.bodyHasNote).length,
    blockedAtContext: seen.filter((s) => s.blocked).length,
  };
}

const record: Record<string, unknown> = {};

const EXAMPLE_WORDS = ["Okonkwo", "Brandvold", "Dana Whitfield", "Mould in the back bedroom"];

async function pageState(page: Page) {
  const device = (await page.locator('[data-state="device"] .state-words').innerText()).trim();
  const makeRecord = (await page.locator("#make-record").innerText()).trim();
  return { device, makeRecordLabel: makeRecord };
}

/** From the typed note, press the structure control as far as the page lets it be pressed. */
async function pressStructure(page: Page): Promise<{ label: string; pressed: boolean; note: string }> {
  const label = (await page.locator("#make-record").innerText()).trim();
  const enabled = await page.locator("#make-record").isEnabled();
  if (enabled) {
    await page.locator("#make-record").click();
    const edit = page.locator("#edit-record");
    if ((await edit.count()) > 0) await edit.click();
  }
  await page.waitForTimeout(1200);
  const note = (await page.locator('[data-zone="note"]').innerText()).replace(/\s+/g, " ").slice(0, 400);
  return { label, pressed: enabled, note };
}

/** A record by hand with the listed name in it, then the mask step: the device pass (propose-masks) runs on the record text. */
async function pressPropose(page: Page): Promise<{ maskStepEntered: boolean; line: string }> {
  // In a browser with no usable model the structure press has already opened the by-hand record.
  if ((await page.locator("[data-record]").count()) === 0) {
    const hand = page.locator("#start-by-hand");
    if ((await hand.count()) > 0) await hand.click();
    const edit = page.locator("#edit-record");
    if ((await edit.count()) > 0) await edit.click();
  }
  await expect(page.locator("[data-record]")).toBeVisible();
  await page.locator("#record-date").fill("2026-11-12");
  await page.locator("#tag-label").fill(NAME);
  await page.locator("#tag-role").selectOption("client");
  await page.locator("#add-tag").click();
  await page.locator("#record-seen").fill(`${NAME} said the back lock is broken and Bea let me in.`);
  await page.locator("#record-risks").fill("Mould in the back bedroom.");
  const mask = page.locator("#mask");
  const entered = await mask.isEnabled();
  if (entered) await mask.click();
  await page.waitForTimeout(1500);
  const line = (await page.locator("[data-mask-view]").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
  return { maskStepEntered: entered, line };
}

test("A0: the bundled Chromium as it is (LanguageModel present in a secure page, not usable): nothing leaves", async ({ page, context, browser }) => {
  const seen: Seen[] = [];
  NOTE_WORDS.push(...EXAMPLE_WORDS);
  await watch(context, seen);
  await standIn(page);
  await fillNoteAndList(page);
  const api = await page.evaluate(async () => {
    const lm = (globalThis as { LanguageModel?: { availability(o?: unknown): Promise<string> } }).LanguageModel;
    return { inGlobalThis: "LanguageModel" in globalThis, type: typeof lm, availability: lm ? await lm.availability({ expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] }).catch((e: unknown) => `threw ${String(e)}`) : null };
  });
  const state = await pageState(page);
  const structure = await pressStructure(page);
  const propose = await pressPropose(page);
  const s = summarise(seen, server.url);
  record["walkA0_asShipped"] = { browser: `Chromium ${browser.version()} (Playwright 1.65.0 bundled, headless)`, api, state, structure, propose, requests: s };
  expect(s.toCloudHosts).toBe(0);
  expect(s.withAnyPartOfTheNote).toBe(0);
  expect(s.outsideThePageOrigin).toEqual([]);
});

test("A: the LanguageModel API absent from page start (the #10635 condition): structure and propose, nothing leaves", async ({ page, context, browser }) => {
  const seen: Seen[] = [];
  NOTE_WORDS.push(...EXAMPLE_WORDS);
  await watch(context, seen);
  await standIn(page);
  await page.addInitScript(() => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
  });
  await fillNoteAndList(page);
  const hasApi = await page.evaluate(() => "LanguageModel" in globalThis);
  expect(hasApi).toBe(false);
  const state = await pageState(page);
  const structure = await pressStructure(page);
  const propose = await pressPropose(page);
  const s = summarise(seen, server.url);
  record["walkA_apiAbsentFromStart"] = { browser: `Chromium ${browser.version()} (Playwright 1.65.0 bundled, headless)`, languageModelInGlobalThis: hasApi, state, structure, propose, requests: s };
  expect(s.toCloudHosts).toBe(0);
  expect(s.withAnyPartOfTheNote).toBe(0);
  expect(s.outsideThePageOrigin).toEqual([]);
});

test("B: LanguageModel there at load, gone at call time: the SDK is reached and the guard refuses; nothing leaves", async ({ page, context, browser }) => {
  const seen: Seen[] = [];
  NOTE_WORDS.push(...EXAMPLE_WORDS);
  await watch(context, seen);
  await standIn(page);
  await page.addInitScript(() => {
    const session = { inputQuota: 6000, measureInputUsage: async () => 5, prompt: async () => '{"ok":true}', destroy() {} };
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = { availability: async () => "available", create: async () => session };
  });
  await fillNoteAndList(page);
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("not on this computer", { timeout: 20_000 });
  const stateBefore = await pageState(page);
  // The API goes away after the page has read "available".
  await page.evaluate(() => {
    delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
  });
  expect(await page.evaluate(() => "LanguageModel" in globalThis)).toBe(false);
  const structure = await pressStructure(page);
  const afterStructure = summarise(seen, server.url);
  const propose = await pressPropose(page);
  const s = summarise(seen, server.url);
  record["walkB_staleAvailableThenApiGone"] = {
    browser: `Chromium ${browser.version()} (Playwright 1.65.0 bundled, headless)`,
    languageModelAtPageStart: "stand-in: availability() 'available', create() answers the tiny probe",
    languageModelInGlobalThisAtPress: false,
    stateBefore,
    structure,
    propose,
    requestsAfterStructure: afterStructure,
    requests: s,
  };
  expect(structure.pressed).toBe(true);
  expect(structure.note).toContain("It is not on this computer.");
  expect(s.toCloudHosts).toBe(0);
  expect(s.withAnyPartOfTheNote).toBe(0);
  expect(s.outsideThePageOrigin).toEqual([]);
});

test.afterAll(() => {
  const file = nextFreeRecord();
  const body = {
    order: "H45 item 4",
    issue: "firebase-js-sdk #10635 (ONLY_ON_DEVICE falls back to the cloud when the LanguageModel API is missing)",
    date: "2026-11-17",
    headWhenRun: execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim(),
    build: "npm run build:e2e (dist-e2e), served by tests/e2e/fixtures/staticServer.ts",
    cloudCallsMade: 0,
    cloudCallsEnvVarsSet: { E2E_CLOUD_BUDGET: process.env["E2E_CLOUD_BUDGET"] ?? null, DOORSTEP_RELEASE_DAY: process.env["DOORSTEP_RELEASE_DAY"] ?? null },
    cloudHostsWatchedAndBlocked: CLOUD_HOSTS,
    noteTypedHadListedName: NAME,
    limits: [
      "Walks A0 and A: the app's own state gate (device.state() says not usable) stops both jobs before the SDK is reached, so they show the shipped behaviour, not the guard. Playwright's Chromium 158 has no LanguageModel only in an insecure page; on the localhost page it has the API with availability 'downloadable', so walk A deletes it at page start.",
      "Walk B reaches the SDK: the stand-in model made the page read 'ready', the API was deleted, and the structure press ended with the page's device-model-absent line, which only the guard's refusal produces on that path. Whether the propose-masks job also reached the SDK in walk B is not shown by this record (the mask view shows no device suggestions).",
      "The stand-in LanguageModel in walk B is a test double, not a real device model; no model output was produced.",
    ],
    walks: record,
  };
  if (Object.keys(record).length > 0) writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
});
