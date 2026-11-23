// DEVICE MODEL, H1. capture-and-record task 17 and masking task 17.
// Google Chrome with the built-in model, the built app, the network switched off after the
// first load: the invented visit becomes a record and masks, and every result on the page is
// labelled "on this device". Writes the record results/h1-<UTC date>-h20.json (the default suffix of records.ts).
// H23: two screenshots at 1440 by 900 go through holdScreen, only when RETAKE_SCREENS names them, and are written only
// when no problem was found and the record had a Seen line:
//   docs/screens/08-device-record.png  the record, labelled on this device, network off
//   docs/screens/09-device-masks.png   the masks, with the device proposals as dashed chips
// With Chrome or the model absent the file records a failure with its reason (ruling 20).
import { expect, test, type Page } from "@playwright/test";
import { openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { holdScreen } from "../fixtures/screens";
import { isNotNeeded } from "../../../src/masking/notNeeded";
import { appReady, press, recordAbsent, seconds, settleShell } from "./support";

const retaken = (name: string): boolean => (process.env["RETAKE_SCREENS"] ?? "").split(",").map((n) => n.trim()).includes(name);

async function sourceLabels(page: Page): Promise<string[]> {
  return (await page.locator(".source-label:not(.not-connected)").allInnerTexts()).map((t) => t.trim());
}

test("H1: network off, the invented note becomes a record and masks, all labelled on this device", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    recordAbsent("h1", out, "fail");
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  const seen: Record<string, unknown> = {};
  const problems: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  try {
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });

    // Network off. Everything below runs from what is already in the browser.
    const mark = s.recorder.mark();
    await s.context.setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 30_000 });
    seen["networkWords"] = "offline";

    await press(page, "#try-example");
    await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
    const t0 = Date.now();
    await press(page, "#make-record");
    const record = page.locator("[data-record]");
    await expect(record).toBeVisible({ timeout: 150_000 });
    const recordSeconds = seconds(Date.now() - t0);
    const recordLabel = (await record.locator(".source-label").first().innerText()).trim();
    seen["recordSeconds"] = recordSeconds;
    seen["recordLabel"] = recordLabel;
    // The people are folded to one line (shell-and-offline task 42); open them to count the chips.
    if ((await page.locator("#fold-present").count()) > 0 && (await page.locator("#fold-present").getAttribute("aria-expanded")) === "false") await page.locator("#fold-present").click();
    seen["recordPeople"] = await record.locator(".chips .chip").count();
    // Shell-and-offline task 42 (X6): a record field that holds text is folded to one line, "Date: 12/11". An empty one is open.
    const folded = page.locator('[data-fold="record-date"] .fold-text');
    seen["recordDate"] = (await folded.count()) > 0 ? ((await folded.textContent()) ?? "").replace(/^Date: /, "") : await page.locator("#record-date").inputValue();
    // The invented note gives "12/11" with no year. A year in the record is the model's own choice.
    seen["observation"] = `The record date was "${seen["recordDate"]}". The note gives no year, so any year in it was chosen by the model.`;
    if ((await page.locator("#fold-seen").count()) > 0 && (await page.locator("#fold-seen").getAttribute("aria-expanded")) === "false") await page.locator("#fold-seen").click();
    seen["recordSeenLines"] = (await page.locator("#record-seen").inputValue()).split("\n").filter(Boolean).length;

    // The record from its top, with its label. The status bar scrolls away at this position (OPEN-QUESTIONS); the
    // network state is in results/h1.json and in docs/screens/06-offline.png.
    await page.evaluate(() => document.querySelector(".record-title")?.scrollIntoView({ block: "start" }));
    const shot08 = retaken("08-device-record") ? await holdScreen(page, "08-device-record", s.browser, "DEVICE MODEL") : null;

    const t1 = Date.now();
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] .mask-chip").first()).toBeVisible();
    // The device pass is done when its own label is shown next to the line.
    await expect(page.locator("[data-mask-section] .source-label").first()).toBeVisible({ timeout: 150_000 });
    const maskSeconds = seconds(Date.now() - t1);
    const chips = await page.locator("[data-mask-view] .mask-chip").evaluateAll((els) =>
      els.map((e) => ({
        cls: [...e.classList].filter((c) => c !== "mask-chip")[0] ?? "",
        text: (e.textContent ?? "").trim(),
        chipText: (e.querySelector(".chip-text")?.textContent ?? "").trim(),
      })),
    );
    const count = (c: string) => chips.filter((x) => x.cls === c).length;
    seen["maskSeconds"] = maskSeconds;
    seen["chips"] = { listed: count("listed"), near: count("near"), proposed: count("proposed"), manual: count("manual"), masked: count("masked") };
    seen["devicePassLine"] = (await page.locator("[data-device-pass-line]").innerText()).trim();
    seen["proposalLabel"] = (await page.locator("[data-mask-section] .source-label").first().innerText()).trim();

    await page.locator("[data-mask-section]").scrollIntoViewIfNeeded();
    const shot09 = retaken("09-device-masks") ? await holdScreen(page, "09-device-masks", s.browser, "DEVICE MODEL") : null;
    seen["noticeShown"] = (await page.locator("[data-send-notice]").count()) > 0 ? ((await page.locator("[data-send-notice]").first().innerText()) ?? "").trim() : null;

    const labels = await sourceLabels(page);
    seen["allLabels"] = labels;
    const requests = summariseRequests(s.recorder.since(mark), s.origin);
    seen["requestsAfterNetworkOff"] = { total: requests.total, outsideThePage: requests.outside.length, toCloudModelHost: requests.cloudModelHost };

    if (recordLabel !== "on this device") problems.push(`The record was labelled "${recordLabel}".`);
    if (labels.length === 0 || labels.some((l) => l !== "on this device")) problems.push(`Labels on the page: ${JSON.stringify(labels)}.`);
    if ((seen["chips"] as { listed: number }).listed < 1) problems.push("No listed name was masked by exact match.");
    if ((seen["chips"] as { proposed: number }).proposed < 1) problems.push("The device pass proposed nothing, so there were no dashed chips.");
    if (requests.outside.length > 0 || requests.cloudModelHost > 0) problems.push("A request left the page after the network was switched off.");
    if (pageErrors.length > 0) problems.push(`Page errors: ${pageErrors.join(" | ")}`);
    for (const c of chips) if (c.cls === "proposed" && isNotNeeded(c.chipText)) problems.push(`A proposed chip reads "${c.chipText}", a word the filter drops.`);

    const hadSeenLine = (seen["recordSeenLines"] as number) > 0;
    if (!hadSeenLine) seen["screensNotRetaken"] = "The record had no Seen line (H23-CANDIDATES item 10); 08 and 09 were left as they were.";
    if (problems.length === 0 && hadSeenLine) {
      shot08?.commit();
      shot09?.commit();
    }

    writeResult(
      "h1",
      problems.length === 0
        ? { status: "pass", network: "off for the whole run after the first load", inventedVisit: true, ...seen }
        : { status: "fail", reason: problems.join(" "), ...seen },
      s.browser,
    );
    expect(problems).toEqual([]);
  } catch (error) {
    const visibleError = await page.locator(".error").first().innerText({ timeout: 2000 }).catch(() => "");
    if (problems.length === 0) {
      writeResult(
        "h1",
        {
          status: "fail",
          reason: `The run stopped: ${String((error as Error).message).split("\n")[0]}`,
          errorShownOnPage: visibleError.trim() || null,
          pageErrors,
          ...seen,
        },
        s.browser,
      );
    }
    throw error;
  } finally {
    await s.close();
  }
});
