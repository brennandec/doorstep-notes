// BUNDLED. drafting 27 (S5, sixth review): not connected, the finished note holds exactly one mark.
// With AI_SERVICE_ENABLED true this check sets the stand-in explicitly (H11, shell-and-offline R41.2), on the
// e2e build, so the draft is the test double and no call to the cloud model is made. It was in sixthReview.spec.ts.
// Playwright's bundled Chromium, headless, 1440 by 900, no device model. Invented people only.
// The built files are served on port 4311 for one file and stopped.
import { detail, expect, openInventedVisit, press, serveForFile, task, test, useStandIn } from "../fixtures/base";

const site = serveForFile("dist-e2e");

test("S5: not connected, the finished note holds exactly one mark, with the words of the review", async ({ page, context }, info) => {
  task(info, "drafting 27");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  // H35a D8: Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await expect(page.locator("[data-outgoing]")).toContainText("Visit date:");
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();
  const sheet = page.locator('[data-zone="finished"] [data-sheet]');
  const marks = sheet.locator("[data-source]");
  await expect(marks).toHaveCount(1);
  await expect(marks.first()).toHaveAttribute("data-source", "test-double");
  const words = (await marks.first().innerText()).trim();
  expect(words).toBe("names put back on this device; draft text is a fixed sample: cloud off");
  const sheetLabels = (await sheet.locator(".source-label").allInnerTexts()).map((t) => t.trim());
  expect(sheetLabels).toEqual(["names put back on this device; draft text is a fixed sample: cloud off"]);
  expect(await sheet.locator(".source-label.cloud").count()).toBe(0);
  await detail(info, { marks: sheetLabels });
});
