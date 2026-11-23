// DEVICE MODEL, V8. shell-and-offline task 40 (R23.1, R23.2).
// Google Chrome with the built-in model, the built app, the invented visit, 1440 by 900, headless.
//   docs/screens/08-device-record.png        the record made on this device, network off, scrolled to the record
//   docs/screens/09-device-masks.png         the masks with the device proposals, scrolled to the masks
//   docs/screens/10-whole-journey-device.png network back on, Draft and Send (cloud test double), the page at the top, nothing scrolled
// Each shot is added to results/screens.json with its date, browser, viewport and scroll position.
// Does not write results/h1.json. With Chrome or the model absent it records a miss in results/screens-device.json.
// Invented people only.
import { expect, test } from "@playwright/test";
import { openDevice, writeResult } from "../fixtures/deviceModel";
import { takeScreen } from "../fixtures/screens";
import { appReady, press, recordAbsent, recordAndMask, settleShell } from "./support";

test("V8: screenshots 08, 09 and 10 with the device model", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    recordAbsent("screens-device", out, "miss");
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  const seen: Record<string, unknown> = {};
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });

    // Record and masks with the network off, as in H1.
    await s.context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
    const labels = await recordAndMask(page);
    seen["recordLabel"] = labels.recordLabel;
    seen["proposalLabel"] = labels.proposalLabel;
    expect(labels.recordLabel).toBe("on this device");

    await page.evaluate(() => document.querySelector(".record-title")?.scrollIntoView({ block: "start" }));
    seen["08"] = await takeScreen(page, "08-device-record", s.browser, "DEVICE MODEL");
    await page.locator("[data-mask-section]").scrollIntoViewIfNeeded();
    seen["09"] = await takeScreen(page, "09-device-masks", s.browser, "DEVICE MODEL");

    // Network back on: Draft (PREFER_IN_CLOUD, the cloud test double, not connected) and Send.
    await s.context.setOffline(false);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
    await press(page, "#draft");
    await press(page, "#send");
    await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible({ timeout: 150_000 });
    await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
    await page.evaluate(() => window.scrollTo(0, 0));
    const shot10 = await takeScreen(page, "10-whole-journey-device", s.browser, "DEVICE MODEL");
    seen["10"] = shot10;
    expect(shot10.scrollY).toBe(0);
    expect(shot10.viewport).toEqual({ width: 1440, height: 900 });

    // What is in view in shot 10, recorded as seen (V3 asks for it; this file only records it).
    seen["inViewAt10"] = await page.evaluate(() => {
      const inView = (sel: string) => {
        const n = document.querySelector(sel);
        if (!n) return "not on the page";
        const r = n.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight ? "in view" : `out of view (top ${Math.round(r.top)})`;
      };
      return {
        steps: inView("[data-steps]"),
        firstChip: inView("[data-mask-view] [data-chip]"),
        outgoing: inView("[data-outgoing]"),
        egressLine: inView("[data-egress-line]"),
        finishedNote: inView('[data-zone="finished"] .sheet'),
      };
    });
    writeResult("screens-device", { status: "pass", ...seen }, s.browser);
  } catch (error) {
    writeResult("screens-device", { status: "fail", reason: String((error as Error).message).split("\n")[0], ...seen }, s.browser);
    throw error;
  } finally {
    await s.close();
  }
});
