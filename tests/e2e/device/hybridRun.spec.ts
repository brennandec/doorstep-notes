// DEVICE MODEL, with the real cloud. H15: both halves live in one Google Chrome session (session H15).
//
//   on this device: the record, the masks, the offline draft and "Shorter"
//   in the cloud:   the second reader and the online draft
//
// Steps 1 to 11 of the order, each with mode, inferenceSource, label, presses and seconds. Every request is
// recorded (host, method, path without the query, body bytes, sha256, status) and the leak assertions run over
// all of them. A failed assertion is written into the record as failed; nothing is re-run for a better take.
//
// Cap: at most 4 generateContent requests leave in this run (the session's cap is 5, the cut-call check takes the
// rest); the recorder stops a request after the cap and lists it. App Check exchanges are counted apart.
//
// New records, never an edit of an old one:
//   results/hybrid-run-<date>-<suffix>.json, results/h2-part-b-<date>-<suffix>.json, results/h4-<date>-<suffix>.json
// H20: the reader's mask is followed into the draft (step 7 and step 8), the offline cloud word is read (step 2),
// the ledger fold has no Save button and no test double words (step 9). Screens 05 and 17 are retaken through
// holdScreen, only when the whole run passes; screens 01 and 10 are not written in this run.
// Invented people only. The config and the debug token are read into memory; no value is printed or written.
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { nextFreeRecord, writeNewRecord, type RecordedRequest } from "../fixtures/deviceModel";
import { nextRecordSuffix } from "../fixtures/records";
import { holdScreen } from "../fixtures/screens";
import {
  acceptAll,
  countDeviceModelCalls,
  deviceModelCalls,
  draftProblems,
  finishedZoneCheck,
  leakCheck,
  leakProblems,
  openCloudDevice,
  readCard,
  recordHeader,
  requestsSection,
  words,
  type LeakResult,
} from "./hybridSupport";
import { appReady, press, seconds, settleShell } from "./support";

const CAP = 4;
/** H20: the new records carry this suffix; the earlier ones stay as they were. */
const SUFFIX = "h20";
/** H44 item 4: the next free name for a record on every path (the miss path and the end of the run), never an existing file. */
// H50b: fresh, so a record another spec wrote earlier in the same run (h4Offline writes h4) is never chosen.
const freeRecord = (name: string) => nextFreeRecord(name, undefined, nextRecordSuffix(name, SUFFIX, undefined, true));
const held: { commit: () => unknown }[] = [];
const retakeScreens = (process.env.RETAKE_SCREENS ?? "").split(",").map((s) => s.trim());

interface Step {
  step: number;
  what: string;
  mode: string;
  inferenceSource: string;
  label: string;
  presses: number;
  seconds: number;
  /** requests to hosts outside the page during the step */
  outsideRequests: number;
  extra?: Record<string, unknown>;
}

const gen = (r: RecordedRequest) => r.url.includes(`//${CLOUD_MODEL_HOST}/`) && r.url.includes(":generateContent");
/** The record block of an outgoing text: everything before the first blank line, so the fixed instructions are not searched. */
const recordPart = (text: string): string => text.split(/\n\s*\n/)[0] ?? text;
/** Whole-word, case-folded: "form" is not found inside "formal". */
const holdsWord = (text: string, word: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(text);

test("H15: both halves live in one Chrome session", async () => {
  test.setTimeout(290_000);
  const out = await openCloudDevice(CAP);
  const day = new Date().toISOString().slice(0, 10);
  if (!out.ok) {
    const miss = { status: "miss", ...recordHeader(out.browser), reason: out.reason };
    for (const name of ["hybrid-run", "h2-part-b", "h4"]) writeNewRecord(freeRecord(name).file, { ...miss, check: name });
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  await countDeviceModelCalls(s.context);
  const steps: Step[] = [];
  const problems: string[] = [];
  const leaks: { step: number; result: LeakResult }[] = [];
  const observed: Record<string, unknown> = {};
  let presses = 0;
  const tap = async (selector: string) => {
    // Quiet masks hides the record rows. Edit is the control that opens them; the old controls are on that page.
    if ((await page.locator(selector).count()) === 0 && (await page.locator("#edit-record").count()) > 0) {
      presses++;
      await page.locator("#edit-record").click();
    }
    presses++;
    await press(page, selector);
  };
  const note = (step: number, what: string, mode: string, label: string, started: number, since: number, source: string, extra?: Record<string, unknown>) => {
    const outside = s.recorder.since(since).filter((r) => !r.url.startsWith(s.origin)).length;
    steps.push({ step, what, mode, inferenceSource: source, label, presses, seconds: seconds(Date.now() - started), outsideRequests: outside, ...(extra ? { extra } : {}) });
    presses = 0;
  };
  const sourceOf = (label: string) => (label.includes("in the cloud") ? "IN_CLOUD" : label.includes("on this device") ? "ON_DEVICE" : "not shown");
  const outgoing = () => page.locator("[data-outgoing]").innerText();
  const checkLeaks = (step: number, since: number, sentText: string) => {
    const result = leakCheck(s.recorder.since(since), sentText);
    leaks.push({ step, result });
    problems.push(...leakProblems(result).map((p) => `step ${step}: ${p}`));
  };
  let browserLabel = s.browser;
  let finished = false;
  let t0 = Date.now();
  let toOfflineNote: number | null = null;
  let toCloudNote: number | null = null;
  // H20 R1: the value she masked from a reader quote, and where it was looked for afterwards.
  let readerMask: { quote: string; words: string[]; inSecondReaderText?: string[]; inDraftText?: string[]; inDraftRequestBody?: string[]; shownMaskedAtDraft?: boolean } | null = null;

  const shorterOnce = async (skipText?: string): Promise<{ label: string; before: number; after: number | null; line: string | null; waited: boolean; chosen: string }> => {
    const sentences = page.locator("[data-outgoing] [data-sentence]");
    await expect(sentences.first()).toBeVisible({ timeout: 30_000 });
    const texts = await sentences.allInnerTexts();
    const matchIndex = texts.findIndex((t) => /\[Person \d+\]/.test(t) && t.length > 40 && (skipText === undefined || t !== skipText));
    const fallbackIndex = texts.findIndex((t) => /\[Person \d+\]/.test(t) && t.length > 40);
    const index = Math.max(0, matchIndex >= 0 ? matchIndex : fallbackIndex);
    const chosen = texts[index] ?? "";
    const whole = await outgoing();
    presses++;
    await sentences.nth(index).click();
    await expect(page.locator("[data-rewrite-controls]")).toBeVisible();
    await tap("#rewrite-shorter");
    // With the cloud switch on, the page shows the text that would leave and waits for Send.
    const waitSel = page.locator("[data-rewrite-wait]").first();
    const resultSel = page.locator("[data-rewrite-result], [data-rewrite-line]").first();
    await expect(waitSel.or(resultSel)).toBeVisible({ timeout: 150_000 });
    const waited = await waitSel.isVisible();
    if (waited) await tap("#send");
    await expect(resultSel).toBeVisible({ timeout: 150_000 });
    const shown = (await page.locator("[data-rewrite-result]").count()) > 0;
    const label = shown ? (await page.locator("[data-rewrite-result] .source-label").first().innerText()).replace(/\s+/g, " ").trim() : "not shown";
    const line = shown ? null : (await page.locator("[data-rewrite-line]").first().innerText()).trim();
    const after = await outgoing();
    const head = whole.split(chosen)[0] ?? "";
    const tail = whole.split(chosen)[1] ?? "";
    const replacement = after.startsWith(head) && after.endsWith(tail) ? after.slice(head.length, after.length - tail.length) : null;
    return { label, before: chosen.length, after: replacement === null ? null : replacement.length, line, waited, chosen };
  };

  try {
    // 1. Page load. Screen 01 with the device model ready and the cloud connected.
    await page.setViewportSize({ width: 1440, height: 900 });
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 30_000 });
    browserLabel = s.browser;
    await page.evaluate(() => window.scrollTo(0, 0));
    observed["statusBarAtLoad"] = { network: await words(page, "network"), deviceModel: await words(page, "device"), cloud: await words(page, "cloud") };
    note(1, "page load", "none", "Device model: ready, Cloud: connected", Date.now(), 0, "none");

    // 3. The record (ONLY_ON_DEVICE), the masks, every device suggestion accepted.
    // Still online. Sentence buttons exist only after Draft and before a finished note, and the offline
    // draft finishes in the same press, so this stays before the network goes off. No Send, so no cloud answer.
    let mark = s.recorder.mark();
    let started = Date.now();
    t0 = Date.now();
    await tap("#try-example");
    await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
    await tap("#make-record");
    if ((await page.locator("[data-record]").count()) === 0 && (await page.locator("#edit-record").count()) > 0) {
      presses++;
      await page.locator("#edit-record").click();
    }
    const record = page.locator("[data-record]");
    await expect(record).toBeVisible({ timeout: 150_000 });
    const recordLabel = (await record.locator(".source-label").first().innerText()).replace(/\s+/g, " ").trim();
    await tap("#mask");
    await expect(page.locator("[data-mask-view] .mask-chip").first()).toBeVisible();
    await expect(page.locator("[data-mask-section] .source-label").first()).toBeVisible({ timeout: 150_000 });
    const proposalLabel = (await page.locator("[data-mask-section] .source-label").first().innerText()).replace(/\s+/g, " ").trim();
    const proposedChips = (await page.locator('[data-mask-view] [data-chip="proposed"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    const accepted = await acceptAll(page);
    presses += accepted;
    // H44 item 4: a capital-letter guess must be masked or kept before Draft. As a person would, mask each one.
    for (let n = 0; n < 20 && (await page.locator("[data-likely-word]").count()) > 0; n++) {
      presses++;
      await page.locator("[data-likely-word]").first().click();
    }
    // H17, masking R21: the device pass proposes Bea (a name in the note that is not on her list), and accepting
    // it keeps her out of What leaves.
    const leavingAfterMasks = await outgoing();
    const beaLeaves = /\bBea\b/.test(leavingAfterMasks);
    note(3, "record, masks, suggestions accepted", "ONLY_ON_DEVICE", `record: ${recordLabel}; suggestions: ${proposalLabel}`, started, mark, sourceOf(recordLabel), {
      suggestionsAccepted: accepted,
      suggestionsOffered: proposedChips,
      beaProposed: proposedChips.some((t) => /^Bea\b/.test(t)),
      whatLeavesHoldsBea: beaLeaves,
    });
    if (recordLabel !== "on this device") problems.push(`step 3: the record was labelled "${recordLabel}".`);
    if (!proposedChips.some((t) => /^Bea\b/.test(t))) problems.push("step 3: the device pass did not propose Bea.");
    if (beaLeaves) problems.push("step 3: What leaves still holds Bea after every suggestion was accepted.");
    checkLeaks(3, mark, "");

    // Draft while online, and do not Send. This is the only stretch where sentence buttons exist:
    // a cloud Draft waits for Send and no finished note stands yet. The offline Draft below finishes
    // in one press, and a later Draft leaves the first note standing, so neither shows the buttons.
    const windowMark = s.recorder.mark();
    await tap("#draft");
    while ((await page.locator("[data-keep-likely]").count()) > 0) {
      presses++;
      await page.locator("[data-keep-likely]").first().click();
    }
    await expect(page.locator("#send")).toBeEnabled({ timeout: 60_000 });
    await expect(page.locator("[data-outgoing] [data-sentence]").first()).toBeVisible({ timeout: 30_000 });
    const outsideBeforeOffline = s.recorder.since(windowMark).filter((r) => !r.url.startsWith(s.origin));
    if (outsideBeforeOffline.length > 0) {
      throw new Error(`before the offline draft, ${outsideBeforeOffline.length} request(s) left the page`);
    }
    const draftPresses = presses;

    // 2. Network off. The visit is already on the page. The cloud chip reads unreachable.
    presses = 0;
    mark = s.recorder.mark();
    const offlineMark = mark;
    started = Date.now();
    await s.context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
    const cloudWordsOffline = await words(page, "cloud");
    observed["cloudWordOffline"] = cloudWordsOffline;
    if (cloudWordsOffline !== "unreachable") problems.push(`step 2: while offline the cloud state read "${cloudWordsOffline}", not "unreachable".`);
    note(2, "network off, sentence buttons already on the page", "none", "offline", started, mark, "none");
    presses = draftPresses;

    // 4. Shorter on one sentence (PREFER_ON_DEVICE), offline, while the sentence buttons are on the page.
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("unreachable", { timeout: 30_000 });
    const markShorterOff = s.recorder.mark();
    const startedShorterOff = Date.now();
    const sentOffline = await outgoing();
    const shortOff = await shorterOnce();
    const outsideShorterOff = s.recorder.since(markShorterOff).filter((r) => !r.url.startsWith(s.origin));
    note(4, "Shorter on one sentence, offline", "PREFER_ON_DEVICE", shortOff.label, startedShorterOff, markShorterOff, sourceOf(shortOff.label), { sentenceChars: shortOff.before, shownChars: shortOff.after, line: shortOff.line, pageWaitedForSend: shortOff.waited, outsideRequests: outsideShorterOff.length });
    if (sourceOf(shortOff.label) !== "ON_DEVICE") problems.push(`step 4: Shorter offline was labelled "${shortOff.label}", not on this device.`);
    if (shortOff.waited) problems.push("step 4: Shorter offline waited for Send; it should run on this device without it.");
    if (outsideShorterOff.length > 0) problems.push(`step 4: Shorter offline sent ${outsideShorterOff.length} outside request(s).`);
    checkLeaks(4, markShorterOff, sentOffline);
    let outsideWhileOffline = s.recorder.since(offlineMark).filter((r) => !r.url.startsWith(s.origin)).length;

    // Back online. The same wait the page shows once the cloud can answer, and the buttons are still there.
    await s.context.setOffline(false);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("connected", { timeout: 30_000 });
    await expect(page.locator("#send")).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator("[data-outgoing] [data-sentence]").first()).toBeVisible({ timeout: 30_000 });

    // 10. Shorter once more, online, still before any finished note. Which side answered?
    const markShorter = s.recorder.mark();
    const startedShorter = Date.now();
    const sentShorter = await outgoing();
    const shortOn = await shorterOnce(shortOff.chosen);
    const answeredByCloud = s.recorder.since(markShorter).some(gen);
    note(10, "Shorter again, online (between Draft and Send)", "PREFER_ON_DEVICE", shortOn.label, startedShorter, markShorter, sourceOf(shortOn.label), { sentenceChars: shortOn.before, shownChars: shortOn.after, line: shortOn.line, pageWaitedForSend: shortOn.waited, generateContentRequestMade: answeredByCloud, answeredBy: sourceOf(shortOn.label) });
    checkLeaks(10, markShorter, sentShorter);

    // 5. Draft offline: the app chooses ONLY_ON_DEVICE. Network off again, so this press does not send.
    await s.context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("unreachable", { timeout: 30_000 });
    mark = s.recorder.mark();
    started = Date.now();
    await tap("#draft");
    while ((await page.locator("[data-keep-likely]").count()) > 0) {
      presses++;
      await page.locator("[data-keep-likely]").first().click();
    }
    const sheet = page.locator('[data-zone="finished"] .sheet-text');
    const sendOffline = page.locator("#send");
    await expect(sheet.or(sendOffline.and(page.locator(":enabled")))).toBeVisible({ timeout: 150_000 });
    if (!(await sheet.isVisible())) await tap("#send");
    await expect(sheet).toBeVisible({ timeout: 150_000 });
    toOfflineNote = seconds(Date.now() - t0);
    const offlineLabel = (await page.locator('[data-zone="finished"] .source-label').first().innerText()).replace(/\s+/g, " ").trim();
    const offlineShort = (await page.locator("[data-short-draft]").innerText()).trim();
    const offlineText = await sheet.innerText();
    const offlineCard = await readCard(page);
    const offlineZone = await finishedZoneCheck(page, "step 5");
    note(5, "Draft and Send offline", "ONLY_ON_DEVICE", offlineLabel, started, mark, sourceOf(offlineLabel), { shortLine: offlineShort, card: offlineCard, draftChars: offlineText.length, flags: offlineZone.flags, copyDisabled: offlineZone.copyDisabled, putBackButtons: offlineZone.putBackButtons });
    problems.push(...offlineZone.problems);
    if (offlineLabel !== "on this device") problems.push(`step 5: the offline draft was labelled "${offlineLabel}".`);
    if (offlineShort !== "Shorter draft made on this device.") problems.push(`step 5: the short-draft line read "${offlineShort}".`);
    problems.push(...draftProblems("step 5: the device draft", offlineText));
    outsideWhileOffline += s.recorder.since(mark).filter((r) => !r.url.startsWith(s.origin)).length;
    observed["requestsOutsideThePageWhileOffline"] = outsideWhileOffline;
    if (outsideWhileOffline > 0) problems.push(`while offline, ${outsideWhileOffline} request(s) went to a host outside the page.`);
    checkLeaks(5, mark, await outgoing());

    // 6. Network on. Ask the second reader and Send (ONLY_IN_CLOUD).
    await s.context.setOffline(false);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
    mark = s.recorder.mark();
    started = Date.now();
    await tap("#ask-reader");
    const readerText1 = await outgoing();
    await tap("#send");
    const passLine = page.locator("[data-reader-pass]");
    await expect(passLine.or(page.locator("[data-reader-error]"))).toBeVisible({ timeout: 120_000 });
    const readerError1 = (await page.locator("[data-reader-error]").count()) > 0 ? (await page.locator("[data-reader-error]").innerText()).trim() : null;
    const readerLabel1 = (await page.locator(".reader-source .source-label").count()) > 0 ? (await page.locator(".reader-source .source-label").first().innerText()).replace(/\s+/g, " ").trim() : "not shown";
    const card6 = await readCard(page);
    const line1 = (await passLine.count()) > 0 ? (await passLine.innerText()).trim() : "";
    const guessCount1 = await page.locator("[data-reader] [data-guess]").count();
    note(6, "second reader, pass 1", "ONLY_IN_CLOUD", readerLabel1, started, mark, sourceOf(readerLabel1), { card: card6, guessesShown: guessCount1, passLine: line1, error: readerError1 });
    if (readerError1) problems.push(`step 6: the reader showed an error: ${readerError1}`);
    if (sourceOf(readerLabel1) !== "IN_CLOUD") problems.push(`step 6: the reader was labelled "${readerLabel1}".`);
    checkLeaks(6, mark, readerText1);
    // H20: screen 17 is the second reader's pass 1 from this run: the guesses and the line of bytes that left.
    if (!readerError1 && guessCount1 > 0) {
      if (retakeScreens.includes("all") || retakeScreens.includes("17-second-reader-real-service")) {
        await page.locator("[data-reader]").scrollIntoViewIfNeeded();
        held.push(await holdScreen(page, "17-second-reader-real-service", s.browser, "DEVICE MODEL"));
      }
    } else problems.push("step 6: no guess was shown, so screen 17 could not be taken.");

    // 7. A shown guess that quotes unmasked words: press the first such chip, Ask again, Send.
    const chip = page.locator('[data-reader] button[data-quote][aria-pressed="false"]').first();
    if ((await chip.count()) > 0 && !readerError1) {
      mark = s.recorder.mark();
      started = Date.now();
      const quoted = await chip.getAttribute("data-quote");
      // The words the press masks: the quote without its tags (the same split the page makes).
      const maskedWords = (quoted ?? "").split(/\[[^\]]*\]/).map((p) => p.trim()).filter((p) => /[\p{L}\p{N}]/u.test(p));
      readerMask = { quote: quoted ?? "", words: maskedWords };
      presses++;
      await chip.click();
      await expect(page.locator('[data-reader] button[data-quote][aria-pressed="true"]').first()).toBeVisible();
      await tap("#ask-reader");
      const readerText2 = await outgoing();
      readerMask.inSecondReaderText = maskedWords.filter((w) => holdsWord(recordPart(readerText2), w));
      await tap("#send");
      await expect.poll(async () => ((await page.locator("[data-reader-pass]").count()) > 0 ? (await page.locator("[data-reader-pass]").innerText()).trim() : ""), { timeout: 120_000, intervals: [500] }).not.toBe(line1);
      const readerLabel2 = (await page.locator(".reader-source .source-label").first().innerText()).replace(/\s+/g, " ").trim();
      const card7 = await readCard(page);
      note(7, "chip pressed, ask again", "ONLY_IN_CLOUD", readerLabel2, started, mark, sourceOf(readerLabel2), { pressedChip: quoted, maskedWords, wordsStillInTheSecondReaderText: readerMask.inSecondReaderText, card: card7 });
      checkLeaks(7, mark, readerText2);
      if ((readerMask.inSecondReaderText ?? []).length > 0) problems.push(`step 7: the second pass still held the pressed words: ${readerMask.inSecondReaderText!.join(", ")}.`);
    } else {
      steps.push({ step: 7, what: "no shown guess quoted unmasked words", mode: "ONLY_IN_CLOUD", inferenceSource: "none", label: "skipped", presses: 0, seconds: 0, outsideRequests: 0 });
      problems.push("step 7: no shown guess quoted unmasked words, so the reader's mask could not be followed into the draft.");
    }

    // 8. Draft and Send online (PREFER_IN_CLOUD). Screen 05.
    // The note from step 5 is still on the page, so Draft asks before it replaces that note.
    // Sentence buttons are not on this page while that note stands. Steps 4 and 10 already ran.
    await tap("#draft");
    while ((await page.locator("[data-keep-likely]").count()) > 0) {
      presses++;
      await page.locator("[data-keep-likely]").first().click();
    }
    await expect(page.locator("#replace-yes")).toBeVisible({ timeout: 30_000 });
    await tap("#replace-yes");
    await expect(page.locator("#send")).toBeEnabled({ timeout: 60_000 });

    mark = s.recorder.mark();
    started = Date.now();
    const lmBefore = await deviceModelCalls(page);
    await expect(page.locator("#send")).toBeEnabled({ timeout: 60_000 });
    const sentDraft = await outgoing();
    await tap("#send");
    await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible({ timeout: 150_000 });
    await expect(page.locator('[data-zone="finished"] .source-label').first()).toBeVisible();
    toCloudNote = seconds(Date.now() - t0);
    const cloudLabel = (await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + ").replace(/\s+/g, " ").trim();
    const cloudText = await page.locator('[data-zone="finished"] .sheet-text').innerText();
    const card8 = await readCard(page);
    const cloudZone = await finishedZoneCheck(page, "step 8");
    const lmAfter = await deviceModelCalls(page);
    let screen05: Awaited<ReturnType<typeof holdScreen>> | null = null;
    if (retakeScreens.includes("all") || retakeScreens.includes("05-finished-note")) {
      await page.evaluate(() => window.scrollTo(0, 0));
      screen05 = await holdScreen(page, "05-finished-note", s.browser, "DEVICE MODEL");
      held.push(screen05);
    }
    note(8, "Draft and Send online", "PREFER_IN_CLOUD", cloudLabel, started, mark, sourceOf(cloudLabel), {
      card: card8,
      draftChars: cloudText.length,
      flags: cloudZone.flags,
      copyDisabled: cloudZone.copyDisabled,
      putBackButtons: cloudZone.putBackButtons,
      deviceModelAfterTheAnswer: { sessionsMade: lmAfter.creates - lmBefore.creates, prompts: lmAfter.prompts - lmBefore.prompts, meaning: "findNames on the cloud draft runs on the device when these are above zero" },
      screen: screen05?.entry.file ?? null,
    });
    problems.push(...cloudZone.problems);
    if (!cloudLabel.includes("in the cloud")) problems.push(`step 8: the finished note was labelled "${cloudLabel}", not in the cloud.`);
    if (/test double|not connected/.test(cloudLabel)) problems.push(`step 8: the label names a test double or says not connected: "${cloudLabel}".`);
    if (!cloudText.includes("Maria Okonkwo-Reyes")) problems.push("step 8: the names were not put back in the finished note.");
    problems.push(...draftProblems("step 8: the cloud draft", cloudText));
    checkLeaks(8, mark, sentDraft);
    if (!s.recorder.since(mark).some(gen)) problems.push("step 8: no generateContent request was made: the draft was not answered by the cloud.");
    // H20 R1: the step after the reader's mask. The pressed words are masked in the text Draft held and in the body sent.
    if (readerMask !== null) {
      const draftBodies = s.recorder.since(mark).filter(gen).map((r) => (r.body === undefined ? "" : r.body.toString("utf8")));
      readerMask.inDraftText = readerMask.words.filter((w) => holdsWord(recordPart(sentDraft), w));
      readerMask.inDraftRequestBody = readerMask.words.filter((w) => draftBodies.some((b) => holdsWord(b, w)));
      readerMask.shownMaskedAtDraft = readerMask.inDraftText.length === 0 && readerMask.inDraftRequestBody.length === 0 && draftBodies.length > 0;
      observed["readerMaskCarriedIntoTheDraft"] = readerMask;
      if (readerMask.inDraftText.length > 0) problems.push(`step 8: the text held for the draft still held the pressed words: ${readerMask.inDraftText.join(", ")}.`);
      if (readerMask.inDraftRequestBody.length > 0) problems.push(`step 8: the draft request still held the pressed words: ${readerMask.inDraftRequestBody.join(", ")}.`);
      if (draftBodies.length === 0) problems.push("step 8: no draft request body was recorded to look in.");
    }

    // 9. The ledger fold (H20 R2: no save control in the build she is given).
    mark = s.recorder.mark();
    started = Date.now();
    presses++;
    await page.locator("#fold-ledger").click();
    await expect(page.locator('[data-details="ledger"] [data-ledger-entry]').first()).toBeVisible();
    const ledgerEntriesShown = await page.locator('[data-details="ledger"] [data-ledger-entry]').count();
    const saveButtons = await page.locator('[data-details="ledger"] button').count();
    const ledgerFoldWords = (await page.locator('[data-details="ledger"]').innerText()).replace(/\s+/g, " ").trim();
    const testDoubleWords = (await page.locator("body").innerText()).match(/test double/gi) ?? [];
    note(9, "Ledger fold", "none", `${ledgerEntriesShown} entries shown, ${saveButtons} Save buttons`, started, mark, "none", { entriesShown: ledgerEntriesShown, saveButtons, testDoubleWordsOnThePage: testDoubleWords.length });
    if (ledgerEntriesShown === 0) problems.push("step 9: the ledger fold showed no entry.");
    if (saveButtons > 0) problems.push("step 9: the page still has a save button in the ledger fold.");
    if (/not connected|Written to/i.test(ledgerFoldWords)) problems.push(`step 9: the ledger fold says "${ledgerFoldWords.slice(0, 120)}".`);
    if (testDoubleWords.length > 0) problems.push(`step 9: the words "test double" are on the page ${testDoubleWords.length} time(s).`);
    checkLeaks(9, mark, "");

    // 11. The end state. Screen 10 is not written in this run (H20).
    await page.evaluate(() => window.scrollTo(0, 0));
    observed["statusBarAtTheEnd"] = { network: await words(page, "network"), deviceModel: await words(page, "device"), cloud: await words(page, "cloud") };
    note(11, "end state", "none", "scroll 0", Date.now(), s.recorder.mark(), "none");
    finished = true;
  } catch (error) {
    problems.push(`The run stopped: ${String((error as Error).message).split("\n").filter((l) => l.trim() !== "").slice(0, 4).join(" | ")}`);
  } finally {
    const all = s.recorder.requests;
    const counts = { generateContent: s.recorder.generateContentCount(), appCheck: s.recorder.appCheckCount(), stoppedAtCap: s.recorder.stoppedAtCap() };
    if (counts.stoppedAtCap) problems.push("a generateContent request was stopped at the cap.");
    const refused = all.filter((r) => r.refused && !r.url.startsWith(s.origin));
    const header = recordHeader(browserLabel);
    steps.sort((a, b) => a.step - b.step);
    const status = problems.length === 0 && finished ? "pass" : "fail";
    // H17: the three pictures are written only when the whole run passed; a failing run leaves the committed ones.
    if (status === "pass") for (const h of held) h.commit();
    const hybrid = freeRecord("hybrid-run");
    const partB = freeRecord("h2-part-b");
    const h4 = freeRecord("h4");
    const section = requestsSection(all, s.origin, counts);
    const hybridName = `results/${hybrid.file.split("/").pop()}`;
    writeNewRecord(hybrid.file, {
      ...header,
      status,
      what: "One run in Google Chrome with the built-in model and the real cloud, invented visit. On this device: record, masks, offline draft, Shorter. In the cloud: second reader, online draft. Invented people only.",
      problems,
      steps,
      secondsFromInventedVisitToOfflineNote: toOfflineNote,
      secondsFromInventedVisitToCloudNote: toCloudNote,
      observed,
      requests: section,
      refusedOutsideRequests: refused.map((r) => ({ host: new URL(r.url).host, method: r.method })),
      cloudCalls: { generateContent: counts.generateContent, cap: CAP, appCheckExchanges: counts.appCheck, note: "App Check exchanges are counted apart from the cloud model calls." },
    });
    writeNewRecord(partB.file, {
      ...header,
      status,
      check: "H2 part B: a full run against the real cloud service with invented people, every request recorded.",
      hybridRun: hybridName,
      assertions: {
        noListedNameOtherNameSurfaceFormMaskedOriginalNoteLineOrImageByteInAnyRequest: leaks.every((l) => leakProblems(l.result).length === 0),
        zeroOutsideRequestsWhileOffline: observed["requestsOutsideThePageWhileOffline"] === 0,
        everyOutsideHostOnTheAllowList: refused.length === 0,
        noMarkdownTagOrTokenInEitherDraft: !problems.some((p) => /double asterisks|heading line|holds a tag|holds a token/.test(p)),
        cloudDraftAnsweredInTheCloud: steps.find((x) => x.step === 8)?.inferenceSource === "IN_CLOUD",
      },
      leakChecks: leaks,
      problems,
      requests: section,
      cloudCalls: { generateContent: counts.generateContent, appCheckExchanges: counts.appCheck },
    });
    const s5 = steps.find((x) => x.step === 5);
    const s8 = steps.find((x) => x.step === 8);
    const half = (x: Step | undefined, want: string) => ({
      status: x !== undefined && x.inferenceSource === want ? "pass" : "fail",
      ...(x ? { mode: x.mode, inferenceSource: x.inferenceSource, label: x.label, seconds: x.seconds, card: (x.extra as { card?: unknown } | undefined)?.card } : { reason: "the step did not run" }),
    });
    writeNewRecord(h4.file, {
      ...header,
      status,
      check: "H4: the draft online (the cloud) and offline (this device), in one Google Chrome session with the model and the real cloud.",
      hybridRun: hybridName,
      offline: { network: "off", modeChosenByTheApp: "ONLY_ON_DEVICE (the browser reported offline)", ...half(s5, "ON_DEVICE") },
      online: { network: "on", modeChosenByTheApp: "PREFER_IN_CLOUD", ...half(s8, "IN_CLOUD") },
    });
    await s.close();
  }
  expect(problems).toEqual([]);
  expect(existsSync("results")).toBe(true);
});
