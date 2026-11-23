// BUNDLED (order H52, hosted-cloud R5). 0 real cloud calls: the App Check exchange host is forced to 403,
// every other outside request is aborted, and no token is minted. Runs on dist-e2e with the debug-token placeholder.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { detail, openInventedVisit, press, task } from "../fixtures/pageHelpers";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

const INVENTED_CONFIG = readFileSync("tests/fixtures/firebase.config.invented.json", "utf8");
const FORBIDDEN_403_BODY = JSON.stringify({ error: { code: 403, message: "App attestation failed.", status: "PERMISSION_DENIED" } });
const REFUSAL = "The robot check refused this page. Press Send to try the check again. Your masked record is kept.";

let server: RunningServer | undefined;
test.beforeAll(async () => {
  server = await startStaticServer({ dir: "dist-e2e" });
});
test.afterAll(async () => {
  await server?.stop();
});

/**
 * Where every element that carries the refusal sentence is, against the viewport, measured as it is, with no
 * scrolling by the test. Before order H52, on the live page at 390 x 844, the refusal was written 2,921 px above
 * the viewport top and the error line in the note column 2,360 px above it (bottom less than 0 in both cases), so
 * the visitor who pressed Send saw nothing change. The assertions below catch that: the copy of the sentence under
 * Send must have top >= 0 and bottom <= innerHeight.
 */
async function refusalGeometry(page: Page) {
  return page.evaluate((sentence) => {
    const all = [...document.querySelectorAll("body *")].filter((e) => e.children.length === 0 && (e.textContent ?? "").trim() === sentence);
    return {
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
      copies: all.map((e) => {
        const r = e.getBoundingClientRect();
        return { inAlert: e.closest('[role="alert"]') !== null, inRefusedLine: e.closest("[data-refused-line]") !== null, top: r.top, bottom: r.bottom };
      }),
    };
  }, REFUSAL);
}

for (const size of [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`H52: after the cloud refuses this browser, the refusal is inside the viewport with no scrolling at ${size.width} x ${size.height}`, async ({ page, context }, info) => {
    task(info, "H52 8");
    const origin = server!.url;
    let appCheck403Count = 0;
    const aborted: string[] = [];
    await context.addInitScript(() => {
      (window as unknown as Record<string, unknown>)["FIREBASE_APPCHECK_DEBUG_TOKEN"] = "11111111-1111-4111-8111-111111111111";
    });
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url === `${origin}/firebase.config.local.json`) return route.fulfill({ status: 200, contentType: "application/json", body: INVENTED_CONFIG });
      if (url.startsWith(origin)) return route.continue();
      if (url.includes("//content-firebaseappcheck.googleapis.com/")) {
        appCheck403Count += 1;
        return route.fulfill({ status: 403, contentType: "application/json", body: FORBIDDEN_403_BODY });
      }
      aborted.push(url.split("?")[0] ?? url);
      return route.abort();
    });

    await page.setViewportSize(size);
    await openInventedVisit(page, origin);
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet");
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
    while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
    await press(page, "#draft");
    await press(page, "#send");

    // Waiting for the text does not scroll. From here the test does not scroll or click.
    await expect(page.locator("[data-refused-line]")).toHaveText(REFUSAL, { timeout: 15_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("the robot check refused this page");
    const g = await refusalGeometry(page);
    await detail(info, { size, appCheck403Count, aborted: aborted.length, ...g });

    expect(appCheck403Count).toBeGreaterThanOrEqual(1);
    expect(g.copies.some((c) => c.inRefusedLine)).toBe(true);
    const inView = g.copies.filter((c) => c.top >= 0 && c.bottom <= g.innerHeight);
    expect(inView.length, `no copy of the refusal is inside the viewport: ${JSON.stringify(g.copies)}`).toBeGreaterThan(0);
    // The line beside Send is what the visitor is looking at, and it is inside the viewport. The alert in the note
    // column is a different place (about 2,400 px away at 390 x 844) and is not asserted; its place is in the detail.
    for (const c of g.copies.filter((x) => x.inRefusedLine)) {
      expect(c.top, "top of the line beside Send").toBeGreaterThanOrEqual(0);
      expect(c.bottom, "bottom of the line beside Send").toBeLessThanOrEqual(g.innerHeight);
    }
    // Not an alert, and no focus taken from where the visitor was.
    expect(await page.locator("[data-refused-line]").getAttribute("role")).toBe("status");
    expect(await page.evaluate(() => document.activeElement?.closest('[role="alert"], [data-refused-line]') ?? null)).toBeNull();
  });
}

test("H52: a cloud answer changes the first-paint state to connected", async ({ page, context }, info) => {
  task(info, "H52 8");
  const origin = server!.url;
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "*",
  };
  await context.addInitScript(() => {
    (window as unknown as Record<string, unknown>)["FIREBASE_APPCHECK_DEBUG_TOKEN"] = "11111111-1111-4111-8111-111111111111";
  });
  await context.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url === `${origin}/firebase.config.local.json`) return route.fulfill({ status: 200, contentType: "application/json", body: INVENTED_CONFIG });
    if (url.startsWith(origin)) return route.continue();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.includes("//content-firebaseappcheck.googleapis.com/")) {
      const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + 1800 })).toString("base64url");
      return route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ token: `${header}.${payload}.sig`, ttl: "1800s" }),
      });
    }
    if (url.includes(`//${CLOUD_MODEL_HOST}/`)) {
      const reply = JSON.stringify({
        guesses: [{ who: "household member", description: "a household member", why: "appears in seen", kind: "place", evidence: ["Mould in the back bedroom"] }],
      });
      return route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: reply }] } }] }),
      });
    }
    return route.abort();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, origin);
  await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet");
  await press(page, "#mask");
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await press(page, "#ask-reader");
  await press(page, "#send");
  await expect(page.locator("[data-reader]")).toContainText("bytes in", { timeout: 15_000 });
  await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("connected");
  await detail(info, { cloud: "connected" });
});
