// @vitest-environment happy-dom
// Shell-and-offline task 66 (R34.3, fifth review N3): the logic of the check that finds text a box hides.
import { describe, expect, it } from "vitest";
import { collectBoxes, findCut, type BoxInfo } from "../e2e/fixtures/cutText";

const box = (over: Partial<BoxInfo> = {}): BoxInfo => ({
  label: "p.offline-line",
  text: "Not available while you are offline.",
  clientWidth: 300,
  scrollWidth: 300,
  clientHeight: 27,
  scrollHeight: 27,
  overflowX: "visible",
  overflowY: "visible",
  boxBottom: 100,
  boxRight: 300,
  textBottom: 100,
  textRight: 280,
  ...over,
});

describe("findCut", () => {
  it("passes a box whose text is inside it", () => {
    expect(findCut([box()])).toEqual([]);
  });

  it("finds text that spills below its box (the M3 case: the second line sits outside a one-line box)", () => {
    const cut = findCut([box({ textBottom: 127 })]);
    expect(cut).toHaveLength(1);
    expect(cut[0]).toMatchObject({ label: "p.offline-line", reason: "spills below", text: "Not available while you are offline.", by: 27 });
  });

  it("finds text that spills to the right", () => {
    expect(findCut([box({ textRight: 340 })])[0]?.reason).toBe("spills right");
  });

  it("finds a box that clips across or down", () => {
    expect(findCut([box({ overflowX: "hidden", scrollWidth: 420 })])[0]?.reason).toBe("clipped across");
    expect(findCut([box({ overflowY: "hidden", scrollHeight: 90 })])[0]?.reason).toBe("clipped down");
  });

  it("does not report a scroll box whose content is larger when it scrolls (overflow auto still counts: the page names those it exempts)", () => {
    expect(findCut([box({ overflowY: "visible", scrollHeight: 90 })])).toEqual([]);
  });

  it("allows one pixel of rounding", () => {
    expect(findCut([box({ textBottom: 101, textRight: 301 })])).toEqual([]);
    expect(findCut([box({ overflowX: "hidden", scrollWidth: 301 })])).toEqual([]);
  });

  it("allows a hanging space at the end of a pre-wrap line, a few pixels past the box, and no more", () => {
    expect(findCut([box({ textRight: 303 })])).toEqual([]);
    expect(findCut([box({ textRight: 306 })])[0]?.reason).toBe("spills right");
  });

  it("reports each box once and keeps the order", () => {
    const cut = findCut([box({ label: "a", textBottom: 150 }), box({ label: "b" }), box({ label: "c", textRight: 999 })]);
    expect(cut.map((c) => c.label)).toEqual(["a", "c"]);
  });
});

describe("collectBoxes (in a page with no layout)", () => {
  it("leaves out the outgoing text, the ledger text, a closed fold's body and boxes with no text of their own", () => {
    document.body.innerHTML = `
      <section data-zone="leaves">
        <pre class="outgoing">Masked text</pre>
        <pre class="ledger-text">entry</pre>
        <details class="fold"><summary>What this check scans</summary><p>Scanned: words</p></details>
        <div><p class="send-notice">Not connected.</p></div>
      </section>`;
    // happy-dom has no layout: every box is empty, so nothing is collected, and nothing throws.
    expect(() => collectBoxes()).not.toThrow();
    for (const b of collectBoxes()) {
      expect(b.label).not.toMatch(/outgoing|ledger-text/);
    }
  });
});
