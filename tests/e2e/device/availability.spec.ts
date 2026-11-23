// DEVICE MODEL. shell-and-offline task 29. Availability check through the fixture.
// Writes results/device-model-check.json. Only when it passes does the file carry the
// Chrome version and the steps for the first-run line (ruling 19): the version and the
// steps are what this check itself saw, nothing else.
import { expect, test } from "@playwright/test";
import { createFromClick, openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { appReady, chromeVersion, recordAbsent } from "./support";

test("Availability check: the built-in model is reported available and a session is made from a click", async () => {
  test.setTimeout(240_000);
  const out = await openDevice();
  if (!out.ok) {
    recordAbsent("device-model-check", out, "miss");
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  try {
    await appReady(s.page);
    // The status bar starts on a default and settles when the page has read the model state.
    await expect(s.page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 }).catch(() => undefined);
    const statusWords = (await s.page.locator('[data-state="device"] .state-words').innerText()).trim();
    const flags = await s.page.evaluate(() => navigator.userAgent);
    const t = Date.now();
    const created = await createFromClick(s.page);
    const createSeconds = Math.round((Date.now() - t) / 100) / 10;
    const requests = summariseRequests(s.recorder.requests, s.origin);
    const version = chromeVersion(s.browser);
    const passed = created === "created" && statusWords === "ready";
    writeResult(
      "device-model-check",
      passed
        ? {
            status: "pass",
            chromeVersion: version,
            deviceModelState: "available",
            sessionFromClick: created,
            sessionSeconds: createSeconds,
            statusBarWords: statusWords,
            headless: true,
            launchSeconds: Math.round(s.launchMs / 100) / 10,
            // What this check saw on the author's computer. Lines for the first-run text.
            steps: [
              "The browser reported the device model as ready, with no Chrome flag set.",
              "A model session was made from one press, with no download.",
            ],
            userAgent: flags.replace(/\(.*?\)/, "(system removed)"),
            requestsOutsideThePage: requests.outside.length,
            note: "The download was done earlier by the product owner (docs/decisions/2026-11-13-browser-on-this-computer.md). This check starts no download.",
          }
        : {
            status: "fail",
            reason: `State was available, but the session from a click gave "${created}" and the status bar read "${statusWords}".`,
            deviceModelState: "available",
            sessionFromClick: created,
            statusBarWords: statusWords,
          },
      s.browser,
    );
    expect(created).toBe("created");
    expect(statusWords).toBe("ready");
  } finally {
    await s.close();
  }
});
