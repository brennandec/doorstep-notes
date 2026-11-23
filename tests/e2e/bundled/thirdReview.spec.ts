// BUNDLED. The real-browser task added by the third review (owner document 2026-11-13, acceptance Y5).
//   shell-and-offline 43    Y5  at 1440 x 900 with a record present, the first chip is inside the viewport
// Playwright's bundled Chromium, headless, no device model. The record comes from hand entry with the invented visit.
// The cloud is not connected. Invented people only.
import { detail, expect, openInventedVisit, press, serveForFile, task, test } from "../fixtures/base";

const site = serveForFile("dist");

test("Y5: with a record present at 1440 by 900, the first chip is inside the viewport", async ({ page }, info) => {
  task(info, "shell-and-offline 43");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  const chip = page.locator("[data-mask-view] [data-chip]").first();
  await expect(chip).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  const seen = await page.evaluate(() => {
    const n = document.querySelector("[data-mask-view] [data-chip]");
    const r = n ? n.getBoundingClientRect() : null;
    return {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      scrollY: Math.round(window.scrollY),
      firstChipTop: r ? Math.round(r.top) : null,
      firstChipBottom: r ? Math.round(r.bottom) : null,
    };
  });
  await detail(info, seen);
  expect(seen.viewportWidth).toBe(1440);
  expect(seen.viewportHeight).toBe(900);
  expect(seen.scrollY).toBe(0);
  expect(seen.firstChipTop).not.toBeNull();
  expect(seen.firstChipTop!).toBeGreaterThanOrEqual(0);
  expect(seen.firstChipBottom!).toBeLessThanOrEqual(seen.viewportHeight);
});
