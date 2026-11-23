// BUNDLED. The invented visit with no device model, in the production build.
//   shell-and-offline 28 (H6), drafting 13 (H4 online part) and 14 (H6), capture-and-record 14 and 15 (H6).
// Also saves screenshots 01, 02, 03 and 05 at 1440 by 900.
// The bundled browser has no usable device model: it reports `downloadable` on localhost (not `unavailable`),
// and nothing here presses "Get the device model", so no download starts.
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { findLeaks } from "../../../src/egress/assertNoLeak";
import { INVENTED_NAMES, detail, expect, openHandEntryIfNeeded, openInventedVisit, press, record, runToFinished, serveForFile, task, test, useStandIn } from "../fixtures/base";
import { bundledLabel, takeScreen } from "../fixtures/screens";
import { nextRecordSuffix, writeRecord } from "../fixtures/records";

const site = serveForFile("dist-e2e");
const SHOT = (n: string) => `docs/screens/${n}.png`;

async function modelState(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(async () => {
    const lm = (globalThis as { LanguageModel?: { availability(): Promise<string> } }).LanguageModel;
    return lm ? lm.availability() : "no LanguageModel object";
  });
}

test("No device model: the invented visit, one press per step", async ({ page, context, browserName }, info) => {
  task(info, "shell-and-offline 28", "drafting 13");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(site.get().url);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("can be downloaded");
  const state = await modelState(page);
  expect(state).not.toBe("available");
  await page.locator("#start-visit").click();

  // R8.4: the absent line. The stored check under it is a past measurement, not a claim about this computer.
  const line = page.locator("[data-model-line]");
  await expect(line).toContainText("It is not on this computer.");
  await expect(line).toContainText("turn rough notes into a record");
  // The stored check is this project's past measurement, with its date and its machine.
  await expect(page.locator("[data-past-measurement]")).toContainText("Past measurement of this project");
  await expect(page.locator("[data-past-measurement]")).toContainText("Not measured on this computer");
  await expect(page.locator("[data-past-measurement]")).toContainText("2026-11-13");
  await expect(page.locator("[data-model-steps]")).not.toContainText("author's computer");
  await expect(page.locator("[data-audience]")).toContainText("home-visit caseworkers");
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("author's computer");
  expect(bodyText).not.toContain("results/");
  expect(bodyText.toLowerCase()).not.toContain("chrome://");
  await takeScreen(page, "01-first-run", await bundledLabel(page), "BUNDLED");

  // One press: the invented visit fills the note, the list of 12 and the prepared record.
  await press(page, "#try-example");
  await openHandEntryIfNeeded(page);
  await expect(page.locator("[data-record]")).toBeVisible();
  // With a record the note and the list are folded (R20.3); the values are read from the hidden editors.
  await expect(page.locator('[data-fold="note"]')).toContainText("Note: 7 lines.");
  await expect(page.locator('[data-fold="list"]')).toContainText("Client list: 12 names.");
  await page.locator('[data-fold="note"] button').click();
  await page.locator('[data-fold="list"] button').click();
  await expect(page.locator("#note")).toHaveValue(inventedVisit.note);
  expect(await page.locator("#client-list").inputValue()).toBe(inventedVisit.clientList);
  await page.locator('[data-fold="note"] button').click();
  await page.locator('[data-fold="list"] button').click();
  expect(inventedVisit.clientList.split("\n").length).toBe(12);

  // One press: exact and near masking.
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] .mask-chip.listed").first()).toBeVisible();
  await expect(page.locator("[data-mask-view] .mask-chip.near").first()).toBeVisible();
  const chipCount = await page.locator("[data-mask-view] [data-chip]").count();
  await page.locator("[data-mask-section]").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("[data-mask-section]")!.scrollIntoView({ block: "start" }));
  await takeScreen(page, "02-note-record-masks", await bundledLabel(page), "BUNDLED");
  await page.evaluate(() => window.scrollTo(0, 0));

  // One press: Draft shows the exact outgoing text, with no listed name in it.
  await press(page, "#draft");
  // H35a D8: Draft pauses on an unlisted name-like word (Bea) until she chooses keep or mask.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  const outgoing = (await page.locator("[data-outgoing]").innerText());
  for (const name of INVENTED_NAMES) expect(outgoing.toLowerCase()).not.toContain(name.toLowerCase());
  expect(outgoing).toMatch(/\[Person \d\]/);
  await expect(page.locator("[data-send-notice]")).toContainText("The cloud is off");

  // One press: Send. The double answers; the line is computed on the built body.
  await press(page, "#send");
  const egress = page.locator("[data-egress-line]");
  await expect(egress).toHaveAttribute("data-kind", "pass");
  await expect(egress).toContainText(/cloud off/i);
  const lineText = (await egress.innerText()).replace(/\s+/g, " ");
  await page.evaluate(() => window.scrollTo(0, 0));
  await takeScreen(page, "03-outgoing-egress-pass", await bundledLabel(page), "BUNDLED");

  // The finished note: labelled, names put back on this device.
  const sheet = page.locator('[data-zone="finished"] .sheet');
  await expect(sheet.locator(".sheet-text")).toBeVisible();
  const label = (await sheet.locator(".source-label").allInnerTexts()).join(" + ").replace(/\s+/g, " ");
  // Since the sixth review (R5) the note carries one mark while the cloud is off.
  expect(await sheet.locator(".source-label").count()).toBe(1);
  expect(label).toBe("names put back on this device; draft text is a fixed sample: cloud off");
  const finishedText = await sheet.locator(".sheet-text").innerText();
  expect(finishedText).toContain("Maria");
  expect(finishedText).not.toMatch(/[[{(][^\]})\n]{0,30}(?:Person|Place|Date|Detail)[ \t]*\d+/i);
  await expect(page.locator("#copy")).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await takeScreen(page, "05-finished-note", await bundledLabel(page), "BUNDLED");

  // drafting 13 / H4 online part, written for the README audit trail.
  const browser = `Chromium ${page.context().browser()!.version()} (Playwright 1.65.0 bundled, headless)`;
  const h4 = {
    date: new Date().toISOString().slice(0, 10),
    browser,
    note: "Online draft of the invented visit through the test double. The cloud is not connected. The offline part needs the device model and has not been run.",
    online: { source: "in the cloud", connected: false, label: label, egressLineKind: "pass", egressLine: lineText, finishedHasRestoredName: true },
    offline: { status: "not measured", reason: "DEVICE MODEL task (drafting 15) not run in this session" },
  };
  writeRecord("h4", h4, process.cwd(), nextRecordSuffix("h4"));
  await detail(info, { deviceModelState: state, chips: chipCount, label, egressLine: lineText, browserName });
});

test("Capture sends nothing: typing, a photo, the invented visit", async ({ page, context }, info) => {
  task(info, "capture-and-record 14");
  const rec = record(context);
  await page.goto(site.get().url);
  await page.locator("#start-visit").click();
  await expect(page.locator("#note")).toBeVisible();

  // The invented visit, then more typing on top of it, key by key.
  await press(page, "#try-example");
  await openHandEntryIfNeeded(page);
  await expect(page.locator("[data-record]")).toBeVisible();
  const typed = "Visit on Tuesday at nine, Priya Halloran was out. Left the form on the step.";
  // With a record the note and the list are folded (shell-and-offline R20.3); Edit unfolds each.
  await page.locator('[data-fold="note"] button').click();
  await page.locator('[data-fold="list"] button').click();
  await page.locator("#note").pressSequentially("\n" + typed, { delay: 2 });
  await page.locator("#client-list").pressSequentially("\nPriya Halloran; ; she/her", { delay: 2 });

  // An invented photo: a page drawn on a canvas inside the page, handed to the file input.
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 640, 320);
    g.fillStyle = "#222222";
    g.font = "28px sans-serif";
    ["Invented page", "Wed 9am flat 3", "Bea let me in", "Form posted Fri"].forEach((t, i) => g.fillText(t, 20, 60 + i * 60));
    return c.toDataURL("image/png").split(",")[1]!;
  });
  await page.setInputFiles("#photo-input", { name: "page.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") });
  await expect(page.locator("[data-photo-line]")).toBeVisible();

  await page.waitForTimeout(300);

  // The photo's text as the page would hold it: the file's base64, whole and in pieces of 48 characters.
  const pieces: string[] = [base64];
  for (let i = 0; i + 48 <= base64.length; i += 48) pieces.push(base64.slice(i, i + 48));
  const leaks = [
    ...findLeaks(rec.requests, { listedNames: INVENTED_NAMES, surfaceForms: [...pieces, "Priya Halloran"], rawNote: `${typed}\n${inventedVisit.note}` }),
  ];
  expect(leaks).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(rec.outside(origin)).toEqual([]);
  expect(rec.requests.filter((r) => r.method !== "GET")).toEqual([]);
  await detail(info, { requests: rec.requests.length, hosts: rec.hosts(), nonGet: 0, photoBase64Length: base64.length, piecesChecked: pieces.length });
});

test("No model: hand entry builds a full record and the prepared record loads with one press", async ({ page }, info) => {
  task(info, "capture-and-record 15");
  await page.goto(site.get().url);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("can be downloaded");
  const state = await modelState(page);
  expect(state).not.toBe("available");
  await page.locator("#start-visit").click();
  await expect(page.locator("[data-model-line]")).toBeVisible();
  await expect(page.locator("[data-past-measurement]")).toContainText("Past measurement of this project");
  await expect(page.locator("[data-past-measurement]")).toContainText("Not measured on this computer");
  await expect(page.locator("[data-past-measurement]")).toContainText("2026-11-13");
  await expect(page.locator("[data-model-steps]")).not.toContainText("author's computer");
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("author's computer");
  expect(text).not.toContain("results/");
  expect(text.toLowerCase()).not.toContain("chrome://");
  await expect(page.locator("#make-record")).toBeDisabled();

  // By hand: the client list, then an empty record filled in field by field.
  await page.locator("#client-list").fill(inventedVisit.clientList);
  await press(page, "#start-by-hand");
  await press(page, "#edit-record");
  await page.locator("#record-date").fill("2026-11-12");
  for (const [label, role] of [["Maria Okonkwo-Reyes", "client"], ["Bea", "other"], ["Dana Whitfield", "worker"]] as const) {
    await page.locator("#tag-label").fill(label);
    await page.locator("#tag-role").selectOption(role);
    await press(page, "#add-tag");
  }
  await page.locator("#record-seen").fill("Mould in the back bedroom, worse by the window.\nLetter about the benefits form on the table.");
  await page.locator("#record-agreed").fill("Worker rings the landlord on Monday.\nMaria posts the form on Friday.");
  await page.locator("#record-risks").fill("Rent arrears if the form is late.");
  await page.locator("#record-nextSteps").fill("Revisit on 26/11.");
  await expect(page.locator(".chips .chip")).toHaveCount(3);
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] .mask-chip.listed").first()).toBeVisible();
  const handChips = await page.locator("[data-mask-view] [data-chip]").count();
  await press(page, "#draft");
  expect(await page.locator("[data-outgoing]").innerText()).not.toContain("Okonkwo");

  // One press: the prepared invented record.
  const freshContext = await page.context().browser()!.newContext();
  const fresh = await freshContext.newPage();
  await fresh.goto(site.get().url);
  await press(fresh, "#try-example");
  await openHandEntryIfNeeded(fresh);
  await expect(fresh.locator("[data-record]")).toBeVisible();
  // The prepared record is folded to one line per field (shell-and-offline task 42): open the people to count them.
  await fresh.locator("#fold-present").click();
  await expect(fresh.locator(".chips .chip")).toHaveCount(3);
  await freshContext.close();
  await detail(info, { deviceModelState: state, handEntryChips: handChips });
});

test("Offline with no model: the online draft works, the offline case shows the no-model line", async ({ page, context }, info) => {
  task(info, "drafting 14");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await runToFinished(page);
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");

  const rec = record(context);
  await context.setOffline(true);
  await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline");
  await expect(page.locator('[data-zone="leaves"] .offline-line')).toBeVisible();
  await expect(page.locator("#send")).toBeDisabled();
  await press(page, "#draft");
  // A finished note is already on screen, so Draft asks before it will replace it.
  await press(page, "#replace-yes");
  const none = page.locator("[data-no-draft]");
  await expect(none).toBeVisible();
  const line = (await none.innerText()).replace(/\s+/g, " ");
  expect(line).toBe("No draft can be made right now. Your masked record is kept.");
  await expect(page.locator("[data-model-line]")).toContainText("It is not on this computer.");
  await expect(page.locator("#copy-masked")).toBeEnabled();
  expect(rec.requests.filter((r) => r.method === "POST")).toEqual([]);
  await detail(info, { noDraftLine: line });
});

test("H34b item 7(c): a reply with {she}, {{they:Person 1}} and {it:Mould} shows none of [ ] { } and one plain line, and Copy stays on", async ({ page, context }, info) => {
  task(info, "drafting 16");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  // The draft double writes the Seen line of the outgoing text into its note, so the three marks reach the restore step
  // as a model's reply would carry them. No cloud call is made.
  await page.goto(site.get().url);
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
  await page.locator("#start-visit").click();
  await page.locator("#client-list").fill(inventedVisit.clientList);
  await press(page, "#start-by-hand");
  await press(page, "#edit-record");
  await page.locator("#record-date").fill("2026-11-12");
  for (const [label, role] of [["Maria Okonkwo-Reyes", "client"], ["Tomas Brandvold", "other"], ["Dana Whitfield", "worker"]] as const) {
    await page.locator("#tag-label").fill(label);
    await page.locator("#tag-role").selectOption(role);
    await press(page, "#add-tag");
  }
  await page.locator("#record-seen").fill("{she} left the door open.\n{{they:Person 1}} showed the letter.\nMould on the wall and {it:Mould} spread.");
  await page.locator("#record-agreed").fill("Worker rings the landlord on Monday.");
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  await press(page, "#send");
  const sheet = page.locator('[data-zone="finished"] .sheet');
  await expect(sheet.locator(".sheet-text")).toBeVisible();

  const text = await sheet.locator(".sheet-text").innerText();
  const unreadLine = "The model left a mark the app could not read. Read the note before you copy.";
  const notes = (await sheet.locator("[data-note] li").allInnerTexts()).map((n) => n.trim());
  const copy = page.locator("#copy");
  const characters = [...text].filter((c) => "[]{}".includes(c)).length;
  await detail(info, { charactersOfBracketsOnTheSheet: characters, notes: notes.length, copyEnabled: await copy.isEnabled() });

  // 0 of the four characters on the sheet.
  expect(characters).toBe(0);
  expect(text).toContain("(pronoun not put back)");
  expect(text).toContain("and it spread");
  // The one plain line stands under the note. It is a line, not a flag.
  expect(notes.filter((n) => n === unreadLine)).toHaveLength(1);
  await expect(sheet.locator("[data-tag-not-matched]")).toHaveCount(0);
  // Copy is not held by it: no flag is open.
  await expect(page.locator("[data-copy-held]")).toHaveCount(0);
  await expect(copy).toBeEnabled();
  expect(((await copy.getAttribute("title")) ?? "").match(/[[\]{}]/g)).toBeNull();
  for (const b of await page.locator('[data-zone="finished"] button').all()) {
    expect(`${(await b.innerText()) ?? ""}${(await b.getAttribute("title")) ?? ""}`.match(/[[\]{}]/g)).toBeNull();
  }
});
