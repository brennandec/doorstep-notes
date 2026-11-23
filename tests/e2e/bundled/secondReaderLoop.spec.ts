// BUNDLED, with the real cloud. One loop of the second reader (session H14, second-reader task 18, R9.7):
//   pass 1: ask, send, read what the reader infers;
//   she presses a chip that quotes unmasked words;
//   pass 2: ask again, send; no guess shown quotes the masked words, and the egress card counts them.
//
// With no device model the prepared record leaves "Bea" unmasked, so pass 1 has words to mask.
// At most two calls to the cloud model are allowed in one run (the third is stopped before it leaves).
// The record is a new file, results/second-reader-loop-<date>.json (a later run writes -2, -3, and so on).
// It holds hosts and counts, never a full URL: the App Check exchange URL carries the key and the app id.
// An existing results file is never opened for writing.
//
// Invented people only. The firebase web config and the App Check debug token are read from the
// local files by this test and handed to the page from memory; neither is printed or written.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { CLOUD_MODEL_HOST, READER_CLOUD_MODEL } from "../../../src/constants";
import { INVENTED_NAMES, detail, expect, openInventedVisit, press, task, test } from "../fixtures/base";
import { bundledLabel, holdScreen } from "../fixtures/screens";
import { PAID_NOTICE } from "../../../src/app/sendNotice";
import { nextRecordSuffix, writeRecord } from "../fixtures/records";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

const CONFIG_FILE = "firebase.config.local.json";
const DEBUG_TOKEN_FILE = "appcheck-debug-token.local";
/** The cap of this session for calls to the cloud model, here and in every run of this spec. */
const CALLS_THIS_RUN = 2;

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
  host: string;
  bytes: number;
  sha256: string;
  sentText: string;
}
interface ShownGuess {
  description: string;
  why: string;
  kind: string;
  quotes: string[];
  chips: string[];
}
interface PassRecord {
  pass: number;
  status: number | null;
  callStatuses: number[];
  model: string | null;
  host: string | null;
  modelCallBytes: number;
  modelCallSha256: string | null;
  requestsByHost: Record<string, number>;
  guessesShown: ShownGuess[];
  hiddenLine: string | null;
  maskedOnCard: { found: number; of: number } | null;
  source: string | null;
  readerError: string | null;
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function readGuesses(page: Page): Promise<ShownGuess[]> {
  const items = page.locator("[data-reader] [data-guess]");
  const out: ShownGuess[] = [];
  for (let i = 0; i < (await items.count()); i++) {
    const g = items.nth(i);
    const text = async (l: Locator, drop: string) => ((await l.count()) > 0 ? (await l.first().innerText()).replace(/\s+/g, " ").trim().replace(drop, "") : "");
    out.push({
      description: await text(g.locator(".reader-who"), "Guess: "),
      why: await text(g.locator("[data-reader-why]"), "Why: "),
      kind: await text(g.locator("[data-reader-kind]"), "Kind of clue: "),
      quotes: await g.locator("[data-quote]").evaluateAll((els) => els.map((e) => e.getAttribute("data-quote") ?? "")),
      chips: await g.locator("button[data-quote]").evaluateAll((els) => els.map((e) => e.getAttribute("data-quote") ?? "")),
    });
  }
  return out;
}

async function maskedOnCard(page: Page): Promise<{ found: number; of: number } | null> {
  const t = (await page.locator("[data-egress-line]").innerText()).replace(/\s+/g, " ");
  const m = /Masked values in the text sent (\d+) of (\d+)/.exec(t);
  return m ? { found: Number(m[1]), of: Number(m[2]) } : null;
}

test("Second reader loop against the real service: a guess is gone after she masks its words", async ({ page, context }, info) => {
  task(info, "H14", "second-reader 18");
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  if (existsSync(DEBUG_TOKEN_FILE)) {
    const token = readFileSync(DEBUG_TOKEN_FILE, "utf8").trim();
    await context.addInitScript((t) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, token);
  }

  // Counts every generateContent request that leaves, and stops the one after the cap before it goes.
  let generateContentCalls = 0;
  let stoppedAtCap = false;
  await context.route(
    (url) => url.hostname === CLOUD_MODEL_HOST && url.pathname.includes(":generateContent"),
    async (route) => {
      if (generateContentCalls >= CALLS_THIS_RUN) {
        stoppedAtCap = true;
        await route.abort("blockedbyclient");
        return;
      }
      generateContentCalls += 1;
      await route.fallback();
    },
  );

  let pass = 0;
  let calls: Promise<Seen>[] = [];
  let hostsOfPass: Record<string, number> = {};
  const leaked: string[] = [];
  context.on("request", (r) => {
    if (pass === 0) return;
    const host = new URL(r.url()).host;
    hostsOfPass[host] = (hostsOfPass[host] ?? 0) + 1;
    const body = r.postData() ?? "";
    for (const n of INVENTED_NAMES) if (body.toLowerCase().includes(n.toLowerCase()) || r.url().toLowerCase().includes(n.toLowerCase())) leaked.push(n);
  });
  context.on("response", (res) => {
    const req = res.request();
    if (pass === 0 || !req.url().includes(CLOUD_MODEL_HOST) || !req.url().includes(":generateContent")) return;
    calls.push(
      (async () => {
        const buf = req.postDataBuffer() ?? Buffer.alloc(0);
        const sent = JSON.parse(req.postData() ?? "{}") as { contents?: { parts?: { text?: string }[] }[] };
        return {
          status: res.status(),
          model: /\/models\/([^/:?]+):/.exec(req.url())?.[1] ?? "",
          host: new URL(req.url()).host,
          bytes: buf.length,
          sha256: createHash("sha256").update(buf).digest("hex"),
          sentText: (sent.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? "").join(""),
        };
      })(),
    );
  });

  const records: PassRecord[] = [];
  const sentTexts: string[] = [];
  const settlePass = async (n: number, previousLine: string | null): Promise<PassRecord> => {
    // The pass ends when the reader shows a result or an error. A new pass shows a new pass line.
    await expect
      .poll(
        async () => {
          if ((await page.locator("[data-reader-error]").count()) > 0) return "error";
          const line = (await page.locator("[data-reader-pass]").count()) > 0 ? (await page.locator("[data-reader-pass]").innerText()).trim() : "";
          return line !== "" && line !== previousLine ? "answered" : "waiting";
        },
        { timeout: 120_000, intervals: [500] },
      )
      .not.toBe("waiting");
    const seen = await Promise.all(calls);
    const call = seen.find((s) => s.status === 200) ?? seen[0];
    if (call) sentTexts.push(call.sentText);
    const rec: PassRecord = {
      pass: n,
      status: call?.status ?? null,
      callStatuses: seen.map((s) => s.status),
      model: call?.model ?? null,
      host: call?.host ?? null,
      modelCallBytes: call?.bytes ?? 0,
      modelCallSha256: call?.sha256 ?? null,
      requestsByHost: { ...hostsOfPass },
      guessesShown: await readGuesses(page),
      hiddenLine: (await page.locator("[data-reader-hidden]").count()) > 0 ? (await page.locator("[data-reader-hidden]").innerText()).trim() : null,
      maskedOnCard: await maskedOnCard(page),
      source: (await page.locator(".reader-source .source-label").count()) > 0 ? (await page.locator(".reader-source .source-label").first().innerText()).replace(/\s+/g, " ").trim() : null,
      readerError: (await page.locator("[data-reader-error]").count()) > 0 ? (await page.locator("[data-reader-error]").innerText()).trim() : null,
    };
    return rec;
  };

  await openInventedVisit(page, server.url);
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();

  // Pass 1.
  await press(page, "#ask-reader");
  pass = 1;
  calls = [];
  hostsOfPass = {};
  await press(page, "#send");
  const first = await settlePass(1, null);
  records.push(first);
  // H23: writes screen 18 after pass 2 through holdScreen, only when RETAKE_SCREENS names it and every check passed. Screen 17 is the hybrid run's.

  const browser = await bundledLabel(page);
  let held: Awaited<ReturnType<typeof holdScreen>> | null = null;
  let pressed: string | null = null;
  let second: PassRecord | null = null;
  let miss: string | null = null;

  const answered = first.status === 200 && first.readerError === null;
  const firstChip = answered ? page.locator('[data-reader] button[data-quote][aria-pressed="false"]').first() : null;
  if (!answered) {
    miss = `Pass 1 did not answer 200 with a result (statuses ${JSON.stringify(first.callStatuses)}, error ${JSON.stringify(first.readerError)}).`;
  } else if ((await firstChip!.count()) === 0) {
    miss = "Pass 1 showed no guess that quotes words she can mask.";
  } else {
    pressed = await firstChip!.getAttribute("data-quote");
    const line1 = (await page.locator("[data-reader-pass]").innerText()).trim();
    await firstChip!.click();
    await expect(page.locator(`[data-reader] button[data-quote][aria-pressed="true"]`).first()).toBeVisible();
    // Pass 2.
    await press(page, "#ask-reader");
    pass = 2;
    calls = [];
    hostsOfPass = {};
    await press(page, "#send");
    second = await settlePass(2, line1);
    records.push(second);
    // H23: screen 18 is pass 2, held now and written only when every check below passed.
    if ((process.env["RETAKE_SCREENS"] ?? "").split(",").map((n) => n.trim()).includes("18-second-reader-ask-again")) {
      await page.locator("[data-reader]").scrollIntoViewIfNeeded();
      held = await holdScreen(page, "18-second-reader-ask-again", browser, "BUNDLED");
    }
  }
  pass = 0;

  const noticeShown = (await page.locator("[data-send-notice]").count()) > 0 ? ((await page.locator("[data-send-notice]").first().innerText()) ?? "").trim() : null;
  // The checks, computed before the record is written so that the record carries their outcome.
  const checks: Record<string, boolean | null> = {
    noticeIsPaid: noticeShown === PAID_NOTICE && !noticeShown.includes("55 days") && !noticeShown.includes("test double"),
    everyCallAnswered200: records.every((r) => r.callStatuses.length > 0 && r.callStatuses.every((s) => s === 200)),
    modelWasTheReadersModel: records.every((r) => r.model === READER_CLOUD_MODEL),
    maskedWordsNotQuotedInPass2: second && pressed ? !second.guessesShown.some((g) => g.quotes.some((q) => fold(q).includes(fold(pressed!)))) : null,
    maskedWordsNotSentInPass2: second && pressed && sentTexts[1] !== undefined ? !fold(sentTexts[1]).includes(fold(pressed)) : null,
    cardCountsMaskedValue: second && first.maskedOnCard && second.maskedOnCard ? second.maskedOnCard.of === first.maskedOnCard.of + 1 : null,
    noListedNameInAnyRequest: leaked.length === 0,
  };
  const quotedInPass1 = pressed ? first.guessesShown.filter((g) => g.chips.some((q) => fold(q) === fold(pressed!))).map((g) => g.description) : [];
  const stillInPass2 = pressed && second ? second.guessesShown.filter((g) => g.chips.some((q) => fold(q).includes(fold(pressed!)))).map((g) => g.description) : [];

  const record = {
    date: new Date().toISOString(),
    browser,
    noticeShown,
    what: "One loop of the second reader on the invented visit, through the page and the real service: ask and send, mask the words of one guess, ask again and send. Invented people only. Hosts and counts only; no URL is written.",
    job: "second reader",
    mode: "ONLY_IN_CLOUD",
    readerModelAsked: READER_CLOUD_MODEL,
    generateContentCalls,
    stoppedAtCap,
    capOfThisSession: 4,
    maskedByHerBetweenPasses: pressed,
    guessesQuotingThoseWordsInPass1: quotedInPass1,
    guessesQuotingThoseWordsInPass2: stillInPass2,
    passes: records,
    checks,
    miss,
    observation:
      miss ?? (Object.values(checks).every((v) => v === true) ? "Both passes answered 200 and no guess in pass 2 quotes the words she masked." : "A check below failed. See the checks field."),
  };
  const file = writeRecord("second-reader-loop", record, process.cwd(), nextRecordSuffix("second-reader-loop", "h23"));
  await detail(info, { file, generateContentCalls, checks });

  expect(miss, miss ?? "").toBeNull();
  expect(stoppedAtCap, "a call was stopped at the cap").toBe(false);
  for (const [name, ok] of Object.entries(checks)) expect(ok, name).toBe(true);
  // Each pass shows a description and at least one chip (screens 17 and 18).
  for (const r of records) {
    expect(r.guessesShown.length, `pass ${r.pass} showed no guess`).toBeGreaterThan(0);
    expect(r.guessesShown.every((g) => g.description !== ""), `pass ${r.pass}: a guess had no description`).toBe(true);
  }
  expect(first.guessesShown.some((g) => g.chips.length > 0), "pass 1 showed no chip").toBe(true);
  held?.commit();
});
