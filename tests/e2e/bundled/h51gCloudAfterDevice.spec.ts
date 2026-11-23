// BUNDLED, with the real cloud. Order R17 session B, item 5 (H51g): a cloud draft after the device model was
// fetched, in ONE page. Two getAI calls in one page, device-only app first (the get-model press), default app
// second (the cloud draft). This is the order the D9 reading of release 16 leaves untested.
//
// Playwright's bundled Chromium has no usable device model, so a stand-in LanguageModel is installed at page
// start: availability() reads "downloadable" until create() is called (the get-model press calls it through the
// SDK's initializeDeviceModel), then "available". The SDK, the device-only app and the page code are the real
// ones; only the browser's model is a test double. It is not a real device model and produces no model output
// beyond the tiny readiness answer and an empty list of mask suggestions.
//
// The check fails when the local Firebase config is absent (never passes), when the cloud draft is not HTTP 200,
// or when the finished note does not carry the cloud source label. The assertion is not weakened when the cloud
// refuses: the status and the body are written to results/cloud-after-device-<UTC date>.json first.
// Real cloud calls: at most CALLS_THIS_RUN generateContent call; the budget guard in fixtures/base.ts stops at 40.
//
// Invented people only. The Firebase web config and the App Check debug token are read here and handed to the
// page from memory; they are not printed, logged or written.
import { existsSync, readFileSync } from "node:fs";
import { CLOUD_MODEL_HOST, DEFAULT_CLOUD_MODEL } from "../../../src/constants";
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, task, test } from "../fixtures/base";
import { writeNewRecord } from "../fixtures/records";
import { bundledLabel } from "../fixtures/screens";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

const CONFIG_FILE = "firebase.config.local.json";
const DEBUG_TOKEN_FILE = "appcheck-debug-token.local";
const CALLS_THIS_RUN = 1;

let server: RunningServer;
test.beforeAll(async () => {
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
}

function freeRecordFile(date: string): string {
  const base = `results/cloud-after-device-${date}`;
  for (let n = 1; ; n++) {
    const f = n === 1 ? `${base}.json` : `${base}-${n}.json`;
    if (!existsSync(f)) return f;
  }
}

test("A cloud draft after the device model was fetched, in one page: HTTP 200, labelled in the cloud", async ({ page, context }, info) => {
  task(info, "R17 item 5");
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  if (existsSync(DEBUG_TOKEN_FILE)) {
    const token = readFileSync(DEBUG_TOKEN_FILE, "utf8").trim();
    await context.addInitScript((t) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, token);
  }
  // The stand-in browser model. availability() is "downloadable" until create() runs, then "available".
  await context.addInitScript(() => {
    let created = false;
    const session = { inputQuota: 6000, measureInputUsage: async () => 5, prompt: async (input: unknown) => (String(input).startsWith('Return {"ok"') ? '{"ok":true}' : '{"candidates":[]}'), destroy() {} };
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => (created ? "available" : "downloadable"),
      create: async (options?: { monitor?: (m: EventTarget) => void }) => {
        const target = new EventTarget();
        options?.monitor?.(target);
        const ev = new Event("downloadprogress") as Event & { loaded: number };
        ev.loaded = 1;
        target.dispatchEvent(ev);
        created = true;
        return session;
      },
    };
  });

  const cloudCalls: Promise<Seen>[] = [];
  const outsideHosts = new Set<string>();
  const leakedNames: string[] = [];
  const appCheckExchanges: number[] = [];
  context.on("request", (r) => {
    const url = new URL(r.url());
    if (!r.url().startsWith(server.url)) outsideHosts.add(url.host);
    if (url.hostname === "content-firebaseappcheck.googleapis.com") appCheckExchanges.push(1);
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
      }))(),
    );
  });

  // Invented visit, record entered by hand (the page has no usable model yet), then the masking step.
  await openInventedVisit(page, server.url);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();

  // The get-model press: the device-only app's getAI runs here, before any cloud call.
  const deviceBefore = (await page.locator('[data-state="device"] .state-words').innerText()).trim();
  await press(page, "#get-model");
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
  const deviceAfter = (await page.locator('[data-state="device"] .state-words').innerText()).trim();
  const callsBeforeDraft = cloudCalls.length;

  // One cloud draft in the same page (the default app's getAI).
  await press(page, "#draft");
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await press(page, "#send");
  const sheet = page.locator('[data-zone="finished"] .sheet');
  let finishedShown = true;
  await sheet.locator(".sheet-text").waitFor({ state: "visible", timeout: 60_000 }).catch(() => {
    finishedShown = false;
  });

  const seen = await Promise.all(cloudCalls);
  const finishedNote = finishedShown ? (await sheet.locator(".sheet-text").innerText()).trim() : "";
  const label = finishedShown ? (await sheet.locator(".source-label").allInnerTexts()).join(" + ").replace(/\s+/g, " ") : "";
  const egress = (await page.locator("[data-egress-line]").innerText().catch(() => "")).replace(/\s+/g, " ");
  const pageNote = finishedShown ? "" : (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 600);

  const record = {
    order: "R17 session B item 5 (H51g)",
    date: new Date().toISOString(),
    browser: await bundledLabel(page),
    what: "One cloud draft of the invented visit in the same page after the get-model press. The browser's model was a stand-in LanguageModel (availability downloadable, then available after create). Invented people only.",
    sequence: ["get-model press (device-only app getAI, stand-in model)", "cloud draft (default app getAI, real service)"],
    deviceStateBeforePress: deviceBefore,
    deviceStateAfterPress: deviceAfter,
    cloudCallsBeforeTheDraft: callsBeforeDraft,
    generateContentCalls: seen.length,
    appCheckExchanges: appCheckExchanges.length,
    callStatuses: seen.map((s) => s.status),
    // The status and the body of each call, as observed; on a refusal this is the finding.
    calls: seen.map((s) => ({ status: s.status, model: s.model, body: s.body })),
    finishedNoteShown: finishedShown,
    finishedNote,
    label,
    egressLine: egress,
    pageTextWhenNoFinishedNote: pageNote,
    hostsOutsideThePage: [...outsideHosts].sort(),
    leakedListedNames: leakedNames,
  };
  writeNewRecord(freeRecordFile(record.date.slice(0, 10)), record);
  await detail(info, { statuses: record.callStatuses, label, deviceAfter });

  // The order's assertions. Not weakened on a refusal.
  expect(deviceAfter).toBe("ready");
  expect(callsBeforeDraft, "the get-model press made a call to the cloud model").toBe(0);
  expect(seen.length, "no cloud generateContent call was made after the get-model press").toBeGreaterThan(0);
  expect(seen.length, "the run may make one cloud call").toBeLessThanOrEqual(CALLS_THIS_RUN);
  expect(seen.map((s) => s.status), "the cloud draft must answer HTTP 200").toEqual(seen.map(() => 200));
  expect(seen[0]?.model).toBe(DEFAULT_CLOUD_MODEL);
  expect(finishedShown, "the finished note did not appear").toBe(true);
  expect(label).toContain("in the cloud");
  expect(label).not.toContain("on this device; draft");
  await expect(sheet.locator('.source-label[data-source="test-double"]')).toHaveCount(0);
  await expect(sheet.locator('.source-label[data-source="not-connected"]')).toHaveCount(0);
  expect(finishedNote).not.toContain("drafted by a test double");
  expect(leakedNames, "a listed name was in a request").toEqual([]);
});
