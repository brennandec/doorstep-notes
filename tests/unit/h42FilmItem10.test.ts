import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  H42_TAKE_SUFFIXES,
  NO_DROP_STOP_STATUS,
  checkSecondReaderMiddleColumn,
  resolveFilmTakeStatus,
  selectH42TakeSuffix,
  shouldStopOnNoDrop,
} from "../e2e/device/filmHelpers";

describe("H42 film item 10 and N8 helpers", () => {
  it("selects h42-1..h42-12 in order across pass and stopped-no-drop records", () => {
    expect(H42_TAKE_SUFFIXES).toEqual(Array.from({ length: 12 }, (_, i) => `h42-${i + 1}`));
    expect(NO_DROP_STOP_STATUS).toBe("stopped: no dropped line");
    expect(shouldStopOnNoDrop({ stopEnabled: true, addedLinesCount: 0 })).toBe(true);
    expect(shouldStopOnNoDrop({ stopEnabled: true, addedLinesCount: 1 })).toBe(false);
    expect(shouldStopOnNoDrop({ stopEnabled: false, addedLinesCount: 0 })).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "h42-takes-"));
    try {
      const rawDir = join(dir, "raw");
      expect(selectH42TakeSuffix(dir, "2026-11-15", rawDir)).toEqual({
        suffix: "h42-1",
        rawDir: join(rawDir, "raw-h42-1"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h42-1.json"), JSON.stringify({ status: "pass" }));
      writeFileSync(join(dir, "film-run-2026-11-15-h42-2.json"), JSON.stringify({ status: NO_DROP_STOP_STATUS }));
      expect(selectH42TakeSuffix(dir, "2026-11-15", rawDir)).toEqual({
        suffix: "h42-3",
        rawDir: join(rawDir, "raw-h42-3"),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("checkSecondReaderMiddleColumn accepts Pass 1 rewritten & Pass 2 masked/rewritten and fails on un-rewritten/unmasked", () => {
    const chosen = "[Person 1] noticed damp spreading on the rear wall of the kitchen.";
    const rewritten = "[Person 1] saw damp on the rear kitchen wall.";

    expect(
      checkSecondReaderMiddleColumn({
        chosenSentence: chosen,
        rewrittenSentence: rewritten,
        rewriteApplied: true,
        readerText1: `Seen:\n${rewritten}`,
        readerText2: "Seen:\n[Person 1] saw damp on the [Detail 1].",
        pressedQuote: "rear kitchen wall",
      }),
    ).toMatchObject({
      ok: true,
      pass1HasRewritten: true,
      pass1HasChosenOriginal: false,
      pass2HasRewrittenOrMasked: true,
      pass2HasChosenOriginal: false,
    });

    expect(
      checkSecondReaderMiddleColumn({
        chosenSentence: chosen,
        rewrittenSentence: rewritten,
        rewriteApplied: true,
        readerText1: `Seen:\n${chosen}`,
        readerText2: `Seen:\n${chosen}`,
      }),
    ).toMatchObject({ ok: false, pass1HasRewritten: false, pass1HasChosenOriginal: true });

    expect(
      checkSecondReaderMiddleColumn({
        chosenSentence: chosen,
        rewrittenSentence: rewritten,
        rewriteApplied: true,
        readerText1: `Seen:\n${rewritten}`,
        readerText2: `Seen:\n${rewritten}`,
        pressedQuote: "rear kitchen wall",
      }),
    ).toMatchObject({ ok: false, status: "fail", pass2HasRewrittenOrMasked: false });
  });

  it("checkSecondReaderMiddleColumn marks empty or unapplied rewrites as 'not counted' and fails ok (H42b)", () => {
    const chosen = "Mould in the back bedroom again, worse by the window.";
    const unapplied = checkSecondReaderMiddleColumn({
      chosenSentence: chosen,
      rewrittenSentence: "",
      rewriteApplied: false,
      readerText1: `Seen:\n${chosen}`,
      readerText2: `Seen:\n${chosen}`,
      pressedQuote: "Mould in the back bedroom",
    });
    expect(unapplied.status).toBe("not counted");
    expect(unapplied.ok).toBe(false);
    expect(unapplied.reason).toContain("not counted");

    const blankApplied = checkSecondReaderMiddleColumn({
      chosenSentence: chosen,
      rewrittenSentence: "   ",
      rewriteApplied: true,
      readerText1: `Seen:\n${chosen}`,
      readerText2: `Seen:\n${chosen}`,
      pressedQuote: "Mould in the back bedroom",
    });
    expect(blankApplied.status).toBe("not counted");
    expect(blankApplied.ok).toBe(false);
    expect(blankApplied.reason).toContain("not counted");

    const unchangedRewrite = checkSecondReaderMiddleColumn({
      chosenSentence: chosen,
      rewrittenSentence: `  ${chosen} `,
      rewriteApplied: true,
      readerText1: `Seen:\n${chosen}`,
      readerText2: `Seen:\n[Detail 1] again, worse by the window.`,
      pressedQuote: "Mould in the back bedroom",
      pass2Ran: true,
    });
    expect(unchangedRewrite.status).toBe("not counted");
    expect(unchangedRewrite.ok).toBe(false);
    expect(unchangedRewrite.reason).toBe("Shot C.4 sentence rewrite did not change the text (not counted)");
  });

  it("checkSecondReaderMiddleColumn closes H42c soft spots: no pressed quote or skipped Pass 2 cannot count, while Pass 1/2 bugs always fail", () => {
    const chosen = "[Person 1] noticed damp spreading on the rear wall of the kitchen.";
    const rewritten = "[Person 1] saw damp on the rear kitchen wall.";

    // Genuine Pass 1 failure must always fail even when no quote chip was pressed or Pass 2 did not run.
    const pass1MissingWithoutQuote = checkSecondReaderMiddleColumn({
      chosenSentence: chosen,
      rewrittenSentence: rewritten,
      rewriteApplied: true,
      readerText1: "Seen:\nSomething else.",
      readerText2: null,
      pressedQuote: null,
      pass2Ran: false,
    });
    expect(pass1MissingWithoutQuote.status).toBe("fail");
    expect(pass1MissingWithoutQuote.ok).toBe(false);

    const pass1OriginalStillShown = checkSecondReaderMiddleColumn({
      chosenSentence: chosen,
      rewrittenSentence: rewritten,
      rewriteApplied: true,
      readerText1: `Seen:\n${rewritten}\n${chosen}`,
      readerText2: null,
      pressedQuote: null,
      pass2Ran: false,
    });
    expect(pass1OriginalStillShown.status).toBe("fail");
    expect(pass1OriginalStillShown.pass1HasChosenOriginal).toBe(true);

    // No quote chip pressed -> not counted even when Pass 1 has rewritten sentence.
    for (const pressedQuote of [undefined, null, "", "   "]) {
      const noQuote = checkSecondReaderMiddleColumn({
        chosenSentence: chosen,
        rewrittenSentence: rewritten,
        rewriteApplied: true,
        readerText1: `Seen:\n${rewritten}`,
        readerText2: `Seen:\n${rewritten}`,
        pressedQuote,
        pass2Ran: true,
      });
      expect(noQuote.status).toBe("not counted");
      expect(noQuote.ok).toBe(false);
      expect(noQuote.reason).toBe("Shot C.4 no quote chip was pressed (not counted)");
    }

    // Second pass did not run (null, empty string, or pass2Ran: false even with pre-send outgoing text) -> not counted.
    for (const badPass2 of [
      { readerText2: null, pass2Ran: true },
      { readerText2: "   ", pass2Ran: true },
      { readerText2: `Seen:\n[Person 1] saw damp on the [Detail 1].`, pass2Ran: false },
    ]) {
      const noPass2 = checkSecondReaderMiddleColumn({
        chosenSentence: chosen,
        rewrittenSentence: rewritten,
        rewriteApplied: true,
        readerText1: `Seen:\n${rewritten}`,
        pressedQuote: "rear kitchen wall",
        ...badPass2,
      });
      expect(noPass2.status).toBe("not counted");
      expect(noPass2.ok).toBe(false);
      expect(noPass2.pass2HasRewrittenOrMasked).toBe(false);
      expect(noPass2.reason).toBe("Shot C.4 second pass did not run (not counted)");
    }

    // Pass 2 still shows the original un-rewritten sentence -> fail.
    const pass2StillOriginal = checkSecondReaderMiddleColumn({
      chosenSentence: chosen,
      rewrittenSentence: rewritten,
      rewriteApplied: true,
      readerText1: `Seen:\n${rewritten}`,
      readerText2: `Seen:\n[Person 1] saw damp on the [Detail 1].\n${chosen}`,
      pressedQuote: "rear kitchen wall",
      pass2Ran: true,
    });
    expect(pass2StillOriginal.status).toBe("fail");
    expect(pass2StillOriginal.pass2HasChosenOriginal).toBe(true);

    // Quote pressed outside rewritten sentence: Pass 2 still must keep the rewritten sentence and run Pass 2.
    const pass2UnrelatedQuoteOk = checkSecondReaderMiddleColumn({
      chosenSentence: chosen,
      rewrittenSentence: rewritten,
      rewriteApplied: true,
      readerText1: `Seen:\n${rewritten}`,
      readerText2: `Seen:\n${rewritten}`,
      pressedQuote: "something in agreed",
      pass2Ran: true,
    });
    expect(pass2UnrelatedQuoteOk.status).toBe("pass");
    expect(pass2UnrelatedQuoteOk.ok).toBe(true);

    // Integration with resolveFilmTakeStatus for soft-spot "not counted" and Pass 2 "fail".
    const noQuoteReason = "Shot C.4 no quote chip was pressed (not counted)";
    expect(
      resolveFilmTakeStatus({
        earlyStopStatus: null,
        finished: true,
        problems: [noQuoteReason],
        middleCol: { status: "not counted", reason: noQuoteReason },
      }),
    ).toBe("not counted");
    expect(
      resolveFilmTakeStatus({
        earlyStopStatus: null,
        finished: true,
        problems: [pass2StillOriginal.reason!],
        middleCol: pass2StillOriginal,
      }),
    ).toBe("fail");
  });

  it("selectH42TakeSuffix exhausts all 12 take slots across pass, stopped-no-drop, and not-counted takes before returning null (H42b)", () => {
    const dir = mkdtempSync(join(tmpdir(), "h42-exhaust-"));
    try {
      const rawDir = join(dir, "raw");
      for (let i = 1; i <= 11; i++) {
        writeFileSync(
          join(dir, `film-run-2026-11-15-h42-${i}.json`),
          JSON.stringify({ status: i % 2 === 0 ? "not counted" : NO_DROP_STOP_STATUS }),
        );
      }
      expect(selectH42TakeSuffix(dir, "2026-11-15", rawDir)).toEqual({
        suffix: "h42-12",
        rawDir: join(rawDir, "raw-h42-12"),
      });
      writeFileSync(join(dir, "film-run-2026-11-15-h42-12.json"), JSON.stringify({ status: "not counted" }));
      expect(() => selectH42TakeSuffix(dir, "2026-11-15", rawDir)).toThrow(/cap of 12 takes reached/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolveFilmTakeStatus returns 'not counted' only when finished and no non-middle-column failures exist (H42b)", () => {
    const notCountedReason = "Shot C.4 sentence rewrite gave no result (not counted)";
    expect(
      resolveFilmTakeStatus({
        earlyStopStatus: null,
        finished: true,
        problems: [notCountedReason],
        middleCol: { status: "not counted", reason: notCountedReason },
      }),
    ).toBe("not counted");

    expect(
      resolveFilmTakeStatus({
        earlyStopStatus: null,
        finished: true,
        problems: [notCountedReason, "privacy leak at Shot D"],
        middleCol: { status: "not counted", reason: notCountedReason },
      }),
    ).toBe("fail");

    expect(
      resolveFilmTakeStatus({
        earlyStopStatus: null,
        finished: false,
        problems: [notCountedReason],
        middleCol: { status: "not counted", reason: notCountedReason },
      }),
    ).toBe("fail");
  });
});
