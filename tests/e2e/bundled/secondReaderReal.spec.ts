// BUNDLED, with the real cloud. One second-reader pass on bytes that actually left the device
// (judge table fix 5, second-reader tasks 11 and 12).
//
// The check fails when no bytes left (no cloud generateContent request was recorded), when the
// request did not answer HTTP 200, when the reader was the test double, when the label is not
// "in the cloud", or when the pass line on the screen disagrees with the request Playwright recorded.
// It writes results/second-reader-real-service.json, a new file, with the bytes the reader read.
//
// Invented people only. The firebase web config and the App Check debug token are read from the
// local files by this test and handed to the page from memory; neither is printed or written.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { CLOUD_MODEL_HOST, READER_CLOUD_MODEL } from "../../../src/constants";
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, task, test } from "../fixtures/base";
import { bundledLabel } from "../fixtures/screens";
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
  url: string;
  status: number;
  model: string;
  bytes: Buffer;
  sentText: string;
  reply: string;
}

test("Second reader against the real service: bytes left, status 200, in the cloud, shown on the screen", async ({ page, context }, info) => {
  task(info, "judge table fix 5", "second-reader 11", "second-reader 12");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  if (existsSync(DEBUG_TOKEN_FILE)) {
    const token = readFileSync(DEBUG_TOKEN_FILE, "utf8").trim();
    await context.addInitScript((t) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, token);
  }

  const calls: Promise<Seen>[] = [];
  const allRequests: { host: string; bytes: number }[] = [];
  const leakedNames: string[] = [];
  let recording = false;
  context.on("request", (r) => {
    if (!recording) return;
    const buf = r.postDataBuffer();
    allRequests.push({ host: new URL(r.url()).host, bytes: buf?.length ?? 0 });
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
          url: req.url(),
          status: res.status(),
          model: /\/models\/([^/:?]+):/.exec(req.url())?.[1] ?? "",
          bytes: req.postDataBuffer() ?? Buffer.alloc(0),
          sentText: (sent.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? "").join(""),
          reply: (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim(),
        };
      })(),
    );
  });

  await openInventedVisit(page, server.url);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();

  await press(page, "#ask-reader");
  const shownBeforeSend = (await page.locator("[data-outgoing]").innerText()).trim();
  recording = true;
  await press(page, "#send");
  await expect(page.locator("[data-reader-pass]")).toBeVisible({ timeout: 90_000 });
  const seen = await Promise.all(calls);
  recording = false;

  const passLine = (await page.locator("[data-reader-pass]").innerText()).replace(/\s+/g, " ").trim();
  const passLeft = await page.locator("[data-reader-pass]").getAttribute("data-left");
  const label = (await page.locator(".reader-source .source-label").first().innerText()).replace(/\s+/g, " ").trim();
  const readerError = (await page.locator("[data-reader-error]").count()) > 0 ? (await page.locator("[data-reader-error]").innerText()).trim() : null;
  const egress = (await page.locator("[data-egress-line]").innerText()).replace(/\s+/g, " ");
  const guesses = await page.locator("[data-guess] .reader-who").allInnerTexts();
  const call = seen.find((s) => s.status === 200) ?? seen[0];
  const sha = call ? createHash("sha256").update(call.bytes).digest("hex") : null;
  // What the browser sent, as Playwright saw it: requests with a body, not counting the page's own files.
  const withBody = allRequests.filter((r) => r.bytes > 0);
  const toModel = withBody.filter((r) => r.host === CLOUD_MODEL_HOST);
  const bytesToModel = toModel.reduce((n, r) => n + r.bytes, 0);
  const requestsToModel = toModel.length;

  const browser = await bundledLabel(page);
  const record = {
    date: new Date().toISOString(),
    browser,
    what: "One second-reader pass on the invented visit, answered by the cloud model through the page. Invented people only. The bytes the reader read are the bytes the browser sent.",
    job: "second reader",
    mode: "ONLY_IN_CLOUD",
    status: call?.status ?? null,
    callStatuses: seen.map((s) => s.status),
    host: call ? new URL(call.url).host : null,
    model: call?.model ?? null,
    source: label,
    bytesLeft: call?.bytes.length ?? 0,
    bytesToModel: bytesToModel,
    requestsToModel: requestsToModel,
    bytesIncludingAppCheck: withBody.reduce((n, r) => n + r.bytes, 0),
    requestsIncludingAppCheck: withBody.length,
    countsNote:
      "bytesToModel and requestsToModel count the call to the cloud model alone (bytesLeft is the same number). bytesIncludingAppCheck and requestsIncludingAppCheck count every request that had a body during the press, the App Check exchange included. The page shows both, each under its own words.",
    sha256OfBytesLeft: sha,
    requestsDuringPress: allRequests.length,
    requestsDuringPressByHost: allRequests.reduce<Record<string, number>>((m, r) => ({ ...m, [r.host]: (m[r.host] ?? 0) + 1 }), {}),
    textTheReaderRead: call?.sentText ?? null,
    textShownBeforeSend: shownBeforeSend,
    passLineOnScreen: passLine,
    passLeftOnScreen: passLeft,
    egressLine: egress,
    readerAnswer: call?.reply ?? null,
    guessesShown: guesses,
    readerErrorShown: readerError,
    observation:
      call && call.status === 200 && label === "in the cloud" && passLeft === "true"
        ? "Bytes left this device, the cloud answered 200, and the screen shows the pass."
        : "The pass did not complete as required. See the fields above.",
  };
  writeRecord("second-reader-real-service", record, process.cwd(), nextRecordSuffix("second-reader-real-service"));
  await detail(info, { status: record.status, label, bytes: record.bytesLeft });

  // 1. Bytes left, and the call answered HTTP 200 from the cloud model.
  expect(seen.length, "no cloud generateContent request was recorded: no bytes left, or a test double answered").toBeGreaterThan(0);
  expect(call!.bytes.length, "the request carried no bytes").toBeGreaterThan(0);
  expect(seen.map((s) => s.status)).toEqual(seen.map(() => 200));
  expect(call!.model).toBe(READER_CLOUD_MODEL);

  // 2. The reader is the cloud, not the test double.
  expect(readerError, `the reader failed: ${readerError}`).toBeNull();
  expect(label).toBe("in the cloud");
  expect(label).not.toContain("test double");
  expect(label).not.toContain("not connected");
  expect(call!.reply.length).toBeGreaterThan(0);

  // 3. What the reader read is the text she saw before Send, and no listed name was in any request.
  expect(call!.sentText).toBe(shownBeforeSend);
  expect(leakedNames, "a listed name was in a request").toEqual([]);

  // 4. The screen shows this pass, and agrees with the request Playwright recorded.
  expect(passLeft).toBe("true");
  expect(passLine).toContain(CLOUD_MODEL_HOST);
  expect(passLine).toContain(call!.model);
  expect(passLine).toContain(sha!.slice(0, 12));
  const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const plural = (n: number) => (n === 1 ? "one request" : `${n} requests`);
  expect(passLine).toContain(`Sent to the model: ${fmt(bytesToModel)} bytes in ${plural(requestsToModel)}.`);
  expect(passLine).toContain(`Including the App Check exchange: ${fmt(withBody.reduce((n, r) => n + r.bytes, 0))} bytes in ${plural(withBody.length)}.`);
  expect(bytesToModel).toBe(call!.bytes.length);
  // H20: this check writes no screen. Screen 17 is retaken only from the hybrid run, through holdScreen.
});
