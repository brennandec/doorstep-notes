// BUNDLED. Order H40 Items 1-4: walk the no-device-model path in Chromium (dist-e2e + window.__cloudStandIn),
// across 700 x 900 and 1440 x 900 viewports via pointer click and keyboard Enter, plus returning-origin SW freshness.
import type { Page } from "@playwright/test";
import { detail, expect, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";

const prod = serveForFile("dist-e2e");

/** Clear navigator LanguageModel so the app takes the no-device-model path cleanly. */
async function noModel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "LanguageModel", { value: undefined, configurable: true, writable: true });
  });
}

async function activate(page: Page, selector: string, mode: "click" | "keyboard"): Promise<void> {
  if (mode === "click") {
    await press(page, selector);
  } else {
    const target = page.locator(selector);
    await expect(target).toBeEnabled();
    await target.focus();
    await expect(target).toBeFocused();
    await page.keyboard.press("Enter");
  }
  if (selector === "#make-record" && (await page.locator("#edit-record").count()) > 0) {
    const edit = page.locator("#edit-record");
    if (mode === "click") await edit.click();
    else {
      await edit.focus();
      await page.keyboard.press("Enter");
    }
  }
}

for (const width of [700, 1440] as const) {
  for (const mode of ["click", "keyboard"] as const) {
    test(`no-model walk (${width} x 900, ${mode}): way forward, disabled reasons, and Ask a second reader -> Send`, async ({ page, context }, info) => {
      task(info, "H40 item-1 item-2 item-3 item-4");
      await useStandIn(context);
      await noModel(page);
      await page.setViewportSize({ width, height: 900 });
      const origin = prod.get().url;
      const rec = record(context);

      await page.goto(origin);
      await expect(page.locator('[data-state="device"] .state-words')).toHaveText("not on this computer");
      await page.locator("#start-visit").click();
      await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");

      // Item 3: open no-model view clearly tells visitors what they can do without the device model.
      await expect(page.locator("[data-model-line]")).toContainText("It is not on this computer.");
      const wayForward = page.locator('[data-zone="note"] [data-model-way-forward]');
      await expect(wayForward).toBeVisible();
      const wayForwardText = (await wayForward.innerText()).replace(/\s+/g, " ").trim();
      expect(wayForwardText.length).toBeGreaterThan(20);
      expect(wayForwardText).toContain("from a note to a sent draft");
      expect(wayForwardText.toLowerCase()).not.toContain("the full flow");

      // Item 4 (cold open, no note / no record): disabled reasons are visible in page text, not hidden only in tooltips,
      // and Finished zone never shows the same sentence twice.
      const coldNote = (await page.locator('[data-zone="note"]').innerText()).replace(/\s+/g, " ");
      const coldLeaves = (await page.locator('[data-zone="leaves"]').innerText()).replace(/\s+/g, " ");
      const coldFinished = (await page.locator('[data-zone="finished"]').innerText()).replace(/\s+/g, " ");
      expect(coldNote).toContain("Add a note first.");
      expect(coldLeaves).toContain("Make or fill in the record first.");
      expect(coldLeaves).toContain("Nothing to send yet.");
      expect(coldFinished).toContain("The finished note appears here.");
      expect(coldFinished.split("The finished note appears here.").length - 1).toBe(1);
      await expect(page.locator('.reader-panel [data-control-reason]')).toContainText("Make or fill in the record first.");

      // Step 1 -> Try an invented visit.
      await activate(page, "#try-example", mode);
      await expect(page.locator('[data-mark="example"]').first()).toBeVisible();

      // Step 2 -> Use the example's record.
      await expect(page.locator("#make-record")).toHaveText("Use the example's record");
      await activate(page, "#make-record", mode);
      await expect(page.locator("[data-record]")).toBeVisible();

      // Item 4 (record open, no device model, before Draft): all three disabled reasons visible in page text.
      await expect(page.locator("#make-record")).toBeDisabled();
      await expect(page.locator("#send")).toBeDisabled();
      await expect(page.locator("#copy")).toBeDisabled();
      const openNote = (await page.locator('[data-zone="note"]').innerText()).replace(/\s+/g, " ");
      const openLeaves = (await page.locator('[data-zone="leaves"]').innerText()).replace(/\s+/g, " ");
      const openFinished = (await page.locator('[data-zone="finished"]').innerText()).replace(/\s+/g, " ");
      expect(openNote).toContain("Making the record needs the device model. You can fill in the record by hand.");
      await expect(page.locator('[data-zone="note"] [data-control-reason]')).toContainText("Making the record needs the device model. You can fill in the record by hand.");
      expect(openLeaves).toContain("Nothing to send yet.");
      expect(openFinished).toContain("The finished note appears here.");
      expect(openFinished.split("The finished note appears here.").length - 1).toBe(1);

      // Step 3 -> Draft. A Present name is already tagged, so this example does not stop.
      await activate(page, "#draft", mode);
      await expect(page.locator('[data-keep-likely="Bea"]')).toHaveCount(0);
      await expect(page.locator("[data-outgoing]")).toContainText("Visit date:");
      expect(await page.locator("[data-outgoing]").innerText()).not.toMatch(/\bBea\b/);

      // Step 4 -> Send -> Finished note rendered.
      await activate(page, "#send", mode);
      await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();

      // Step 5 -> Ask a second reader via pointer or keyboard Enter.
      await activate(page, "#ask-reader", mode);

      // (a) .reader-panel [data-reader-prepared] stands beside #ask-reader inside .reader-panel .actions,
      // AND a visible status line inside the viewport explains that the request is prepared and what to press.
      const readerPrepared = page.locator(".reader-panel .actions [data-reader-prepared]");
      await expect(readerPrepared).toBeVisible();
      await expect(readerPrepared).toHaveText("Request prepared. It is shown under What leaves. Press Send.");
      const beside = await page.evaluate(() => {
        const btn = document.getElementById("ask-reader")!.getBoundingClientRect();
        const msg = document.querySelector(".reader-panel .actions [data-reader-prepared]")!.getBoundingClientRect();
        return {
          btnRight: btn.right,
          msgLeft: msg.left,
          verticalOverlap: Math.min(btn.bottom, msg.bottom) - Math.max(btn.top, msg.top),
        };
      });
      expect(beside.msgLeft).toBeGreaterThanOrEqual(beside.btnRight - 1);
      expect(beside.verticalOverlap).toBeGreaterThan(0);

      // (b) & (c) Send is visible in viewport, focused, relabeled; [data-outgoing] is brought into view;
      // prepared status notice in What leaves is visible inside the viewport.
      const send = page.locator("#send");
      await expect(send).toHaveText("Send to the second reader");
      await expect(send).toBeFocused();
      const leavesNotice = page.locator('[data-zone="leaves"] [data-leaves-reader-prepared]');
      await expect(leavesNotice).toBeVisible();
      const leavesNoticeText = (await leavesNotice.innerText()).replace(/\s+/g, " ").trim();
      expect(leavesNoticeText).toMatch(/prepared/i);
      expect(leavesNoticeText).toContain("Send to the second reader");

      const view = await page.evaluate(() => {
        const box = (sel: string) => {
          const r = document.querySelector(sel)!.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        };
        return {
          innerHeight: window.innerHeight,
          send: box("#send"),
          outgoing: box("[data-outgoing]"),
          leavesNotice: box('[data-zone="leaves"] [data-leaves-reader-prepared]'),
        };
      });
      expect(view.send.top).toBeGreaterThanOrEqual(0);
      expect(view.send.bottom).toBeLessThanOrEqual(view.innerHeight);
      expect(view.leavesNotice.top).toBeGreaterThanOrEqual(0);
      expect(view.leavesNotice.bottom).toBeLessThanOrEqual(view.innerHeight);
      expect(view.outgoing.top).toBeGreaterThanOrEqual(0);
      expect(view.outgoing.bottom).toBeLessThanOrEqual(view.innerHeight);

      // (d) Pressing Send (or Enter directly on already-focused #send) dispatches the second-reader pass and renders guesses.
      if (mode === "keyboard") {
        await page.keyboard.press("Enter");
      } else {
        await press(page, "#send");
      }
      await expect(page.locator("[data-guess]").first()).toBeVisible();
      await expect(send).toHaveText("Send");
      await expect(leavesNotice).toHaveCount(0);
      expect(rec.outside(origin)).toEqual([]);
      await detail(info, { width, mode, wayForwardText, leavesNoticeText, view });
    });
  }
}

test("returning-origin Service Worker serves fresh network index.html when online instead of stale cached shell", async ({ page, context }, info) => {
  task(info, "H40 item-1 item-2 sw-freshness");
  await useStandIn(context);
  await noModel(page);
  const origin = prod.get().url;

  await page.goto(origin);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await page.evaluate(async () => {
    const stale = "<!doctype html><html><body><h1>STALE-SW-SHELL-H40</h1></body></html>";
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      await cache.put("/index.html", new Response(stale, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
    }
  });

  await page.goto(origin);
  await expect(page.locator("body")).not.toContainText("STALE-SW-SHELL-H40");
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await expect(page.locator("[data-model-line]")).toContainText("It is not on this computer.");
  await detail(info, { servedFreshAfterCachePoison: true });
});
