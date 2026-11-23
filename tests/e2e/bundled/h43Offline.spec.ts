// BUNDLED (Order H43 offline items A3 and C1). 0 real cloud calls.
// Uses dist-e2e and intercepts all non-origin network traffic cleanly.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { assertHostedPass, evaluateHostedVerdicts } from "../device/hostedVerdicts";
import { detail, openInventedVisit, press, record, task, useStandIn } from "../fixtures/pageHelpers";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

const INVENTED_CONFIG = readFileSync("tests/fixtures/firebase.config.invented.json", "utf8");
const FORBIDDEN_403_BODY = JSON.stringify(
  { error: { code: 403, message: "App attestation failed.", status: "PERMISSION_DENIED" } },
  null,
  2,
);

function serveForFile(dir: "dist" | "dist-e2e"): { get(): RunningServer } {
  let server: RunningServer | undefined;
  test.beforeAll(async () => {
    server = await startStaticServer({ dir });
  });
  test.afterAll(async () => {
    await server?.stop();
  });
  return { get: () => server! };
}
const site = serveForFile("dist-e2e");

/** A Present entry is already tagged. The same sentence in the note and the record is an unlisted word, not a name the record added. */
async function addUnlisted(page: Page): Promise<void> {
  const noteFold = page.locator("#fold-note");
  if ((await noteFold.count()) > 0 && (await noteFold.getAttribute("aria-expanded")) !== "true") await noteFold.click();
  const note = page.locator("#note");
  await expect(note).toBeVisible();
  await note.fill(`${await note.inputValue()}\nThen Glenda arrived.`);
  const fold = page.locator("#fold-seen");
  if ((await fold.count()) > 0 && (await fold.getAttribute("aria-expanded")) !== "true") await fold.click();
  const seen = page.locator("#record-seen");
  await expect(seen).toBeVisible();
  await seen.fill(`${await seen.inputValue()}\nThen Glenda arrived.`);
}

/** A new browser mints a new installation id, so those two request hashes differ. The byte counts stay. */
function ledgerAsideFromFreshIds(row: string): string {
  const bytes = (row.match(/Bytes\t([^\n]+)/)?.[1] ?? "").split(", ").map((part) => part.trim());
  const off = row.match(/Off page\t([^\n]+)/)?.[1] ?? "";
  const freshLengths = new Set<string>();
  for (const part of off.split("; ")) {
    if (!part.includes("firebaseinstallations.googleapis.com") && !part.includes("firebaseremoteconfig.googleapis.com")) continue;
    const n = part.match(/(\d+) bytes/)?.[1];
    if (n) freshLengths.add(n);
  }
  return row.replace(/Hash\t([^\n]+)/, (_all, hashes: string) => {
    const next = hashes.split(", ").map((hash, i) => (freshLengths.has(bytes[i] ?? "") ? "<fresh>" : hash));
    return `Hash\t${next.join(", ")}`;
  });
}

test("H43 A3: stand-in 403 refusal leaves 0 places reading connected across header, halves, reader, and draft", async ({ page, context }, info) => {
  task(info, "H43 A3");
  const origin = site.get().url;
  const externalAborted: string[] = [];
  let appCheck403Count = 0;

  await context.addInitScript(() => {
    (window as unknown as Record<string, unknown>)["FIREBASE_APPCHECK_DEBUG_TOKEN"] = "11111111-1111-4111-8111-111111111111";
  });

  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === `${origin}/firebase.config.local.json`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: INVENTED_CONFIG });
    }
    if (url.startsWith(origin)) return route.continue();
    if (url.includes("//content-firebaseappcheck.googleapis.com/")) {
      appCheck403Count += 1;
      return route.fulfill({ status: 403, contentType: "application/json", body: FORBIDDEN_403_BODY });
    }
    externalAborted.push(url.split("?")[0] ?? url);
    return route.abort();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
  await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet");

  await press(page, "#try-example");
  await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
  await press(page, "#make-record");
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();

  // First refused exchange: Second reader
  await press(page, "#ask-reader");
  await press(page, "#send");
  await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("the robot check refused this page", { timeout: 15_000 });
  await expect(page.locator("[data-halves]")).toContainText("The cloud half is standing by: the robot check refused this page");
  await expect(page.locator("[data-reader]")).toContainText("The robot check refused this page, so the second reader could not run.");

  // Second refused exchange: Draft (no device model)
  await press(page, "#draft");
  await press(page, "#send");
  await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("the robot check refused this page", { timeout: 15_000 });
  await expect(page.locator("[data-halves]")).toContainText("The cloud half is standing by: the robot check refused this page");
  await expect(page.locator('[role="alert"].error').first()).toHaveText(
    "The robot check refused this page. Press Send to try the check again. Your masked record is kept.",
  );

  const connectedPlaces = await page.evaluate(() =>
    [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && /\bconnected\b/i.test(e.textContent ?? ""))
      .map((e) => e.textContent?.trim() ?? ""),
  );
  expect(connectedPlaces).toEqual([]);
  expect(appCheck403Count).toBeGreaterThanOrEqual(2);
  await detail(info, { appCheck403Count, abortedHosts: externalAborted.length, connectedPlaces });
});

for (const withMaskFirst of [true, false]) {
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`H43 C1 (${withMaskFirst ? "after Mask" : "direct Draft"}): pressing Draft with an unlisted name undecided keeps the reason in the viewport and focuses that word at ${size.width} x ${size.height}`, async ({ page, context }, info) => {
      task(info, "H43 C1");
      await useStandIn(context);
      const rec = record(context);
      const origin = site.get().url;
      await page.setViewportSize(size);
      await openInventedVisit(page, origin);
      await addUnlisted(page);
      if (withMaskFirst) {
        await press(page, "#mask");
        await expect(page.locator('[data-likely-word="Glenda"]')).toBeVisible();
      }

      await page.locator("#draft").scrollIntoViewIfNeeded();
      await press(page, "#draft");

      const gateReason = page.locator('[data-zone="leaves"] [data-draft-reason]');
      await expect(gateReason).toBeVisible();
      await expect(gateReason).toHaveText("Mask or keep each word above, then Draft continues.");

      const geometry = await page.evaluate(() => {
        const reason = document.querySelector('[data-zone="leaves"] [data-draft-reason]')!;
        const r = reason.getBoundingClientRect();
        const active = document.activeElement;
        return {
          top: r.top,
          bottom: r.bottom,
          innerHeight: window.innerHeight,
          activeLikely: active?.getAttribute("data-likely-word") ?? null,
        };
      });

      expect(geometry.activeLikely).toBe("Glenda");
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.bottom).toBeLessThanOrEqual(geometry.innerHeight);
      expect(rec.outside(origin)).toEqual([]);
      await detail(info, geometry);
    });
  }
}

test("H43 A1.1 stand-in: separates robot-check refusal (deviceHalf pass) from page/device-half fault and throws non-zero exit", async ({ page, context }, info) => {
  task(info, "H43 A1.1");
  const origin = site.get().url;

  await context.addInitScript(() => {
    (window as unknown as Record<string, unknown>)["FIREBASE_APPCHECK_DEBUG_TOKEN"] = "11111111-1111-4111-8111-111111111111";
  });

  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url === `${origin}/firebase.config.local.json`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: INVENTED_CONFIG });
    }
    if (url.startsWith(origin)) return route.continue();
    if (url.includes("//content-firebaseappcheck.googleapis.com/")) {
      return route.fulfill({ status: 403, contentType: "application/json", body: FORBIDDEN_403_BODY });
    }
    return route.abort();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  await press(page, "#try-example");
  await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
  await press(page, "#make-record");
  await expect(page.locator("[data-record]")).toBeVisible();
  const recordLabel = (await page.locator("[data-record] .source-label").count()) > 0
    ? (await page.locator("[data-record] .source-label").first().innerText()).replace(/\s+/g, " ").trim()
    : "on this device";
  await press(page, "#mask");
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();

  await press(page, "#ask-reader");
  await press(page, "#send");
  await expect(page.locator("[data-reader-error]")).toContainText("The robot check refused this page, so the second reader could not run.", { timeout: 15_000 });
  const readerLabel = (await page.locator(".reader-source .source-label").count()) > 0
    ? (await page.locator(".reader-source .source-label").first().innerText()).replace(/\s+/g, " ").trim()
    : "not shown";

  const refusedVerdict = evaluateHostedVerdicts({
    miss: false,
    openOk: true,
    loadedReleaseMatches: true,
    serviceWorker: { registered: true, active: true, cachedFiles: 12, note: "registered", build: "production" },
    debugTokenGlobal: "undefined",
    namesDebug: false,
    refusedCount: 0,
    deviceReadySeen: true,
    scriptLoaded: true,
    exchanges: [{ path: "/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken", status: 403 }],
    modelCalls: 0,
    steps: [
      { step: 1, inferenceSource: "none", label: "Device model: ready, Cloud: connected", outsideRequests: 0 },
      { step: 2, inferenceSource: "ON_DEVICE", label: recordLabel, outsideRequests: 0 },
      { step: 3, inferenceSource: "not shown", label: readerLabel, outsideRequests: 1 },
    ],
    problems: ["step 3: the reader showed an error.", "the App Check token exchange was missing or not status 200."],
  });
  expect(refusedVerdict).toEqual({ robotCheck: "refused", deviceHalf: "pass" });
  expect(() => assertHostedPass("fail", ["the App Check token exchange was missing or not status 200."], "stand-in-refused.json")).toThrow(/did not pass/);

  // Case (b): App Check returned 200 (accepted) alongside a page / device-half fault (SW inactive + step 2 leaked)
  const faultVerdict = evaluateHostedVerdicts({
    miss: false,
    openOk: true,
    loadedReleaseMatches: true,
    serviceWorker: { registered: true, active: false, cachedFiles: 0, note: "failed", build: "production" },
    debugTokenGlobal: "undefined",
    namesDebug: false,
    refusedCount: 0,
    deviceReadySeen: false,
    scriptLoaded: true,
    exchanges: [{ path: "/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken", status: 200 }],
    modelCalls: 0,
    steps: [
      { step: 2, inferenceSource: "ON_DEVICE", label: recordLabel, outsideRequests: 1 },
    ],
    problems: ["the service worker was not active.", "step 2: 1 request(s) left the page during the device steps."],
  });
  expect(faultVerdict).toEqual({ robotCheck: "accepted", deviceHalf: "fail" });
  expect(() => assertHostedPass("fail", ["the service worker was not active."], "stand-in-fault.json")).toThrow(/did not pass/);

  // Case (c): script loaded in page but no App Check exchange or cloud step ever ran -> robotCheck "not run"
  const notRunVerdict = evaluateHostedVerdicts({
    miss: false,
    openOk: true,
    loadedReleaseMatches: true,
    serviceWorker: { registered: true, active: true, cachedFiles: 12, note: "registered", build: "production" },
    debugTokenGlobal: "undefined",
    namesDebug: false,
    refusedCount: 0,
    deviceReadySeen: true,
    scriptLoaded: true,
    exchanges: [],
    modelCalls: 0,
    steps: [
      { step: 1, inferenceSource: "none", label: "Device model: ready, Cloud: connected", outsideRequests: 0 },
      { step: 2, inferenceSource: "ON_DEVICE", label: recordLabel, outsideRequests: 0 },
    ],
    problems: [],
  });
  expect(notRunVerdict).toEqual({ robotCheck: "not run", deviceHalf: "pass" });
  await detail(info, { refusedVerdict, faultVerdict, notRunVerdict });
});

test("H43b b5: watchAppCheck403 restores original fetch and matches page request count and bytes with and without wrapper", async ({ browser }, info) => {
  task(info, "H43b b5");
  const origin = site.get().url;
  const runMeasuredFlow = async (skipAppCheckWrapper: boolean) => {
    const context = await browser.newContext();
    if (skipAppCheckWrapper) {
      await context.addInitScript(() => {
        const ref = window as unknown as Record<string, unknown>;
        ref["__skippedAppCheckWraps"] = 0;
        let currentFetch = window.fetch;
        Object.defineProperty(window, "fetch", {
          configurable: true,
          get() {
            return currentFetch;
          },
          set(fn) {
            const src = typeof fn === "function" ? String(fn) : "";
            if (src.includes("403") && !src.includes("no answer")) {
              ref["__skippedAppCheckWraps"] = Number(ref["__skippedAppCheckWraps"] ?? 0) + 1;
              return;
            }
            currentFetch = fn;
          },
        });
      });
    } else {
      await context.addInitScript(() => {
        const ref = window as unknown as Record<string, unknown>;
        ref["__initialFetch"] = window.fetch;
        ref["__appCheckWrapCount"] = 0;
        let currentFetch = window.fetch;
        Object.defineProperty(window, "fetch", {
          configurable: true,
          get() {
            return currentFetch;
          },
          set(fn) {
            const src = typeof fn === "function" ? String(fn) : "";
            if (src.includes("403") && !src.includes("no answer")) {
              ref["__appCheckWrapCount"] = Number(ref["__appCheckWrapCount"] ?? 0) + 1;
            }
            currentFetch = fn;
          },
        });
      });
    }
    await context.addInitScript(() => {
      (window as unknown as Record<string, unknown>)["FIREBASE_APPCHECK_DEBUG_TOKEN"] = "11111111-1111-4111-8111-111111111111";
    });

    const page = await context.newPage();
    const logs: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`);
    });
    const observedCloudRequests: Array<{ url: string; bytes: number }> = [];
    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "*",
    };
    await context.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      if (url === `${origin}/firebase.config.local.json`) {
        return route.fulfill({ status: 200, contentType: "application/json", body: INVENTED_CONFIG });
      }
      if (url.startsWith(origin)) return route.continue();
      if (req.method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: corsHeaders });
      }
      if (url.includes("//firebaseinstallations.googleapis.com/")) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: "application/json",
          body: JSON.stringify({ refreshToken: "install-refresh", authToken: { token: "install-auth", expiresIn: "604800s" } }),
        });
      }
      if (url.includes("//firebaseremoteconfig.googleapis.com/")) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: "application/json",
          body: JSON.stringify({ state: "NO_TEMPLATE", entries: {} }),
        });
      }
      if (url.includes("//content-firebaseappcheck.googleapis.com/")) {
        observedCloudRequests.push({ url: "appcheck", bytes: req.postDataBuffer()?.length ?? 0 });
        const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
        const now = Math.floor(Date.now() / 1000);
        const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 1800 })).toString("base64url");
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: "application/json",
          body: JSON.stringify({ token: `${header}.${payload}.sig`, ttl: "1800s" }),
        });
      }
      if (url.includes(`//${CLOUD_MODEL_HOST}/`)) {
        observedCloudRequests.push({ url: "modelCall", bytes: req.postDataBuffer()?.length ?? 0 });
        const isReader = (req.postData() ?? "").includes("Say who it could be about");
        const replyPayload = isReader
          ? JSON.stringify({
              guesses: [
                {
                  who: "household member",
                  description: "a household member",
                  why: "appears in seen",
                  kind: "place",
                  evidence: ["Mould in the back bedroom"],
                },
              ],
            })
          : "On 12/11, [Person 1] and [Person 2] were present.";
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: "application/json",
          body: JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: replyPayload }] } }] }),
        });
      }
      logs.push(`ABORTED: ${req.method()} ${url}`);
      return route.abort();
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin);
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet");
    await press(page, "#try-example");
    await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
    await press(page, "#make-record");
    await expect(page.locator("[data-record]")).toBeVisible();
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
    while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();

    await press(page, "#ask-reader");
    await press(page, "#send");
    await expect(page.locator("[data-reader]")).toContainText("bytes in", { timeout: 15_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("connected");
    expect(logs).toEqual([]);
    const readerLine = await page.locator("[data-reader]").evaluate((el) =>
      [...el.querySelectorAll("p, div, span, li")]
        .map((n) => n.textContent?.trim() ?? "")
        .find((t) => /Sent to the model:/i.test(t)) ?? "",
    );

    await press(page, "#draft");
    await press(page, "#send");
    await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible({ timeout: 15_000 });

    await page.locator("#fold-ledger").click();
    const ledgerRows = await page.locator('[data-details="ledger"] [data-ledger-entry]').allInnerTexts();
    const fetchRestored = skipAppCheckWrapper
      ? true
      : await page.evaluate(() => window.fetch === (window as unknown as Record<string, unknown>)["__initialFetch"]);
    const skippedWraps = skipAppCheckWrapper
      ? await page.evaluate(() => Number((window as unknown as Record<string, unknown>)["__skippedAppCheckWraps"] ?? 0))
      : 0;
    const appliedWraps = skipAppCheckWrapper
      ? 0
      : await page.evaluate(() => Number((window as unknown as Record<string, unknown>)["__appCheckWrapCount"] ?? 0));

    await context.close();
    return {
      readerLine,
      ledgerRows: ledgerRows.map((r) => r.trim().replace(/^Time\t[^\n]+\n/, "")),
      observedCloudRequests,
      fetchRestored,
      skippedWraps,
      appliedWraps,
    };
  };

  const withWrapper = await runMeasuredFlow(false);
  const withoutWrapper = await runMeasuredFlow(true);
  expect(withWrapper.fetchRestored).toBe(true);
  expect(withWrapper.appliedWraps).toBeGreaterThanOrEqual(2);
  expect(withoutWrapper.skippedWraps).toBeGreaterThanOrEqual(2);
  expect(withWrapper.observedCloudRequests).toEqual(withoutWrapper.observedCloudRequests);
  expect(withWrapper.observedCloudRequests.length).toBeGreaterThanOrEqual(2);
  expect(withWrapper.readerLine).toContain("bytes in");
  expect(withWrapper.readerLine).toBe(withoutWrapper.readerLine);
  expect(withWrapper.ledgerRows.map(ledgerAsideFromFreshIds)).toEqual(withoutWrapper.ledgerRows.map(ledgerAsideFromFreshIds));
  for (const row of [...withWrapper.ledgerRows, ...withoutWrapper.ledgerRows]) {
    const byteN = (row.match(/Bytes\t([^\n]+)/)?.[1] ?? "").split(", ").filter((part) => part.trim() !== "").length;
    const hashN = (row.match(/Hash\t([^\n]+)/)?.[1] ?? "").split(", ").filter((part) => /^[0-9a-f]{64}$/.test(part.trim())).length;
    expect(hashN).toBe(byteN);
  }
  await detail(info, {
    readerLine: withWrapper.readerLine,
    requestCount: withWrapper.observedCloudRequests.length,
    fetchRestored: withWrapper.fetchRestored,
    appliedWraps: withWrapper.appliedWraps,
    skippedWraps: withoutWrapper.skippedWraps,
  });
});
