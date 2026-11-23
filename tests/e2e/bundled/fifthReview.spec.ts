// BUNDLED. The real-browser checks added by the fifth review (owner document 2026-11-13, acceptance P2, P3, P5).
//   shell-and-offline 64  P2  zone widths 5 : 4 : 4, zone 2 at least 400 px; stacked at 1000 px (also in layout.spec.ts)
//   shell-and-offline 67  P3  no text box hides part of its own text, online and offline, at two sizes
//   shell-and-offline 70  P5  "invented example" once in zone 1, the step line on one line, the single keep-line
// Egress-check 28 (P1) is in egress.spec.ts. Playwright's bundled Chromium, headless, no device model.
// The cloud is not connected. Invented people only.
import type { Page } from "@playwright/test";
import { collectBoxes, findCut } from "../fixtures/cutText";
import { detail, expect, openInventedVisit, press, serveForFile, task, test } from "../fixtures/base";

const site = serveForFile("dist");

async function cutOn(page: Page) {
  const boxes = await page.evaluate(collectBoxes);
  return { count: boxes.length, cut: findCut(boxes) };
}

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`P3: nothing is cut at ${size.width} x ${size.height}, online and offline`, async ({ page, context }, info) => {
    task(info, "shell-and-offline 67");
    await page.setViewportSize(size);
    await openInventedVisit(page, site.get().url);
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
    const online = await cutOn(page);
    expect(online.count).toBeGreaterThan(10);
    expect.soft(online.cut, "text hidden online").toEqual([]);

    await press(page, "#draft");
    // H35a D8: Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
    while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
    await press(page, "#send");
    await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
    const sent = await cutOn(page);
    expect.soft(sent.cut, "text hidden after a send").toEqual([]);

    await context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline");
    const notice = page.locator('[data-zone="leaves"] .offline-line');
    await expect(notice).toBeVisible();
    // The notice holds its last word.
    await expect(notice).toHaveText("Not available while you are offline.");
    const noticeBox = await notice.evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return { text: e.getBoundingClientRect().bottom, box: r.getBoundingClientRect().bottom };
    });
    expect(noticeBox.box).toBeLessThanOrEqual(noticeBox.text + 1);
    const offline = await cutOn(page);
    expect.soft(offline.cut, "text hidden offline").toEqual([]);
    await detail(info, { size, online: online.count, sent: sent.count, offline: offline.count, cutOnline: online.cut, cutSent: sent.cut, cutOffline: offline.cut });
  });
}

test("P5: the example mark stands once in zone 1, the step line is one line, and the keep-line is single", async ({ page }, info) => {
  task(info, "shell-and-offline 70");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  const zone = page.locator('[data-zone="note"]');
  expect(await zone.getByText("invented example", { exact: true }).count()).toBe(1);
  await expect(zone.locator(".zone-line")).toHaveCount(1);
  await expect(zone.locator(".zone-line")).toHaveText("Everything here stays in this browser, on this device.");
  await expect(zone.getByText("Kept in this browser only.")).toHaveCount(0);
  const steps = await page.locator("[data-steps]").evaluate((ol) => {
    const items = Array.from(ol.querySelectorAll("li")).map((li) => li.getBoundingClientRect());
    const tops = new Set(items.map((r) => Math.round(r.top)));
    return { rows: tops.size, items: items.length, width: ol.getBoundingClientRect().width, scrollWidth: ol.scrollWidth };
  });
  expect(steps.items).toBe(5);
  expect(steps.rows).toBe(1);
  expect(steps.scrollWidth).toBeLessThanOrEqual(Math.ceil(steps.width));
  await detail(info, steps);
});

test("P2: at 1440 px zone 2 is at least 400 px and the widths are 5 : 4 : 4; at 1000 px the zones are stacked in order", async ({ page }, info) => {
  task(info, "shell-and-offline 64");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(site.get().url);
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await expect(page.locator('[data-zone="finished"]')).toBeVisible();
  const width = async (z: string) => (await page.locator(`[data-zone="${z}"]`).boundingBox())!.width;
  const [a, b, c] = [await width("note"), await width("leaves"), await width("finished")];
  const total = a + b + c;
  expect(b).toBeGreaterThanOrEqual(400);
  for (const [got, share] of [[a, 5], [b, 4], [c, 4]] as const) expect(Math.abs(got / total - share / 13) / (share / 13)).toBeLessThan(0.03);
  await page.setViewportSize({ width: 1000, height: 800 });
  const y = async (z: string) => (await page.locator(`[data-zone="${z}"]`).boundingBox())!.y;
  expect(await y("note")).toBeLessThan(await y("leaves"));
  expect(await y("leaves")).toBeLessThan(await y("finished"));
  await detail(info, { at1440: { note: a, leaves: b, finished: c } });
});
