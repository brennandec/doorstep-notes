// BUNDLED. Session H35a in a real browser: Playwright's bundled Chromium, headless, no model weights, the production
// build with no Firebase config (the cloud is not configured, so no cloud call can be made). Invented people only.
//   D3  #get-model and #make-record never show "ready" without a model session, and a failure is never called too long
//   D5  the pre-send headline and the refusal line, with no override control in Zone 2
//   D2  What leaves stays "Nothing to send yet." until Draft is pressed
//   D8  Draft stops at a word that looks like an unlisted name; 0 such words leave without her press
//   D6  Ask a second reader says the request is prepared, relabels Send, and moves focus to it
// Every request the context sees is recorded; none may go outside the served page.
import type { Page } from "@playwright/test";
import { detail, expect, press, record, serveForFile, task, test } from "../fixtures/base";

const prod = serveForFile("dist");
const TOO_LONG = "This note is too long for the device model";

/** No LanguageModel at all, so the path is the one with no device model on every run of this file. */
async function noModel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "LanguageModel", { value: undefined, configurable: true, writable: true });
  });
}

/** A Present entry is already tagged. The same sentence in the note and the record is an unlisted word, not a name the record added. */
async function addUnlisted(page: Page): Promise<void> {
  const noteFold = page.locator("#fold-note");
  if ((await noteFold.count()) > 0 && (await noteFold.getAttribute("aria-expanded")) !== "true") await noteFold.click();
  const note = page.locator("#note");
  await expect(note).toBeVisible();
  await note.fill(`${await note.inputValue()}\nThen Glenda arrived.`);
  const fold = page.locator("#fold-seen");
  if ((await fold.count()) > 0 && (await fold.getAttribute("aria-expanded")) !== "true") await fold.click();
  const seen = page.locator("#record-seen");
  await expect(seen).toBeVisible();
  await seen.fill(`${await seen.inputValue()}\nThen Glenda arrived.`);
}

/**
 * A stand-in for a browser that says the model is there but holds no weights: availability answers `answer`,
 * and create() fails with a QuotaExceededError that carries no numbers (as seen in stock Chromium, picture 03).
 * With `sessionOk`, create() gives a session whose prompt fails the same way and that has no input measure.
 */
async function weightless(page: Page, answer: string, sessionOk: boolean): Promise<void> {
  await page.addInitScript(
    ([a, ok]) => {
      const quota = () => new DOMException("The model could not be loaded.", "QuotaExceededError");
      const session = {
        prompt: async (input?: unknown) => {
          if (typeof input === "string" && input.includes('{"ok":true}')) return '{"ok":true}';
          throw quota();
        },
        promptStreaming: () => { throw quota(); },
        destroy() {},
      };
      const lm = {
        availability: async () => a,
        params: async () => ({ defaultTopK: 3, maxTopK: 8, defaultTemperature: 1, maxTemperature: 2 }),
        create: async () => {
          if (!ok) throw quota();
          return session;
        },
      };
      Object.defineProperty(globalThis, "LanguageModel", { value: lm, configurable: true, writable: true });
    },
    [answer, sessionOk] as const,
  );
}

const deviceWords = (page: Page) => page.locator('[data-state="device"] .state-words');

/** Reads the device words every 100 ms for `ms` and returns each value seen. */
async function watchDeviceWords(page: Page, ms: number): Promise<string[]> {
  const seen = new Set<string>();
  const end = Date.now() + ms;
  while (Date.now() < end) {
    seen.add(((await deviceWords(page).textContent()) ?? "").trim());
    await page.waitForTimeout(100);
  }
  return [...seen];
}

test("D3: with no weights, #get-model never shows ready and names its failure; nothing is called too long", async ({ page, context }, info) => {
  task(info, "capture-and-record H35a D3");
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = prod.get().url;
  const rec = record(context);
  await weightless(page, "available", false);
  await page.goto(origin);
  // The browser says available, but no session can be made: the bar says did not start and offers the press.
  await expect(deviceWords(page)).toHaveText("did not start");
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await expect(page.locator("#get-model")).toBeVisible();
  const beforePress = await watchDeviceWords(page, 1000);

  await press(page, "#get-model");
  const error = page.locator('[data-zone="note"] [role="alert"]');
  await expect(error).toBeVisible({ timeout: 20_000 });
  const errorText = (await error.innerText()).replace(/\s+/g, " ");
  expect(errorText).toMatch(/The device model could not be started \([A-Za-z]+\)\./);
  await expect(page.locator("[data-error-hand-entry]")).toHaveText("Fill in by hand");
  const afterPress = await watchDeviceWords(page, 1500);
  for (const w of [...beforePress, ...afterPress]) expect(w).not.toBe("ready");
  await expect(page.locator("#get-model")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain(TOO_LONG);

  // Fill in by hand opens the record, with the example's record when the example is loaded.
  await press(page, "#try-example");
  await press(page, "#make-record");
  await expect(page.locator("[data-record]")).toBeVisible();
  expect(rec.outside(origin)).toEqual([]);
  await detail(info, { deviceWordsSeen: [...new Set([...beforePress, ...afterPress])], errorText, outsideRequests: rec.outside(origin).length });
});

test("D3: a session that cannot prompt fails #make-record with its error name and Fill in by hand, never too long", async ({ page, context }, info) => {
  task(info, "capture-and-record H35a D3");
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = prod.get().url;
  const rec = record(context);
  await weightless(page, "available", true);
  await page.goto(origin);
  await expect(deviceWords(page)).toHaveText("ready");
  await press(page, "#try-example");
  await expect(page.locator("#make-record")).toHaveText(/Make the record/);
  await press(page, "#make-record");
  const error = page.locator('[data-zone="note"] [role="alert"]');
  await expect(error).toBeVisible({ timeout: 30_000 });
  const errorText = (await error.innerText()).replace(/\s+/g, " ");
  expect(errorText).toMatch(/The device model could not make the record \([A-Za-z]+\)\./);
  expect(errorText).not.toContain(TOO_LONG);
  expect(await page.locator("body").innerText()).not.toContain(TOO_LONG);
  await expect(deviceWords(page)).toHaveText("did not start");
  await press(page, "[data-error-hand-entry]");
  await press(page, "#edit-record");
  await expect(page.locator("[data-record]")).toBeVisible();
  expect(rec.outside(origin)).toEqual([]);
  await detail(info, { errorText, outsideRequests: rec.outside(origin).length });
});

test("D2, D8, D5, D6: What leaves waits for Draft, Draft stops at an unlisted name, the block has no override, the reader hands off to Send", async ({ page, context }, info) => {
  task(info, "drafting H35a D2", "masking H35a D8", "egress-check H35a D5", "second-reader H35a D6");
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = prod.get().url;
  const rec = record(context);
  await noModel(page);
  await page.goto(origin);
  await expect(deviceWords(page)).toHaveText("not on this computer");
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");

  // D5: the headline before anything is sent.
  await expect(page.locator("[data-egress-line] .egress-headline")).toHaveText("The egress check runs before anything is sent. It covers listed names only.");

  // D2: the example and its record; What leaves stays empty and Send stays off until Draft.
  await press(page, "#try-example");
  await press(page, "#make-record");
  await expect(page.locator("[data-record]")).toBeVisible();
  const outgoing = page.locator("pre.outgoing");
  await expect(outgoing).toHaveText("Nothing to send yet.");
  await expect(page.locator("#send")).toBeDisabled();
  await expect(page.locator('[data-zone="finished"] .sheet-empty')).toHaveText("The finished note appears here. Press Draft to see what leaves, then press Send.");

  // D8: a Present name is already tagged. Draft stops at the unlisted word. Nothing is built, nothing is sent.
  await addUnlisted(page);
  await press(page, "#draft");
  await expect(page.locator("[data-likely-line]")).toHaveText("1 word looks like a name and is not on your list: Glenda. This is a guess by capital letters.");
  await expect(page.locator('[data-likely-word="Glenda"]')).toBeVisible();
  await expect(page.locator('[data-keep-likely="Glenda"]')).toHaveText("Keep Glenda");
  await expect(page.locator("[data-resolve-before-draft]")).toHaveText("Mask or keep each word above, then Draft continues.");
  await expect(outgoing).toHaveText("Nothing to send yet.");
  await expect(page.locator('[data-likely-word="Glenda"]')).toBeFocused();
  // Her press masks the unlisted word and Draft goes on by itself. Bea stays a Present tag.
  await page.locator('[data-likely-word="Glenda"]').click();
  await expect(outgoing).toContainText("Visit date:");
  const leaves = await outgoing.innerText();
  expect(leaves).not.toMatch(/\bBea\b/);
  expect(leaves).not.toMatch(/\bGlenda\b/);
  expect(leaves).toMatch(/Present: \[Person 1\], \[Person 2\], worker/);
  await expect(page.locator("#send")).toBeEnabled();

  // D5: the block line on a listed name, with its chip, and no override in Zone 2.
  await press(page, "#try-listed");
  const line = page.locator("[data-block-line]");
  await expect(line).toBeVisible();
  expect((await line.innerText()).replace(/\s+/g, " ")).toMatch(/^Not sent: 1 listed name is in the text\. Mask it, then send\. /);
  await expect(line.locator("[data-block-chip]")).toHaveCount(1);
  const zone2 = await page.locator('[data-zone="leaves"]').innerText();
  expect(zone2).not.toContain("Send this name on purpose");
  await line.locator("[data-block-chip] button").click();
  await expect(line).toHaveCount(0);
  await expect(page.locator("#send")).toBeEnabled();

  // D6: Ask a second reader prepares the request, says so in the panel, relabels Send and moves focus to it.
  await press(page, "#ask-reader");
  await expect(page.locator(".reader-panel [data-reader-prepared]")).toHaveText("Request prepared. It is shown under What leaves. Press Send.");
  const send = page.locator("#send");
  await expect(send).toHaveText("Send to the second reader");
  await expect(send).toHaveAttribute("data-kind", "primary");
  await expect(send).toBeFocused();
  await press(page, "#send");
  await expect(page.locator("[data-guess]").first()).toBeVisible();
  await expect(send).toHaveText("Send");

  // 0 requests outside the served page, and none with a body.
  await page.waitForTimeout(300);
  expect(rec.outside(origin)).toEqual([]);
  expect(rec.requests.filter((r) => r.postData && r.postData.length > 0)).toEqual([]);
  await detail(info, { requests: rec.requests.length, outsideRequests: rec.outside(origin).length });
});

test("D8: keeping an unlisted name on purpose lets Draft go on; nothing that looks like an unlisted name leaves without her press", async ({ page, context }, info) => {
  task(info, "masking H35a D8");
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = prod.get().url;
  const rec = record(context);
  await noModel(page);
  await page.goto(origin);
  await page.locator("#start-visit").click();
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await press(page, "#try-example");
  await press(page, "#make-record");
  await addUnlisted(page);
  await press(page, "#draft");
  await expect(page.locator("pre.outgoing")).toHaveText("Nothing to send yet.");
  await page.locator('[data-keep-likely="Glenda"]').click();
  await expect(page.locator("pre.outgoing")).toContainText("Visit date:");
  // Glenda is in the text because she pressed Keep. Bea is a Present tag and is not in the text.
  const kept = await page.locator("pre.outgoing").innerText();
  expect(kept).toContain("Glenda");
  expect(kept).not.toMatch(/\bBea\b/);
  await expect(page.locator("[data-likely-line]")).toHaveCount(0);
  expect(rec.outside(origin)).toEqual([]);
  await detail(info, { keptOnPurpose: ["Glenda"], outsideRequests: rec.outside(origin).length });
});
