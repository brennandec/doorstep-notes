// BUNDLED, with the real cloud. One real cloud draft on the page (judge table fix 1).
//
// The check fails when the draft is the test double, when the cloud call is not HTTP 200, or when the
// finished note carries the test-double mark. It writes the next free results/cloud-draft-<UTC date>.json (never over an
// older one) with the status, the number of generateContent calls and the draft text the cloud returned. It never edits an older probe file.
//
// Invented people only. The text that leaves is the masked outgoing text she saw. The Firebase web
// config is read from the local file by this test and handed to the page from memory by the static
// server; it is not printed, logged or written anywhere. The App Check debug token is read the same way
// and set in the page before the app starts; it is not printed or written either.
import { existsSync, readFileSync } from "node:fs";
import { CLOUD_MODEL_HOST, DEFAULT_CLOUD_MODEL } from "../../../src/constants";
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, task, test } from "../fixtures/base";
import { bundledLabel } from "../fixtures/screens";
import { nextRecordSuffix, writeRecord } from "../fixtures/records";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

// H20: each run writes results/cloud-draft-<date>-h20.json through writeRecord. No earlier record is overwritten.
const CONFIG_FILE = "firebase.config.local.json";
const DEBUG_TOKEN_FILE = "appcheck-debug-token.local";

let server: RunningServer;
test.beforeAll(async () => {
  // Needs the local config. Without it the check fails with its reason, never passes.
  if (!existsSync(CONFIG_FILE)) throw new Error("The local Firebase config file is not in the project root.");
  server = await startStaticServer({
    dir: "dist-e2e",
    files: { "/firebase.config.local.json": readFileSync(CONFIG_FILE, "utf8") },
  });
});
test.afterAll(async () => {
  await server?.stop();
});

interface Seen {
  status: number;
  model: string;
  body: unknown;
  requestBytes: number;
}

test("One real cloud draft: status 200, not the test double", async ({ page, context }, info) => {
  task(info, "judge table fix 1");
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // The registered App Check debug token, set before the app starts (the app keeps a string token).
  if (existsSync(DEBUG_TOKEN_FILE)) {
    const token = readFileSync(DEBUG_TOKEN_FILE, "utf8").trim();
    await context.addInitScript((t) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, token);
  }

  const cloudCalls: Promise<Seen>[] = [];
  const outsideHosts = new Set<string>();
  const leakedNames: string[] = [];
  context.on("request", (r) => {
    const url = new URL(r.url());
    if (!r.url().startsWith(server.url)) outsideHosts.add(url.host);
    const body = r.postData() ?? "";
    for (const n of INVENTED_NAMES) if (body.toLowerCase().includes(n.toLowerCase()) || r.url().toLowerCase().includes(n.toLowerCase())) leakedNames.push(n);
  });
  context.on("response", (res) => {
    const req = res.request();
    if (!req.url().includes(CLOUD_MODEL_HOST) || !req.url().includes(":generateContent")) return;
    cloudCalls.push(
      (async () => ({
        status: res.status(),
        model: /\/models\/([^/:?]+):/.exec(req.url())?.[1] ?? "",
        body: await res.json().catch(() => null),
        requestBytes: req.postDataBuffer()?.length ?? 0,
      }))(),
    );
  });

  await openInventedVisit(page, server.url);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  // H35a D8: Draft pauses on an unlisted name-like word (Bea) until she chooses keep or mask.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await press(page, "#send");
  const sheet = page.locator('[data-zone="finished"] .sheet');
  await expect(sheet.locator(".sheet-text")).toBeVisible({ timeout: 60_000 });

  const seen = await Promise.all(cloudCalls);
  const finishedNote = (await sheet.locator(".sheet-text").innerText()).trim();
  const label = (await sheet.locator(".source-label").allInnerTexts()).join(" + ").replace(/\s+/g, " ");
  const egress = (await page.locator("[data-egress-line]").innerText()).replace(/\s+/g, " ");
  const draftSeen = seen.find((s) => s.status === 200);
  const candidates = (draftSeen?.body as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null)?.candidates;
  const draftText = (candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();

  // The record is written first, so a failed run leaves its own honest status behind.
  const browser = await bundledLabel(page);
  const record = {
    date: new Date().toISOString(),
    browser,
    what: "One real cloud draft of the invented visit, made through the page. Invented people only. The text sent is the masked outgoing text.",
    status: draftSeen?.status ?? seen[seen.length - 1]?.status ?? null,
    callStatuses: seen.map((s) => s.status),
    generateContentCalls: seen.length,
    model: draftSeen?.model ?? seen[0]?.model ?? null,
    requestBytes: draftSeen?.requestBytes ?? null,
    draftText,
    finishedNote,
    label,
    egressLine: egress,
    hostsOutsideThePage: [...outsideHosts].sort(),
  };
  writeRecord("cloud-draft", record, process.cwd(), nextRecordSuffix("cloud-draft"));
  await detail(info, { status: record.status, model: record.model, label });

  // 1. The call went to the cloud and answered HTTP 200.
  expect(seen.length, "no cloud generateContent call was made: the draft was the test double").toBeGreaterThan(0);
  expect(seen.map((s) => s.status), "every cloud call must answer 200").toEqual(seen.map(() => 200));
  expect(draftSeen?.model).toBe(DEFAULT_CLOUD_MODEL);
  expect(draftText.length).toBeGreaterThan(40);

  // 2. The draft is not the test double.
  expect(draftText).not.toContain("drafted by a test double");
  expect(finishedNote).not.toContain("drafted by a test double");
  expect(label).not.toContain("test double");
  expect(label).not.toContain("cloud not connected");
  expect(label).toContain("in the cloud");
  // One mark on the finished note. A restored name does not add "on this device".
  const receiptMark = sheet.locator("[data-receipt] .source-label");
  await expect(receiptMark).toHaveCount(1);
  await expect(receiptMark).toHaveAttribute("data-source", "IN_CLOUD");
  expect((await receiptMark.innerText()).replace(/\s+/g, " ")).toBe("in the cloud");
  await expect(sheet.locator('.source-label[data-source="names-restored"]')).toHaveCount(0);
  await expect(sheet.locator('.source-label[data-source="test-double"]')).toHaveCount(0);
  await expect(sheet.locator('.source-label[data-source="not-connected"]')).toHaveCount(0);

  // 3. The names are put back on this device, and no listed name went out in any request.
  expect(finishedNote).toContain("Maria Okonkwo-Reyes");
  // Plain text she can paste (drafting R15): no Markdown mark, no tag or token in any form.
  expect(finishedNote, "a pair of double asterisks is left").not.toContain("**");
  expect(finishedNote.split("\n").some((l) => /^#{1,6}\s/.test(l)), "a heading line is left").toBe(false);
  expect(finishedNote).not.toMatch(/[[{(][^\]})\n]{0,30}(?:Person|Place|Date|Detail)[ \t]*\d+/i);
  expect(seen.length, "the session may make one cloud call").toBe(1);
  expect(leakedNames, "a listed name was in a request").toEqual([]);
  await expect(page.locator("[data-egress-line]")).toHaveAttribute("data-kind", "pass");
  // H20: this check writes no screen. Screen 05 is retaken only from the hybrid run, through holdScreen.
});
