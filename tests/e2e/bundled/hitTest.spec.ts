// BUNDLED. No control hidden under the egress line (shell-and-offline 86, session H12; R42).
// Before and after "Shorter" has run through the e2e build's rewrite hook (no call to the cloud model), a point at the
// centre of #draft and of #send must hit that button, at 1440 x 900 and at 1280 x 800, with the page at the top.
// The egress line stays the last child of zone 2 and never folds. Playwright's bundled Chromium, headless, no device
// model. Invented people only. The built files are served on port 4311 for this file and stopped.
import type { Page } from "@playwright/test";
import { detail, expect, openInventedVisit, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";
import { nextRecordSuffix, readNewestRecord, writeRecord } from "../fixtures/records";

const prod = serveForFile("dist-e2e");
const SUFFIX = nextRecordSuffix("hit-test");

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];

async function hitTest(page: Page): Promise<Record<string, { inViewport: boolean; ok: boolean; hit: string }>> {
  return page.evaluate(() => {
    window.scrollTo(0, 0);
    const out: Record<string, { inViewport: boolean; ok: boolean; hit: string }> = {};
    for (const id of ["draft", "send"]) {
      const b = document.getElementById(id)!;
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      out[id] = {
        inViewport: x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight,
        ok: top !== null && (top === b || b.contains(top)),
        hit: top ? `${top.tagName.toLowerCase()}${top.id ? "#" + top.id : ""}` : "null",
      };
    }
    return out;
  });
}

for (const size of SIZES) {
  test(`Draft and Send are not under the egress line, before and after Shorter, at ${size.width} x ${size.height}`, async ({ page, context }, info) => {
    task(info, "shell-and-offline 86");
    await useStandIn(context);
    await page.addInitScript(() => {
      (window as unknown as Record<string, string>)["__rewriteTo"] = "Mould near the window";
    });
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

    const before = await hitTest(page);
    await page.locator("[data-sentence]").first().click();
    await press(page, "#rewrite-shorter");
    await expect(page.locator("[data-rewrite-result]")).toBeVisible();
    const after = await hitTest(page);
    await detail(info, { viewport: size, before, after });
    // The record of this run, one entry per size, in a new dated file (never an older one); the sizes of this run are merged in.
    const old = readNewestRecord("hit-test", process.cwd()) as { sizes?: Record<string, unknown> };
    const sizes = { ...(old.sizes ?? {}), [`${size.width}x${size.height}`]: { before, after } };
    writeRecord("hit-test", { date: new Date().toISOString(), browser: `Chromium ${page.context().browser()!.version()} (Playwright 1.65.0 bundled, headless)`, what: "elementFromPoint at the centre of #draft and #send, page at the top, before and after Shorter (rewrite hook, no cloud call). Invented visit.", sizes }, process.cwd(), SUFFIX);

    for (const [when, hit] of [["before Shorter", before], ["after Shorter", after]] as const) {
      for (const id of ["draft", "send"]) {
        expect(hit[id]!.inViewport, `#${id} centre is inside the window ${when}`).toBe(true);
        expect(hit[id]!.ok, `#${id} ${when} is covered by ${hit[id]!.hit}`).toBe(true);
      }
    }

    // The egress line is the last child of zone 2 and never folds.
    const shape = await page.evaluate(() => {
      const line = document.querySelector(".egress-line")!;
      const zone = line.closest("[data-zone]")!;
      return { last: zone.lastElementChild === line, zone: zone.getAttribute("data-zone"), inDetails: line.closest("details") !== null };
    });
    expect(shape.zone).toBe("leaves");
    expect(shape.last).toBe(true);
    expect(shape.inDetails).toBe(false);
    expect(rec.outside(origin)).toEqual([]);
  });
}
