// DEVICE MODEL, H17. Where does a tag in a device draft come from, and does the device pass propose "Bea"?
//
// Network off, so nothing reaches the cloud and no generateContent call is made. The invented visit goes to a
// record and masks with the built-in model. The wrapper below records what each device-model prompt returned
// (invented text only), so the raw draft and the raw proposals can be read next to the finished note.
// Writes a new file, results/token-source-<date>-h17.json, never an old one.
import { expect, test } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openDevice } from "../fixtures/deviceModel";
import { appReady, press, settleShell } from "./support";
import { acceptAll, recordHeader } from "./hybridSupport";

declare global {
  interface Window {
    __lmLog?: { head: string; output: string }[];
  }
}

test("H17: where the tags in a device draft come from", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  try {
    await s.context.addInitScript(() => {
      window.__lmLog = [];
      const w = window as unknown as { LanguageModel?: { create: (...a: unknown[]) => Promise<Record<string, unknown>> } };
      const lm = w.LanguageModel;
      if (!lm || typeof lm.create !== "function") return;
      const create = lm.create.bind(lm);
      lm.create = async (...args: unknown[]) => {
        const session = await create(...args);
        const original = session["prompt"] as ((...a: unknown[]) => Promise<string>) | undefined;
        if (typeof original === "function") {
          session["prompt"] = async (...a: unknown[]) => {
            const result = await original.apply(session, a);
            window.__lmLog!.push({ head: JSON.stringify(a[0]).slice(0, 160), output: String(result) });
            return result;
          };
        }
        return session;
      };
    });
    await page.reload();
    await appReady(page);
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await s.context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });

    await press(page, "#try-example");
    await press(page, "#make-record");
    await expect(page.locator("[data-record]")).toBeVisible({ timeout: 150_000 });
    await press(page, "#mask");
    await expect(page.locator("[data-mask-section] .source-label").first()).toBeVisible({ timeout: 150_000 });
    const proposed = await page.locator('[data-mask-view] [data-chip="proposed"]').allInnerTexts();
    const maskedBeforeAccept = await page.locator("[data-outgoing]").innerText();
    // Second look (after the drop run read fail): every suggestion is accepted, as the two Chrome checks do.
    const acceptedCount = process.env["TOKEN_SOURCE_ACCEPT"] === "1" ? await acceptAll(page) : 0;
    const maskedAfterAccept = await page.locator("[data-outgoing]").innerText();
    await press(page, "#draft");
    const sheet = page.locator('[data-zone="finished"] .sheet-text');
    await expect(sheet).toBeVisible({ timeout: 150_000 });
    const finishedText = await sheet.innerText();
    const flags = await page.locator(".sheet-notes li").allInnerTexts();
    const log = await page.evaluate(() => window.__lmLog ?? []);
    let file = join(process.cwd(), "results", `token-source-${new Date().toISOString().slice(0, 10)}-h17.json`);
    for (let n = 2; existsSync(file); n++) file = join(process.cwd(), "results", `token-source-${new Date().toISOString().slice(0, 10)}-h17-${n}.json`);
    writeFileSync(
      file,
      JSON.stringify(
        {
          ...recordHeader(s.browser),
          what: "Network off. Invented visit, record and masks on the device, then the offline draft. Raw model outputs as the page received them.",
          suggestionsAccepted: acceptedCount,
          proposedChips: proposed,
          maskedTextBeforeAnySuggestionAccepted: maskedBeforeAccept,
          maskedTextSent: maskedAfterAccept,
          finishedText,
          flags,
          copyDisabled: await page.locator("#copy").isDisabled(),
          modelOutputs: log,
          requestsOutsideThePage: s.recorder.requests.filter((r) => !r.url.startsWith(s.origin)).length,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await s.close();
  }
});
