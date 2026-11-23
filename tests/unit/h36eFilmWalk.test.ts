import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TAKE_SUFFIXES, recoverShotARecord, rehearsalGateFrom, selectFilmTakeSuffix, type ShotAPage } from "../e2e/device/filmHelpers";
import { acceptAll, type ChipAcceptPage } from "../e2e/device/hybridSupport";

describe("H36e film walk: acceptAll, Shot A two-path recovery, rehearsal gate, take suffixes, spec log", () => {
  it("item 1: acceptAll and acceptProposedMatching accept multi-chip drops (>= 1 fewer, clicked chip no longer proposed)", () => {
    const hybrid = readFileSync("tests/e2e/device/hybridSupport.ts", "utf8");
    const acceptFn = hybrid.slice(hybrid.indexOf("export async function acceptAll"));
    expect(acceptFn).not.toContain("toHaveCount(n - 1)");
    expect(acceptFn).toMatch(/data-start/);
    expect(acceptFn).toMatch(/<\s*n\b|toBeLessThan\(n\)/);

    const filmRun = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    const matchFn = filmRun.slice(
      filmRun.indexOf("async function acceptProposedMatching"),
      filmRun.indexOf("function chooseRewriteSentenceIndex"),
    );
    expect(matchFn).not.toContain("toHaveCount(texts.length - 1)");
    expect(matchFn).toMatch(/data-start/);
    expect(matchFn).toMatch(/<\s*texts\.length|toBeLessThan\(texts\.length\)/);
  });

  it("items 2 & 3: Shot A supports both complete record and Add-to-Seen recovery without pre-mask recordHasDob fail-fast", () => {
    const filmRun = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    const shotA = filmRun.slice(filmRun.indexOf("// ---- Shot A"), filmRun.indexOf("// ---- Shot B"));
    expect(shotA).not.toMatch(/if \(!a\.recordHasDob\)\s*\{/);
    expect(shotA).toMatch(/recoverShotARecord/);
    expect(shotA).toMatch(/shotAPath/);
    expect(shotA).toMatch(/addedLines/);

    const helpers = readFileSync("tests/e2e/device/filmHelpers.ts", "utf8");
    expect(helpers).toMatch(/export async function recoverShotARecord/);
    expect(helpers).toMatch(/data-record-missing/);
    expect(helpers).toMatch(/2500/);
    expect(helpers).toMatch(/1500/);
    expect(helpers).toMatch(/<\s*3/);

    const rehearsal = readFileSync("tests/e2e/device/filmRehearsal.spec.ts", "utf8");
    expect(rehearsal).not.toMatch(/else if \(!a\.recordHasDob\)\s*\{/);
    expect(rehearsal).toMatch(/recoverShotARecord/);
    expect(rehearsal).toMatch(/shotAPath/);
    expect(rehearsal).toMatch(/addedLines/);
  });

  it("rehearsal config and rehearsalGateFrom support H36e hosted rehearsal (h36r-2) in a single run", () => {
    const rehearsal = readFileSync("tests/e2e/device/filmRehearsal.spec.ts", "utf8");
    expect(rehearsal).toMatch(/const SUFFIX = "h36r-2"/);
    expect(rehearsal).toMatch(/const MAX_ATTEMPTS = 1\b/);
    expect(rehearsal).toMatch(/const MIN_SUCCESSES = 1\b/);

    const dir = mkdtempSync(join(tmpdir(), "doorstep-h36er-"));
    try {
      const base = {
        hostedOrigin: "https://doorstep-notes.web.app",
        gate: { passed: true },
        videoCheck: { fills: true },
        generateContent: 0,
        cloudCalls: { generateContent: 0, appCheck: 0, recaptcha: 0 },
        maxAttemptS: 41,
      };
      writeFileSync(join(dir, "film-rehearsal-2026-11-15-h36r-2.json"), JSON.stringify({ status: "pass", ...base }));
      expect(rehearsalGateFrom(dir, "https://doorstep-notes.web.app")).toEqual({ ok: true, reason: "", maxAttemptS: 41 });

      // Newer h36r-2 result ranks above earlier h36r of the same date.
      writeFileSync(join(dir, "film-rehearsal-2026-11-15-h36r.json"), JSON.stringify({ status: "pass", ...base, maxAttemptS: 38 }));
      writeFileSync(join(dir, "film-rehearsal-2026-11-15-h36r-2.json"), JSON.stringify({ status: "fail", ...base, gate: { passed: false } }));
      expect(rehearsalGateFrom(dir, "https://doorstep-notes.web.app").ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("item 4: TAKE_SUFFIXES adds h36-4 through h36-9 and selectFilmTakeSuffix walks all 9", () => {
    expect(TAKE_SUFFIXES).toEqual([
      "h36",
      "h36-2",
      "h36-3",
      "h36-4",
      "h36-5",
      "h36-6",
      "h36-7",
      "h36-8",
      "h36-9",
    ]);
    const dir = mkdtempSync(join(tmpdir(), "doorstep-h36e-takes-"));
    const rawRoot = resolve(tmpdir(), "doorstep-h36e-raw-root");
    try {
      for (const s of ["h36", "h36-2", "h36-3"]) {
        writeFileSync(join(dir, `film-run-2026-11-15-${s}.json`), JSON.stringify({ status: "fail" }));
      }
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-4",
        rawDir: join(rawRoot, "raw-h36-4"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-4.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot).suffix).toBe("h36-5");
      writeFileSync(join(dir, "film-run-2026-11-15-h36-5.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot).suffix).toBe("h36-6");
      writeFileSync(join(dir, "film-run-2026-11-15-h36-6.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot).suffix).toBe("h36-7");
      writeFileSync(join(dir, "film-run-2026-11-15-h36-7.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot).suffix).toBe("h36-8");
      writeFileSync(join(dir, "film-run-2026-11-15-h36-8.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot).suffix).toBe("h36-9");
      writeFileSync(join(dir, "film-run-2026-11-15-h36-9.json"), JSON.stringify({ status: "fail" }));
      expect(() => selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toThrow(/cap of 9 takes reached/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("item 5: OPEN-QUESTIONS.md adds Session H36e recording the three findings without banned or dramatic words", () => {
    const doc = readFileSync(".kiro/specs/OPEN-QUESTIONS.md", "utf8");
    const idx = doc.indexOf("## Session H36e");
    expect(idx).toBeGreaterThan(-1);
    const sec = doc.slice(idx);
    expect(sec).toMatch(/film-run-2026-11-15-h36\.json/);
    expect(sec).toMatch(/h36-2\.json/);
    expect(sec).toMatch(/h36-3\.json/);
    expect(sec).toMatch(/Add to Seen/);
    expect(sec).toMatch(/Landlord/i);
    expect(sec).toMatch(/rehearsal/i);
    expect(sec).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
    expect(sec).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u);
  });

  it("behavior: acceptAll accepts two-spelling chip drops in one press and rejects if clicked chip stays proposed", async () => {
    interface FakeChip {
      text: string;
      start: string;
      end: string;
    }
    let proposed: FakeChip[] = [
      { text: "Landlord suggested", start: "50", end: "58" },
      { text: "Bea suggested", start: "10", end: "13" },
      { text: "3/3/87 suggested", start: "80", end: "86" },
      { text: "landlord suggested", start: "120", end: "128" },
      { text: "26/11 suggested", start: "150", end: "155" },
    ];
    const makePage = (bugLeaveClicked: boolean): ChipAcceptPage => ({
      locator(selector: string) {
        const m = /\[data-start="(\d+)"\]\[data-end="(\d+)"\]/.exec(selector);
        const matching = () => (m ? proposed.filter((c) => c.start === m[1] && c.end === m[2]) : proposed);
        return {
          async count() {
            return matching().length;
          },
          first() {
            const snap = matching()[0]!;
            return {
              async getAttribute(name: string) {
                return name === "data-start" ? snap.start : name === "data-end" ? snap.end : null;
              },
              async click() {
                if (bugLeaveClicked) {
                  proposed = proposed.filter((c) => !(c.start !== snap.start && c.text.toLowerCase() === snap.text.toLowerCase()));
                } else {
                  const key = snap.text.split(" ")[0]!.toLowerCase();
                  proposed = proposed.filter((c) => c.text.split(" ")[0]!.toLowerCase() !== key);
                }
              },
            };
          },
        };
      },
    });

    await expect(acceptAll(makePage(false), 100)).resolves.toBe(4);
    expect(proposed).toEqual([]);

    proposed = [
      { text: "Landlord suggested", start: "50", end: "58" },
      { text: "landlord suggested", start: "120", end: "128" },
    ];
    await expect(acceptAll(makePage(true), 80)).rejects.toThrow(/did not leave proposed/);
  });

  it("behavior: recoverShotARecord handles complete records, 2 missing lines, and caps at 3 Add-to-Seen presses", async () => {
    const fakeFor = (initialLines: string[]): { page: ShotAPage; holds: number[]; scrolled: () => boolean } => {
      const remaining = [...initialLines];
      const holds: number[] = [];
      let wasScrolled = false;
      const makeLoc = (selector: string) => ({
        async count() {
          if (selector.includes("button") || selector.includes("[data-missed-line]")) return remaining.length;
          return remaining.length > 0 ? 1 : 0;
        },
        first() {
          return makeLoc(selector);
        },
        async isVisible() {
          return remaining.length > 0;
        },
        async scrollIntoViewIfNeeded() {
          wasScrolled = true;
        },
        async innerText() {
          return remaining[0] ?? "";
        },
        async click() {
          remaining.shift();
        },
      });
      return { page: { locator: makeLoc }, holds, scrolled: () => wasScrolled };
    };

    const complete = fakeFor([]);
    await expect(recoverShotARecord(complete.page, async (ms) => { complete.holds.push(ms); })).resolves.toEqual({
      shotAPath: "complete",
      addedLines: [],
    });
    expect(complete.holds).toEqual([]);
    expect(complete.scrolled()).toBe(false);

    const twoMissed = fakeFor(["DOB on form 3/3/87.", "Next: revisit 26/11."]);
    await expect(recoverShotARecord(twoMissed.page, async (ms) => { twoMissed.holds.push(ms); })).resolves.toEqual({
      shotAPath: "added-to-seen",
      addedLines: ["DOB on form 3/3/87.", "Next: revisit 26/11."],
    });
    expect(twoMissed.holds).toEqual([2500, 1500, 1500]);
    expect(twoMissed.scrolled()).toBe(true);

    const fourMissed = fakeFor(["L1", "L2", "L3", "L4"]);
    await expect(recoverShotARecord(fourMissed.page, async (ms) => { fourMissed.holds.push(ms); })).resolves.toEqual({
      shotAPath: "added-to-seen",
      addedLines: ["L1", "L2", "L3"],
    });
    expect(fourMissed.holds).toEqual([2500, 1500, 1500, 1500]);
  });
});
