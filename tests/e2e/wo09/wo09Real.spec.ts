// WO-09 acceptance. Outside tests/e2e/bundled/ on purpose: the bundled results ledger
// must name every spec in that folder as already passed. This file is not part of that set.
//
// Ten invented visits, two asks each, at most 20 generateContent calls. The shared Sunday
// ledger stays at budget 40. This spec stops at 20 of its own calls and also stops when
// that ledger is full. Set WO09_REAL=1 or the test skips and spends nothing.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";
import { PLACE_CLUE, RELATION_CLUE } from "../../../src/app/example/inventedVisit";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { findWholeWords } from "../../../src/masking/fold";
import { readLedger, recordDailyCloudCall } from "../fixtures/cloudCalls";
import { expect, test } from "../fixtures/base";
import { nextRecordSuffix, writeRecord } from "../fixtures/records";
import { startStaticServer, type RunningServer } from "../fixtures/staticServer";

const CONFIG_FILE = "firebase.config.local.json";
const DEBUG_TOKEN_FILE = "appcheck-debug-token.local";
const CALL_CAP = 20;
const SPEC = "wo09Real.spec.ts";

let server: RunningServer | undefined;
let token = "";

function clip(value: string): string {
  return value.replace(/\/Users\/\S+/g, "[path]").replace(/https?:\/\/\S+/g, "[url]").slice(0, 180);
}

function quotes(text: string, term: string): boolean {
  return term !== "" && findWholeWords(text, term).length > 0;
}

interface GuessRow {
  description: string;
  why: string;
  kind: string;
  quotes: string[];
}

function rowQuotes(row: GuessRow, term: string): boolean {
  return quotes(row.description, term) || quotes(row.why, term) || quotes(row.kind, term) || row.quotes.some((q) => quotes(q, term));
}

async function readGuesses(page: Page): Promise<GuessRow[]> {
  const items = page.locator("[data-reader] [data-guess]");
  const out: GuessRow[] = [];
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    const g = items.nth(i);
    const text = async (sel: string, drop: string) => {
      const loc = g.locator(sel);
      if ((await loc.count()) === 0) return "";
      return clip((await loc.first().innerText()).replace(/\s+/g, " ").trim().replace(drop, ""));
    };
    out.push({
      description: await text(".reader-who", "Guess: "),
      why: await text("[data-reader-why]", "Why: "),
      kind: await text("[data-reader-kind]", "Kind of clue: "),
      quotes: await g.locator("[data-quote]").evaluateAll((els) => els.map((e) => (e.getAttribute("data-quote") ?? "").slice(0, 180))),
    });
  }
  return out;
}

async function waitForAnswer(page: Page, previous: string | null): Promise<"answered" | "error" | "timeout"> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if ((await page.locator("[data-reader-error]").count()) > 0) return "error";
    const pass = page.locator("[data-reader-pass]");
    if ((await pass.count()) > 0) {
      const line = (await pass.first().innerText()).trim();
      if (line !== "" && line !== previous) return "answered";
    }
    await page.waitForTimeout(500);
  }
  return "timeout";
}

test.beforeAll(async () => {
  if (process.env["WO09_REAL"] !== "1") return;
  if (!existsSync(CONFIG_FILE) || !existsSync(DEBUG_TOKEN_FILE)) throw new Error("local file missing");
  const raw = readFileSync(DEBUG_TOKEN_FILE, "utf8").trim();
  if (raw.length === 0) throw new Error("local file empty");
  token = raw;
  server = await startStaticServer({
    dir: "dist-e2e",
    limitMs: 50 * 60 * 1000,
    files: { "/firebase.config.local.json": readFileSync(CONFIG_FILE) },
  });
});

test.afterAll(async () => {
  await server?.stop();
});

test("ten invented visits, one press between two asks", async ({ browser }, info) => {
  test.skip(process.env["WO09_REAL"] !== "1", "WO09_REAL is not 1");
  test.setTimeout(2_400_000);
  const label = `Chromium ${browser.version()} (Playwright, headless)`;
  const counter = { calls: 0, stopped: false };
  const runs: Record<string, unknown>[] = [];
  let stoppedBecause: string | null = null;

  const arm = async (context: BrowserContext): Promise<void> => {
    await context.addInitScript((t) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, token);
    await context.route(
      (url) => url.hostname === CLOUD_MODEL_HOST && url.pathname.includes(":generateContent"),
      async (route) => {
        if (counter.calls >= CALL_CAP) {
          counter.stopped = true;
          await route.abort("blockedbyclient");
          return;
        }
        const { allowed } = recordDailyCloudCall(SPEC, info.title, label);
        if (!allowed) {
          counter.stopped = true;
          await route.abort("blockedbyclient");
          return;
        }
        counter.calls += 1;
        await route.continue();
      },
    );
  };

  for (let n = 1; n <= 10; n++) {
    if (counter.calls + 2 > CALL_CAP) {
      stoppedBecause = "20-call share would be exceeded";
      break;
    }
    const ledger = readLedger();
    if (ledger.total + 2 > ledger.budget) {
      stoppedBecause = `shared ledger has ${ledger.total} of ${ledger.budget}`;
      break;
    }
    const started = counter.calls;
    const sharedBefore = ledger.total;
    const seen: { status: number; host: string; bytes: number; sha256: string; quotedPlace: boolean; quotedRelation: boolean }[] = [];
    let phrase = "";
    const context = await browser.newContext();
    const page = await context.newPage();
    const run: Record<string, unknown> = { run: n };
    try {
      await arm(context);
      context.on("response", (res) => {
        const req = res.request();
        if (!req.url().includes(CLOUD_MODEL_HOST) || !req.url().includes(":generateContent")) return;
        const buf = req.postDataBuffer() ?? Buffer.alloc(0);
        let sent = "";
        try {
          const body = JSON.parse(req.postData() ?? "{}") as { contents?: { parts?: { text?: string }[] }[] };
          sent = (body.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? "").join("");
        } catch {
          sent = "";
        }
        let host = "";
        try { host = new URL(req.url()).host; } catch { host = ""; }
        seen.push({
          status: res.status(),
          host,
          bytes: buf.length,
          sha256: createHash("sha256").update(buf).digest("hex"),
          quotedPlace: quotes(sent, PLACE_CLUE),
          quotedRelation: quotes(sent, RELATION_CLUE),
        });
      });
      await page.goto(server!.url);
      await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("", { timeout: 30_000 });
      await page.locator("#try-example").click();
      await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
      await page.locator("#make-record").click();
      await expect(page.locator("[data-masks-step]")).toBeVisible();
      // The quiet masks step has no keep control. Edit opens the rows, then Mask
      // shows an unlisted word while the draft gate is still off. Keeping it there
      // does not start a draft. Resolving it after the gate would.
      await page.locator("#edit-record").click();
      await expect(page.locator("#mask")).toBeEnabled({ timeout: 10_000 });
      await page.locator("#mask").click();
      await expect(page.locator("[data-mask-view]")).toBeVisible();
      for (let guard = 0; guard < 12; guard++) {
        if ((await page.locator("[data-resolve-before-draft]").count()) > 0) break;
        const keep = page.locator("[data-keep-likely]");
        if ((await keep.count()) === 0) break;
        await keep.first().click();
      }
      run["device"] = clip((await page.locator('[data-state="device"] .state-words').innerText()).replace(/\s+/g, " ").trim());
      run["keepBeforeAsk"] = await page.locator("[data-keep-likely]").count();
      run["likelyBeforeAsk"] = await page.locator("[data-likely-word]").count();
      if ((await page.locator("[data-resolve-before-draft]").count()) > 0) {
        stoppedBecause = "draft gate is up before the ask";
      } else {
      await expect(page.locator("#ask-reader")).toHaveCount(1);
      await page.locator("#ask-reader").click();
      if ((await page.locator("[data-resolve-before-draft]").count()) > 0) {
        run["gateAfterAsk"] = await page.locator("[data-keep-likely]").count();
        stoppedBecause = "draft gate is up; resolving it would start a draft";
      } else {
      await expect(page.locator("#send")).toBeEnabled({ timeout: 15_000 });
      await page.locator("#send").click();
      const firstWait = await waitForAnswer(page, null);
      const firstGuesses = await readGuesses(page);
      const first = firstGuesses[0] ?? null;
      const firstQuotesClue = first ? rowQuotes(first, PLACE_CLUE) || rowQuotes(first, RELATION_CLUE) : false;
      const passLine = (await page.locator("[data-reader-pass]").count()) > 0 ? (await page.locator("[data-reader-pass]").first().innerText()).trim() : "";
      const errorLine = (await page.locator("[data-reader-error]").count()) > 0 ? clip(await page.locator("[data-reader-error]").first().innerText()) : "";
      run["firstWait"] = firstWait;
      run["firstQuotesClue"] = firstQuotesClue;
      run["firstGuess"] = first;
      run["firstError"] = errorLine;
      const badStatus = seen.find((s) => s.status >= 400);
      if (badStatus) {
        run["stop"] = badStatus.status;
        stoppedBecause = `model status ${badStatus.status}`;
      } else if ((await page.locator("#mask-clue").count()) === 0) {
        run["maskClue"] = false;
        stoppedBecause = counter.calls === started ? "no model call and no mask control" : "no mask control after the first ask";
      } else {
        phrase = (await page.locator("#mask-clue").getAttribute("data-quoted-clue")) ?? "";
        run["maskedPhraseIsPlace"] = phrase === PLACE_CLUE;
        run["maskedPhraseIsRelation"] = phrase === RELATION_CLUE;
        await page.locator("#mask-clue").click();
        await page.locator("#ask-reader").click();
        await expect(page.locator("#send")).toBeEnabled({ timeout: 15_000 });
        const beforeSecond = seen.length;
        await page.locator("#send").click();
        const secondWait = await waitForAnswer(page, passLine);
        const secondGuesses = await readGuesses(page);
        const secondQuoted = phrase !== "" && secondGuesses.some((g) => rowQuotes(g, phrase));
        const secondSent = seen.slice(beforeSecond);
        const sentHeld = secondSent.some((s) => (phrase === PLACE_CLUE && s.quotedPlace) || (phrase === RELATION_CLUE && s.quotedRelation));
        run["secondWait"] = secondWait;
        run["secondAsked"] = true;
        run["secondQuotedMaskedClue"] = secondQuoted;
        run["sentStillHeldClue"] = sentHeld;
        run["secondGuess"] = secondGuesses[0] ?? null;
        const badSecond = seen.find((s) => s.status >= 400);
        if (badSecond) stoppedBecause = `model status ${badSecond.status}`;
        else if (n === 1 && sentHeld) stoppedBecause = "run 1 still sent the masked clue";
      }
      }
      }
      run["calls"] = seen.map((s) => ({ status: s.status, host: s.host, bytes: s.bytes, sha256: s.sha256 }));
      run["callsUsed"] = counter.calls - started;
      const sharedDelta = readLedger().total - sharedBefore;
      run["sharedDelta"] = sharedDelta;
      if (n === 1 && sharedDelta !== seen.length) stoppedBecause = stoppedBecause ?? `ledger delta ${sharedDelta} did not match ${seen.length} responses`;
    } catch (err) {
      run["error"] = clip(err instanceof Error ? err.message : String(err));
      run["callsUsed"] = counter.calls - started;
      stoppedBecause = stoppedBecause ?? (counter.calls === started ? "setup failed before a model call" : "run failed after a model call");
    } finally {
      await context.close();
    }
    runs.push(run);
    process.stdout.write(`RUN ${n} mine=${counter.calls} shared=${readLedger().total} first=${run["firstQuotesClue"] === true ? 1 : 0} second=${run["secondQuotedMaskedClue"] === true ? 1 : 0} sentHeld=${run["sentStillHeldClue"] === true ? 1 : 0}\n`);
    if (stoppedBecause) break;
  }

  const firstHits = runs.filter((r) => r["firstQuotesClue"] === true).length;
  const secondQuoted = runs.filter((r) => r["secondQuotedMaskedClue"] === true).length;
  const record = {
    date: new Date().toISOString(),
    what: "Ten invented visits on the dev build. Each ask is sent by hand. One press masks the quoted clue, then the reader is asked again. Hosts, statuses, sizes and hashes only.",
    runsAsked: 10,
    runsRecorded: runs.length,
    generateContentCalls: counter.calls,
    callCap: CALL_CAP,
    stoppedAtCap: counter.stopped,
    stoppedBecause,
    firstGuessQuotedPlaceOrRelation: firstHits,
    secondAskQuotedMaskedClue: secondQuoted,
    sharedLedger: { budget: readLedger().budget, total: readLedger().total },
    runs,
  };
  const file = writeRecord("wo09-real", record, process.cwd(), nextRecordSuffix("wo09-real", "h23"));
  process.stdout.write(`DONE file=${file} first=${firstHits} of ${runs.length} second=${secondQuoted} calls=${counter.calls} stopped=${stoppedBecause ?? "none"}\n`);
  expect(counter.calls).toBeLessThanOrEqual(CALL_CAP);
});
