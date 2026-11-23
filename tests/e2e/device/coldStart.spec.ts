// DEVICE MODEL, H8. capture-and-record task 18 and measurement task 8 (one run serves both).
// Cold start to the first record: the clock starts just before Google Chrome is launched, on a
// browser process that has not run yet, with the site data of the served page cleared, and
// stops when the record made from the invented note is on the page. The model is already
// downloaded. Writes results/cold-start.json with seconds, date, browser and machine.
// Over COLD_START_LIMIT_S, or Chrome or the model absent, is a failure with its reason.
import { expect, test } from "@playwright/test";
import { COLD_START_LIMIT_S } from "../../../src/constants";
import { describeMachine, openDevice, writeResult } from "../fixtures/deviceModel";
import { appReady, press, recordAbsent, seconds } from "./support";

test("H8: cold start to the first record", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    recordAbsent("cold-start", out, "fail", { machine: describeMachine() });
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  try {
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    const pageReadyAt = Date.now();
    await press(page, "#try-example");
    await press(page, "#make-record");
    await expect(page.locator("[data-record]")).toBeVisible({ timeout: 150_000 });
    const label = (await page.locator("[data-record] .source-label").first().innerText()).trim();
    const total = (Date.now() - s.startedAt) / 1000;
    const total1 = Math.round(total * 10) / 10;
    const passed = total <= COLD_START_LIMIT_S && label === "on this device";
    writeResult(
      "cold-start",
      {
        status: passed ? "pass" : "fail",
        ...(passed ? {} : { reason: total > COLD_START_LIMIT_S ? `${total1} seconds is over the limit of ${COLD_START_LIMIT_S} seconds.` : `The record was labelled "${label}".` }),
        seconds: total1,
        limitSeconds: COLD_START_LIMIT_S,
        launchToPageSeconds: seconds(s.launchMs),
        pageToRecordSeconds: seconds(Date.now() - pageReadyAt),
        machine: describeMachine(),
        recordLabel: label,
        how: "from just before Chrome was launched to the record on the page: launch, load, read the model state, press the invented visit, press Make the record. Model already downloaded. Site data of the page cleared first; the browser profile and the model kept.",
        headless: true,
      },
      s.browser,
    );
    expect(passed).toBe(true);
  } finally {
    await s.close();
  }
});
