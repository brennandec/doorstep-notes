// Collects every BUNDLED check and, when asked, writes results/real-browser-2026-11-13-c05.json and .md (session C05; the earlier files are kept).
// Asked means the environment variable WRITE_REAL_BROWSER_RESULTS is 1 (npm run e2e:bundled sets it),
// so a single spec run while working never overwrites the full results.
// A check names its tasks with annotations of type "task", marks itself missed with
// type "missed" (the description is the reason), and records measured values with an
// attachment named "detail".
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { FullConfig, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { CLOUD_PATH_SPECS, readLedger, writeLedger } from "../fixtures/cloudCalls";
import { buildReport, renderMarkdown, statusOf, type Check } from "./report";

/** Session D02 writes its own file; REAL_BROWSER_RESULTS_BASENAME names it. The default is the C05 file. */
export const RESULTS_BASENAME = process.env["REAL_BROWSER_RESULTS_BASENAME"] ?? "results/real-browser-2026-11-13-c05";

export default class ResultsReporter implements Reporter {
  private checks: Check[] = [];
  private browser = "Chromium (version not read)";
  private playwright = "1.65.0";

  onBegin(config: FullConfig): void {
    this.playwright = config.version;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.noteOutcome(test, result.status);
    const note = (type: string) => test.annotations.filter((a) => a.type === type).map((a) => a.description ?? "");
    const browser = note("browser")[0];
    if (browser) this.browser = browser;
    const missed = note("missed");
    const status = statusOf(result.status, missed.length > 0);
    const detailBody = result.attachments.find((a) => a.name === "detail")?.body;
    let detail: unknown;
    if (detailBody) {
      try {
        detail = JSON.parse(detailBody.toString("utf8"));
      } catch {
        detail = undefined;
      }
    }
    const error = result.errors[0]?.message?.split("\n").slice(0, 6).join(" ").replace(/\u001b\[[0-9;]*m/g, "");
    const reason = status === "missed" ? missed[0] || "skipped" : status === "failed" ? error ?? result.status : undefined;
    this.checks.push({
      id: test.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      title: test.title,
      tasks: note("task"),
      status,
      ...(reason ? { reason } : {}),
      ...(detail === undefined ? {} : { detail }),
      seconds: Math.round(result.duration / 100) / 10,
    });
  }

  /** The outcome of each bundled spec in the file of real cloud calls (shell-and-offline R41.3). Asked for with WRITE_E2E_CLOUD_ON=1. */
  private writeCloudOn(): void {
    if (process.env["WRITE_E2E_CLOUD_ON"] !== "1") return;
    const ledger = readLedger();
    for (const [spec, outcome] of this.specOutcomes) {
      const entry = ledger.specs[spec] ?? { calls: 0, tests: {} };
      const text = readFileSync(`tests/e2e/bundled/${spec}`, "utf8");
      const kind = CLOUD_PATH_SPECS.includes(spec) ? "cloud-path" : text.includes("useStandIn(") ? "stand-in" : "no-cloud";
      ledger.specs[spec] = { ...entry, outcome, kind };
    }
    ledger.date = new Date().toISOString();
    ledger.browser = this.browser;
    writeLedger(ledger);
  }

  private specOutcomes = new Map<string, "passed" | "failed" | "skipped" | "missed">();

  private noteOutcome(test: TestCase, status: string): void {
    const spec = basename(test.location.file);
    if (!spec.endsWith(".spec.ts") || !test.location.file.includes("/bundled/")) return;
    const now = status === "passed" ? "passed" : status === "skipped" ? "skipped" : "failed";
    const before = this.specOutcomes.get(spec);
    this.specOutcomes.set(spec, before === "failed" || now === "failed" ? "failed" : before === "skipped" || now === "skipped" ? "skipped" : "passed");
  }

  onEnd(): void {
    this.writeCloudOn();
    if (process.env["WRITE_REAL_BROWSER_RESULTS"] !== "1") return;
    const report = buildReport(this.checks, {
      date: new Date().toISOString().slice(0, 10),
      browser: this.browser,
      playwright: this.playwright,
    });
    mkdirSync("results", { recursive: true });
    writeFileSync(`${RESULTS_BASENAME}.json`, JSON.stringify(report, null, 2) + "\n");
    writeFileSync(`${RESULTS_BASENAME}.md`, renderMarkdown(report));
  }

  printsToStdio(): boolean {
    return false;
  }
}
