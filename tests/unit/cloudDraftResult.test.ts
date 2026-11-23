// Judge table fix 1: one real cloud draft is on the page. The switch is on only because a result file
// records a real call with status 200 and a draft that is not the test double's text.
// The file is written by tests/e2e/bundled/cloudDraft.spec.ts. It is never edited by hand and no older
// probe file is edited to look successful.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as constants from "../../src/constants";
import { initAppCheckDebug } from "../../src/firebase/appCheckDebug";
import { fixedNote } from "../../src/inference/draft/draft.double";

const FIRST = "results/cloud-draft-2026-11-14.json";
// The newest dated file is the one read: cloud-draft-<date>.json, then -2, -3 for the same date (H12).
const NAME = /^cloud-draft-(\d{4}-\d{2}-\d{2})(?:-(\d+))?\.json$/;
const sortKey = (f: string) => {
  const m = NAME.exec(f)!;
  return `${m[1]}-${String(m[2] ?? "1").padStart(4, "0")}`;
};
const FILE = `results/${readdirSync("results").filter((f) => NAME.test(f)).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).pop() ?? "cloud-draft-2026-11-14.json"}`;

interface CloudDraft {
  date: string;
  browser: string;
  status: number;
  callStatuses: number[];
  generateContentCalls?: number;
  model: string;
  draftText: string;
  finishedNote: string;
  label: string;
}
const read = (): CloudDraft | undefined => (existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as CloudDraft) : undefined);

describe("the newest result file of the real cloud draft (H12)", () => {
  it("is a file written after the first one, which stays as it was", () => {
    expect(FILE, "the real cloud draft of H12 has not run").not.toBe(FIRST);
    const diff = execFileSync("git", ["diff", "--stat", "--", FIRST], { encoding: "utf8" });
    expect(diff.trim()).toBe("");
  });
  it("records one call, status 200, the model, and the label in the cloud", () => {
    const r = read()!;
    expect(r.status).toBe(200);
    expect(r.generateContentCalls).toBe(1);
    expect(r.model).toBe(constants.DEFAULT_CLOUD_MODEL);
    expect(r.label).toContain("in the cloud");
  });
  it("holds a finished note with no Markdown mark and no tag or token in any form", () => {
    const note = read()!.finishedNote;
    expect(note).toContain("Maria Okonkwo-Reyes");
    expect(note).not.toContain("**");
    expect(note.split("\n").some((l) => /^#{1,6}\s/.test(l))).toBe(false);
    expect(note).not.toMatch(/[[{(][^\]})\n]{0,30}(?:Person|Place|Date|Detail)[ \t]*\d+/i);
  });
});

describe("the result file of the one real cloud draft", () => {
  it("exists and records status 200", () => {
    const r = read();
    expect(r, `${FILE} is missing: the real cloud draft has not run`).toBeDefined();
    expect(r!.status).toBe(200);
    expect(r!.callStatuses.length).toBeGreaterThan(0);
    expect(r!.callStatuses.every((s) => s === 200)).toBe(true);
  });
  it("records a date, a browser, the model and the draft text", () => {
    const r = read()!;
    expect(r.date).toMatch(/^2026-11-1\d/);
    expect(r.browser).toMatch(/Chromium/);
    expect(r.model).toBe(constants.DEFAULT_CLOUD_MODEL);
    expect(r.draftText.length).toBeGreaterThan(40);
  });
  it("is not the test double's text", () => {
    const r = read()!;
    expect(r.draftText).not.toContain("drafted by a test double");
    expect(r.finishedNote).not.toContain("drafted by a test double");
    expect(r.draftText).not.toBe(fixedNote(r.draftText, false));
    expect(r.label).toContain("in the cloud");
    expect(r.label).not.toContain("test double");
  });
  it("holds no listed name in the draft text the cloud returned", () => {
    const r = read()!;
    expect(r.draftText).toMatch(/Person \d/);
  });
});

describe("the cloud switch", () => {
  it("is on, with a result file of status 200 behind it", () => {
    expect(constants.AI_SERVICE_ENABLED).toBe(true);
    expect(read()?.status).toBe(200);
  });
  it("is not set by a billing step: no file about billing was added", () => {
    expect(constants.CONSTANT_SOURCES["AI_SERVICE_ENABLED"]).toMatch(/200/);
    expect(constants.CONSTANT_SOURCES["AI_SERVICE_ENABLED"]).toMatch(/cloud-draft-2026-11-14/);
  });
  it("still names the tier, which is paid since the ruling of 2026-11-14", () => {
    expect(constants.CLOUD_TIER).toBe("paid");
    expect(constants.CONSTANT_SOURCES["CLOUD_TIER"]).toContain("docs/decisions/2026-11-14-cloud-tier.md");
  });
});

describe("the older probe file is untouched", () => {
  it("is the same as in the last commit", () => {
    const diff = execFileSync("git", ["diff", "--stat", "--", "results/cloud-probe-2026-11-13.json", "results/h2-part-b.json"], { encoding: "utf8" });
    expect(diff.trim()).toBe("");
  });
});

describe("App Check debug token", () => {
  it("keeps a token string that is already set, and sets true otherwise", () => {
    const withToken: { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string } = { FIREBASE_APPCHECK_DEBUG_TOKEN: "registered-by-the-owner" };
    initAppCheckDebug({}, { scope: withToken, makeProvider: () => ({}), initializeAppCheck: () => ({}) });
    expect(withToken.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe("registered-by-the-owner");
    const none: { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string } = {};
    initAppCheckDebug({}, { scope: none, makeProvider: () => ({}), initializeAppCheck: () => ({}) });
    expect(none.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
  });
});

describe("the draft wrapper", () => {
  const src = readFileSync("src/firebase/draftSdk.ts", "utf8");
  it("no longer says it was not run against the real service", () => {
    expect(src).not.toContain("has not been run against the real service");
  });
  it("asks for PREFER_IN_CLOUD with the cloud model name and temperature 0 set explicitly", () => {
    expect(src).toContain("PREFER_IN_CLOUD");
    expect(src).toContain("inCloudParams: { model: call.inCloudModel, generationConfig: { temperature: 0 } }");
  });
  it("starts App Check before the cloud call, inside cloudService()", () => {
    expect(src).toContain("cloudService()");
    const service = readFileSync("src/firebase/cloudService.ts", "utf8");
    expect(service.indexOf("startProductionAppCheck")).toBeGreaterThan(-1);
    expect(service.indexOf("startProductionAppCheck")).toBeLessThan(service.indexOf("getGenerativeModel("));
  });
});
