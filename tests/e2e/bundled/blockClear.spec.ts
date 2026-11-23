// BUNDLED. The block line must not sit under the egress line (shell-and-offline 83, session H01).
// On the invented visit, one press on "Try to send a listed name" shows the block. At scroll 0, at 1440 x 900 and at 1280 x 800,
// the "Not sent" line and its chip must lie fully inside the viewport and must not intersect .egress-line.
// Playwright's bundled Chromium, headless, no device model. The built files are served on port 4311 for this file and stopped.
// The block words are not checked here; sixthReview.spec.ts holds them. Invented people only.
import { detail, expect, openInventedVisit, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";

const prod = serveForFile("dist-e2e");

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];

for (const size of SIZES) {
  test(`the block line and its chip are in view and clear of the egress line at ${size.width} x ${size.height}, scroll 0`, async ({ page, context }, info) => {
    task(info, "shell-and-offline 83");
    await useStandIn(context);
    await page.setViewportSize(size);
    const origin = prod.get().url;
    const rec = record(context);
    await openInventedVisit(page, origin);
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
    await press(page, "#draft");
    // H35a D8: Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
    while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
    await expect(page.locator("[data-outgoing]")).toContainText("Visit date:");
    const before = rec.requests.length;
    await press(page, "#try-listed");
    await expect(page.locator("[data-block-line]")).toBeVisible();
    await expect(page.locator("#send")).toBeDisabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);

    const m = await page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      const line = document.querySelector("[data-block-line]")!;
      const chips = [...line.querySelectorAll("[data-block-chip]")].map(box);
      const egress = box(document.querySelector(".egress-line")!);
      const lineBox = box(line);
      // Every line box of the block text, not only its outer box: a wrapped line can end below the first.
      const range = document.createRange();
      range.selectNodeContents(line);
      const rects = [...range.getClientRects()].map((r) => ({ top: r.top, bottom: r.bottom }));
      return { line: lineBox, chips, egress, rects, innerHeight: window.innerHeight };
    });
    const hits = (a: { top: number; bottom: number }, b: { top: number; bottom: number }) => a.top < b.bottom && b.top < a.bottom;
    const parts = [m.line, ...m.chips, ...m.rects];
    expect(m.chips.length).toBe(1);
    for (const p of parts) {
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.bottom).toBeLessThanOrEqual(m.innerHeight);
      expect(hits(p, m.egress)).toBe(false);
    }
    // The egress line is also fully inside the first screen while the block holds (session H02, judge: Design 4).
    expect(m.egress.top).toBeGreaterThanOrEqual(0);
    expect(m.egress.bottom).toBeLessThanOrEqual(m.innerHeight);
    // Nothing was sent while the block holds.
    // (A page asset such as an icon may still load, so the check is: no request left the served page, none carried a body.)
    const after = rec.requests.slice(before);
    expect(rec.outside(origin)).toEqual([]);
    expect(after.filter((r) => r.postData !== null || r.method !== "GET")).toEqual([]);
    await detail(info, { viewport: size, requestsAfterPress: after.map((r) => r.url), scrollY: 0, line: m.line, chips: m.chips, egressLine: m.egress, innerHeight: m.innerHeight });
  });
}
