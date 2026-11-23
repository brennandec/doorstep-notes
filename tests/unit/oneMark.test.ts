// @vitest-environment happy-dom
// Drafting task 26 (R13, sixth review R5): one mark on the finished note while the cloud is not connected.
import { describe, expect, it } from "vitest";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { finishedMark } from "../../src/app/parts/sourceLabel";
import { flattenStrings, strings } from "../../src/app/strings";
import { emptyState, type AppState } from "../../src/app/state";

const done = (over: Partial<NonNullable<AppState["finished"]>> = {}) =>
  renderFinishedZone(emptyState({ finished: { text: "Maria Okonkwo-Reyes agreed.", source: "IN_CLOUD", connected: false, ...over } }), {} as never);
const marks = (z: HTMLElement) => [...z.querySelectorAll(".sheet .source-label")];

const MARK = "names put back on this device; draft text is a fixed sample: cloud off";

describe("the restored name and the mark together (screens 10 and 13)", () => {
  it("the finished note still shows the restored listed name, and the one mark says both facts", () => {
    const z = done();
    expect(z.querySelector(".sheet-text")!.textContent).toContain("Maria Okonkwo-Reyes");
    expect(marks(z)).toHaveLength(1);
    const words = marks(z)[0]!.textContent!;
    expect(words).toContain("names put back on this device");
    expect(words).toContain("draft text is a fixed sample");
    expect(words).toContain("cloud off");
    expect(words).toBe(MARK);
  });

  it("a connected or device note does not carry the test-double words", () => {
    expect(finishedMark("IN_CLOUD", true).textContent).not.toContain("put back");
    expect(finishedMark("ON_DEVICE", false).textContent).toBe("on this device");
  });
});

describe("the finished note from a test double (R13.1)", () => {
  it("carries exactly one mark, with the owner's words", () => {
    const z = done();
    expect(marks(z)).toHaveLength(1);
    expect(marks(z)[0]!.textContent).toBe(MARK);
    expect(marks(z)[0]!.getAttribute("data-source")).toBe("test-double");
  });

  it("has no 'in the cloud' pill beside it and no second 'not connected' mark", () => {
    const z = done();
    expect(z.querySelector('[data-source="IN_CLOUD"]')).toBeNull();
    expect(z.querySelector('[data-source="not-connected"]')).toBeNull();
    expect(z.querySelector(".source-labels")).toBeNull();
    expect(z.querySelector(".sheet")!.textContent).not.toContain("in the cloud");
  });

  it("draws a shape of its own: the cloud outline with a line through it, in the outlined style", () => {
    const mark = marks(done())[0]!;
    expect(mark.querySelector('[data-icon="cloud"]')).not.toBeNull();
    expect(mark.querySelector("svg path[d='M4 4l16 16']")).not.toBeNull();
    expect(mark.classList.contains("cloud")).toBe(false);
  });
});

describe("the finished note once connected, and from the device (R13.2)", () => {
  it("connected: the source mark as before, one mark", () => {
    const z = done({ connected: true });
    expect(marks(z)).toHaveLength(1);
    expect(marks(z)[0]!.textContent).toBe("in the cloud");
    expect(marks(z)[0]!.getAttribute("data-source")).toBe("IN_CLOUD");
  });

  it("a device draft keeps 'on this device', one mark, whether or not the cloud is connected", () => {
    for (const connected of [true, false]) {
      const z = done({ source: "ON_DEVICE", connected, shortLine: "Shorter draft made on this device." });
      expect(marks(z)).toHaveLength(1);
      expect(marks(z)[0]!.textContent).toBe("on this device");
    }
  });

  it("finishedMark is the source label when connected", () => {
    expect(finishedMark("IN_CLOUD", true).textContent).toBe("in the cloud");
    expect(finishedMark("ON_DEVICE", true).textContent).toBe("on this device");
  });
});

describe("the other results are not changed (R13.3)", () => {
  it("the source label still adds 'not connected' for a double on the record, rewrite and reader", async () => {
    const { sourceLabel } = await import("../../src/app/parts/sourceLabel");
    const l = sourceLabel("IN_CLOUD", false);
    expect(l.textContent).toContain("in the cloud");
    expect(l.textContent).toContain("off");
  });
});

describe("the words (R13.4)", () => {
  it("are in the string table, pass the word and number audits, and are not duplicated", () => {
    const all = flattenStrings(strings);
    expect(all.filter((t) => t === MARK)).toHaveLength(1);
    expect(strings.source.testDouble).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared)\b/i);
    expect(strings.source.testDouble).not.toMatch(/\d/);
    expect(strings.source.testDouble).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe("one path mark on a connected result", () => {
  it("a connected cloud result shows one mark, in the cloud, and does not say on this device", () => {
    const z = done({ connected: true, namesRestored: true });
    const m = marks(z);
    expect(m).toHaveLength(1);
    expect(m[0]!.textContent).toBe("in the cloud");
    expect(m[0]!.getAttribute("data-source")).toBe("IN_CLOUD");
    expect(m[0]!.textContent).not.toContain("on this device");
    expect(z.querySelector('[data-source="names-restored"]')).toBeNull();
  });

  it("a connected cloud result without restored names is the same one mark", () => {
    const z = done({ connected: true, namesRestored: false });
    expect(marks(z)).toHaveLength(1);
    expect(marks(z)[0]!.textContent).toBe("in the cloud");
  });

  it("a connected device result shows one mark, on this device, and does not say in the cloud", () => {
    const z = done({ source: "ON_DEVICE", connected: true, namesRestored: true });
    expect(marks(z)).toHaveLength(1);
    expect(marks(z)[0]!.textContent).toBe("on this device");
    expect(marks(z)[0]!.textContent).not.toContain("in the cloud");
    expect(z.querySelector('[data-source="names-restored"]')).toBeNull();
  });

  it("finishedMark for a connected cloud result is one mark even when names were restored", () => {
    const mark = finishedMark("IN_CLOUD", true, true);
    expect(mark.classList.contains("source-label")).toBe(true);
    expect(mark.querySelectorAll(".source-label")).toHaveLength(0);
    expect(mark.textContent).toBe("in the cloud");
    expect(mark.textContent).not.toContain("on this device");
  });

  it("finishedMark without namesRestored shows one mark", () => {
    const mark = finishedMark("IN_CLOUD", true, false);
    expect(mark.classList.contains("source-label")).toBe(true);
    expect(mark.textContent).toBe("in the cloud");
  });

  it("the restoration label is in the string table and passes audits", () => {
    const all = flattenStrings(strings);
    expect(all.filter((t) => t === "names put back on this device")).toHaveLength(1);
    expect(strings.source.namesRestored).toBe("names put back on this device");
    expect(strings.source.namesRestored).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared)\b/i);
    expect(strings.source.namesRestored).not.toMatch(/\d/);
    expect(strings.source.namesRestored).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
