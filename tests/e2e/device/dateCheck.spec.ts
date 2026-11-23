// DEVICE MODEL, V1. capture-and-record task 27 (R12.7).
// Google Chrome with the built-in model, the built app, the invented visit: the record's date
// field is the note's words, the reading names the current year and says "assumed", and no year
// that the note does not hold appears unmarked in the record view or the outgoing text.
// Writes results/date-check.json, or a miss with its reason when Chrome or the model is absent.
import { expect, test } from "@playwright/test";
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { firstDateWords, unmarkedYears } from "../../../src/record/noteDate";
import { openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { appReady, press, recordAbsent, seconds, settleShell } from "./support";

test("V1: the date field is the note's words, the reading is marked assumed, no unmarked year", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    recordAbsent("date-check", out, "miss");
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  const seen: Record<string, unknown> = {};
  const problems: string[] = [];
  try {
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });

    const mark = s.recorder.mark();
    await press(page, "#try-example");
    await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
    const t0 = Date.now();
    await press(page, "#make-record");
    const record = page.locator("[data-record]");
    await expect(record).toBeVisible({ timeout: 150_000 });
    seen["recordSeconds"] = seconds(Date.now() - t0);
    seen["recordLabel"] = (await record.locator(".source-label").first().innerText()).trim();

    // 1. The date field.
    const note = inventedVisit.note;
    const expectedWords = firstDateWords(note);
    // Shell-and-offline task 42 (X6): the date field is folded to one line, "Date: 12/11", when it holds text.
    const foldedDate = page.locator('[data-fold="record-date"] .fold-text');
    const dateField = (await foldedDate.count()) > 0 ? ((await foldedDate.textContent()) ?? "").replace(/^Date: /, "") : await page.locator("#record-date").inputValue();
    seen["noteDateWords"] = expectedWords;
    seen["dateField"] = dateField;
    seen["deviceWroteDateLine"] = (await page.locator("[data-date-guard]").first().innerText({ timeout: 3000 }).catch(() => "")).trim() || null;
    if (dateField !== expectedWords) problems.push(`The date field held "${dateField}", the note's words are "${expectedWords}".`);

    // 2. The reading.
    const reading = (await page.locator("[data-date-reading]").first().innerText({ timeout: 5000 }).catch(() => "")).trim();
    const browserLocale = await page.evaluate(() => navigator.language);
    const year = String(new Date().getFullYear());
    seen["reading"] = reading;
    seen["browserLocale"] = browserLocale;
    seen["currentYear"] = year;
    if (!reading.includes(year)) problems.push(`The reading "${reading}" does not name the year ${year}.`);
    if (!/assumed/.test(reading)) problems.push(`The reading "${reading}" does not say "assumed".`);

    // 3. No unmarked year in the record view (field values and text).
    const recordText = await page.evaluate(() => {
      const live = document.querySelector("[data-record]");
      if (!live) return "";
      // The measured-figures block carries the dates of results files, not of the visit. It is left out of this
      // audit and the result says so (OPEN-QUESTIONS, session C05).
      const root = live.cloneNode(true) as HTMLElement;
      root.querySelectorAll("[data-figures]").forEach((n) => n.remove());
      root.style.cssText = "position:absolute;left:-9999px";
      document.body.append(root);
      const values = [...root.querySelectorAll("input, textarea")].map((e) => (e as HTMLInputElement).value);
      const block = document.querySelector("[data-date-block]");
      const text = [...values, root.innerText, block ? (block as HTMLElement).innerText : ""].join("\n");
      root.remove();
      return text;
    });
    const recordYears = unmarkedYears(recordText, note);
    seen["unmarkedYearsInRecordView"] = recordYears;
    seen["recordViewAuditLeavesOut"] = "the measured-figures block, which holds the dates of results files";
    seen["recordViewLinesWithAYear"] = recordText.split("\n").filter((l) => /(?:19|20)\d{2}/.test(l));
    if (recordYears.length > 0) problems.push(`Unmarked years in the record view: ${recordYears.join(", ")}.`);

    // 4. Masks, then the outgoing text.
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] .mask-chip").first()).toBeVisible();
    await expect(page.locator("[data-mask-section] .source-label").first()).toBeVisible({ timeout: 150_000 });
    const outgoing = await page.locator("[data-outgoing]").innerText();
    seen["outgoingChars"] = outgoing.length;
    const outgoingYears = unmarkedYears(outgoing, note);
    seen["unmarkedYearsInOutgoingText"] = outgoingYears;
    seen["outgoingDateLines"] = outgoing.split("\n").filter((l) => /\d{1,2}\/\d{1,2}|\b(?:19|20)\d{2}\b/.test(l));
    if (outgoingYears.length === 0 && outgoing.trim() === "") problems.push("The outgoing text was empty.");
    if (outgoingYears.length > 0) problems.push(`Unmarked years in the outgoing text: ${outgoingYears.join(", ")}.`);

    const requests = summariseRequests(s.recorder.since(mark), s.origin);
    seen["requests"] = { outsideThePage: requests.outside.length, toCloudModelHost: requests.cloudModelHost };

    writeResult(
      "date-check",
      problems.length === 0
        ? { status: "pass", inventedVisit: true, ...seen }
        : { status: "fail", reason: problems.join(" "), inventedVisit: true, ...seen },
      s.browser,
    );
    expect(problems).toEqual([]);
  } catch (error) {
    if (problems.length === 0) {
      writeResult("date-check", { status: "fail", reason: `The run stopped: ${String((error as Error).message).split("\n")[0]}`, ...seen }, s.browser);
    }
    throw error;
  } finally {
    await s.close();
  }
});
