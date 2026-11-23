import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  H39_TAKE_SUFFIXES,
  chooseH39Chip,
  classifySheetFaults,
  selectH39TakeSuffix,
} from "../e2e/device/filmHelpers";

describe("H39 final take prep: h39-1..h39-5 slots, neighbour chip preference, Shot A capture, and bare colon fault stop", () => {
  it("selectH39TakeSuffix steps h39-1..h39-5 independently of h36/h37 and enforces DOORSTEP_FILM_RAW_DIR", () => {
    expect(H39_TAKE_SUFFIXES).toEqual(["h39-1", "h39-2", "h39-3", "h39-4", "h39-5"]);

    const prev = process.env["DOORSTEP_FILM_RAW_DIR"];
    try {
      delete process.env["DOORSTEP_FILM_RAW_DIR"];
      const dir = mkdtempSync(join(tmpdir(), "h39-noenv-"));
      try {
        expect(() => selectH39TakeSuffix(dir, "2026-11-15")).toThrow(/DOORSTEP_FILM_RAW_DIR/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    } finally {
      if (prev === undefined) delete process.env["DOORSTEP_FILM_RAW_DIR"];
      else process.env["DOORSTEP_FILM_RAW_DIR"] = prev;
    }

    const dir = mkdtempSync(join(tmpdir(), "h39-slots-"));
    const rawRoot = resolve(tmpdir(), "h39-raw-root");
    try {
      writeFileSync(join(dir, "film-run-2026-11-15-h36-8.json"), JSON.stringify({ status: "pass" }));
      writeFileSync(join(dir, "film-run-2026-11-15-h37-4.json"), JSON.stringify({ status: "pass" }));

      for (const s of H39_TAKE_SUFFIXES) {
        const picked = selectH39TakeSuffix(dir, "2026-11-15", rawRoot);
        expect(picked.suffix).toBe(s);
        expect(basename(picked.rawDir)).toBe(`raw-${s}`);
        expect(picked.rawDir).toBe(join(rawRoot, `raw-${s}`));
        writeFileSync(join(dir, `film-run-2026-11-15-${s}.json`), JSON.stringify({ status: s === "h39-1" ? "fail" : "pass" }));
      }
      expect(() => selectH39TakeSuffix(dir, "2026-11-15", rawRoot)).toThrow(/cap of 5/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("chooseH39Chip prefers any chip quoting the neighbour phrase when Pass 1 offers it, else first pressable", () => {
    const guesses = [
      { kind: "place", quotes: ["worse by the window"] },
      { kind: "role", quotes: ["on my list", "a neighbour, also on my list"] },
    ];
    const withNeighbour = chooseH39Chip(guesses, [
      ["worse by the window"],
      ["on my list", "a neighbour, also on my list"],
    ]);
    expect(withNeighbour).toEqual({
      rule: "neighbour-quote",
      pressedKind: "role",
      pressedIndex: 1,
      pressedQuoteIndex: 1,
      pressedQuote: "a neighbour, also on my list",
      candidates: [{ index: 1, quoteIndex: 1, kind: "role", quote: "a neighbour, also on my list" }],
    });

    const usSpelling = chooseH39Chip(
      [{ kind: "other", quotes: ["the neighbor offered help"] }],
      [["the neighbor offered help"]],
    );
    expect(usSpelling?.rule).toBe("neighbour-quote");
    expect(usSpelling?.pressedQuote).toBe("the neighbor offered help");

    const withoutNeighbour = chooseH39Chip(
      [
        { kind: "place", quotes: [] },
        { kind: "date", quotes: ["missed deadline", "post on Friday"] },
      ],
      [[], ["missed deadline", "post on Friday"]],
    );
    expect(withoutNeighbour).toEqual({
      rule: "first-pressable",
      pressedKind: "date",
      pressedIndex: 1,
      pressedQuoteIndex: 0,
      pressedQuote: "missed deadline",
      candidates: [],
    });

    expect(chooseH39Chip([{ kind: "place", quotes: [] }], [[]])).toBeNull();
  });

  it("classifySheetFaults stops on bare word:Role marks and passes clean prose colons", () => {
    expect(
      classifySheetFaults({
        sheetText: "Sent by them:Landlord before 10:30.",
        noteItems: [],
      }).stops,
    ).toEqual(["word:Role mark (them:Landlord) on the sheet"]);
    expect(
      classifySheetFaults({
        sheetText: "It was agreed that I:Worker will ring.",
        noteItems: [],
      }).stops,
    ).toEqual(["word:Role mark (I:Worker) on the sheet"]);
    expect(
      classifySheetFaults({
        sheetText:
          "Visit date: 12/11. Present:Maria Okonkwo-Reyes, Tomas Brandvold. Seen:Mould in back bedroom. Re:Benefits form deadline. Ref:AB12 (Note:Mould). Agreed: Maria Okonkwo-Reyes will post at 10:30 via https://example.invalid/doc:1.",
        noteItems: [],
      }).stops,
    ).toEqual([]);
    expect(
      classifySheetFaults({
        sheetText: "Meet Maria:Person 1 and foo:Worker.",
        noteItems: [],
      }).stops,
    ).toEqual(["word:Role mark (Maria:Person 1) on the sheet"]);
  });

  it("filmRun.spec.ts wires h39-1..h39-5 slots, neighbour chip preference, pressedIndex lookup, Shot A text capture, and keeps selectH37TakeSuffix", () => {
    const src = readFileSync("tests/e2e/device/filmRun.spec.ts", "utf8");
    expect(src).toContain("selectH39TakeSuffix");
    expect(src).toContain("selectH37TakeSuffix");
    expect(src).toContain("chooseH39Chip");
    expect(src).toContain("guesses1[choice.pressedIndex]");
    expect(src).toContain("deviceDraftText");
    expect(src).toContain("deviceAboutLines");
  });
});
