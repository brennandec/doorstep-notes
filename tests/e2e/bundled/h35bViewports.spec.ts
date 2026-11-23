// BUNDLED. Session H35b: what a judge sees first, in Playwright's bundled Chromium, headless, no device model.
// D1 (first fold and whole step words at 390 x 844), D7 (no overlap of the result card, 8 px on the date row) and
// the device half panel for a computer without the model. Invented people only. The built files are served for this
// file and stopped. This file writes no record into results/.
import type { Page } from "@playwright/test";
import { expect, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";

const prod = serveForFile("dist-e2e");

const SIZES = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("cold open at 390 x 844: one action button in the first fold and five whole step words", async ({ page, context }, info) => {
  task(info, "H35b D1");
  await useStandIn(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(prod.get().url);
  await expect(page.locator("[data-first-screen]")).toHaveCount(1);
  await expect(page.locator("#try-example")).toBeVisible();
  await expect(page.locator("#start-visit")).toBeVisible();
  await expect(page.locator("#make-record")).toHaveCount(0);

  const seen = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) => {
      const r = b.getBoundingClientRect();
      return !b.disabled && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    });
    const steps = document.querySelector<HTMLElement>(".first-steps")!;
    const items = [...steps.querySelectorAll<HTMLElement>("[data-first-step]")].map((s) => ({
      word: s.querySelector(".first-step-name")?.textContent?.trim() ?? "",
      right: s.getBoundingClientRect().right,
    }));
    return {
      buttons: buttons.map((b) => b.textContent?.trim()),
      scrollWidth: steps.scrollWidth,
      clientWidth: steps.clientWidth,
      items,
    };
  });
  expect(seen.buttons).toEqual(["Try an invented visit", "Start a visit"]);
  expect(seen.scrollWidth).toBeLessThanOrEqual(seen.clientWidth);
  expect(seen.items).toHaveLength(5);
  for (const item of seen.items) expect(item.right, `${item.word} ends inside the window`).toBeLessThanOrEqual(390);
  for (const word of ["Note", "Record", "Masks", "Send", "Finished"]) {
    expect(seen.items.some((i) => i.word === word), word).toBe(true);
  }
});

const overlap = (a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

async function resultCardGeometry(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const targets: Record<string, Element> = {};
    const add = (name: string, sel: string) => {
      const e = document.querySelector(sel);
      if (e) targets[name] = e;
    };
    add("draft", "#draft");
    add("send", "#send");
    add("tryListed", "#try-listed");
    add("sendNotice", "[data-send-notice]");
    add("outgoing", "pre.outgoing");
    const out: Record<string, { box: ReturnType<typeof box>; hit: boolean | null }> = {};
    for (const [name, e] of Object.entries(targets)) {
      const isButton = e.tagName === "BUTTON";
      let hit: boolean | null = null;
      if (isButton) {
        e.scrollIntoView({ block: "center" });
        const r = e.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        hit = top !== null && (top === e || e.contains(top));
      }
      out[name] = { box: box(e), hit };
    }
    window.scrollTo(0, 0);
    // Boxes are taken again with the page at the top, so every box is in the same frame.
    const frame = (name: string) => out[name] && box(targets[name]!);
    const result: Record<string, { box: ReturnType<typeof box>; hit: boolean | null }> = {};
    for (const name of Object.keys(out)) result[name] = { box: frame(name)!, hit: out[name]!.hit };
    return {
      targets: result,
      line: document.querySelector("[data-egress-line]") ? box(document.querySelector("[data-egress-line]")!) : null,
      card: document.querySelector("[data-egress-card]") ? box(document.querySelector("[data-egress-card]")!) : null,
    };
  });
}

for (const size of SIZES) {
  test(`the result card overlaps nothing before and after Send, at ${size.width} x ${size.height}`, async ({ page, context }, info) => {
    task(info, "H35b D7");
    await useStandIn(context);
    await page.setViewportSize(size);
    const origin = prod.get().url;
    const rec = record(context);
    await page.goto(origin);
    await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
    await page.locator("#start-visit").click();
    await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
    await press(page, "#try-example");
    await expect(page.locator("#make-record")).toHaveText("Use the example's record");
    await press(page, "#make-record");
    await expect(page.locator("[data-record]")).toBeVisible();
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
    await press(page, "#draft");
    // Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
    while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
    await expect(page.locator("[data-outgoing]")).toContainText("Visit date:");

    const stages: [string, Awaited<ReturnType<typeof resultCardGeometry>>][] = [["before Send", await resultCardGeometry(page)]];
    await press(page, "#send");
    await expect(page.locator("[data-egress-card]")).toBeVisible();
    stages.push(["after Send", await resultCardGeometry(page)]);

    for (const [when, g] of stages) {
      expect(g.line, `the egress line exists ${when}`).not.toBeNull();
      for (const [name, t] of Object.entries(g.targets)) {
        if (g.line) expect(overlap(g.line, t.box), `${name} and the egress line ${when}`).toBe(0);
        if (g.card) expect(overlap(g.card, t.box), `${name} and the egress card ${when}`).toBe(0);
        if (t.hit !== null) expect(t.hit, `${name} is hit at its centre ${when}`).toBe(true);
      }
      expect(Object.keys(g.targets), `Draft and Send are present ${when}`).toEqual(expect.arrayContaining(["draft", "send"]));
    }
    expect(rec.outside(origin)).toEqual([]);
  });
}

test("the date reading and its Confirm control are 8 px apart", async ({ page, context }, info) => {
  task(info, "H35b D7");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(prod.get().url);
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await press(page, "#try-example");
  await press(page, "#make-record");
  await expect(page.locator("[data-date-reading]")).toBeVisible();
  const gaps = await page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    const reading = r("[data-date-reading]");
    const confirm = r("#confirm-date");
    const correct = r("#correct-date");
    return { readingToConfirm: Math.round(confirm.left - reading.right), confirmToCorrect: Math.round(correct.left - confirm.right) };
  });
  expect(gaps.readingToConfirm).toBe(8);
  expect(gaps.confirmToCorrect).toBe(8);
});

test("with no device model the first screen has no lab-note panel and names the audience", async ({ page, context }, info) => {
  task(info, "H35b item 4");
  await useStandIn(context);
  await page.goto(prod.get().url);
  await expect(page.locator("[data-first-screen]")).toHaveCount(1);
  await expect(page.locator("[data-author-device-panel]")).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText("Listed names stay on this device.");
  const cold = await page.locator("body").innerText();
  expect(cold).not.toContain("author's computer");
  expect(cold).not.toContain("results/");
  expect(cold.toLowerCase()).not.toContain("egress");
  for (const step of ["Note", "Record", "Masks", "Send", "Finished"]) {
    await expect(page.locator(".first-steps")).toContainText(step);
  }
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await expect(page.locator("[data-author-device-panel]")).toHaveCount(0);
  await expect(page.locator("[data-audience]")).toContainText("home-visit caseworkers");
  await expect(page.locator("[data-job]")).toContainText("The egress check stops a send.");
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("author's computer");
  expect(body).not.toContain("results/");
  for (const step of ["Note", "Record", "Masks", "Send", "Finished"]) {
    await expect(page.locator("[data-steps]")).toContainText(step);
  }
});
