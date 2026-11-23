// The summary of a real-browser run (BUNDLED). Every check is passed, failed or missed.
// A miss is a check that could not run, with its reason; it is never counted as a pass.
import { describe, expect, it } from "vitest";
import { buildReport, renderMarkdown, statusOf, type Check } from "../e2e/reporter/report";

const meta = { date: "2026-11-13", browser: "Chromium 150.0.0.0 (Playwright 1.65.0 bundled, headless)", playwright: "1.65.0" };
const checks: Check[] = [
  { id: "layout", title: "Layout at 1440 and 1000", tasks: ["shell-and-offline 25"], status: "passed", seconds: 1.2 },
  { id: "seeded", title: "Seeded leak", tasks: ["egress-check 12"], status: "failed", reason: "expected #B3261E", seconds: 2 },
  { id: "partB", title: "H2 part B", tasks: ["egress-check 14"], status: "missed", reason: "the cloud service is not connected", seconds: 0 },
];

describe("statusOf", () => {
  it("maps Playwright's own statuses", () => {
    expect(statusOf("passed", false)).toBe("passed");
    expect(statusOf("failed", false)).toBe("failed");
    expect(statusOf("timedOut", false)).toBe("failed");
    expect(statusOf("interrupted", false)).toBe("failed");
  });
  it("a skipped check is a miss, and a passed check marked as a miss stays a miss", () => {
    expect(statusOf("skipped", false)).toBe("missed");
    expect(statusOf("skipped", true)).toBe("missed");
    expect(statusOf("passed", true)).toBe("missed");
  });
});

describe("buildReport", () => {
  const r = buildReport(checks, meta);
  it("counts are computed from the checks", () => {
    expect(r.summary).toEqual({ passed: 1, failed: 1, missed: 1, total: 3 });
  });
  it("keeps the date, the browser and that it ran headless with no device model", () => {
    expect(r.date).toBe("2026-11-13");
    expect(r.browser).toContain("Chromium");
    expect(r.kind).toBe("BUNDLED");
    expect(r.headless).toBe(true);
    expect(r.deviceModel).toBe("not used");
  });
  it("keeps each check with its tasks", () => {
    expect(r.checks.map((c) => c.id)).toEqual(["layout", "seeded", "partB"]);
    expect(r.checks[1]!.reason).toBe("expected #B3261E");
  });
});

describe("renderMarkdown", () => {
  const md = renderMarkdown(buildReport(checks, meta));
  it("lists every check with the word passed, failed or missed", () => {
    expect(md).toMatch(/Layout at 1440 and 1000.*passed/);
    expect(md).toMatch(/Seeded leak.*failed/);
    expect(md).toMatch(/H2 part B.*missed/);
  });
  it("gives the reason of a failure and of a miss", () => {
    expect(md).toContain("expected #B3261E");
    expect(md).toContain("the cloud service is not connected");
  });
  it("states the date, the browser and the counts", () => {
    expect(md).toContain("2026-11-13");
    expect(md).toContain("Chromium 150.0.0.0");
    expect(md).toMatch(/1 passed, 1 failed, 1 missed/);
  });
  it("has no emoji and no banned word", () => {
    expect(md).not.toMatch(/\p{Extended_Pictographic}/u);
    for (const w of ["safe", "private by design", "anonymised", "guaranteed", "cleared", "compliant", "compliance"]) {
      expect(md.toLowerCase(), w).not.toContain(w);
    }
  });
});
