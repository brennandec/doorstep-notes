// BUNDLED, drafting 21 (V6, rewrite part). Needs the e2e build, which has the hook for the rewrite answer
// (window.__rewriteTo; src/app/testHooks.ts). The production build has no hook. Own file: one server on port 4311 at a time.
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";

const hooked = serveForFile("dist-e2e");

test("V6 (rewrite): 'Shorter' calls the rewrite double, shows a label, and the masker runs before the sentence is replaced", async ({ page, context }, info) => {
  task(info, "drafting 21");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const rec = record(context);
  const origin = hooked.get().url;
  // The answer names the invented listed client of this visit. The masker must turn her into a tag before the sentence is replaced.
  await page.addInitScript(() => {
    (window as unknown as Record<string, string>)["__rewriteTo"] = "Maria Okonkwo-Reyes saw mould near the window.";
  });
  await openInventedVisit(page, origin);
  await press(page, "#mask");
  await press(page, "#draft");
  // A Present name is already tagged. Keep any leftover unlisted word, then Draft has gone on.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await expect(page.locator("[data-outgoing]")).toContainText("Visit date:");
  const before = await page.locator("[data-outgoing]").innerText();
  expect(before.toLowerCase()).not.toContain("maria");
  const sentence = page.locator("[data-sentence]").first();
  await expect(sentence).toBeVisible();
  const original = (await sentence.innerText()).trim();
  const requestsBefore = rec.requests.length;
  await sentence.click();
  await expect(page.locator("[data-rewrite-controls]")).toBeVisible();
  await press(page, "#rewrite-shorter");
  const result = page.locator("[data-rewrite-result]");
  await expect(result).toBeVisible();
  const label = (await result.innerText()).replace(/\s+/g, " ");
  expect(label).toMatch(/in the cloud/);
  expect(label).toMatch(/off/i);
  const after = await page.locator("[data-outgoing]").innerText();
  expect(after).not.toBe(before);
  expect(after).not.toContain(original);
  // The listed name that the double returned shows as its tag, never as the name.
  expect(after.toLowerCase()).not.toContain("maria");
  // The rewrite is followed by another item, so its own full stop is dropped when it is joined (drafting R15.6).
  expect(after).toMatch(/\[Person \d+\] saw mould near the window; Her sister was there; Letter/);
  expect(after).not.toMatch(/\.;/);
  for (const name of INVENTED_NAMES) expect(after.toLowerCase()).not.toContain(name.toLowerCase());
  // The double makes no request outside the page.
  expect(rec.outside(origin)).toEqual([]);
  expect(rec.requests.length - requestsBefore).toBe(0);
  await detail(info, { label, original, replacedWith: after.split("\n").find((l) => l.includes("saw mould")) ?? "" });
});
