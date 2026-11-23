// DEVICE MODEL, V6 (rewrite part). drafting task 22 (R10.7).
// Google Chrome with the built-in model, the built app, the invented visit: "Shorter" on one sentence of
// the outgoing text answers with the label "on this device", the sentence is replaced after the masker ran
// (the new text holds no listed invented name), and the request recorder sees no request at all.
// Writes results/rewrite-device-shorter.json when the model is already there, and nothing when it is not (a new file; results/rewrite-device.json, the 74-to-86 run, is kept as it was).
// Failure test for Shorter: the sentence the screen shows must have fewer characters than the sentence sent.
import { expect, test } from "@playwright/test";
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { appReady, press, seconds, settleShell } from "./support";

/** The listed invented names and their parts of three letters or more, folded to lower case. */
function listedWords(): string[] {
  const names = inventedVisit.clientList.split("\n").flatMap((line) => line.split(";").slice(0, 2).flatMap((p) => p.split(",")));
  const words = names.flatMap((n) => n.trim().split(/[\s-]+/)).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 3);
  return [...new Set(words)];
}

test("V6 rewrite: Shorter answers on this device, the sentence is replaced after the masker, no request", async () => {
  test.setTimeout(290_000);
  const out = await openDevice();
  if (!out.ok) {
    // No stand-in result is written when the model is absent; the reason goes in the skip message.
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

    await press(page, "#try-example");
    await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
    await press(page, "#make-record");
    await expect(page.locator("[data-record]")).toBeVisible({ timeout: 150_000 });
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] .mask-chip").first()).toBeVisible();
    await expect(page.locator("[data-mask-section] .source-label").first()).toBeVisible({ timeout: 150_000 });
    // H50: the outgoing text exists only after Draft (as in every bundled spec since H35a); the cloud is off
    // in this build, so Draft answers with the fixed sample and sends nothing. Draft stops at a likely
    // unlisted name until it is kept.
    await press(page, "#draft");
    while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();

    // Pick the sentence that holds a person tag, so the tag rule is exercised too.
    const sentences = page.locator("[data-outgoing] [data-sentence]");
    await expect(sentences.first()).toBeVisible();
    const texts = await sentences.allInnerTexts();
    const index = Math.max(0, texts.findIndex((t) => /\[Person \d+\]/.test(t) && t.length > 40));
    const before = await page.locator("[data-outgoing]").innerText();
    const chosen = texts[index] ?? "";
    seen["sentenceBefore"] = chosen;
    seen["sentenceBeforeChars"] = chosen.length;

    // The request recorder starts clean at the press.
    const mark = s.recorder.mark();
    await sentences.nth(index).click();
    await expect(page.locator("[data-rewrite-controls]")).toBeVisible();
    const t0 = Date.now();
    await page.locator("#rewrite-shorter").click();
    // Done when the result label shows, or a line says why the answer was not used.
    await expect(page.locator("[data-rewrite-result], [data-rewrite-line]").first()).toBeVisible({ timeout: 150_000 });
    seen["pressSeconds"] = seconds(Date.now() - t0);

    const resultCount = await page.locator("[data-rewrite-result]").count();
    const line = resultCount === 0 ? (await page.locator("[data-rewrite-line]").first().innerText()).trim() : null;
    seen["lineShown"] = line;
    if (resultCount === 0) {
      problems.push(`The answer was not used. The page said: "${line}".`);
    } else {
      const label = (await page.locator("[data-rewrite-result] .source-label").first().innerText()).trim();
      seen["label"] = label;
      if (label !== "on this device") problems.push(`The label read "${label}".`);
      const after = await page.locator("[data-outgoing]").innerText();
      seen["outgoingChangedByThePress"] = after !== before;
      seen["outgoingCharsBefore"] = before.length;
      seen["outgoingCharsAfter"] = after.length;
      if (after === before) problems.push("The outgoing text did not change.");
      if (after.includes(chosen)) problems.push("The old sentence is still in the outgoing text.");
      // Replaced after the masker ran: no listed name or part of one in the text that would leave.
      const folded = after.toLowerCase();
      const leaked = listedWords().filter((w) => new RegExp(`(?<![\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(folded));
      seen["listedWordsInOutgoingAfter"] = leaked;
      if (leaked.length > 0) problems.push(`Listed words in the outgoing text after the press: ${leaked.join(", ")}.`);
      // The replacement itself, found by taking away what stayed the same.
      const head = before.split(chosen)[0] ?? "";
      const tail = before.split(chosen)[1] ?? "";
      const replacement = after.startsWith(head) && after.endsWith(tail) ? after.slice(head.length, after.length - tail.length) : null;
      seen["sentenceAfter"] = replacement;
      if (replacement !== null) {
        seen["sentenceAfterChars"] = replacement.length;
        seen["observation"] = replacement.length < chosen.length ? "The sentence became shorter." : `The sentence did not become shorter: ${chosen.length} characters before, ${replacement.length} after.`;
        if (replacement.length >= chosen.length) {
          problems.push(`The sentence shown is not shorter: ${chosen.length} characters sent, ${replacement.length} shown.`);
        } else if (!(await page.locator("[data-outgoing]").innerText()).includes(replacement)) {
          problems.push("The shorter sentence is not on the screen.");
        }
      } else {
        problems.push("The replacement sentence could not be found in the outgoing text.");
      }
    }

    const requests = summariseRequests(s.recorder.since(mark), s.origin);
    seen["requestsSinceThePress"] = { total: requests.total, outsideThePage: requests.outside.length, toCloudModelHost: requests.cloudModelHost };
    if (requests.outside.length > 0 || requests.cloudModelHost > 0) problems.push("A request left the page.");

    writeResult(
      "rewrite-device-shorter",
      problems.length === 0 ? { status: "pass", inventedVisit: true, ...seen } : { status: "fail", reason: problems.join(" "), inventedVisit: true, ...seen },
      s.browser,
    );
    expect(problems).toEqual([]);
  } catch (error) {
    if (problems.length === 0) {
      writeResult("rewrite-device-shorter", { status: "fail", reason: `The run stopped: ${String((error as Error).message).split("\n")[0]}`, ...seen }, s.browser);
    }
    throw error;
  } finally {
    await s.close();
  }
});
