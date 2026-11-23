// DEVICE MODEL. egress-check task 17, browser fact 3.
// The device jobs (make the record, propose masks, device draft) produce no request at all
// in Chrome: not one outside the served page, and none to the cloud model host.
// Every request of the run is recorded, with the network on for the first two jobs and off
// for the draft. Writes results/device-jobs-no-request.json.
import { expect, test } from "@playwright/test";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { appReady, deviceDraft, recordAndMask, recordAbsent, settleShell } from "./support";

test("Device jobs make no request", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    recordAbsent("device-jobs-no-request", out, "miss");
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

    // From here every request is counted. Only the app's own probe file may be asked for.
    const mark = s.recorder.mark();
    const made = await recordAndMask(page); // network on: the record and the device proposals
    await s.context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
    const draft = await deviceDraft(page); // network off: the device draft
    const summary = summariseRequests(s.recorder.since(mark), s.origin);
    const paths = s.recorder.since(mark).map((r) => new URL(r.url).pathname.replace(/\d{6,}/g, "N"));
    const names = [...new Set(paths)].sort();
    const strays = s.recorder.since(mark).filter((r) => !/^\/(probe\.txt|assets\/[\w.-]+\.(js|css))$/.test(new URL(r.url).pathname));

    const passed =
      summary.outside.length === 0 &&
      summary.cloudModelHost === 0 &&
      made.recordLabel === "on this device" &&
      draft.label === "on this device" &&
      strays.length === 0;
    writeResult(
      "device-jobs-no-request",
      passed
        ? {
            status: "pass",
            watchedHost: CLOUD_MODEL_HOST,
            jobsRun: ["structure (make the record)", "propose masks", "device draft"],
            requestsRecorded: summary.total,
            requestsOutsideThePage: summary.outside.length,
            requestsToCloudModelHost: summary.cloudModelHost,
            pathsAskedFor: names,
            labels: { record: made.recordLabel, proposals: made.proposalLabel, draft: draft.label },
          }
        : {
            status: "fail",
            reason: `Outside the page: ${summary.outside.length}. To the cloud model host: ${summary.cloudModelHost}. Unexpected paths: ${strays.length}.`,
            outside: summary.outside,
            pathsAskedFor: names,
          },
      s.browser,
    );
    expect(passed).toBe(true);
  } finally {
    await s.close();
  }
});
