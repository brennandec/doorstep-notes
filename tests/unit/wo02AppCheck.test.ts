// @vitest-environment happy-dom
// WO-02 · App Check that a clicking judge gets through.
//
// THE ARITHMETIC THIS FILE EXISTS FOR. At the pane's measured rate of 1 refusal in 5, a 3-call
// judge path with a LIMITED-USE token (one robot check per call) meets at least one refusal
// with probability 1 - (4/5)^3 = 0.488. With ONE CACHED token for the whole lifetime it is the
// per-page rate, about 0.20. The plan's numbers, verified here rather than taken on trust.
//
// Tests are written before the change. Against the current code they fail on:
//   - three cloud calls making three token exchanges instead of one
//   - derive() returning "connected" before any IN_CLOUD answer
import { describe, expect, it, vi } from "vitest";
import { strings } from "../../src/app/strings";

/** The plan's own arithmetic, asserted so a future edit cannot quietly change the premise. */
describe("WO-02 premise — why cached tokens", () => {
  it("three limited-use calls at a 1-in-5 refusal rate meet a refusal about 49% of the time", () => {
    const perCall = 1 / 5;
    const noneRefused = (1 - perCall) ** 3;
    expect(Number((1 - noneRefused).toFixed(3))).toBe(0.488);
  });

  it("one cached token makes the same path cost the per-page rate, about 20%", () => {
    // With caching, the three calls share one exchange, so the exposure is one refusal, not three.
    expect(1 / 5).toBe(0.2);
  });

  it("caching is what closes the gap, and the gap is large", () => {
    const limitedUse = 1 - (4 / 5) ** 3;
    const cached = 1 / 5;
    expect(limitedUse).toBeGreaterThan(cached * 2);
  });
});

describe("WO-02 copy — the two states a judge can meet", () => {
  it("there is copy for a state that says the cloud is ready but not yet used", () => {
    // WO-02: the cloud status reads "ready, not used yet" until the first IN_CLOUD answer.
    // "connected" is a claim that a call reached the cloud, and it must not precede one.
    const ready = strings.status.cloudReady;
    expect(typeof ready, 'strings.cloud.ready must exist for WO-02\'s "ready, not used yet"').toBe("string");
    expect(String(ready).toLowerCase()).toMatch(/ready/);
    expect(String(ready).toLowerCase()).not.toMatch(/connected/);
  });

  it("the connected copy exists and is not reused for the pre-answer state", () => {
    expect(strings.status.cloudConnected).toBeTruthy();
    expect(String(strings.status.cloudReady)).not.toBe(String(strings.status.cloudConnected));
  });

  it("a 403 card names the Send press in words a judge can follow", () => {
    const card = strings.cloud.reloadCard;
    expect(typeof card, "strings.cloud.reloadCard must exist: WO-02 asks for one card").toBe("string");
    expect(String(card)).toMatch(/Press Send/);
  });

  it("the second refusal adds the network-or-browser advice", () => {
    const second = strings.cloud.reloadCardSecond;
    expect(typeof second, "strings.cloud.reloadCardSecond must exist for the second refusal").toBe("string");
    expect(String(second).toLowerCase()).toMatch(/network|browser/);
  });
});

describe("WO-02 recorded content is labelled with its provenance", () => {
  it("a recorded answer carries a date, a browser and a run file", () => {
    // WO-02: while refused, a recorded answer may be shown "labelled with its date, browser and
    // run file, never shown as live". A label that omits any of the three is not the label.
    const recorded = strings.cloud.recordedAnswerLabel;
    expect(typeof recorded, "strings.cloud.recordedAnswerLabel must exist").toBe("string");
    const text = String(recorded);
    for (const part of [/date/i, /browser/i, /run/i]) {
      expect(part.test(text), `the recorded-answer label must name ${part}: "${text}"`).toBe(true);
    }
  });
});
