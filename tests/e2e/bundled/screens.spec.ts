// BUNDLED. The first screen and the invented visit load (1440 by 900, headless). Writes no screen (H23: the shell pictures repeated 01 and showed the no-cost notice).
import { expect, test } from "@playwright/test";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

let server: RunningServer;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.stop(); });

test("first screen and the invented visit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(server.url);
  await expect(page.locator("h1")).toHaveText("Listed names stay on this device.");
  await expect(page.locator("#try-example")).toHaveText("Try an invented visit");
  await expect(page.locator("#start-visit")).toHaveText("Start a visit");
  await expect(page.locator('[data-zone="note"]')).toHaveCount(0);
  await page.click("#try-example");
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await expect(page.locator('[data-mark="example"]')).toBeVisible();
});
