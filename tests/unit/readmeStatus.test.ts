// H11 item 5 (measurement R16): the README status lines about the cloud half are written from the
// three results files by `npm run measure:readme`, not by hand.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cloudStatusLines } from "../../src/app/figureText";
import type { ResultFile, ResultsLookup } from "../../src/app/figures";
import { STATUS_END, STATUS_START, fileLookup, renderStatusBlock } from "../../scripts/writeReadme";

const readme = readFileSync("README.md", "utf8");

const draft: Record<string, unknown> = { date: "2026-11-14T07:05:51.597Z", browser: "Chromium 158 (bundled, headless)", status: 200, model: "gemini-3.5-flash-lite", label: "in the cloud" };
const rewrite: Record<string, unknown> = { date: "2026-11-14T07:11:33.680Z", browser: "Chromium 158 (bundled, headless)", status: 200, sentenceSentChars: 41, sentenceShownChars: 38 };
const reader: Record<string, unknown> = {
  date: "2026-11-14T07:14:39.720Z", browser: "Chromium 158 (bundled, headless)", status: 200,
  bytesToModel: 1012, requestsToModel: 1, bytesIncludingAppCheck: 1066, requestsIncludingAppCheck: 2,
};
const all: Record<string, Record<string, unknown>> = {
  "cloud-draft-2026-11-14": draft,
  "rewrite-real-service": rewrite,
  "second-reader-real-service": reader,
};
const lookupOf = (files: Record<string, Record<string, unknown>>): ResultsLookup => (name) => files[name] as ResultFile | undefined;

describe("the README status block is written from the results (R16.1)", () => {
  it("is between the status markers and equals the generated block", () => {
    const start = readme.indexOf(STATUS_START);
    const end = readme.indexOf(STATUS_END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const inside = readme.slice(start + STATUS_START.length, end).trim();
    expect(inside).toBe(renderStatusBlock(fileLookup(process.cwd())).trim());
  });

  it("each line carries the date and browser of its file", () => {
    const lines = cloudStatusLines(lookupOf(all));
    expect(lines[0]).toContain("2026-11-14");
    expect(lines[0]).toContain("Chromium 158 (bundled, headless)");
    expect(lines[1]).toContain("2026-11-14");
    expect(lines[2]).toContain("2026-11-14");
  });

  it("the second reader line gives both counts, each with its own words", () => {
    const line = cloudStatusLines(lookupOf(all)).find((l) => l.startsWith("Second reader"))!;
    expect(line).toContain("Sent to the model: 1,012 bytes in one request.");
    expect(line).toContain("Including the App Check exchange: 1,066 bytes in 2 requests.");
  });
});

describe("what the files do not show reads as not measured or not checked (R16.2)", () => {
  it("a missing file says not measured on its own line", () => {
    const lines = cloudStatusLines(lookupOf({ "cloud-draft-2026-11-14": draft, "rewrite-real-service": rewrite }));
    expect(lines.find((l) => l.startsWith("Second reader"))).toContain("not measured");
  });

  it("a run that did not answer 200 does not read as connected", () => {
    const lines = cloudStatusLines(lookupOf({ ...all, "cloud-draft-2026-11-14": { ...draft, status: 403 } }));
    expect(lines[0]).not.toMatch(/answered HTTP 200/);
    expect(lines[0]).toContain("403");
  });

  it("with all three files present, no line of the three says its call is not checked", () => {
    const lines = cloudStatusLines(lookupOf(all)).slice(0, 3);
    for (const l of lines) expect(l).not.toMatch(/not yet checked|not measured/i);
  });

  it("the not-checked line names what has not run, so it does not stand under a line that says it ran", () => {
    const block = renderStatusBlock(lookupOf({ ...all, "h2-part-b": { status: "miss", reason: "no run" } }));
    const line = block.split("\n").find((l) => l.includes("Not yet checked against the real service."))!;
    expect(line).toBeDefined();
    expect(line).toMatch(/part B/);
    expect(line).toMatch(/every request/);
  });

  it("once part B has passed the not-checked sentence is gone", () => {
    const block = renderStatusBlock(lookupOf({ ...all, "h2-part-b": { status: "pass" } }));
    expect(block).not.toContain("Not yet checked against the real service.");
  });

  it("the README says what the files say: with part B passed (H17, h16 record), the not-checked sentence is gone", () => {
    const start = readme.indexOf(STATUS_START);
    const end = readme.indexOf(STATUS_END);
    const block = readme.slice(start, end);
    expect(block.indexOf("Cloud draft:")).toBeGreaterThan(-1);
    expect(block).toContain("Both halves in one Chrome session: pass");
    expect(block).not.toContain("Not yet checked against the real service.");
  });
});
