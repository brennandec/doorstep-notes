import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  A5_PRONOUN_WARNING,
  REQUIRED_LEDGER_MODES,
  TAKE_SUFFIXES,
  classifySheetFaults,
  collectFinishedObservations,
  doublesInText,
  forbiddenCopyProblems,
  hasA5PronounWarning,
  markdownProblems,
  namesDebug,
  rectOverlapPx,
  rehearsalGateFrom,
  selectFilmTakeSuffix,
  tokensNamingThePreviousTag,
} from "../e2e/device/filmHelpers";

describe("H36b / H36f A6 pronoun and doubled-word FailFast rules", () => {
  it("tracks valid same-person pronoun tokens for observation without failing on them", () => {
    const counts = tokensNamingThePreviousTag("[Person 1] agreed that {she:Person 1} would post the form.");
    expect(counts.total).toBe(1);
    expect(counts.byRole["she"]).toBe(1);
  });

  it("stops on A5 pronoun warning line", () => {
    expect(hasA5PronounWarning([`${A5_PRONOUN_WARNING} Maria agreed to remind him.`])).toBe(true);
    expect(hasA5PronounWarning([])).toBe(false);
  });

  it("stops on doubled words (X or X, X/X, adjacent repeats) without false positives", () => {
    expect(doublesInText("She agreed she or she would post it.")).toEqual(["she or she"]);
    expect(doublesInText("They asked he or she or she today.")).toEqual(["she or she"]);
    expect(doublesInText("They confirmed he/he signed.")).toEqual(["he/he"]);
    expect(doublesInText("Maria stated that she she missed the deadline.")).toEqual(["she she"]);
    expect(doublesInText("She left. She left.")).toEqual([]);
    expect(doublesInText("Maria O-R visited on 3/3/87. She left early. She confirmed later.")).toEqual([]);
  });

  it("stops on A5 wrong-person warning via classifySheetFaults, records h36-4/h36-5/h36-6/doublesInText as observations (H36g)", () => {
    expect(
      classifySheetFaults({
        sheetText: "Tomas Brandvold, a neighbour who is also on the client list, offered to help her with the form.",
        noteItems: [],
      }),
    ).toEqual({ stops: [], observedNotes: [] });
    expect(
      classifySheetFaults({
        sheetText: "Tomas Brandvold, a neighbor also on my list, offered to help her with the form.",
        noteItems: [],
      }),
    ).toEqual({ stops: [], observedNotes: [] });
    expect(
      classifySheetFaults({
        sheetText: "Maria Okonkwo-Reyes missed the form and he left a note.",
        noteItems: ["The draft used no pronoun tokens, so no pronouns were changed."],
      }),
    ).toEqual({
      stops: [],
      observedNotes: ["The draft used no pronoun tokens, so no pronouns were changed."],
    });
    expect(
      classifySheetFaults({
        sheetText: "Tomas Brandvold offered to help her with the form.",
        noteItems: [`${A5_PRONOUN_WARNING} Tomas Brandvold offered to help her with the form.`],
      }).stops,
    ).toEqual([
      `page fault line under note: ${A5_PRONOUN_WARNING} Tomas Brandvold offered to help her with the form.`,
    ]);

    const obs = collectFinishedObservations({
      finishedText: "Agreed with Maria she she posts the form.",
      observedNotes: ["The draft used no pronoun tokens, so no pronouns were changed."],
    });
    expect(obs.some((o) => o.rule === "doublesInText" && o.seen.includes("she she"))).toBe(true);
    expect(obs.some((o) => o.rule === "sheetNote" && o.seen.includes("no pronoun tokens"))).toBe(true);
  });

  it("stops on Markdown formatting in finished notes while allowing normal hyphens", () => {
    expect(markdownProblems("**Visit:** 12/11")).toHaveLength(1);
    expect(markdownProblems("# Heading\n- bullet")).toHaveLength(2);
    expect(markdownProblems("Maria Okonkwo-Reyes (Maria O-R) reported mould on 12/11.")).toEqual([]);
  });
});

describe("H36b forbidden copy, D7 overlap, ledger completeness, debug check, and h36r gate", () => {
  it("flags forbidden copy only when violated", () => {
    expect(forbiddenCopyProblems({ pageText: "The cloud half is connected.", offline: true })).toHaveLength(1);
    expect(forbiddenCopyProblems({ pageText: "The cloud half is on standby offline.", offline: true })).toEqual([]);
    expect(forbiddenCopyProblems({ pageText: "Send this name on purpose", offline: false })).toHaveLength(1);
    expect(forbiddenCopyProblems({ pageText: "Check 2nd reader", offline: false })).toHaveLength(1);
    expect(forbiddenCopyProblems({ pageText: "Second reader", offline: false, networkWords: "offline" })).toHaveLength(1);
    expect(
      forbiddenCopyProblems({
        pageText: "Clean text",
        offline: false,
        outgoingPopulated: true,
        zone2Text: "Nothing to send yet.",
        finishedShown: true,
        zone3Text: "The finished note appears here.",
      }),
    ).toHaveLength(2);
  });

  it("computes D7 overlap accurately", () => {
    expect(rectOverlapPx({ left: 100, top: 200, right: 400, bottom: 300 }, { left: 100, top: 300, right: 400, bottom: 450 })).toEqual({
      width: 300,
      height: 0,
      overlaps: false,
    });
    expect(rectOverlapPx({ left: 100, top: 200, right: 400, bottom: 310 }, { left: 250, top: 300, right: 450, bottom: 450 })).toEqual({
      width: 150,
      height: 10,
      overlaps: true,
    });
  });

  it("lists all 4 InferenceMode values", () => {
    expect(REQUIRED_LEDGER_MODES).toEqual(["ONLY_ON_DEVICE", "PREFER_ON_DEVICE", "PREFER_IN_CLOUD", "ONLY_IN_CLOUD"]);
  });

  it("rejects exchangeDebugToken paths while allowing reCAPTCHA Enterprise exchange", () => {
    expect(
      namesDebug([
        {
          url: "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken",
          method: "POST",
          bodyBytes: 10,
          refused: false,
        },
      ]),
    ).toBe(true);
    expect(
      namesDebug([
        {
          url: "https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken",
          method: "POST",
          bodyBytes: 10,
          refused: false,
        },
      ]),
    ).toBe(false);
  });

  it("validates hosted h36r rehearsal gate strictly", () => {
    const dir = mkdtempSync(join(tmpdir(), "doorstep-h36r-"));
    try {
      expect(rehearsalGateFrom(dir, "https://doorstep-notes.web.app").ok).toBe(false);
      writeFileSync(
        join(dir, "film-rehearsal-2026-11-15-h36r.json"),
        JSON.stringify({
          status: "pass",
          hostedOrigin: "https://doorstep-notes.web.app",
          gate: { passed: true },
          videoCheck: { fills: true },
          generateContent: 0,
          cloudCalls: { generateContent: 0, appCheck: 0, recaptcha: 0 },
          maxAttemptS: 38,
        }),
      );
      expect(rehearsalGateFrom(dir, "https://doorstep-notes.web.app")).toEqual({ ok: true, reason: "", maxAttemptS: 38 });
      expect(rehearsalGateFrom(dir, "https://other.example").ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("selects H36 film take suffix across up to 9 takes and stops at first pass (A7 + H36e + H36g)", () => {
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
    const dir = mkdtempSync(join(tmpdir(), "doorstep-h36takes-"));
    const rawRoot = resolve(tmpdir(), "doorstep-h36-raw-root");
    try {
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36",
        rawDir: join(rawRoot, "raw-h36"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-2",
        rawDir: join(rawRoot, "raw-h36-2"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-2.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-3",
        rawDir: join(rawRoot, "raw-h36-3"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-3.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-4",
        rawDir: join(rawRoot, "raw-h36-4"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-4.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-5",
        rawDir: join(rawRoot, "raw-h36-5"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-5.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-6",
        rawDir: join(rawRoot, "raw-h36-6"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-6.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-7",
        rawDir: join(rawRoot, "raw-h36-7"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-7.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-8",
        rawDir: join(rawRoot, "raw-h36-8"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-8.json"), JSON.stringify({ status: "fail" }));
      expect(selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-9",
        rawDir: join(rawRoot, "raw-h36-9"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h36-9.json"), JSON.stringify({ status: "fail" }));
      expect(() => selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toThrow(
        "All 9 allowed H36 film takes have run; cap of 9 takes reached per A7.",
      );
      writeFileSync(join(dir, "film-run-2026-11-15-h36-2.json"), JSON.stringify({ status: "pass" }));
      expect(() => selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toThrow(
        /A passing H36 film take already exists .*stopping at the first pass per A7/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
