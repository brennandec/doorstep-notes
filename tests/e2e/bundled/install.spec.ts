// BUNDLED. shell-and-offline tasks 27 and 55 (H7, L1) and masking task 16 (H7 and H6), in the production build:
//   the browser's own installability errors and manifest errors, a reload with the network off,
//   the cache holding only allowed files after a full invented-visit run, and masking offline
//   (exact, near, tap, Enter, the live region) with no device model. Fourth review L1: the page kept her
//   work across a reload with the network off, and 12-after-reload-offline.png is taken then.
import type { BrowserContext, Page } from "@playwright/test";
import { isAllowed } from "../../../scripts/swPlugin";
import { detail, expect, openHandEntryIfNeeded, openInventedVisit, press, serveForFile, task, test, useStandIn } from "../fixtures/base";
import { bundledLabel, holdScreen } from "../fixtures/screens";
import { nextRecordSuffix, writeRecord } from "../fixtures/records";

const site = serveForFile("dist-e2e");

/** First load, wait for the service worker to control the page, then reload once so it serves the shell. */
async function firstLoad(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
}

async function goOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await page.reload();
  const note = page.locator('[data-zone="note"] h2');
  const start = page.locator("#start-visit");
  await expect(note.or(start)).toBeVisible();
  if ((await start.count()) > 0) await start.click();
  await expect(note).toHaveText("Your note");
  await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline");
}

test("Installable, offline after first load, cache holds only allowed files", async ({ page, context }, info) => {
  task(info, "shell-and-offline 27", "shell-and-offline 55");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const url = site.get().url;
  await firstLoad(page, url);

  // R10.2 The browser's own report.
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  const installability = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
  const manifest = (await cdp.send("Page.getAppManifest")) as { url: string; errors: unknown[]; data?: string };
  expect(installability.installabilityErrors.map((e) => e.errorId)).toEqual([]);
  expect(manifest.errors).toEqual([]);
  expect(manifest.url).toContain("/manifest.webmanifest");
  const parsed = JSON.parse(manifest.data ?? "{}") as { name?: string; display?: string; icons?: { sizes: string }[] };
  expect(parsed.display).toBe("standalone");
  expect(parsed.icons?.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);

  // The allowed list written into sw.js at build time.
  const sw = await (await page.request.get(`${url}/sw.js`)).text();
  const allowed = JSON.parse(/const ALLOWED = (\[.*?\]);/s.exec(sw)![1]!) as string[];
  expect(allowed.length).toBeGreaterThan(3);
  for (const p of allowed) expect(isAllowed(p.slice(1)), p).toBe(true);

  // R10.3 and R27.1 (L1) The invented visit, record by hand entry, one mask added by a tap, a draft with
  // the double. Then the network is cut and the page reloaded: what she had is on the screen again.
  await press(page, "#try-example");
  await openHandEntryIfNeeded(page);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] .mask-chip.listed").first()).toBeVisible();
  await page.locator("[data-mask-view] button.word", { hasText: /^Mould$/ }).first().click();
  await expect(page.locator("[data-mask-view] .mask-chip.manual")).toHaveCount(1);
  await press(page, "#draft");
  // H35a D8: Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await expect(page.locator("[data-outgoing]")).toContainText("Visit date:");
  const before = await screenState(page);
  expect(before.chips.length).toBeGreaterThan(3);
  expect(before.outgoing.length).toBeGreaterThan(20);
  expect(before.note.length).toBeGreaterThan(20);
  expect(before.list.length).toBeGreaterThan(20);
  expect(before.step).toBe("send");

  await goOffline(context, page);
  await expect(page.locator('[data-zone="note"] .offline-line')).toContainText("You are offline.");
  await expect(page.locator("#try-example")).toHaveCount(0);
  await expect(page.locator("[data-record]")).toBeVisible();
  const after = await screenState(page);
  expect(after).toEqual(before);
  await expect(page.locator("[data-kept-line]")).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  const retake = (process.env["RETAKE_SCREENS"] ?? "").split(",").map((n) => n.trim());
  const held = retake.includes("12-after-reload-offline") ? await holdScreen(page, "12-after-reload-offline", await bundledLabel(page), "BUNDLED") : null;
  // The reload check passed up to here: write its result file (the README reads it, fourth review L1).
  writeRecord(
    "kept-reload",
    {
      date: new Date().toISOString().slice(0, 10),
      browser: await bundledLabel(page),
      status: "pass",
      check: "shell-and-offline 55 (L1): invented visit, record by hand entry, one mask added, a draft with the test double, network cut, page reloaded",
      restored: { noteChars: before.note.length, listChars: before.list.length, chips: before.chips.length, outgoingChars: before.outgoing.length, step: before.step },
      screen: "docs/screens/12-after-reload-offline.png",
    },
    process.cwd(),
    nextRecordSuffix("kept-reload"),
  );
  held?.commit();
  // Offline, masking still works on what was restored: a tap unmasks the word she masked and a second tap masks it again.
  const manual = page.locator("[data-mask-view] .mask-chip.manual");
  await manual.first().click();
  await expect(manual.first()).toHaveAttribute("aria-pressed", "false");
  await manual.first().click();
  await expect(manual.first()).toHaveAttribute("aria-pressed", "true");

  // R11.3 After a full invented-visit run (back online for the cloud step), every cached URL is on the list.
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online");
  await expect(page.locator("[data-record]")).toBeVisible();
  await expect(page.locator("[data-outgoing]")).not.toHaveText("");
  // A kept word is not stored. Send stops until each of those words is masked or kept.
  while ((await page.locator("[data-likely-word]").count()) > 0) await page.locator("[data-likely-word]").first().click();
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    return urls;
  });
  expect(cached.length).toBeGreaterThan(3);
  const stray = cached.filter((p) => !allowed.includes(p));
  expect(stray).toEqual([]);
  for (const p of cached) expect(isAllowed(p.slice(1)), p).toBe(true);
  await detail(info, { keptAcrossReloadOffline: { chips: before.chips.length, noteChars: before.note.length, listChars: before.list.length, outgoingChars: before.outgoing.length, step: before.step }, installabilityErrors: 0, manifestErrors: 0, allowedFiles: allowed.length, cachedFiles: cached.length, stray: 0 });
});

/** What is on the screen that she would lose on a reload: the note, the list, the chips, the outgoing text, the step. */
async function screenState(page: Page): Promise<{ note: string; list: string; chips: string[]; outgoing: string; step: string }> {
  // The note and the list are folded once a record exists. Open both to read them, then fold them again.
  const open = async (which: "note" | "list") => {
    const edit = page.locator(`#fold-${which}`);
    if ((await edit.getAttribute("aria-expanded")) !== "true") await edit.click();
  };
  const close = async (which: "note" | "list") => {
    const edit = page.locator(`#fold-${which}`);
    if ((await edit.getAttribute("aria-expanded")) === "true") await edit.click();
  };
  await open("note");
  await open("list");
  const note = await page.locator("#note").inputValue();
  const list = await page.locator("#client-list").inputValue();
  await close("note");
  await close("list");
  const chips = await page.locator("[data-mask-view] [data-chip]").evaluateAll((els) =>
    els.map((e) => `${e.className}|${(e.textContent ?? "").trim()}|${e.getAttribute("aria-pressed") ?? ""}`),
  );
  const outgoing = await page.locator("[data-outgoing]").innerText();
  const step = (await page.locator("[data-step][aria-current='step']").getAttribute("data-step")) ?? "";
  return { note, list, chips, outgoing, step };
}

test("Masking offline with no model: exact, near, tap, Enter and the live region", async ({ page, context }, info) => {
  task(info, "masking 16");
  const url = site.get().url;
  await firstLoad(page, url);
  await goOffline(context, page);
  await openInventedVisit(page, url).catch(async () => {
    // Offline the goto is served by the service worker; the page is already open, so press the control here.
    await press(page, "#try-example");
    await openHandEntryIfNeeded(page);
  });
  await expect(page.locator("[data-model-line]")).toContainText("It is not on this computer.");
  await press(page, "#mask");
  await expect(page.locator("[data-device-pass-line]")).toContainText("not on this computer");

  // Exact and near.
  const exact = await page.locator("[data-mask-view] .mask-chip.listed").count();
  const near = await page.locator("[data-mask-view] .mask-chip.near").count();
  expect(exact).toBeGreaterThan(0);
  expect(near).toBeGreaterThan(0);

  // Tap: a plain word becomes a masked chip, and the live region says so.
  const live = page.locator("[data-mask-view] [data-live]");
  await page.locator("[data-mask-view] button.word", { hasText: /^Mould$/ }).first().click();
  await expect(live).not.toHaveText("");
  const afterTap = await live.textContent();
  expect(await page.locator("[data-mask-view] .mask-chip.manual").count()).toBe(1);

  // Enter toggles a chip. A listed chip no longer unmasks (masking R13, U4: Enter opens its panel), so the
  // round trip uses the chip she just made by tapping: Enter unmasks it, Enter masks it again.
  const chip = page.locator("[data-mask-view] .mask-chip.manual").first();
  await chip.focus();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Enter");
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  const afterEnter = await live.textContent();
  expect(afterEnter).not.toBe("");
  expect(afterEnter).not.toBe(afterTap);
  await expect(live).toHaveAttribute("aria-live", "polite");
  // Focus stays in the record text, on the same word, so a second Enter masks it again.
  await page.keyboard.press("Enter");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  // Enter on a listed chip opens its panel; Escape closes it.
  const listed = page.locator("[data-mask-view] .mask-chip.listed").first();
  await listed.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-purpose]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-purpose]")).toHaveCount(0);
  await detail(info, { exactChips: exact, nearChips: near, announcementAfterTap: afterTap, announcementAfterEnter: afterEnter, networkOff: true });
});
