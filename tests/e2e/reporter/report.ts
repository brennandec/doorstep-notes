// Pure parts of the real-browser results: status mapping, the report object and the
// short markdown. The Playwright reporter (resultsReporter.ts) only collects and writes.

export type CheckStatus = "passed" | "failed" | "missed";

export interface Check {
  id: string;
  title: string;
  /** spec and task numbers this check serves, for example "shell-and-offline 25" */
  tasks: string[];
  status: CheckStatus;
  /** why it failed or was missed */
  reason?: string;
  /** measured values the check recorded, plain JSON */
  detail?: unknown;
  seconds: number;
}

export interface ReportMeta {
  date: string;
  browser: string;
  playwright: string;
}

export interface Report {
  kind: "BUNDLED";
  date: string;
  browser: string;
  playwright: string;
  headless: true;
  deviceModel: "not used";
  summary: { passed: number; failed: number; missed: number; total: number };
  checks: Check[];
}

/** A skipped check, or one that marks itself as a miss, is a miss. It is never a pass. */
export function statusOf(playwrightStatus: string, markedMissed: boolean): CheckStatus {
  if (playwrightStatus === "skipped" || markedMissed) return "missed";
  return playwrightStatus === "passed" ? "passed" : "failed";
}

export function buildReport(checks: Check[], meta: ReportMeta): Report {
  const count = (s: CheckStatus) => checks.filter((c) => c.status === s).length;
  return {
    kind: "BUNDLED",
    date: meta.date,
    browser: meta.browser,
    playwright: meta.playwright,
    headless: true,
    deviceModel: "not used",
    summary: { passed: count("passed"), failed: count("failed"), missed: count("missed"), total: checks.length },
    checks,
  };
}

export function renderMarkdown(report: Report): string {
  const s = report.summary;
  const lines = [
    `# Real-browser checks, bundled browser, ${report.date}`,
    "",
    `Browser: ${report.browser}. Headless. No device model. The cloud is off, so cloud steps ran against a fixed sample.`,
    "",
    `${s.passed} passed, ${s.failed} failed, ${s.missed} missed, of ${s.total} checks.`,
    "",
    "| Check | Tasks | Result |",
    "|---|---|---|",
    ...report.checks.map((c) => `| ${c.title} | ${c.tasks.join("; ")} | ${c.status} |`),
    "",
  ];
  const why = report.checks.filter((c) => c.status !== "passed" && c.reason);
  if (why.length > 0) {
    lines.push("## Why a check did not pass", "");
    for (const c of why) lines.push(`- ${c.title} (${c.status}): ${c.reason}`);
    lines.push("");
  }
  lines.push(
    "The device model checks are not part of this file. They run in Google Chrome in a later session.",
    "H2 part B (the real cloud service) has not run. Until it does, the page and README say \"not yet checked against the real service\".",
    "",
  );
  return lines.join("\n");
}
