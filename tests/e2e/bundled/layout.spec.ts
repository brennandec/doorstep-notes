// BUNDLED. shell-and-offline task 25 (R1) and task 64 (R33, P2): zone order and widths at 1440 px, stacking and the
// horizontal rule at 1000 px, boundary labels, zone 2 dashed border, darker paper and egress
// line last, zone 3 serif face and Copy, the page opens on zone 1. Serves R1.
// Also saves 07-stacked-1024.png (1024 by 768).
import { detail, expect, openInventedVisit, press, record, serveForFile, task, test } from "../fixtures/base";
import { bundledLabel, takeScreen } from "../fixtures/screens";

const site = serveForFile("dist");

test("Layout: zones, boundary and stacking", async ({ page }, info) => {
  task(info, "shell-and-offline 25");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(site.get().url);
  await expect(page.locator("[data-first-screen]")).toHaveCount(1);
  await expect(page.locator('[data-zone="note"]')).toHaveCount(0);
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");

  // R1.1 After Start a visit the first element after the status bar is the tool.
  // Its first child is the one screen heading. Zone 1 is still the note.
  const opens = await page.evaluate(() => {
    const bar = document.querySelector("header.status-bar")!;
    const next = bar.nextElementSibling!;
    const first = next.firstElementChild;
    const hero = [...document.querySelectorAll("video, [class*=hero], img")].some((node) => !node.closest("[data-device-still]"));
    return {
      nextId: next.id,
      firstTag: first?.tagName ?? "",
      firstClass: first?.className ?? "",
      firstText: first?.textContent ?? "",
      noteIsZone: next.querySelector('[data-zone="note"]') !== null,
      hasHero: hero,
    };
  });
  expect(opens).toEqual({
    nextId: "tool",
    firstTag: "H1",
    firstClass: "sr-only",
    firstText: "Your note",
    noteIsZone: true,
    hasHero: false,
  });

  // R1.2 Three zones left to right with these titles; widths 5 : 4 : 4 (R33.1).
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  const note = await box('[data-zone="note"]');
  const leaves = await box('[data-zone="leaves"]');
  const finished = await box('[data-zone="finished"]');
  await expect(page.locator('[data-zone="leaves"] h2')).toHaveText("What leaves");
  await expect(page.locator('[data-zone="finished"] h2')).toHaveText("Finished note");
  expect(note.x).toBeLessThan(leaves.x);
  expect(leaves.x).toBeLessThan(finished.x);
  // Fifth review N2 (shell-and-offline 64, P2): 5 : 4 : 4 within 3 per cent, and zone 2 at least 400 px.
  const total = note.width + leaves.width + finished.width;
  for (const [got, share] of [[note.width, 5], [leaves.width, 4], [finished.width, 4]] as const) {
    expect(Math.abs(got / total - share / 13) / (share / 13)).toBeLessThan(0.03);
  }
  expect(leaves.width).toBeGreaterThanOrEqual(400);

  // R1.3 The zone 1 line.
  await expect(page.locator('[data-zone="note"] .zone-line')).toHaveText("Everything here stays in this browser, on this device.");
  await expect(page.locator('[data-zone="note"] .zone-line')).toHaveCount(1);

  // R1.4 The vertical rule with its two labels, at the top, on the correct sides.
  const rule = await box(".boundary .rule");
  const dev = await box(".boundary .label-device");
  const cloud = await box(".boundary .label-cloud");
  const main = await box("main#tool");
  await expect(page.locator(".boundary .label-device")).toContainText("this device");
  await expect(page.locator(".boundary .label-cloud")).toContainText("the cloud");
  expect(rule.height).toBeGreaterThan(rule.width * 50);
  expect(dev.x + dev.width).toBeLessThanOrEqual(rule.x + 1);
  expect(cloud.x).toBeGreaterThanOrEqual(rule.x + rule.width - 1);
  expect(dev.y - main.y).toBeLessThan(120);
  expect(cloud.y - main.y).toBeLessThan(120);
  expect(note.x + note.width).toBeLessThanOrEqual(rule.x + 1);
  expect(rule.x + rule.width).toBeLessThanOrEqual(leaves.x + 1);

  // R1.6 Zone 2: monospace, darker paper, dashed border, the egress line is the last child.
  const z2 = await page.evaluate(() => {
    const zone = document.querySelector('[data-zone="leaves"]')!;
    const pre = zone.querySelector("pre.outgoing")!;
    const cs = getComputedStyle(pre);
    return {
      family: cs.fontFamily, background: cs.backgroundColor, border: cs.borderTopStyle,
      lastIsEgress: zone.lastElementChild?.hasAttribute("data-egress-line") === true,
      noticeBeforeSend: !!zone.querySelector("[data-send-notice]") && !!zone.querySelector("#send"),
    };
  });
  expect(z2.family).toMatch(/monospace/);
  expect(z2.background).toBe("rgb(241, 238, 230)");
  expect(z2.border).toBe("dashed");
  expect(z2.lastIsEgress).toBe(true);
  expect(z2.noticeBeforeSend).toBe(true);

  // R1.7 Zone 3: the sheet in a serif face, with soft shadow, and Copy.
  const z3 = await page.evaluate(() => {
    const sheet = document.querySelector('[data-zone="finished"] .sheet')!;
    const cs = getComputedStyle(sheet);
    return { family: cs.fontFamily, shadow: cs.boxShadow, copy: !!document.querySelector('[data-zone="finished"] #copy') };
  });
  expect(z3.family).toMatch(/Georgia/);
  expect(z3.family).toMatch(/serif/);
  expect(z3.shadow).not.toBe("none");
  expect(z3.copy).toBe(true);

  // R1.5 At 1000 px the zones stack in the same order and the boundary is a horizontal rule with the same labels.
  await page.setViewportSize({ width: 1000, height: 800 });
  const sNote = await box('[data-zone="note"]');
  const sLeaves = await box('[data-zone="leaves"]');
  const sFinished = await box('[data-zone="finished"]');
  const sBoundary = await box(".boundary");
  const sRule = await box(".boundary .rule");
  expect(sNote.y).toBeLessThan(sBoundary.y);
  expect(sBoundary.y).toBeLessThan(sLeaves.y);
  expect(sLeaves.y).toBeLessThan(sFinished.y);
  expect(Math.abs(sNote.x - sLeaves.x)).toBeLessThan(2);
  expect(Math.abs(sLeaves.x - sFinished.x)).toBeLessThan(2);
  expect(sRule.width).toBeGreaterThan(sRule.height * 50);
  await expect(page.locator(".boundary .label-device")).toBeVisible();
  await expect(page.locator(".boundary .label-cloud")).toBeVisible();
  // The device label is above the rule and the cloud label below it (the rule runs across).
  const sDev = await box(".boundary .label-device");
  const sCloud = await box(".boundary .label-cloud");
  expect(sDev.y + sDev.height).toBeLessThanOrEqual(sRule.y + 1);
  expect(sCloud.y).toBeGreaterThanOrEqual(sRule.y - 1);

  await detail(info, {
    at1440: { noteX: note.x, leavesX: leaves.x, finishedX: finished.x, noteWidth: note.width, leavesWidth: leaves.width, finishedWidth: finished.width },
    at1000: { noteY: sNote.y, boundaryY: sBoundary.y, leavesY: sLeaves.y, finishedY: sFinished.y },
    zone2: z2, zone3: z3,
  });
});

test("Screenshot: stacked at 1024 by 768", async ({ page }, info) => {
  task(info, "look-and-layout: screenshot 07");
  await page.setViewportSize({ width: 1024, height: 768 });
  await openInventedVisit(page, site.get().url);
  await expect(page.locator('[data-zone="note"]')).toBeVisible();
  const stacked = await page.evaluate(() => {
    const y = (s: string) => document.querySelector(s)!.getBoundingClientRect().top;
    return y('[data-zone="note"]') < y('[data-zone="leaves"]') && y('[data-zone="leaves"]') < y('[data-zone="finished"]');
  });
  expect(stacked).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await takeScreen(page, "07-stacked-1024", await bundledLabel(page), "BUNDLED");
});

test("The test hooks are not in the production build", async ({ page, context }, info) => {
  task(info, "egress-check 12 (production build has no hook)");
  // The production build cannot be driven through a draft with the cloud switch on and no project config,
  // and it must make no call to the cloud model. So the check reads the built scripts themselves (H11, R41.2).
  const rec = record(context);
  await page.goto(site.get().url);
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  const scripts = await page.evaluate(async () => {
    const urls = [...document.querySelectorAll("script[src]")].map((s) => (s as HTMLScriptElement).src);
    const texts: string[] = [];
    for (const u of urls) texts.push(await (await fetch(u)).text());
    return texts;
  });
  expect(scripts.length).toBeGreaterThan(0);
  const all = scripts.join("\n");
  expect(all.length).toBeGreaterThan(1000);
  for (const hook of ["__seedLeak", "__readerWho", "__rewriteTo", "__cloudStandIn"]) {
    expect(all.includes(hook), `${hook} is in the production build`).toBe(false);
  }
  // Setting the hooks has no effect on the production page: it starts the same way.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w["__seedLeak"] = "Priya Halloran";
    w["__readerWho"] = "Priya Halloran, a tenant";
    w["__cloudStandIn"] = true;
  });
  await page.reload();
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  expect(rec.requests.filter((r) => r.url.includes("firebasevertexai")).length).toBe(0);
});
