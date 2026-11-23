// DEVICE MODEL. The real-browser tasks added by the third review (owner document 2026-11-13).
//   shell-and-offline 44  Y6  docs/screens/10-whole-journey-device.png again, and 11-whole-journey-all-accepted.png
//   drafting 25           Y1  every suggestion accepted: no square-bracket tag in the finished note except for
//                             names a model added, and "Present: Maria Okonkwo-Reyes, Bea."
// Google Chrome with the built-in model, the built app, 1440 by 900, headless. One browser at a time on the profile.
// The cloud is not connected: Draft goes through the test double. Nothing here starts a download.
// Each shot is added to results/screens.json (date, browser, viewport, scroll position). The outcome of each
// check is written to results/third-review-device.json. With Chrome or the model absent: a miss with its reason.
// Invented people only.
import { expect, test, type Page } from "@playwright/test";
import { readNewestRecord } from "../fixtures/records";
import { openDevice, writeResult, type DeviceSession } from "../fixtures/deviceModel";
import { takeScreen } from "../fixtures/screens";
import { appReady, press, recordAndMask, settleShell } from "./support";

function keep(key: string, value: Record<string, unknown>, browser: string): void {
  const old = readNewestRecord("third-review-device");
  const { date: _d, time: _t, browser: _b, status: _s, ...rest } = old;
  void _d; void _t; void _b; void _s;
  const merged = { ...rest, [key]: value };
  const failed = Object.values(merged).some((v) => (v as { status?: string }).status === "fail");
  const missed = Object.values(merged).some((v) => (v as { status?: string }).status === "miss");
  writeResult("third-review-device", { status: failed ? "fail" : missed ? "miss" : "pass", ...merged }, browser);
}

/** Accept every dashed suggestion, one press each, until none is left. Returns how many were accepted. */
async function acceptAll(page: Page): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < 100; i++) {
    const left = page.locator('[data-mask-view] [data-chip="proposed"]');
    const n = await left.count();
    if (n === 0) break;
    // H50: one press changes every occurrence of the same value (src/masking/toggle.ts toggleSpan), so a
    // suggestion that appears k times leaves k fewer, not one. The run on ac8ab2d failed here: 6 expected, 3 left.
    const value = (await left.first().innerText()).trim();
    const same = (await left.allInnerTexts()).filter((t) => t.trim() === value).length;
    await left.first().click();
    accepted++;
    await expect(left).toHaveCount(n - same);
  }
  return accepted;
}

/** The invented visit: record and masks on this device with the network off, then the network back on, Draft and Send. */
async function journey(s: DeviceSession, accept: boolean): Promise<{ accepted: number; recordLabel: string; proposalLabel: string }> {
  const page = s.page;
  await page.setViewportSize({ width: 1440, height: 900 });
  await appReady(page);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
  await settleShell(page);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
  await s.context.setOffline(true);
  await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
  const labels = await recordAndMask(page);
  expect(labels.recordLabel).toBe("on this device");
  const accepted = accept ? await acceptAll(page) : 0;
  await s.context.setOffline(false);
  await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
  await press(page, "#draft");
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible({ timeout: 150_000 });
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
  return { accepted, ...labels };
}

test("Y6: 10-whole-journey-device.png again, nothing scrolled", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    keep("shot10", { status: "miss", reason: out.reason, deviceModelState: out.availability }, out.browser);
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  try {
    const j = await journey(s, false);
    await s.page.evaluate(() => window.scrollTo(0, 0));
    const shot = await takeScreen(s.page, "10-whole-journey-device", s.browser, "DEVICE MODEL");
    const inView = await s.page.evaluate(() => {
      const f = (sel: string) => {
        const n = document.querySelector(sel);
        if (!n) return "not on the page";
        const r = n.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight ? "in view" : `out of view (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)})`;
      };
      return { steps: f("[data-steps]"), firstChip: f("[data-mask-view] [data-chip]"), outgoing: f("[data-outgoing]"), egressLine: f("[data-egress-line]"), finishedNote: f('[data-zone="finished"] .sheet') };
    });
    const problems: string[] = [];
    if (shot.scrollY !== 0) problems.push(`The page was scrolled to ${shot.scrollY}.`);
    if (shot.viewport.width !== 1440 || shot.viewport.height !== 900) problems.push("The viewport was not 1440 by 900.");
    keep("shot10", { status: problems.length === 0 ? "pass" : "fail", ...(problems.length ? { reason: problems.join(" ") } : {}), file: shot.file, scrollY: shot.scrollY, viewport: shot.viewport, recordLabel: j.recordLabel, proposalLabel: j.proposalLabel, inView }, s.browser);
    expect(problems).toEqual([]);
  } catch (error) {
    keep("shot10", { status: "fail", reason: String((error as Error).message).split("\n")[0] }, s.browser);
    throw error;
  } finally {
    await s.close();
  }
});

test("Y6 and Y1: 11-whole-journey-all-accepted.png, and the finished note holds no tag it should have put back", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    keep("shot11", { status: "miss", reason: out.reason, deviceModelState: out.availability }, out.browser);
    keep("y1", { status: "miss", reason: out.reason, deviceModelState: out.availability }, out.browser);
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  try {
    const mark = s.recorder.mark();
    void mark;
    const j = await journey(s, true);
    const sheet = page.locator('[data-zone="finished"] .sheet-text');
    const noteText = (await sheet.innerText()).trim();
    const notesBlock = (await page.locator("[data-zone=\"finished\"] [data-note]").count()) > 0 ? (await page.locator("[data-zone=\"finished\"] [data-note]").allInnerTexts()).join(" | ") : "";
    const tags = [...noteText.matchAll(/\[[^\]\n]+\]/g)].map((m) => m[0]);
    // A tag may stay only if the page says a model added the name behind it.
    const unexplained = tags.filter((t) => !notesBlock.includes(t));
    const presentLine = "Present: Maria Okonkwo-Reyes, Bea.";
    const hasPresent = noteText.includes(presentLine);

    await sheet.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelector('[data-zone="finished"] .sheet')?.scrollIntoView({ block: "start" }));
    const shot = await takeScreen(page, "11-whole-journey-all-accepted", s.browser, "DEVICE MODEL");
    const sheetBox = await page.evaluate(() => {
      const r = document.querySelector('[data-zone="finished"] .sheet-text')!.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewportHeight: window.innerHeight };
    });

    const shotProblems: string[] = [];
    if (shot.viewport.width !== 1440 || shot.viewport.height !== 900) shotProblems.push("The viewport was not 1440 by 900.");
    if (sheetBox.top < 0 || sheetBox.top >= sheetBox.viewportHeight) shotProblems.push(`The finished note starts at ${sheetBox.top} px in a ${sheetBox.viewportHeight} px viewport.`);
    keep("shot11", { status: shotProblems.length === 0 ? "pass" : "fail", ...(shotProblems.length ? { reason: shotProblems.join(" ") } : {}), file: shot.file, scrollY: shot.scrollY, viewport: shot.viewport, finishedNoteBox: sheetBox, suggestionsAccepted: j.accepted }, s.browser);

    const y1Problems: string[] = [];
    if (j.accepted === 0) y1Problems.push("The device model proposed no suggestion, so nothing was accepted.");
    if (unexplained.length > 0) y1Problems.push(`The finished note holds tags the page does not explain as added by a model: ${unexplained.join(" ")}.`);
    if (!hasPresent) y1Problems.push(`The finished note does not hold the line "${presentLine}".`);
    keep("y1", { status: y1Problems.length === 0 ? "pass" : "fail", ...(y1Problems.length ? { reason: y1Problems.join(" ") } : {}), suggestionsAccepted: j.accepted, tagsInFinishedNote: tags, unexplainedTags: unexplained, addedByTheModelNotes: notesBlock, presentLineFound: hasPresent, presentLineAsWritten: (noteText.match(/Present:[^\n]*/) ?? ["no Present line"])[0], recordLabel: j.recordLabel }, s.browser);
    expect([...shotProblems, ...y1Problems]).toEqual([]);
  } catch (error) {
    keep("y1", { status: "fail", reason: String((error as Error).message).split("\n")[0] }, s.browser);
    throw error;
  } finally {
    await s.close();
  }
});
