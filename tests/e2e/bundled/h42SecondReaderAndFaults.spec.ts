// BUNDLED (Order H42 N2): Fault A (Second Reader reads the rewritten masked record and
// quote chips mask rewritten words for both Reader and Draft), Fault B (skipped rewrites
// surfaced beside What leaves, cleared Sentence replaced, and restored on unmask), and
// zero outside calls under useStandIn. Needs dist-e2e (npm run build:e2e).
import { expect, openInventedVisit, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";

const hooked = serveForFile("dist-e2e");

test("H42 Fault A (F1, F3): Second Reader and Draft share rewritten masked record and quote chips mask rewritten words", async ({ page, context }, info) => {
  task(info, "second-reader H42 F1", "second-reader H42 F3");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const rec = record(context);
  const origin = hooked.get().url;
  await page.addInitScript(() => {
    (window as unknown as Record<string, string>)["__rewriteTo"] = "Damp spot in the rear hallway.";
  });

  await openInventedVisit(page, origin);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await press(page, "#draft");
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();

  const outgoing = page.locator("[data-outgoing]");
  await expect(outgoing).toContainText("Mould in the back bedroom");
  const target = page.locator("[data-outgoing] [data-sentence]").filter({ hasText: "back bedroom" }).first();
  await target.click();
  await expect(page.locator("[data-rewrite-controls]")).toBeVisible();
  await press(page, "#rewrite-shorter");
  await expect(page.locator("[data-rewrite-result]")).toBeVisible();
  await expect(outgoing).toContainText("Damp spot in the rear hallway");
  await expect(outgoing).not.toContainText("back bedroom");

  // Ask a second reader: Pass 1 What leaves holds the rewritten sentence and Reader quotes from it.
  await press(page, "#ask-reader");
  await expect(page.locator("[data-reader-prepared]")).toBeVisible();
  await expect(outgoing).toContainText("Damp spot in the rear hallway");
  await expect(outgoing).not.toContainText("back bedroom");
  await press(page, "#send");
  await expect(page.locator("[data-reader-pass]")).toBeVisible();

  const quoteChip = page.locator('[data-reader] button[data-quote="Damp spot in the rear hallway"]').first();
  await expect(quoteChip).toBeVisible();
  await quoteChip.click();
  await expect(page.locator('[data-reader] button[data-quote="Damp spot in the rear hallway"][aria-pressed="true"]')).toHaveCount(1);

  // Ask again (Pass 2) masks the quoted words inside the rewritten sentence.
  await press(page, "#ask-reader");
  await expect(outgoing).toContainText("[Detail 1]");
  await expect(outgoing).not.toContainText("Damp spot in the rear hallway");
  await expect(outgoing).not.toContainText("back bedroom");
  await press(page, "#send");
  await expect(page.locator("#ask-reader")).toBeEnabled();

  // Switching back to Draft keeps both the rewrite and the reader quote mask.
  await press(page, "#draft");
  await expect(outgoing).toContainText("[Detail 1]");
  await expect(outgoing).not.toContainText("Damp spot in the rear hallway");
  await expect(outgoing).not.toContainText("back bedroom");
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();

  expect(rec.outside(origin)).toEqual([]);
});

test("H42 Fault B (F2) + Item 4: masking then unmasking inside rewritten target surfaces skipped=1, clears Sentence replaced, then restores rewrite", async ({ page, context }, info) => {
  task(info, "drafting H42 F2");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const rec = record(context);
  const origin = hooked.get().url;
  await page.addInitScript(() => {
    (window as unknown as Record<string, string>)["__rewriteTo"] = "Damp spot by the rear frame.";
  });

  await openInventedVisit(page, origin);
  await press(page, "#mask");
  await press(page, "#draft");
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();

  const outgoing = page.locator("[data-outgoing]");
  await page.locator("[data-outgoing] [data-sentence]").filter({ hasText: "back bedroom" }).first().click();
  await press(page, "#rewrite-shorter");
  await expect(page.locator("[data-rewrite-result]")).toBeVisible();
  await expect(page.locator("[data-rewrite-skipped]")).toHaveCount(0);
  await expect(outgoing).toContainText("Damp spot by the rear frame");

  // Mask "bedroom" in Zone 1 to invalidate the stored rewrite target -> Fault B status line + cleared result.
  await press(page, "#mask");
  const bedroomWord = page.locator("[data-mask-text] button.word").filter({ hasText: /^bedroom$/i }).first();
  await expect(bedroomWord).toBeVisible();
  await bedroomWord.click();

  const skipped = page.locator('[data-zone="leaves"] [data-rewrite-skipped]');
  await expect(skipped).toBeVisible();
  await expect(skipped).toContainText("1");
  await expect(page.locator("[data-rewrite-result]")).toHaveCount(0);
  await expect(outgoing).not.toContainText("Damp spot by the rear frame");

  // Unmask the manual chip again -> skipped returns to 0 and the rewritten sentence comes back.
  const manualChip = page.locator('[data-mask-text] [data-chip="manual"]').last();
  await expect(manualChip).toBeVisible();
  await manualChip.click();

  await expect(skipped).toHaveCount(0);
  await expect(outgoing).toContainText("Damp spot by the rear frame");
  expect(rec.outside(origin)).toEqual([]);
});
