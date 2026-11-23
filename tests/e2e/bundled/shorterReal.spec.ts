// BUNDLED, with the real cloud. Failure test for "Shorter" against the real service (judge table fix 2).
//
// The bundled browser has no device model, so the rewrite job (PREFER_ON_DEVICE) is answered by the
// cloud model. The check fails when the answer is the test double, when the cloud call is not HTTP 200,
// when the label is not "in the cloud", or when the sentence shown does not have fewer characters than
// the sentence sent. It writes results/rewrite-real-service.json, a new file. It never edits
// results/rewrite-device-shorter.json or results/rewrite-device.json.
//
// Invented people only. The one masked sentence is what leaves. The Firebase web config and the App Check
// debug token are read from the local files by this test and handed to the page from memory; neither is
// printed, logged or written.
import { existsSync, readFileSync } from "node:fs";
import { CLOUD_MODEL_HOST, DEFAULT_CLOUD_MODEL } from "../../../src/constants";
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, task, test } from "../fixtures/base";
import { bundledLabel, holdScreen } from "../fixtures/screens";
import { PAID_NOTICE } from "../../../src/app/sendNotice";
import { nextRecordSuffix, writeRecord } from "../fixtures/records";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

const CONFIG_FILE = "firebase.config.local.json";
const DEBUG_TOKEN_FILE = "appcheck-debug-token.local";

let server: RunningServer;
test.beforeAll(async () => {
  if (!existsSync(CONFIG_FILE)) throw new Error("The local Firebase config file is not in the project root.");
  server = await startStaticServer({ dir: "dist-e2e", files: { "/firebase.config.local.json": readFileSync(CONFIG_FILE, "utf8") } });
});
test.afterAll(async () => {
  await server?.stop();
});

interface Seen {
  status: number;
  model: string;
  text: string;
  sentText: string;
}

test("Shorter against the real service: status 200, in the cloud, fewer characters", async ({ page, context }, info) => {
  task(info, "judge table fix 2");
  test.setTimeout(100_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  if (existsSync(DEBUG_TOKEN_FILE)) {
    const token = readFileSync(DEBUG_TOKEN_FILE, "utf8").trim();
    await context.addInitScript((t) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, token);
  }

  const calls: Promise<Seen>[] = [];
  const leakedNames: string[] = [];
  let recording = false;
  context.on("request", (r) => {
    if (!recording) return;
    const body = r.postData() ?? "";
    for (const n of INVENTED_NAMES) if (body.toLowerCase().includes(n.toLowerCase()) || r.url().toLowerCase().includes(n.toLowerCase())) leakedNames.push(n);
  });
  context.on("response", (res) => {
    const req = res.request();
    if (!recording || !req.url().includes(CLOUD_MODEL_HOST) || !req.url().includes(":generateContent")) return;
    calls.push(
      (async () => {
        const json = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
        const sent = JSON.parse(req.postData() ?? "{}") as { contents?: { parts?: { text?: string }[] }[] };
        return {
          status: res.status(),
          model: /\/models\/([^/:?]+):/.exec(req.url())?.[1] ?? "",
          text: (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim(),
          sentText: (sent.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? "").join(""),
        };
      })(),
    );
  });

  await openInventedVisit(page, server.url);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  // H35a D8: Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();

  // One sentence with a person tag, so the tag rule is exercised too.
  const sentences = page.locator("[data-outgoing] [data-sentence]");
  await expect(sentences.first()).toBeVisible();
  const texts = await sentences.allInnerTexts();
  const index = Math.max(0, texts.findIndex((t) => /\[Person \d+\]/.test(t) && t.length > 40));
  const chosen = texts[index] ?? "";
  const before = await page.locator("[data-outgoing]").innerText();

  recording = true;
  await sentences.nth(index).click();
  await expect(page.locator("[data-rewrite-controls]")).toBeVisible();
  await page.locator("#rewrite-shorter").click();
  // With the cloud on, the sentence waits for Send: the page shows the text that would leave first.
  await expect(page.locator("[data-rewrite-wait]").first()).toBeVisible();
  await press(page, "#send");
  await expect(page.locator("[data-rewrite-result], [data-rewrite-line]").first()).toBeVisible({ timeout: 60_000 });
  const seen = await Promise.all(calls);
  recording = false;

  const resultCount = await page.locator("[data-rewrite-result]").count();
  const lineShown = resultCount === 0 ? (await page.locator("[data-rewrite-line]").first().innerText()).trim() : null;
  const label = resultCount > 0 ? (await page.locator("[data-rewrite-result] .source-label").first().innerText()).replace(/\s+/g, " ").trim() : null;
  const after = await page.locator("[data-outgoing]").innerText();
  const head = before.split(chosen)[0] ?? "";
  const tail = before.split(chosen)[1] ?? "";
  const replacement = after.startsWith(head) && after.endsWith(tail) ? after.slice(head.length, after.length - tail.length) : null;
  const call = seen.find((s) => s.status === 200) ?? seen[0];

  const browser = await bundledLabel(page);
  const noticeShown = (await page.locator("[data-send-notice]").count()) > 0 ? ((await page.locator("[data-send-notice]").first().innerText()) ?? "").trim() : null;
  // H23: the picture is held now and written only when every check below passed.
  const retake = (process.env["RETAKE_SCREENS"] ?? "").split(",").map((n) => n.trim());
  let shot: Awaited<ReturnType<typeof holdScreen>> | null = null;
  if (retake.includes("16-shorter-real-service")) {
    await page.locator("[data-rewrite-result]").scrollIntoViewIfNeeded();
    shot = await holdScreen(page, "16-shorter-real-service", browser, "BUNDLED");
  }
  const record = {
    date: new Date().toISOString(),
    browser,
    noticeShown,
    what: "One real Shorter press on one masked sentence of the invented visit, answered by the cloud model through the page. Invented people only.",
    job: "rewrite (Shorter)",
    mode: "PREFER_ON_DEVICE, no device model in this browser, so the cloud answers",
    status: call?.status ?? null,
    callStatuses: seen.map((s) => s.status),
    model: call?.model ?? null,
    source: label,
    lineShown,
    sentenceSent: chosen,
    sentenceSentChars: chosen.length,
    sentenceReturned: call?.text ?? null,
    sentenceReturnedChars: call ? call.text.length : null,
    sentenceShown: replacement,
    sentenceShownChars: replacement === null ? null : replacement.length,
    observation:
      replacement !== null && replacement.length < chosen.length
        ? "The sentence shown has fewer characters than the sentence sent."
        : "The sentence shown does not have fewer characters than the sentence sent.",
  };
  writeRecord("rewrite-real-service", record, process.cwd(), nextRecordSuffix("rewrite-real-service", "h23"));
  await detail(info, { status: record.status, label, sent: chosen.length, shown: record.sentenceShownChars });

  // 1. The call went to the cloud and answered HTTP 200.
  expect(seen.length, "no cloud generateContent call was made: the answer was the test double or the device").toBeGreaterThan(0);
  expect(seen.map((s) => s.status)).toEqual(seen.map(() => 200));
  expect(call?.model).toBe(DEFAULT_CLOUD_MODEL);
  expect(call?.sentText).toContain(chosen);

  // 2. Not the test double, and labelled "in the cloud".
  expect(lineShown, `the answer was not used: ${lineShown}`).toBeNull();
  expect(label).toBe("in the cloud");
  expect(label).not.toContain("test double");
  await expect(page.locator('[data-rewrite-result] .source-label[data-source="test-double"]')).toHaveCount(0);

  // 3. The sentence shown has fewer characters than the sentence sent, and is on the screen.
  expect(replacement, "the replacement sentence was not found in the outgoing text").not.toBeNull();
  expect(replacement!.length).toBeLessThan(chosen.length);
  expect(after).not.toContain(chosen);
  expect(after).toContain(replacement!);

  // 4. No listed name left in any request of the press.
  expect(leakedNames, "a listed name was in a request").toEqual([]);

  // 5. The notice beside Send is the paid-tier notice, with no day count.
  expect(noticeShown).toBe(PAID_NOTICE);
  expect(noticeShown).not.toContain("55 days");
  expect(noticeShown).not.toContain("test double");
  // H23: writes screen 16 through holdScreen only when RETAKE_SCREENS names it and every check passed.
  shot?.commit();
});
