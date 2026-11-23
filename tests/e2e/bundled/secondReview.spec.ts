// BUNDLED. The real-browser tasks added by the second review (owner document 2026-11-13, acceptance V3 to V6).
//   shell-and-offline 35    V3  the whole journey in view at 1440 x 900
//   masking 19              V4  "Send this name on purpose" lives on a pressed listed chip
//   masking 24              V5  no device model: the line about likely names, one press masks "Bea"
//   drafting 21             V6  "Shorter" calls the rewrite job (test double), label, masker first
//   egress-check 21         V6  the ledger fold after a send, no save control
// Playwright's bundled Chromium, headless, no device model. The cloud is not connected: cloud steps use the test double.
// The e2e build (dist-e2e) is used only where a test hook is needed (the rewrite answer). Invented people only.
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";

/** The path with no device model: Mask, Draft (keeping Bea, H35a D8), Send. Returns once the finished note shows. */
async function runToFinished(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();
}

const site = serveForFile("dist-e2e");

test("V3: after hand entry and a send, the journey is in view together at 1440 by 900", async ({ page, context }, info) => {
  task(info, "shell-and-offline 35");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await runToFinished(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  const seen = await page.evaluate(() => {
    const box = (sel: string) => {
      const n = document.querySelector(sel);
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) };
    };
    const note = document.querySelector('[data-zone="finished"] .sheet-text');
    const lineHeight = note ? parseFloat(getComputedStyle(note).lineHeight) : 0;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollY: window.scrollY,
      steps: box("[data-steps]"),
      chip: box("[data-mask-view] [data-chip]"),
      outgoing: box("[data-outgoing]"),
      // H35b D7 (25c3d77): the full egress section flows below the controls; its verdict stays in view at 1440 x 900.
      egress: box("[data-egress-line] .egress-verdict"),
      finished: box('[data-zone="finished"] .sheet-text'),
      finishedLineHeight: lineHeight,
    };
  });
  type Box = { top: number; bottom: number; left: number; right: number } | null;
  const outOfView: string[] = [];
  const inside = (b: Box, name: string) => {
    if (b === null) return void outOfView.push(`${name}: not on the page`);
    if (b.top < 0 || b.bottom > seen.viewport.height || b.left < 0 || b.right > seen.viewport.width)
      outOfView.push(`${name}: top ${b.top}, bottom ${b.bottom} (viewport height ${seen.viewport.height})`);
  };
  expect(seen.viewport).toEqual({ width: 1440, height: 900 });
  expect(seen.scrollY).toBe(0);
  inside(seen.steps, "five-step line");
  inside(seen.chip, "first chip");
  inside(seen.outgoing, "outgoing text");
  inside(seen.egress, "egress line");
  // The finished note may be longer than the screen; its first two lines must be in view.
  const f = seen.finished;
  if (f === null || f.top < 0 || f.top + seen.finishedLineHeight * 2 > seen.viewport.height) outOfView.push(`first lines of the finished note: top ${f?.top}`);
  await detail(info, { ...seen, outOfView });
  expect(outOfView).toEqual([]);
});

test("V4: 'Send this name on purpose' is not in the document until a listed chip is pressed", async ({ page }, info) => {
  task(info, "masking 19");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await press(page, "#mask");
  // The invented visit gives two listed chips (Maria twice) and one near chip (Tomas). All three open the panel.
  const listed = page.locator('[data-mask-view] .mask-chip[aria-haspopup="true"]');
  await expect(listed.first()).toBeVisible();
  const count = await listed.count();
  expect(count).toBeGreaterThanOrEqual(3);
  expect(await page.locator("[data-mask-view] .mask-chip.listed").count()).toBeGreaterThanOrEqual(1);
  const phrase = "Send this name on purpose";
  expect(await page.locator("body").innerText()).not.toContain(phrase);
  expect(await page.locator("[data-purpose]").count()).toBe(0);

  const first = page.locator("[data-mask-view] .mask-chip.listed").first();
  await first.click();
  await expect(page.getByText(phrase)).toBeVisible();
  expect(await page.locator("[data-purpose]").count()).toBe(1);
  await expect(first).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-purpose]")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(phrase);
  await expect(first).toHaveAttribute("aria-expanded", "false");
  const focusIsChip = await page.evaluate(() => {
    const a = document.activeElement;
    return !!a && a.classList.contains("mask-chip") && a.getAttribute("data-chip") === "listed";
  });
  expect(focusIsChip).toBe(true);
  await detail(info, { listedChips: count });
});

test("V5: no device model, the likely-names line lists Bea and one press masks her", async ({ page }, info) => {
  task(info, "masking 24");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  const state = await page.evaluate(async () => {
    const lm = (globalThis as { LanguageModel?: { availability(): Promise<string> } }).LanguageModel;
    return lm ? lm.availability() : "no LanguageModel object";
  });
  expect(state).not.toBe("available");
  await press(page, "#mask");
  const line = page.locator("[data-likely-line]");
  await expect(line).toBeVisible();
  const before = (await line.innerText()).replace(/\s+/g, " ");
  expect(before).toContain("Bea");
  expect(before).toContain("This is a guess by capital letters.");
  await expect(page.locator('[data-likely-word="Bea"]')).toBeVisible();

  // One press on her word, then Draft: the outgoing text holds no "Bea".
  await page.locator('[data-likely-word="Bea"]').click();
  await press(page, "#draft");
  const after = await page.locator("[data-outgoing]").innerText();
  expect(after).not.toMatch(/\bBea\b/);
  for (const name of INVENTED_NAMES) expect(after.toLowerCase()).not.toContain(name.toLowerCase());
  const lineAfter = (await page.locator("[data-likely-line]").count()) > 0 ? ((await page.locator("[data-likely-line]").innerText()).replace(/\s+/g, " ")) : "";
  expect(lineAfter).not.toContain("Bea");
  await detail(info, { deviceModelState: state, lineBefore: before, lineAfter, outgoingHasBea: /\bBea\b/.test(after) });
});

test("V6 (ledger): after a send, the ledger fold shows its entries as text and has no save control", async ({ page, context }, info) => {
  task(info, "egress-check 21");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const rec = record(context);
  const origin = site.get().url;
  await openInventedVisit(page, origin);
  await runToFinished(page);
  // Since the sixth review the ledger is a closed fold with one small table for each entry (shell-and-offline R39).
  await page.locator("#fold-ledger").click();
  await expect(page.locator('[data-details="ledger"] button')).toHaveCount(0);
  const entries = await page.locator("[data-ledger-entries]").innerText();
  expect(entries.trim().length).toBeGreaterThan(0);
  expect(entries).not.toMatch(/Maria|Bea|Priya/);
  const explain = await page.locator(".ledger-explain").innerText();
  expect(explain).toContain("Kept on this device");
  // The fold makes no request outside the page.
  await detail(info, { entries, explain, requestsOutsideThePage: rec.outside(origin).length });
});
