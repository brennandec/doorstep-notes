// DEVICE MODEL, H4 offline part. drafting task 15.
// Network off, device model present: the app chooses ONLY_ON_DEVICE, the draft is labelled
// "on this device" and "Shorter draft made on this device.". The result is added to a copy of the newest h4
// record and written as a new dated file (the online part, written by the BUNDLED run, is kept); or a miss with its reason.
import { expect, test } from "@playwright/test";
import { openDevice, summariseRequests } from "../fixtures/deviceModel";
import { nextRecordSuffix, readNewestRecord, writeRecord } from "../fixtures/records";
import { appReady, deviceDraft, recordAndMask, seconds, settleShell } from "./support";

/** The offline part is added to a copy of the newest h4 record, written as a new dated file (H20 R8). */
function mergeOffline(offline: Record<string, unknown>, note: string): void {
  writeRecord("h4", { ...readNewestRecord("h4"), note, offline }, process.cwd(), nextRecordSuffix("h4"));
}

test("H4 offline: the draft is made on the device and labelled", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  const day = new Date().toISOString().slice(0, 10);
  if (!out.ok) {
    mergeOffline({ status: "miss", reason: out.reason, deviceModelState: out.availability, date: day, browser: out.browser }, "The offline part needs the device model and could not run.");
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  try {
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    const mark = s.recorder.mark();
    await s.context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });

    const made = await recordAndMask(page);
    const t = Date.now();
    const d = await deviceDraft(page);
    const requests = summariseRequests(s.recorder.since(mark), s.origin);

    const problems: string[] = [];
    if (d.label !== "on this device") problems.push(`The draft was labelled "${d.label}".`);
    if (d.shortLine !== "Shorter draft made on this device.") problems.push(`The short-draft line read "${d.shortLine}".`);
    if (requests.outside.length > 0 || requests.cloudModelHost > 0) problems.push("A request left the page.");
    mergeOffline(
      problems.length === 0
        ? {
            status: "pass",
            date: day,
            browser: s.browser,
            network: "off",
            modeChosenByTheApp: "ONLY_ON_DEVICE (the browser reported offline)",
            source: d.label,
            shortLine: d.shortLine,
            draftSeconds: seconds(Date.now() - t),
            draftChars: d.textChars,
            recordLabel: made.recordLabel,
            egressLine: d.egressLine,
            requestsOutsideThePage: requests.outside.length,
            toCloudModelHost: requests.cloudModelHost,
          }
        : { status: "fail", date: day, browser: s.browser, reason: problems.join(" "), source: d.label, shortLine: d.shortLine, egressLine: d.egressLine },
      "Online part: the BUNDLED run through the test double (cloud not connected). Offline part: Google Chrome with the device model, network off.",
    );
    expect(problems).toEqual([]);
  } finally {
    await s.close();
  }
});
