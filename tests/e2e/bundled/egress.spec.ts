// BUNDLED, e2e build (test hooks present). The cloud is not connected, so cloud steps use the test doubles.
//   egress-check 12 (H3): the seeded leak, in the failure colour, in words, with the crossed octagon. Screenshot 04.
//   egress-check 23 (H2 part A in full): masks, Shorter, draft, second reader, the ledger fold, with the request recorder; writes results/h2-part-a.json.
//   second-reader 8 and 9: click-through with the double, two ledger entries, the redaction line.
import type { Page } from "@playwright/test";
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { findLeaks } from "../../../src/egress/assertNoLeak";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";
import { bundledLabel, takeScreen } from "../fixtures/screens";
import { nextRecordSuffix, writeRecord } from "../fixtures/records";

const site = serveForFile("dist-e2e");

/** The ledger as the page keeps it on this device (IndexedDB, key "ledger", { version, entries }). */
async function ledgerEntries(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const open = indexedDB.open("doorstep-notes", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction("kv", "readonly").objectStore("kv").get("ledger");
          // The ledger is kept as { version, entries } since the fourth review; a bare list from an earlier build is read too.
          get.onsuccess = () => {
            const v = get.result as { entries?: Record<string, unknown>[] } | Record<string, unknown>[] | undefined;
            resolve(Array.isArray(v) ? v : (v?.entries ?? []));
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

async function toSend(page: Page): Promise<void> {
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  // H35a D8: Draft pauses on an unlisted name-like word (Bea) until she chooses keep or mask.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await press(page, "#send");
}

test("Seeded leak: the line fails in the failure colour, in words, with the crossed octagon", async ({ page }, info) => {
  task(info, "egress-check 12");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    (window as unknown as { __seedLeak: string }).__seedLeak = "Priya Halloran";
  });
  await openInventedVisit(page, site.get().url);
  await toSend(page);

  const line = page.locator("[data-egress-line]");
  await expect(line).toHaveAttribute("data-kind", "fail");
  await expect(line).toHaveAttribute("role", "alert");
  const text = (await line.innerText()).replace(/\s+/g, " ");
  expect(text).toContain("Egress check failed");
  expect(text).toContain("Found");
  expect(text).toContain("Priya Halloran");
  await expect(line.locator('[data-icon-name="crossedOctagon"] svg')).toBeVisible();
  expect(await line.locator('[data-icon-name="check"]').count()).toBe(0);
  const colours = await line.evaluate((e) => ({
    headline: getComputedStyle(e.querySelector(".egress-headline")!).color,
    icon: getComputedStyle(e.querySelector(".egress-icon")!).color,
  }));
  expect(colours.headline).toBe("rgb(179, 38, 30)"); // #B3261E
  expect(colours.icon).toBe("rgb(179, 38, 30)");
  // The card (egress-check R14.2): the verdict names the count and the names; the card holds no paragraph.
  expect(text).toMatch(/Found \d+ of \d+ listed names/);
  expect(await line.locator("[data-egress-card] p").count()).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await takeScreen(page, "04-egress-fail-seeded", await bundledLabel(page), "BUNDLED");
  // shell-and-offline 72 (P6): the same seeded leak, the card in view at 1440 x 900.
  task(info, "shell-and-offline 72");
  await line.scrollIntoViewIfNeeded();
  await takeScreen(page, "13-egress-fail-card", await bundledLabel(page), "BUNDLED");
  await detail(info, { text, colours });
});

test("P1: after a send the verdict is one line, the table has three rows and the card holds no paragraph", async ({ page }, info) => {
  task(info, "egress-check 28");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await toSend(page);
  const card = page.locator("[data-egress-card]");
  await expect(card).toBeVisible();
  const measured = await card.evaluate((c) => {
    const v = c.querySelector(".egress-headline") as HTMLElement;
    const cs = getComputedStyle(v);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    return {
      verdictLines: Math.round(v.getBoundingClientRect().height / lineHeight),
      rows: c.querySelectorAll("tr").length,
      paragraphs: c.querySelectorAll("p").length,
      verdict: v.textContent,
    };
  });
  expect(measured.verdictLines).toBe(1);
  expect(measured.rows).toBe(3);
  expect(measured.paragraphs).toBe(0);
  await detail(info, measured);
});

test("Without the seed the same run passes (the control for the seeded leak)", async ({ page }, info) => {
  task(info, "egress-check 12");
  await openInventedVisit(page, site.get().url);
  await toSend(page);
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
  expect(await page.locator("[data-egress-line].fail").count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { __seedLeak?: unknown }).__seedLeak)).toBeUndefined();
});

test("H2 part A in full: masks, Shorter, draft, second reader and the ledger fold against the doubles, every request recorded", async ({ page, context, browser }, info) => {
  task(info, "egress-check 23", "egress-check 13 (replaced)", "second-reader 9");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  // The rewrite double answers with an invented listed name; the masker must turn it into a tag before the sentence is used.
  await page.addInitScript(() => {
    (window as unknown as Record<string, string>)["__rewriteTo"] = "Maria Okonkwo-Reyes saw mould near the window.";
  });
  const rec = record(context);
  const steps: string[] = [];
  const origin = site.get().url;
  await openInventedVisit(page, origin);
  steps.push("load of the invented visit (record by hand entry with the prepared record)");

  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await page.locator("[data-mask-view] button.word", { hasText: /^Mould$/ }).first().click();
  await expect(page.locator("[data-mask-view] .mask-chip.manual")).toHaveCount(1);
  steps.push("masking: listed and near chips, and one word masked by a tap");

  await press(page, "#draft");
  // H35a D8: Draft pauses on an unlisted name-like word (Bea) until she chooses keep or mask.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  steps.push("draft through the double");
  const before = await page.locator("[data-outgoing]").innerText();
  const sentence = page.locator("[data-sentence]").first();
  await expect(sentence).toBeVisible();
  const original = (await sentence.innerText()).trim();
  await sentence.click();
  await press(page, "#rewrite-shorter");
  await expect(page.locator("[data-rewrite-result]")).toBeVisible();
  const afterRewrite = await page.locator("[data-outgoing]").innerText();
  expect(afterRewrite).not.toBe(before);
  expect(afterRewrite).not.toContain(original);
  expect(afterRewrite.toLowerCase()).not.toContain("maria");
  steps.push('"Shorter" on one sentence through the rewrite double');

  await press(page, "#send");
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();
  steps.push("send of the draft, egress check on the bytes");

  // The ledger fold: after a send it shows its entries as text and has no control that saves them anywhere.
  await page.locator("#fold-ledger").click();
  await expect(page.locator("[data-ledger-entries]")).toBeVisible();
  await expect(page.locator('[data-details="ledger"] button')).toHaveCount(0);
  steps.push("ledger fold: entries as text, no save control");
  await page.locator("#fold-ledger").click();

  // The second reader.
  await press(page, "#ask-reader");
  await expect(page.locator("[data-outgoing]")).toContainText("Instructions");
  await press(page, "#send");
  await expect(page.locator("[data-guess]").first()).toBeVisible();
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
  steps.push("second reader through the double");
  await page.waitForTimeout(300);

  const target = {
    listedNames: INVENTED_NAMES,
    surfaceForms: ["Maria O-R", "Mari", "Tomas Brandvald", "Brandvald", "Okonkwo-Reyes"],
    rawNote: inventedVisit.note,
  };
  const leaks = findLeaks(rec.requests, target);
  expect(leaks).toEqual([]);
  // None leaves the page: every request went to the served page; the service worker's are in the same record.
  expect(rec.outside(origin)).toEqual([]);
  expect(rec.requests.filter((r) => r.url.includes(CLOUD_MODEL_HOST))).toEqual([]);
  expect(rec.requests.filter((r) => r.method !== "GET")).toEqual([]);
  expect(rec.requests.filter((r) => r.postData && r.postData.length > 0)).toEqual([]);

  // The ledger on this device holds counts, hashes and times; no listed name. Draft, second reader, and the rewrite are all there.
  const ledger = await ledgerEntries(page);
  const jobs = ledger.map((e) => e["job"]);
  expect(jobs).toEqual(expect.arrayContaining(["draft", "secondReader"]));
  const ledgerText = JSON.stringify(ledger).toLowerCase();
  for (const n of INVENTED_NAMES) expect(ledgerText).not.toContain(n.toLowerCase());
  for (const e of ledger) expect(e["connected"]).toBe(false);

  // The seeded variant proves the assertion can fail.
  const seeded = findLeaks([...rec.requests, { url: `${origin}/x`, method: "POST", postData: "hello Priya Halloran" }], target);
  expect(seeded.map((l) => l.kind)).toContain("listed name");

  const report = {
    date: new Date().toISOString().slice(0, 10),
    browser: `Chromium ${browser.version()} (Playwright 1.65.0 bundled, headless)`,
    status: "pass",
    part: "A, in full, against the test doubles. The cloud is not connected.",
    steps,
    requestRecord: "every request seen by the browser context, which includes the page and any service worker",
    requests: {
      total: rec.requests.length,
      hosts: rec.hosts(),
      outsideThePage: rec.outside(origin).length,
      nonGet: 0,
      withABody: 0,
      toCloudModelHost: 0,
    },
    leaks: leaks.length,
    ledgerJobs: jobs,
    note: "Part B (the real cloud service) has not run. Not yet checked against the real service.",
  };
  writeRecord("h2-part-a", report, process.cwd(), nextRecordSuffix("h2-part-a"));
  await detail(info, report.requests);
});

test("Second reader: mask through a quote, ask again, two ledger entries, redaction line", async ({ page, context }, info) => {
  task(info, "second-reader 8");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    (window as unknown as { __readerWho: string }).__readerWho = "Priya Halloran, a tenant in a ground-floor flat";
  });
  await openInventedVisit(page, site.get().url);
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  // Ask stops while a word looks like an unlisted name. Mask it. Keeping it would leave it in the request this test checks.
  while ((await page.locator("[data-likely-word]").count()) > 0) await page.locator("[data-likely-word]").first().click();

  // First question.
  await press(page, "#ask-reader");
  await press(page, "#send");
  await expect(page.locator("[data-guess]").first()).toBeVisible();
  // The fixture reply names an invented listed client: the name is replaced on screen and the line says so.
  await expect(page.locator("[data-reader-redacted]")).toBeVisible();
  const who = await page.locator(".reader-who").first().innerText();
  expect(who).not.toContain("Priya");
  expect(who).not.toContain("Halloran");
  expect(who).toMatch(/\[Person \d+\]/);
  const redactedLine = await page.locator("[data-reader-redacted]").innerText();

  // Mask through a quote.
  const quote = page.locator("[data-reader] button[data-quote]").first();
  const quoted = await quote.getAttribute("data-quote");
  expect(quoted).toBeTruthy();
  await quote.click();
  await expect(page.locator('[data-reader] button[data-quote][aria-pressed="true"]').first()).toBeVisible();
  await expect(page.locator("[data-reader] [data-live]")).not.toHaveText("");

  // Ask again: the text for zone 2 no longer holds the quote.
  await expect(page.locator("#ask-reader")).toHaveText("Ask again");
  await press(page, "#ask-reader");
  const outgoing = await page.locator("[data-outgoing]").innerText();
  expect(outgoing).not.toContain(quoted!);
  await press(page, "#send");
  await expect(page.locator("[data-reader-redacted]")).toBeVisible();
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");

  // Two ledger entries for the second reader.
  await expect.poll(async () => (await ledgerEntries(page)).filter((e) => e["job"] === "secondReader").length).toBe(2);
  const entries = (await ledgerEntries(page)).filter((e) => e["job"] === "secondReader");
  for (const e of entries) {
    expect(e["mode"]).toBe("ONLY_IN_CLOUD");
    expect(e["connected"]).toBe(false);
  }
  await detail(info, { redactedLine, quoteMasked: quoted, ledgerEntries: entries.length });
});
