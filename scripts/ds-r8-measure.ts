// D-R8 measurement. Saved device replies stay on the device when they pass.
// Only a failing shorthand note is sent, masked, through the real cloud SDK.
// The ledger charged is tomorrow's file. This script never writes today's file.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { checkEgress } from "../src/egress/check";
import { singleSentence } from "../src/inference/rewrite/rewrite.real";
import { inventedFacts, replyPasses, shownText } from "../src/inference/rewrite/shorthand";
import { INVENTED_NAMES } from "../tests/e2e/fixtures/pageHelpers";
import { checkDailyCloudBudget, readLedger, recordDailyCloudCall } from "../tests/e2e/fixtures/cloudCalls";
import { loadPlan, type Classified } from "./ds-r8-classify";

const LEDGER = "results/e2e-cloud-on-2026-11-21-h23.json";
const OUT = "results/ds-r8-return.json";
const PAGE = `http://127.0.0.1:4311/scripts/ds-r8-measure.html${process.env["DS_R8_DRY"] === "1" ? "?dry=1" : ""}`;
const SPEC = "ds-r8-measure";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function assertNoSecret(text: string, token: string): void {
  if (text.includes(token) || text.includes("AIza") || /BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/.test(text)) {
    throw new Error("refusing to write a secret");
  }
}

interface PageAnswer {
  status: string;
  source: string;
  value: string;
  cloudMs: number;
  cloudCalls: number;
  canSend: boolean;
  passes: boolean;
  spelled: boolean;
  invented: number;
  modes?: string[];
  cloudError?: string;
}

interface CloudAnswer extends PageAnswer {
  n: number;
  http: number[];
}

export async function main(): Promise<void> {
  if (LEDGER.includes("2026-11-20")) throw new Error("refusing today's cloud ledger");
  const tokenFile = process.env["DS_R8_TOKEN_FILE"] ?? "";
  const configFile = process.env["DS_R8_CONFIG_FILE"] ?? "";
  if (tokenFile === "" || !existsSync(tokenFile)) throw new Error("DS_R8_TOKEN_FILE is missing");
  if (configFile === "" || !existsSync(configFile)) throw new Error("DS_R8_CONFIG_FILE is missing");
  const token = readFileSync(tokenFile, "utf8").trim();
  if (token.length < 8) throw new Error("debug token is empty");
  const configBytes = readFileSync(configFile);

  const plan = loadPlan();
  const only = (process.env["DS_R8_ONLY"] ?? "").split(",").map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
  const cloud = plan.filter((row) => !row.pass && (only.length === 0 || only.includes(row.n)));
  const probe = process.env["DS_R8_PROBE"] === "1";
  if (cloud.length < 1 || cloud.length > 10) throw new Error(`cloud notes ${cloud.length} are outside 1..10`);
  const budget = checkDailyCloudBudget(LEDGER);
  if (budget.remaining < cloud.length) throw new Error(`tomorrow remaining ${budget.remaining} < ${cloud.length}`);
  const before = readLedger(LEDGER).total;

  const listening = await fetch("http://127.0.0.1:4311/").then(() => true).catch(() => false);
  if (listening) throw new Error("port 4311 is already in use");

  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4311", "--strictPort"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const viteLog: string[] = [];
  const keep = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line === "" || line.includes(token) || line.includes("AIza")) continue;
      if (/error|ready|Local:|4311/i.test(line)) viteLog.push(line.slice(0, 180));
    }
  };
  vite.stdout?.on("data", keep);
  vite.stderr?.on("data", keep);

  let namesLeft = 0;
  let generateCalls = 0;
  const hosts = new Set<string>();
  const httpByNote = new Map<number, number[]>();
  let current: Classified | null = null;

  try {
    const started = Date.now();
    while (Date.now() - started < 20_000) {
      const ok = await fetch(PAGE).then((res) => res.ok).catch(() => false);
      if (ok) break;
      if (vite.exitCode !== null) throw new Error(`vite exited ${vite.exitCode}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    const ready = await fetch(PAGE).then((res) => res.ok).catch(() => false);
    if (!ready) throw new Error(`measure page did not come up; ${viteLog.join(" | ")}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addInitScript((t) => {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t;
    }, token);
    const page = await context.newPage();
    page.setDefaultTimeout(90_000);
    await page.route("**/*", async (route) => {
      const request = route.request();
      let host = "";
      try { host = new URL(request.url()).host; } catch { host = ""; }
      if (new URL(request.url()).pathname === "/firebase.config.local.json") {
        return route.fulfill({ status: 200, contentType: "application/json", body: configBytes });
      }
      if (host === "127.0.0.1" || host.startsWith("127.0.0.1:") || host === "localhost") return route.continue();
      hosts.add(host);
      if (!request.url().includes(":generateContent")) return route.continue();
      const body = request.postData() ?? request.postDataBuffer()?.toString("utf8") ?? "";
      const row = current;
      const sentenceAt = body.toLowerCase().indexOf("sentence:");
      const sentencePart = sentenceAt === -1 ? "" : body.slice(sentenceAt);
      const check = checkEgress({
        captured: [{ url: "", body: new TextEncoder().encode(body) }],
        listedNames: [...INVENTED_NAMES],
        surfaceForms: [],
        sentOnPurpose: [],
      });
      const low = body.toLowerCase();
      const fullName = INVENTED_NAMES.some((name) => low.includes(name.toLowerCase()));
      const forbiddenHit = row !== null && row.forbidden.some((word) => wordsOf(sentencePart).has(word));
      const masked = row !== null && (body.includes(row.expanded) || sentencePart.includes(row.expanded));
      console.log(JSON.stringify({
        n: row?.n ?? 0,
        bodyLen: body.length,
        sentenceAt,
        masked,
        listed: check.listedFound.length,
        fullName,
        forbiddenHit,
      }));
      if (probe) return route.abort();
      if (check.listedFound.length > 0 || fullName) {
        namesLeft += 1;
        return route.abort();
      }
      if (forbiddenHit || !masked) return route.abort();
      if (generateCalls >= cloud.length) return route.abort();
      const recorded = recordDailyCloudCall(SPEC, `n=${row?.n ?? 0}`, "Chromium (Playwright bundled, headless)", LEDGER);
      if (!recorded.allowed) return route.abort();
      generateCalls += 1;
      return route.continue();
    });
    page.on("response", (res) => {
      if (!res.url().includes(":generateContent") || current === null) return;
      const list = httpByNote.get(current.n) ?? [];
      list.push(res.status());
      httpByNote.set(current.n, list);
    });

    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof (window as unknown as { __dsr8?: unknown }).__dsr8 === "function");

    const answers: CloudAnswer[] = [];
    for (const row of cloud) {
      current = row;
      const answer = await page.evaluate(async ({ note, model }) => {
        const run = (window as unknown as { __dsr8: (note: string, model: string) => Promise<PageAnswer> }).__dsr8;
        return run(note, model);
      }, { note: row.note, model: row.model });
      answers.push({ ...answer, n: row.n, http: httpByNote.get(row.n) ?? [] });
      if (answer.cloudCalls !== 1) break;
    }
    current = null;
    await browser.close();

    const byCloud: CloudAnswer[] = [];
    const spelled: CloudAnswer[] = [];
    let inventedOnScreen = 0;
    for (const answer of answers) {
      const row = cloud.find((item) => item.n === answer.n);
      if (!row) continue;
      const invented = answer.value === "" ? 1 : inventedFacts(row.note, answer.value).length;
      inventedOnScreen += invented;
      if (answer.source === "IN_CLOUD" && replyPasses(row.note, answer.value)) byCloud.push(answer);
      else spelled.push(answer);
    }
    const deviceRows = plan.filter((row) => row.pass);
    const same = deviceRows.filter((row) => shownText(row.note, singleSentence(row.model) ?? "") === row.expanded).length;
    const report = {
      status: namesLeft === 0 && inventedOnScreen === 0 && generateCalls === cloud.length ? "pass" : "fail",
      at: new Date().toISOString(),
      ledger: LEDGER,
      ledgerBefore: before,
      ledgerAfter: readLedger(LEDGER).total,
      calls: generateCalls,
      hosts: [...hosts].sort(),
      shownByDevice: deviceRows.length,
      shownByCloud: byCloud.length,
      spelledOut: spelled.length,
      deviceSameAsExpansion: same,
      inventedOnScreen,
      namesLeft,
      medianMs: {
        device: median(deviceRows.map((row) => row.deviceMs)),
        cloud: median(byCloud.map((row) => row.cloudMs)),
        spelled: median(spelled.map((row) => row.cloudMs + (cloud.find((item) => item.n === row.n)?.deviceMs ?? 0))),
      },
      cloudNotes: cloud.map((row) => row.n),
      answers: answers.map((answer) => ({
        n: answer.n,
        status: answer.status,
        source: answer.source,
        cloudMs: answer.cloudMs,
        cloudCalls: answer.cloudCalls,
        canSend: answer.canSend,
        passes: answer.passes,
        spelled: answer.spelled,
        invented: answer.invented,
        http: answer.http,
        value: answer.value,
      })),
    };
    const text = JSON.stringify(report, null, 2) + "\n";
    assertNoSecret(text, token);
    writeFileSync(probe ? "results/ds-r8-probe.json" : OUT, text);
    console.log(JSON.stringify({
      status: report.status,
      shownByDevice: report.shownByDevice,
      shownByCloud: report.shownByCloud,
      spelledOut: report.spelledOut,
      inventedOnScreen: report.inventedOnScreen,
      namesLeft: report.namesLeft,
      calls: report.calls,
      ledgerBefore: report.ledgerBefore,
      ledgerAfter: report.ledgerAfter,
      medianMs: report.medianMs,
      hosts: report.hosts,
      http: answers.map((answer) => {
        const raw = answer.cloudError ?? "";
        const cloudError = raw.includes("AIza") || raw.includes(token) ? "redacted" : raw;
        return { n: answer.n, http: answer.http, source: answer.source, modes: answer.modes, invented: answer.invented, cloudMs: answer.cloudMs, cloudError };
      }),
    }));
  } finally {
    vite.kill("SIGTERM");
  }
}
