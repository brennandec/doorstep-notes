// DEVICE MODEL, with the real cloud. H15: the model call is cut mid-draft and the SDK's own fallback writes the note
// on this device (session H15, measurement R17.3).
//
// Online. The record and the masks are made on the device. The request to
// firebasevertexai.googleapis.com ...:generateContent is aborted with page.route, so this is a simulated drop
// (route.abort), not a real network cut. The draft is PREFER_IN_CLOUD; the SDK falls back only on FETCH_ERROR, ERROR
// or API_NOT_ENABLED and only when the device model is available (docs/sdk-facts.md facts 12, 24, 26).
//
// The record holds the inferenceSource, the label shown, the text length, the card's request row and every status.
// A failed assertion is written as failed; nothing is re-run for a better take. A new record, never an edit.
// Cap: no request to the cloud model may leave in this run (the recorder's cap is 0); the one cut counts as one attempt.
// Invented people only. The config and the debug token are read into memory; no value is printed or written.
import { expect, test } from "@playwright/test";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { nextFreeRecord, writeNewRecord, type RecordedRequest } from "../fixtures/deviceModel";
import { acceptAll, draftProblems, finishedZoneCheck, leakCheck, leakProblems, openCloudDevice, readCard, recordHeader, requestsSection } from "./hybridSupport";
import { waitEnabled, waitForOneOf } from "./named";
import { appReady, press, recordAndMask, seconds, settleShell } from "./support";

/** H18: the new record carries this suffix; the earlier ones (none, -2, -h16) stay as they were. */
const SUFFIX = "h18";

test("H15: the model call is cut mid-draft, the SDK falls back to the device", async () => {
  test.setTimeout(290_000);
  const out = await openCloudDevice(0);
  if (!out.ok) {
    writeNewRecord(nextFreeRecord("draft-network-drop", undefined, SUFFIX).file, { status: "miss", ...recordHeader(out.browser), reason: out.reason });
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  const problems: string[] = [];
  const observed: Record<string, unknown> = {};
  let cutAttempts = 0;
  let finished = false;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 30_000 });
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });

    // The record and the masks, on the device, online.
    const made = await recordAndMask(page);
    observed["recordLabel"] = made.recordLabel;
    if (made.recordLabel !== "on this device") problems.push(`The record was labelled "${made.recordLabel}".`);
    // H17: every suggestion is accepted, Bea among them, so What leaves holds no Bea (masking R21).
    observed["suggestionsAccepted"] = await acceptAll(page);

    // The cut. page.route runs before the recorder's route; this handler lists the request itself, then aborts it.
    await page.route(
      (url) => url.hostname === CLOUD_MODEL_HOST && url.pathname.includes(":generateContent"),
      async (route) => {
        cutAttempts += 1;
        const req = route.request();
        const entry: RecordedRequest = {
          url: req.url(),
          method: req.method(),
          bodyBytes: req.postDataBuffer()?.length ?? 0,
          refused: false,
          allowedBy: "host",
          status: "no answer",
          ...(req.postDataBuffer() ? { body: req.postDataBuffer()! } : {}),
        };
        s.recorder.requests.push(entry);
        await route.abort("failed");
      },
    );

    const started = Date.now();
    await press(page, "#draft");
    await waitEnabled(page.locator("#send"), "the Send button (#send)", 60_000);
    const sentText = await page.locator("[data-outgoing]").innerText();
    observed["whatLeavesHoldsBea"] = /\bBea\b/.test(sentText);
    if (/\bBea\b/.test(sentText)) problems.push("What leaves holds Bea after every suggestion was accepted.");
    await press(page, "#send");
    const sheet = page.locator('[data-zone="finished"] .sheet-text');
    // H17: the held-Copy line is also a p.error, so it is not what an error looks like here (it made the old combined locator match two
    // elements, and the record read only "toBeVisible failed"). H18: each element is named, and a match of two is no longer an error.
    const errorLine = page.locator("p.error:not([data-copy-held])").first();
    await waitForOneOf(
      [
        { name: 'the finished note ([data-zone="finished"] .sheet-text)', locator: sheet.first() },
        { name: "the page's error line (p.error, not the held-Copy line)", locator: errorLine },
      ],
      200_000,
    );
    observed["secondsFromSendToTheNote"] = seconds(Date.now() - started);
    if (!(await sheet.isVisible())) {
      problems.push(`No note was written. The page said: "${(await errorLine.innerText()).replace(/\s+/g, " ").trim()}".`);
    } else {
      const label = (await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + ").replace(/\s+/g, " ").trim();
      const text = await sheet.innerText();
      const card = await readCard(page);
      const requestRow = card.rows["The request"] ?? "no request row";
      observed["label"] = label;
      observed["textChars"] = text.length;
      observed["card"] = card;
      observed["requestRow"] = requestRow;
      if (!label.includes("on this device")) problems.push(`The note was labelled "${label}", not on this device.`);
      if (!/no answer, drafted on this device$/.test(requestRow)) problems.push(`The request row read "${requestRow}".`);
      problems.push(...draftProblems("the fallback draft", text));
      const zone = await finishedZoneCheck(page, "the fallback draft");
      observed["flags"] = zone.flags;
      observed["copyDisabled"] = zone.copyDisabled;
      problems.push(...zone.problems);
      const leak = leakCheck(s.recorder.requests, sentText);
      observed["leakCheck"] = leak;
      problems.push(...leakProblems(leak));
    }
    if (cutAttempts !== 1) problems.push(`The cut request was seen ${cutAttempts} times, not once.`);
    finished = true;
  } catch (error) {
    // H18: keep the lines that name the locator (Playwright puts it on the second line), not only the first.
    const said = String((error as Error).message).replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
    problems.push(`The run stopped: ${said}`);
  } finally {
    const counts = { generateContent: cutAttempts + s.recorder.generateContentCount(), appCheck: s.recorder.appCheckCount(), stoppedAtCap: s.recorder.stoppedAtCap() };
    if (counts.stoppedAtCap) problems.push("a generateContent request that was not the cut one reached the recorder and was stopped.");
    const status = problems.length === 0 && finished ? "pass" : "fail";
    const label = typeof observed["label"] === "string" ? observed["label"] : "no note";
    const section = requestsSection(s.recorder.requests, s.origin, counts);
    writeNewRecord(nextFreeRecord("draft-network-drop", undefined, SUFFIX).file, {
      ...recordHeader(s.browser),
      status,
      what: "Online, the generateContent request of the draft is aborted by page.route (a simulated drop, route.abort), and the SDK's own fallback writes the note on this device. Invented people only.",
      simulatedDrop: "route.abort on the generateContent request; not a real network cut",
      modeAskedOfTheSdk: "PREFER_IN_CLOUD",
      inferenceSource: label.includes("on this device") ? "ON_DEVICE" : label.includes("in the cloud") ? "IN_CLOUD" : "none",
      label,
      textChars: observed["textChars"] ?? null,
      requestRow: observed["requestRow"] ?? null,
      statuses: section.outside.map((r) => ({ host: r.host, method: r.method, path: r.path, status: r.status })),
      problems,
      observed,
      requests: section,
      cloudCalls: { generateContentAttempts: counts.generateContent, cutByTheTest: cutAttempts, appCheckExchanges: counts.appCheck },
    });
    await s.close();
  }
  expect(problems).toEqual([]);
});
