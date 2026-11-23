// @vitest-environment happy-dom
// WO-09: one place clue, one relation clue, ranked above role words. One press masks the quoted clue.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit, PLACE_CLUE, RELATION_CLUE } from "../../src/app/example/inventedVisit";
import { measureRoot } from "../../src/app/measureScreen";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { cluePhrase } from "../../src/app/zones/masksScreen";
import { buildOutgoing, recordBlock } from "../../src/drafting/buildOutgoing";
import type { Guess } from "../../src/inference/types";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { findWholeWords } from "../../src/masking/fold";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { maskText } from "../../src/masking/toggle";
import { keepEvidence } from "../../src/secondReader/evidence";
import { isRoleWordQuote, pointingCount, quotedClue, rankGuesses } from "../../src/secondReader/rank";

const clues = { place: PLACE_CLUE, relation: RELATION_CLUE };
const clients = parseClientList(inventedVisit.clientList).entries;

const handlers = (over: Partial<Handlers> = {}): Handlers => ({
  onNoteInput: vi.fn(),
  onListInput: vi.fn(),
  onTryExample: vi.fn(),
  onRemoveExample: vi.fn(),
  onGetModel: vi.fn(),
  onMakeRecord: vi.fn(),
  onStartVisit: vi.fn(),
  ...over,
});

function maskedRecord(): string {
  return buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY }).maskedRecord;
}

describe("WO-09 invented visit", () => {
  it("carries one place clue and one relation clue in the record the reader sees", () => {
    expect(findWholeWords(inventedVisit.note, PLACE_CLUE)).toHaveLength(1);
    expect(inventedVisit.note).toContain("sister Bea there too");
    const block = recordBlock(inventedVisit.preparedRecord);
    expect(findWholeWords(block, PLACE_CLUE)).toHaveLength(1);
    expect(findWholeWords(block, RELATION_CLUE)).toHaveLength(1);
    expect(block).toContain("worker");
    expect(block).toContain("landlord");
  });

  it("leaves both clues in the masked record", () => {
    const masked = maskedRecord();
    expect(findWholeWords(masked, PLACE_CLUE)).toHaveLength(1);
    expect(findWholeWords(masked, RELATION_CLUE)).toHaveLength(1);
  });
});

describe("WO-09 rank", () => {
  const guesses: Guess[] = [
    { who: "a landlord", kind: "role", evidence: ["landlord"] },
    { who: "a worker", kind: "role", evidence: ["worker"] },
    { who: "a date", kind: "date", evidence: ["26/11"] },
    { who: "a sister", kind: "relation", evidence: ["Her sister was there"] },
    { who: "a room", kind: "place", evidence: ["the back bedroom"] },
  ];

  it("ranks place, relation and date above worker and landlord", () => {
    expect(isRoleWordQuote("landlord")).toBe(true);
    expect(isRoleWordQuote("worker")).toBe(true);
    expect(isRoleWordQuote("Worker rings the landlord on Mon")).toBe(false);
    expect(rankGuesses(guesses, clues).map((guess) => guess.kind)).toEqual(["place", "relation", "date", "role", "role"]);
  });

  it("keeps a place label from saving a quote that is only the word landlord", () => {
    const mislabeled: Guess[] = [
      { who: "role word", kind: "place", evidence: ["landlord"] },
      { who: "the room", kind: "role", evidence: ["back bedroom"] },
    ];
    expect(rankGuesses(mislabeled, clues).map((guess) => guess.who)).toEqual(["the room", "role word"]);
  });
});

describe("WO-09 one press", () => {
  const two: Guess[] = [
    { who: "the room", kind: "place", evidence: ["Mould in the back bedroom"] },
    { who: "the same room", kind: "place", evidence: ["worse by the back bedroom"] },
  ];

  it("goes from 2 guesses pointing at her to 0 after the quoted clue is masked", () => {
    const raw = recordBlock(inventedVisit.preparedRecord);
    const before = applyMask(raw, [], clients).maskedText;
    expect(pointingCount(two, clues, before)).toBe(2);
    expect(quotedClue(two, clues, before)).toBe(PLACE_CLUE);
    const next = maskText(raw, [], PLACE_CLUE);
    const after = applyMask(raw, next.spans, clients).maskedText;
    expect(findWholeWords(after, PLACE_CLUE)).toHaveLength(0);
    const kept = keepEvidence(two, after);
    expect(pointingCount(kept.guesses, clues, after)).toBe(0);
    expect(kept.guesses.every((guess) => guess.evidence.every((quote) => !quote.toLowerCase().includes(PLACE_CLUE)))).toBe(true);
  });

  it("still counts the relation clue after the place clue is masked", () => {
    const raw = recordBlock(inventedVisit.preparedRecord);
    const both: Guess[] = [
      { who: "the room", kind: "place", evidence: ["the back bedroom"] },
      { who: "the sister", kind: "relation", evidence: ["Her sister was there"] },
    ];
    const after = applyMask(raw, maskText(raw, [], PLACE_CLUE).spans, clients).maskedText;
    expect(pointingCount(keepEvidence(both, after).guesses, clues, after)).toBe(1);
  });
});

describe("WO-09 masks step", () => {
  function mount() {
    const root = document.createElement("div");
    const onAskReader = vi.fn();
    const onMaskClue = vi.fn();
    root.append(
      ...renderScreen(
        emptyState({
          recordOpen: false,
          example: true,
          started: true,
          noteText: inventedVisit.note,
          clientList: inventedVisit.clientList,
          record: structuredClone(inventedVisit.preparedRecord),
        }),
        handlers({ onAskReader, onMaskClue }),
      ),
    );
    return { root, onAskReader, onMaskClue };
  }

  it("offers the reader on the masks step and marks the place clue", () => {
    const { root, onAskReader, onMaskClue } = mount();
    const measured = measureRoot(root);
    expect(measured.words).toBeLessThanOrEqual(350);
    expect(measured.controls).toBeLessThanOrEqual(30);
    const ask = root.querySelector<HTMLButtonElement>("#ask-reader")!;
    expect(ask.textContent).toBe(strings.secondReader.ask);
    ask.click();
    expect(onAskReader).toHaveBeenCalledTimes(1);
    const hit = root.querySelector("[data-quoted-clue]");
    expect(hit?.textContent).toBe(PLACE_CLUE);
    expect(cluePhrase(maskedRecord(), inventedVisit.preparedRecord)).toBe(PLACE_CLUE);
    root.querySelector<HTMLButtonElement>("#mask-clue")!.click();
    expect(onMaskClue).toHaveBeenCalledWith(PLACE_CLUE);
  });

  it("keeps the answer on screen and masks the quoted clue in one press", () => {
    const onMaskClue = vi.fn();
    const root = document.createElement("div");
    root.append(
      ...renderScreen(
        emptyState({
          recordOpen: false,
          example: true,
          started: true,
          noteText: inventedVisit.note,
          clientList: inventedVisit.clientList,
          record: structuredClone(inventedVisit.preparedRecord),
          outgoingText: "the text that was sent",
          reader: {
            pending: false,
            asking: false,
            line: null,
            maskedQuotes: [],
            announce: "",
            result: {
              guesses: [{ who: "the room", kind: "place", evidence: ["the back bedroom"] }],
              replaced: 0,
              allDropped: false,
              source: "IN_CLOUD",
              connected: true,
              pass: {
                left: true,
                host: "example.test",
                model: "m",
                requests: 1,
                bytes: 1,
                modelRequests: 1,
                modelBytes: 1,
                sha256: "abc",
                at: "2026-11-22T00:00:00.000Z",
                read: "",
              },
            },
          },
        }),
        handlers({ onMaskClue }),
      ),
    );
    expect(root.querySelector("[data-send-step]")).toBeNull();
    expect(root.querySelector("[data-reader] [data-guess]")?.textContent).toContain("the room");
    expect(root.querySelector("[data-pointing]")?.getAttribute("data-pointing")).toBe("1");
    const clue = root.querySelector<HTMLButtonElement>("#mask-clue")!;
    expect(clue.getAttribute("data-quoted-clue")).toBe(PLACE_CLUE);
    clue.click();
    expect(onMaskClue).toHaveBeenCalledWith(PLACE_CLUE);
  });
});
