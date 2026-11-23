// BUNDLED. The real-browser tasks added by the sixth review (owner document 2026-11-13, acceptance S1 to S5, S7).
//   shell-and-offline 77   S1  the built site holds THIRD-PARTY-NOTICES.txt and the footer link opens it
//   shell-and-offline 80   S4  after a send: the verdict card is above the ledger fold, the fold is closed and opens to a table, no pipe in zone 2
//   shell-and-offline 81   S7  14-send-blocked.png (13 is taken by egress.spec.ts; 10 and 11 by the device spec)
//   egress-check 34        S2  the block line, Send unavailable, the step line stopped, no request, the chip press restores Send
//   drafting 27            S5  not connected: the finished note holds exactly one mark
// Playwright's bundled Chromium, headless, 1440 by 900, no device model. The cloud is not connected, so the cloud steps use the
// test doubles. Invented people only. The built files are served on port 4311 for one file and stopped.
import { detail, expect, openInventedVisit, press, record, serveForFile, task, test } from "../fixtures/base";
import { bundledLabel, takeScreen } from "../fixtures/screens";

const prod = serveForFile("dist");

async function toDraft(page: import("@playwright/test").Page): Promise<void> {
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  // H35a D8: Draft pauses on an unlisted name-like word (Bea) until she chooses keep or mask.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await expect(page.locator("[data-outgoing]")).toBeVisible();
}

test("S1: the built site holds the notices file and the footer link opens it", async ({ page, context }, info) => {
  task(info, "shell-and-offline 77");
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = prod.get().url;
  await page.goto(origin);
  await page.locator("#start-visit").click();
  const link = page.locator("[data-notices] a");
  await expect(link).toHaveText("Third-party notices");
  const href = await link.getAttribute("href");
  expect(href).toBe("/THIRD-PARTY-NOTICES.txt");
  const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await popup.waitForLoadState("domcontentloaded");
  const url = popup.url();
  const body = await popup.locator("body").innerText();
  await popup.close();
  expect(url).toBe(`${origin}/THIRD-PARTY-NOTICES.txt`);
  expect(body.toLowerCase()).toContain("firebase");
  expect(body.length).toBeGreaterThan(10_000);
  const served = await page.request.get(`${origin}/THIRD-PARTY-NOTICES.txt`);
  expect(served.status()).toBe(200);
  await detail(info, { href, openedUrl: url, characters: body.length, status: served.status(), contentType: served.headers()["content-type"] });
});

test("S4: after a send the verdict card is above the ledger fold, the fold is closed and opens to a table, no pipe in zone 2", async ({ page }, info) => {
  task(info, "shell-and-offline 80");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, prod.get().url);
  await toDraft(page);
  await press(page, "#send");
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
  const card = page.locator("[data-egress-card]");
  const ledger = page.locator('[data-details="ledger"]');
  await expect(card).toBeVisible();
  await expect(ledger).toBeVisible();
  const cardTop = (await card.boundingBox())!.y;
  const foldTop = (await ledger.boundingBox())!.y;
  expect(cardTop).toBeLessThan(foldTop);
  expect(await ledger.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(false);
  const summary = await ledger.locator("summary").innerText();
  expect(summary).toMatch(/^Egress ledger \(\d+ entr(y|ies)\)$/);
  // Closed: the table is not shown. Open it from its summary, then read it.
  await expect(ledger.locator("table.ledger-entry").first()).toBeHidden();
  await ledger.locator("summary").click();
  expect(await ledger.evaluate((d) => (d as HTMLDetailsElement).open)).toBe(true);
  const table = ledger.locator("table.ledger-entry").first();
  await expect(table).toBeVisible();
  const labels = await table.locator("th").allInnerTexts();
  expect(labels).toEqual(["Time", "Job", "Mode", "Source", "Outcome", "Bytes", "Hash", "Off page"]);
  const zoneText = await page.locator('[data-zone="leaves"]').evaluate((z) => (z as HTMLElement).innerText + "\n" + z.textContent);
  expect(zoneText.includes("|")).toBe(false);
  await detail(info, { cardTop: Math.round(cardTop), foldTop: Math.round(foldTop), summary, tableRowLabels: labels, pipeInZone2: false });
});

test("S2: the block line, Send unavailable, the step line stopped, no request, the chip press restores Send", async ({ page, context }, info) => {
  task(info, "egress-check 34", "shell-and-offline 81");
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = prod.get().url;
  const rec = record(context);
  await openInventedVisit(page, origin);
  await toDraft(page);
  await expect(page.locator("[data-block-line]")).toHaveCount(0);
  await expect(page.locator("#send")).toBeEnabled();
  const before = rec.requests.length;

  await press(page, "#try-listed");
  const line = page.locator("[data-block-line]");
  await expect(line).toBeVisible();
  const lineText = (await line.innerText()).replace(/\s+/g, " ");
  // H35a D5 (9c4a25c): the block line holds no override control and states the listed-name count concisely.
  expect(lineText).toMatch(/^Not sent: 1 listed name is in the text\. Mask it, then send\./);
  const chips = line.locator("[data-block-chip]");
  await expect(chips).toHaveCount(1);
  const name = (await chips.first().getAttribute("data-block-chip"))!;
  await expect(page.locator("#send")).toBeDisabled();
  const stopped = page.locator('[data-step="send"]');
  await expect(stopped).toHaveAttribute("data-stopped", "");
  await expect(stopped.locator('[data-icon-name="crossedOctagon"], [data-icon="crossedOctagon"], svg').first()).toBeVisible();
  expect((await stopped.innerText()).replace(/\s+/g, " ")).toContain("Send: stopped");
  // The step line stays on one row at this width (open question of session G01).
  const rows = await page.locator("[data-steps] li").evaluateAll((items) => new Set(items.map((i) => Math.round(i.getBoundingClientRect().top))).size);
  expect(rows).toBe(1);
  // Nothing was sent while the block holds, even from a press on the disabled button.
  await page.locator("#send").click({ force: true, trial: false }).catch(() => undefined);
  expect(rec.requests.length).toBe(before);
  expect(rec.outside(origin)).toEqual([]);

  // 14-send-blocked.png: the block line, Send and the stopped step in one frame, taken at scroll 0.
  // The egress line flows under the block line while the block holds, so nothing covers the end of it (session H01).
  await page.evaluate(() => window.scrollTo(0, 0));
  const overlap = () =>
    page.evaluate(() => {
      const l = document.querySelector("[data-block-line]")!.getBoundingClientRect();
      const c = document.querySelector("[data-egress-line]")!.getBoundingClientRect();
      return { lineTop: Math.round(l.top), lineBottom: Math.round(l.bottom), cardTop: Math.round(c.top), coveredPx: Math.max(0, Math.round(l.bottom - Math.max(c.top, l.top))), windowHeight: window.innerHeight, scrollY: Math.round(window.scrollY) };
    });
  const atTop = await overlap();
  expect(atTop.scrollY).toBe(0);
  expect(atTop.coveredPx).toBe(0);
  expect(atTop.lineBottom).toBeLessThanOrEqual(atTop.windowHeight);
  const clear = atTop;
  const stepsVisible = await page.locator("[data-steps]").evaluate((e) => e.getBoundingClientRect().top >= 0);
  const shot = await takeScreen(page, "14-send-blocked", await bundledLabel(page), "BUNDLED");
  expect(shot.scrollY).toBe(0);

  // The chip masks the name again; the line goes and Send works.
  await chips.first().locator("button").click();
  await expect(page.locator("[data-block-line]")).toHaveCount(0);
  await expect(page.locator("#send")).toBeEnabled();
  await expect(page.locator('[data-step="send"]')).not.toHaveAttribute("data-stopped", "");
  expect(rec.requests.length).toBe(before);
  await detail(info, { blockedName: name, lineText, stepRowsAtOnce: rows, requestsAfterPress: rec.requests.length - before, atScrollZero: atTop, afterScroll: clear, stepsVisibleInPicture: stepsVisible, shot: { file: shot.file, scrollY: shot.scrollY, viewport: shot.viewport } });
});
