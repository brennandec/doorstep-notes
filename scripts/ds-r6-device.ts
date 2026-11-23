// D-R6 device measurement. 30 invented notes, both rewrite paths, on this computer.
// The model sees the expanded note. The screen shows shownText. No cloud call.
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release, totalmem } from "node:os";
import { chromium } from "@playwright/test";
import { rewriteText, type RewriteKind } from "../src/inference/rewrite/instructions";
import { REWRITE_SYSTEM_PROMPT, singleSentence, tagsKept } from "../src/inference/rewrite/rewrite.real";
import { REGRESSION_NOTES } from "../src/inference/rewrite/regressionSet";
import { allFive, expandShorthand, inventedFacts, shownText } from "../src/inference/rewrite/shorthand";
import { tagsIn } from "../src/masking/tags";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = process.env.DOORSTEP_BROWSER_PROFILE ?? ".browser-profile";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export async function main(): Promise<void> {
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end("<!doctype html><title>probe</title><button id=\"go\">go</button>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  const origin = `http://127.0.0.1:${address.port}/`;
  const outside: string[] = [];
  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    ignoreDefaultArgs: true,
    args: [
      `--user-data-dir=${PROFILE}`,
      "--remote-debugging-pipe",
      "--no-first-run",
      "--no-default-browser-check",
      "--use-mock-keychain",
      "--password-store=basic",
      "--headless=new",
    ],
    viewport: { width: 1440, height: 900 },
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("about:") || url.startsWith("blob:")) return route.continue();
    outside.push(url.split("?")[0]!.slice(0, 180));
    return route.abort();
  });
  const page = context.pages()[0] ?? await context.newPage();
  try {
    await page.goto(origin);
    const availability = await page.evaluate(async () => {
      const lm = (globalThis as { LanguageModel?: { availability(o: unknown): Promise<string> } }).LanguageModel;
      if (!lm) return "no LanguageModel";
      return lm.availability({
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      });
    });
    const machine = `${platform()} ${release()} (${arch()}), ${cpus()[0]?.model ?? "unknown"}, ${cpus().length} cores, ${Math.round(totalmem() / 1024 ** 3)} GB`;
    const browser = `Google Chrome ${context.browser()?.version() ?? "unknown"}`;
    if (availability !== "available") {
      const miss = { status: "miss", availability, machine, browser, at: new Date().toISOString(), outside: outside.length };
      mkdirSync("results", { recursive: true });
      writeFileSync("results/ds-r6-return.json", JSON.stringify(miss, null, 2));
      console.log(JSON.stringify(miss));
      return;
    }
    await page.evaluate((system) => {
      const button = document.createElement("button");
      button.id = "device-create";
      button.addEventListener("click", () => {
        const lm = (globalThis as unknown as { LanguageModel: { create(o: unknown): Promise<{ prompt(t: string): Promise<string> }> } }).LanguageModel;
        (window as unknown as { __session: Promise<unknown> }).__session = lm.create({
          expectedInputs: [{ type: "text", languages: ["en"] }],
          expectedOutputs: [{ type: "text", languages: ["en"] }],
          initialPrompts: [{ role: "system", content: system }],
        });
      });
      document.body.append(button);
    }, REWRITE_SYSTEM_PROMPT);
    await page.click("#device-create");
    await page.evaluate(() => (window as unknown as { __session: Promise<unknown> }).__session);

    const rows: Record<string, unknown>[] = [];
    for (const kind of ["shorter", "plainer"] as const) {
      for (const row of REGRESSION_NOTES) {
        const expanded = expandShorthand(row.note);
        const prompt = rewriteText(kind, expanded);
        const started = Date.now();
        let raw = await page.evaluate(async (text) => {
          const session = await (window as unknown as { __session: Promise<{ prompt(t: string): Promise<string> }> }).__session;
          return session.prompt(text);
        }, prompt);
        let sentence = singleSentence(raw);
        let usable = sentence !== null && tagsKept(tagsIn(row.note), sentence);
        let calls = 1;
        if (!usable) {
          raw = await page.evaluate(async (text) => {
            const session = await (window as unknown as { __session: Promise<{ prompt(t: string): Promise<string> }> }).__session;
            return session.prompt(text);
          }, prompt);
          sentence = singleSentence(raw);
          usable = sentence !== null && tagsKept(tagsIn(row.note), sentence);
          calls = 2;
        }
        const ms = Date.now() - started;
        const shown = usable && sentence !== null ? shownText(row.note, sentence) : expanded;
        rows.push({
          n: row.n,
          kind,
          calls,
          ms,
          model: raw,
          shown,
          allFive: allFive(row.note, shown, row.facts),
          inventedOnScreen: inventedFacts(row.note, shown).length,
          usedExpansion: shown === expanded,
          modelShown: shown !== expanded,
        });
        console.log(`${kind} n=${row.n} allFive=${allFive(row.note, shown, row.facts)} invented=${inventedFacts(row.note, shown).length} ms=${ms} calls=${calls}`);
      }
    }
    const summarise = (kind: RewriteKind) => {
      const part = rows.filter((row) => row["kind"] === kind);
      const pass = part.filter((row) => row["allFive"] === true).length;
      const invented = part.reduce((sum, row) => sum + Number(row["inventedOnScreen"]), 0);
      const modelShown = part.filter((row) => row["modelShown"] === true).length;
      return {
        kind,
        n: part.length,
        allFive: pass,
        allFivePct: Math.round((pass / part.length) * 1000) / 10,
        inventedOnScreen: invented,
        modelShown,
        modelShownPct: Math.round((modelShown / part.length) * 1000) / 10,
        medianMs: median(part.map((row) => Number(row["ms"]))),
      };
    };
    const report = {
      status: "pass",
      at: new Date().toISOString(),
      availability,
      machine,
      browser,
      userAgent: await page.evaluate(() => navigator.userAgent),
      outside: outside.length,
      outsideHosts: [...new Set(outside)].slice(0, 8),
      promptChanged: true,
      shorter: summarise("shorter"),
      plainer: summarise("plainer"),
      rows,
    };
    mkdirSync("results", { recursive: true });
    writeFileSync("results/ds-r6-return.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ shorter: report.shorter, plainer: report.plainer, outside: report.outside, availability }));
  } finally {
    await context.close().catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
