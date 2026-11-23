import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as filmHelpers from "../e2e/device/filmHelpers";
import { A5_PRONOUN_WARNING, TAKE_SUFFIXES, doublesInText, selectFilmTakeSuffix } from "../e2e/device/filmHelpers";

const H36_6 = JSON.parse(readFileSync("results/film-run-2026-11-15-h36-6.json", "utf8")) as {
  finishedText: string;
  problems: string[];
};

describe("H36g: a take stops for privacy (a), a page fault line (b), the walk (c), or the film's claim (d) — and no others", () => {
  it("item 4: extends TAKE_SUFFIXES to h36-7..h36-9 and picks h36-7 after h36..h36-6 fail", () => {
    expect(TAKE_SUFFIXES).toEqual(["h36", "h36-2", "h36-3", "h36-4", "h36-5", "h36-6", "h36-7", "h36-8", "h36-9"]);
    const rawRoot = resolve(tmpdir(), "h36g-raw-root");
    const pre7Dir = mkdtempSync(join(tmpdir(), "h36g-pre7-"));
    try {
      for (const s of ["h36", "h36-2", "h36-3", "h36-4", "h36-5", "h36-6"]) {
        writeFileSync(join(pre7Dir, `film-run-2026-11-15-${s}.json`), JSON.stringify({ status: "fail" }));
      }
      expect(selectFilmTakeSuffix(pre7Dir, "2026-11-15", rawRoot)).toEqual({
        suffix: "h36-7",
        rawDir: join(rawRoot, "raw-h36-7"),
      });
    } finally {
      rmSync(pre7Dir, { recursive: true, force: true });
    }

    const dir = mkdtempSync(join(tmpdir(), "doorstep-h36g-takes-"));
    try {
      for (const s of TAKE_SUFFIXES) {
        writeFileSync(join(dir, `film-run-2026-11-15-${s}.json`), JSON.stringify({ status: "fail" }));
      }
      expect(() => selectFilmTakeSuffix(dir, "2026-11-15", rawRoot)).toThrow(/cap of 9 takes reached/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rule a (privacy): stops only when What leaves holds Bea, 3/3/87, or a listed name, or on offline/request leaks", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["privacyWhatLeavesProblems"]).toBe("function");
    expect(typeof mod["listedInNote"]).toBe("function");
    const privacy = mod["privacyWhatLeavesProblems"] as (step: string, text: string) => string[];
    const listedInNote = mod["listedInNote"] as (text: string) => string[];

    expect(listedInNote("Mould in back bedroom again")).toEqual([]);
    expect(listedInNote("Present: Aga came")).toEqual(["Aga"]);
    expect(listedInNote("Tomas Brandvald")).toEqual([]);
    expect(listedInNote("Present: Maria O-R")).toEqual(["Maria O-R"]);

    expect(privacy("Shot C.3", "Present: [Person 1], [Person 2]. Agreed: [Person 3] helps.")).toEqual([]);
    expect(privacy("Shot A", "Present: [Person 1], Bea")).toHaveLength(1);
    expect(privacy("Shot A", "DOB on form 3/3/87")).toHaveLength(1);
    expect(privacy("Shot C.3", "Present: Maria O-R, [Person 2]")).toHaveLength(1);
  });

  it("rule b (page fault lines & bracket/brace): stops only on the 4 fault lines or sheet bracket/brace; records h36-6 line as observation", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["classifySheetFaults"]).toBe("function");
    const classify = mod["classifySheetFaults"] as (input: {
      sheetText: string;
      noteItems: readonly string[];
    }) => { stops: string[]; observedNotes: string[] };

    expect(
      classify({
        sheetText: H36_6.finishedText,
        noteItems: ["The draft used no pronoun tokens, so no pronouns were changed."],
      }),
    ).toEqual({
      stops: [],
      observedNotes: ["The draft used no pronoun tokens, so no pronouns were changed."],
    });

    expect(
      classify({
        sheetText: "Clean finished note.",
        noteItems: ["The draft left out a detail (Detail 1) that was sent. Check the note."],
      }),
    ).toEqual({
      stops: [],
      observedNotes: ["The draft left out a detail (Detail 1) that was sent. Check the note."],
    });

    expect(
      classify({
        sheetText: "Clean finished note.",
        noteItems: ["Not put back: a name (Person 9). The app cannot tell what it stands for."],
      }).stops,
    ).toHaveLength(1);

    expect(
      classify({
        sheetText: "Clean finished note.",
        noteItems: [
          "Added by the model: a name, place or date that is not in your note or your list. The note shows a phrase in round brackets until you press to put it back.",
        ],
      }).stops,
    ).toHaveLength(1);

    expect(
      classify({
        sheetText: "Clean finished note.",
        noteItems: [`${A5_PRONOUN_WARNING} Tomas offered to help her.`],
      }).stops,
    ).toHaveLength(1);

    expect(
      classify({
        sheetText: "Clean finished note.",
        noteItems: ["The model left a mark the app could not read. Read the note before you copy."],
      }).stops,
    ).toHaveLength(1);

    expect(classify({ sheetText: "Visit for [Person 1].", noteItems: [] }).stops).toHaveLength(1);
    expect(classify({ sheetText: "Agreed {she:Person 1} posts it.", noteItems: [] }).stops).toHaveLength(1);
  });

  it("rule c (walk): stops on cap passed, missing/grey video, or >= 180 s — never on generateContent < 3", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["walkCompletionStopProblems"]).toBe("function");
    const walkStops = mod["walkCompletionStopProblems"] as (input: {
      stoppedAtCap: boolean;
      generateContent: number;
      cap: number;
      walkDurationS: number;
      videoFilesCount: number;
      videoFileMatchesWalk: boolean;
      videoFills: boolean;
      decodedDurationS: number | null;
      videoError?: string;
    }) => string[];

    expect(
      walkStops({
        stoppedAtCap: false,
        generateContent: 1,
        cap: 4,
        walkDurationS: 179.9,
        videoFilesCount: 1,
        videoFileMatchesWalk: true,
        videoFills: true,
        decodedDurationS: 179.9,
      }),
    ).toEqual([]);

    expect(
      walkStops({
        stoppedAtCap: true,
        generateContent: 4,
        cap: 4,
        walkDurationS: 120,
        videoFilesCount: 1,
        videoFileMatchesWalk: true,
        videoFills: true,
        decodedDurationS: 120,
      }),
    ).toHaveLength(1);

    expect(
      walkStops({
        stoppedAtCap: false,
        generateContent: 5,
        cap: 4,
        walkDurationS: 120,
        videoFilesCount: 1,
        videoFileMatchesWalk: true,
        videoFills: true,
        decodedDurationS: 120,
      }),
    ).toHaveLength(1);

    expect(
      walkStops({
        stoppedAtCap: false,
        generateContent: 3,
        cap: 4,
        walkDurationS: 180,
        videoFilesCount: 1,
        videoFileMatchesWalk: true,
        videoFills: false,
        decodedDurationS: 180,
      }),
    ).toHaveLength(3);
  });

  it("rule d (claim of the film): stops only if proposed chips miss Bea or 3/3/87, or ledger misses one of 4 modes", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["devicePassClaimStopProblems"]).toBe("function");
    expect(typeof mod["ledgerClaimStopProblems"]).toBe("function");
    const deviceClaim = mod["devicePassClaimStopProblems"] as (proposed: readonly string[]) => string[];
    const ledgerClaim = mod["ledgerClaimStopProblems"] as (shownModes: readonly string[]) => string[];

    expect(deviceClaim(["Bea suggested", "3/3/87 suggested"])).toEqual([]);
    expect(deviceClaim(["3/3/87 suggested"])).toHaveLength(1);
    expect(deviceClaim(["Bea suggested"])).toHaveLength(1);

    expect(ledgerClaim(["ONLY_ON_DEVICE", "PREFER_ON_DEVICE", "PREFER_IN_CLOUD", "ONLY_IN_CLOUD"])).toEqual([]);
    expect(ledgerClaim(["ONLY_ON_DEVICE", "PREFER_ON_DEVICE", "ONLY_IN_CLOUD"])).toEqual([
      "ledger is missing required InferenceMode row: PREFER_IN_CLOUD",
    ]);
  });

  it("item 2 (observations): non-stop findings such as doublesInText, markdownProblems, token word, and forbiddenCopy become observations with seen text", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["collectFinishedObservations"]).toBe("function");
    const collect = mod["collectFinishedObservations"] as (input: {
      finishedText: string;
      observedNotes: readonly string[];
    }) => { step: string; rule: string; seen: string }[];

    const obs = collect({
      finishedText: "**Visit:** # Heading. She she said the token was she or she and he/he.",
      observedNotes: ["The draft used no pronoun tokens, so no pronouns were changed."],
    });
    expect(doublesInText("She she said she or she and he/he")).toEqual(["she or she", "he/he", "She she"]);
    expect(obs.some((o) => o.rule === "sheetNote" && o.seen.includes("no pronoun tokens"))).toBe(true);
    expect(obs.some((o) => o.rule === "doublesInText" && o.seen.includes("she or she"))).toBe(true);
    expect(obs.some((o) => o.rule === "markdownProblems" && o.seen.includes("double asterisks"))).toBe(true);
    expect(obs.some((o) => o.rule === "draftProblems" && o.seen.includes("token"))).toBe(true);
  });

  it("Shot A / C.3 truthful no-sheet outcomes (alert / no-draft) become observations without throwing", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["classifyDraftOutcomeObservations"]).toBe("function");
    const classifyDraft = mod["classifyDraftOutcomeObservations"] as (input: {
      step: string;
      hasSheet: boolean;
      alertText: string | null;
      noDraftText: string | null;
    }) => { hasSheet: boolean; observations: { step: string; rule: string; seen: string }[] };

    expect(
      classifyDraft({ step: "Shot C.3", hasSheet: true, alertText: null, noDraftText: null }),
    ).toEqual({ hasSheet: true, observations: [] });

    expect(
      classifyDraft({
        step: "Shot A offline Draft",
        hasSheet: false,
        alertText: "Could not write a draft from this record.",
        noDraftText: null,
      }),
    ).toEqual({
      hasSheet: false,
      observations: [
        {
          step: "Shot A offline Draft",
          rule: "zone1Alert",
          seen: "Could not write a draft from this record.",
        },
      ],
    });

    expect(
      classifyDraft({
        step: "Shot C.3",
        hasSheet: false,
        alertText: null,
        noDraftText: "Not enough text to send.",
      }),
    ).toEqual({
      hasSheet: false,
      observations: [{ step: "Shot C.3", rule: "noDraftMarker", seen: "Not enough text to send." }],
    });
  });

  it("Shot C.4 truthful reader outcomes (0 guesses, 0 pressable, readerError, unchanged line2) become observations & settle cleanly", () => {
    const mod = filmHelpers as Record<string, unknown>;
    expect(typeof mod["classifyReaderPassOutcome"]).toBe("function");
    expect(typeof mod["isReaderPassSettled"]).toBe("function");
    const classifyReader = mod["classifyReaderPassOutcome"] as (input: {
      step: string;
      readerError: string | null;
      readerNone: string | null;
      readerHidden: string | null;
      readerDropped: string | null;
      guessesCount: number;
      pressableCount: number;
      requirePressable?: boolean;
    }) => { hasError: boolean; canContinue: boolean; observations: { step: string; rule: string; seen: string }[] };
    const settled = mod["isReaderPassSettled"] as (input: {
      generateContentCount: number;
      beforeCount: number;
      errorCount: number;
      workingCount: number;
      askEnabled: boolean;
    }) => boolean;

    expect(
      classifyReader({
        step: "Shot C.4 Pass 1",
        readerError: null,
        readerNone: null,
        readerHidden: null,
        readerDropped: null,
        guessesCount: 2,
        pressableCount: 1,
      }),
    ).toEqual({ hasError: false, canContinue: true, observations: [] });

    expect(
      classifyReader({
        step: "Shot C.4 Pass 1",
        readerError: "The second reader could not answer. Your text is kept.",
        readerNone: null,
        readerHidden: null,
        readerDropped: null,
        guessesCount: 0,
        pressableCount: 0,
      }),
    ).toEqual({
      hasError: true,
      canContinue: false,
      observations: [
        {
          step: "Shot C.4 Pass 1",
          rule: "readerError",
          seen: "The second reader could not answer. Your text is kept.",
        },
      ],
    });

    expect(
      classifyReader({
        step: "Shot C.4 Pass 1",
        readerError: null,
        readerNone: "The reader made no guess.",
        readerHidden: null,
        readerDropped: null,
        guessesCount: 0,
        pressableCount: 0,
      }),
    ).toEqual({
      hasError: false,
      canContinue: false,
      observations: [
        { step: "Shot C.4 Pass 1", rule: "readerNone", seen: "The reader made no guess." },
        { step: "Shot C.4 Pass 1", rule: "noPressableQuote", seen: "pressable.count() === 0" },
      ],
    });

    expect(
      classifyReader({
        step: "Shot C.4 Pass 1",
        readerError: null,
        readerNone: null,
        readerHidden: "One clue did not hold your words and was not shown.",
        readerDropped: null,
        guessesCount: 0,
        pressableCount: 0,
      }).canContinue,
    ).toBe(false);

    expect(
      classifyReader({
        step: "Shot C.4 Pass 1",
        readerError: null,
        readerNone: null,
        readerHidden: null,
        readerDropped: "The reader gave no words from your text, so there is nothing to tap.",
        guessesCount: 1,
        pressableCount: 0,
      }),
    ).toEqual({
      hasError: false,
      canContinue: false,
      observations: [
        {
          step: "Shot C.4 Pass 1",
          rule: "readerDropped",
          seen: "The reader gave no words from your text, so there is nothing to tap.",
        },
      ],
    });

    expect(
      classifyReader({
        step: "Shot C.4 Pass 2",
        readerError: "The second reader could not answer. Your text is kept.",
        readerNone: null,
        readerHidden: null,
        readerDropped: null,
        guessesCount: 0,
        pressableCount: 0,
        requirePressable: false,
      }),
    ).toEqual({
      hasError: true,
      canContinue: false,
      observations: [
        {
          step: "Shot C.4 Pass 2",
          rule: "readerError",
          seen: "The second reader could not answer. Your text is kept.",
        },
      ],
    });

    expect(settled({ generateContentCount: 2, beforeCount: 2, errorCount: 0, workingCount: 0, askEnabled: true })).toBe(
      false,
    );
    expect(settled({ generateContentCount: 3, beforeCount: 2, errorCount: 0, workingCount: 1, askEnabled: false })).toBe(
      false,
    );
    expect(settled({ generateContentCount: 3, beforeCount: 2, errorCount: 0, workingCount: 0, askEnabled: true })).toBe(
      true,
    );
    expect(settled({ generateContentCount: 2, beforeCount: 2, errorCount: 1, workingCount: 0, askEnabled: true })).toBe(
      true,
    );
  });

  it("item 3: OPEN-QUESTIONS.md adds Session H36g table listing selectFilmTakeSuffix + acceptAll and 0 stops with a correct trigger", () => {
    const doc = readFileSync(".kiro/specs/OPEN-QUESTIONS.md", "utf8");
    const idx = doc.indexOf("## Session H36g");
    expect(idx).toBeGreaterThan(-1);
    const nextIdx = doc.indexOf("## Session H37a", idx);
    expect(nextIdx).toBeGreaterThan(idx);
    const sec = doc.slice(idx, nextIdx);
    expect(sec).toMatch(/selectFilmTakeSuffix/);
    expect(sec).toMatch(/acceptAll/);
    const rows = sec
      .split("\n")
      .filter((l) => l.startsWith("|") && !l.startsWith("| spec ") && !l.startsWith("|---"));
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      const cells = row
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      expect(cells).toHaveLength(4);
      expect(["a", "b", "c", "d"]).toContain(cells[2]);
      expect(cells[3]).toBe("none");
    }
    expect(sec).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
    expect(sec).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u);
  });

  it("source discipline: filmRun.spec.ts and filmRehearsal.spec.ts record observations and never stop on removed triggers", () => {
    const filmRunSrc = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    const rehearsalSrc = readFileSync("tests/e2e/device/filmRehearsal.spec.ts", "utf8");

    expect(filmRunSrc).toContain("observations");
    expect(rehearsalSrc).toContain("observations");
    expect(filmRunSrc).toContain("classifyDraftOutcomeObservations");
    expect(filmRunSrc).toContain("classifyReaderPassOutcome");
    expect(filmRunSrc).toContain("isReaderPassSettled");
    expect(filmRunSrc).not.toMatch(/fail\(.*doublesInText|fail\(.*markdownProblems|fail\(.*readerError|fail\(.*showed no guess|fail\(.*no pressable quote/);
    expect(filmRunSrc).not.toMatch(/querySelector\(["']\[data-reader\] \[data-guess\]["']\)!/);
    expect(filmRunSrc).not.toMatch(/problems\.push\(.*d7Overlap|problems\.push\(.*MIN_READER_PX|problems\.push\(.*MIN_CAP_PX|problems\.push\(.*MIN_LEDGER_PX/);
    expect(rehearsalSrc).not.toMatch(/problems\.push\(.*forbiddenCopyProblems/);
    expect(filmRunSrc).not.toMatch(/if\s*\(\s*gc\s*<\s*3\s*\)\s*(?:problems\.push|fail\(|throw)/);
    expect(filmRunSrc).toMatch(/if\s*\(\s*gc\s*<\s*3\s*\)\s*observe\(/);
  });
});
