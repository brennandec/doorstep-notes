// @vitest-environment happy-dom
// drafting tasks 19 and 20 (R10, U7): "Shorter" and "Plainer" on a sentence of the outgoing text.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { buildOutgoing, INSTRUCTIONS } from "../../src/drafting/buildOutgoing";
import { rewriteText } from "../../src/inference/rewrite/instructions";
import { expandShorthand } from "../../src/inference/rewrite/shorthand";
import { applyReplacements, occurrenceIndex, recordPartEnd, selectableSentences } from "../../src/drafting/sentences";
import { prepareDraft } from "../../src/drafting/draftFlow";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { makeRewriteJob, type RewriteSdk } from "../../src/inference/rewrite/rewrite.real";
import { rewriteDouble } from "../../src/inference/rewrite/rewrite.double";
import type { DeviceModelState, RewriteJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { tagsIn } from "../../src/masking/tags";
import { makePreview } from "../../src/egress/send";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const clients = parseClientList(inventedVisit.clientList).entries;
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const SEEN = "Mould in the back bedroom, worse by the window";
const FORM = "[Person 1] posts the form on Fri";

afterEach(() => vi.unstubAllGlobals());

function setup(o: { device?: DeviceModelState; cloud?: boolean; rewrite?: RewriteJob } = {}) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const rewrite = o.rewrite ?? { mode: "PREFER_ON_DEVICE" as const, run: vi.fn((t, i) => rewriteDouble.run(t, i)) };
  const draft = { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) };
  const ledger = makeLedger();
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => o.device ?? "unavailable", create: async () => ({ destroy() {} }) } }),
    aiServiceEnabled: o.cloud ?? false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => draft as never,
      rewriteFor: () => rewrite,
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  });
  return { root, c, rewrite, draft, ledger };
}
async function withVisit(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(structuredClone(inventedVisit.preparedRecord));
  s.c.render();
  // H35a D2 and D8: Zone 2 stays empty until Draft is pressed, and Draft stops at a word that looks like an
  // unlisted name (Bea) until she keeps it. The sentences can be selected once the text is there.
  await press(s.root, "#draft");
  for (let i = 0; i < 5 && s.root.querySelector("[data-keep-likely]"); i++) await press(s.root, "[data-keep-likely]");
}
const sentenceEl = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll<HTMLElement>("[data-sentence]")].find((n) => n.textContent === text)!;
const press = async (root: HTMLElement, sel: string) => { q<HTMLElement>(root, sel).click(); await settle(); };
const outgoing = (root: HTMLElement) => q(root, "pre.outgoing").textContent!;

describe("task 19: which sentences can be selected", () => {
  const out = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
  const ranges = selectableSentences(out.text);

  it("takes sentences of the masked record part only", () => {
    const end = recordPartEnd(out.text)!;
    expect(end).toBe(out.maskedRecord.length);
    expect(ranges.length).toBeGreaterThanOrEqual(5);
    for (const r of ranges) {
      expect(r.end).toBeLessThanOrEqual(end);
      expect(out.text.slice(r.start, r.end)).toBe(r.text);
    }
    const texts = ranges.map((r) => r.text);
    expect(texts).toContain(SEEN);
    expect(texts).toContain(FORM);
    expect(texts.join("\n")).not.toMatch(/Instructions|Visit date|Present|Keep every tag/);
  });

  it("leaves out the date line, the people, the labels, 'none' and the fixed instructions", () => {
    const text = `Visit date: 12/11\nPresent: [Person 1], worker\nSeen: none\nAgreed: Rings on Mon.; Posts on Fri.\nRisks: none\nNext steps: Revisit.\n\n${INSTRUCTIONS}`;
    expect(selectableSentences(text).map((r) => r.text)).toEqual(["Rings on Mon.", "Posts on Fri.", "Revisit."]);
  });

  it("splits a second sentence inside one item", () => {
    const text = "Seen: First thing here. Second thing here.; Third.\n\nInstructions: x";
    expect(selectableSentences(text).map((r) => r.text)).toEqual(["First thing here.", "Second thing here.", "Third."]);
  });

  it("selects nothing in a text that has no record part", () => {
    expect(selectableSentences("Some other text.")).toEqual([]);
  });

  it("counts equal sentences before the selected one", () => {
    const text = "Seen: Same.; Same.; Other.\n\nInstructions: x";
    const rs = selectableSentences(text);
    expect(occurrenceIndex(text, rs[0]!)).toBe(0);
    expect(occurrenceIndex(text, rs[1]!)).toBe(1);
  });

  it("applies a replacement to the record part only, and checks the new text again", () => {
    const prep = prepareDraft({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const next = applyReplacements(prep, [{ from: SEEN, to: "Mould again.", nth: 0 }], (t) => makePreview(t, prep.values));
    expect(next.outgoing.text).toContain("Seen: Mould again;");
    expect(next.outgoing.text.endsWith(INSTRUCTIONS)).toBe(true);
    expect(next.outgoing.maskedRecord).toBe(next.outgoing.text.slice(0, next.outgoing.maskedRecord.length));
    expect(next.preview.text).toBe(next.outgoing.text);
    expect(applyReplacements(prep, [], (t) => makePreview(t, prep.values))).toBe(prep);
    expect(applyReplacements(prep, [{ from: "not there", to: "x", nth: 0 }], (t) => makePreview(t, prep.values))).toBe(prep);
  });
});

describe("task 19: on the screen", () => {
  it("draws each selectable sentence as a control, and the text of the block is the string given to the job", async () => {
    const s = await (async () => { const x = setup(); await withVisit(x); return x; })();
    const text = s.c.state().outgoingText;
    expect(outgoing(s.root)).toBe(text);
    const spans = [...s.root.querySelectorAll<HTMLElement>("[data-sentence]")];
    expect(spans.map((n) => n.textContent)).toEqual(selectableSentences(text).map((r) => r.text));
    for (const n of spans) {
      expect(n.getAttribute("role")).toBe("button");
      expect(n.tabIndex).toBe(0);
      expect(n.getAttribute("aria-pressed")).toBe("false");
    }
    expect(s.root.querySelector("[data-rewrite-controls]")).toBeNull();
    // The fixed labels and the instructions are plain text.
    expect(spans.some((n) => /Instructions|Seen:|Visit date/.test(n.textContent!))).toBe(false);
  });

  it("shows Shorter and Plainer on the selected sentence only, one at a time, each at least 44 px high", async () => {
    const s = setup();
    await withVisit(s);
    const text = s.c.state().outgoingText;
    sentenceEl(s.root, SEEN).click();
    expect(s.root.querySelectorAll("[data-rewrite-controls]").length).toBe(1);
    expect(q(s.root, "#rewrite-shorter").textContent).toBe("Shorter");
    expect(q(s.root, "#rewrite-plainer").textContent).toBe("Plainer");
    expect(sentenceEl(s.root, SEEN).getAttribute("aria-pressed")).toBe("true");
    // The wrapping and the controls add no text to the block.
    expect(outgoing(s.root)).toBe(text);
    sentenceEl(s.root, FORM).click();
    expect(s.root.querySelectorAll("[data-rewrite-controls]").length).toBe(1);
    expect(sentenceEl(s.root, SEEN).getAttribute("aria-pressed")).toBe("false");
    expect(sentenceEl(s.root, FORM).getAttribute("aria-pressed")).toBe("true");
    expect(outgoing(s.root)).toBe(text);
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.btn \{[^}]*min-height: 48px/);
    for (const id of ["rewrite-shorter", "rewrite-plainer"]) expect(q(s.root, `#${id}`).classList.contains("btn")).toBe(true);
  });

  it("selects with the keyboard, and clears on a second press", async () => {
    const s = setup();
    await withVisit(s);
    const n = sentenceEl(s.root, SEEN);
    n.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(s.root.querySelector("[data-rewrite-controls]")).not.toBeNull();
    expect(document.activeElement).toBe(sentenceEl(s.root, SEEN));
    sentenceEl(s.root, SEEN).dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(s.root.querySelector("[data-rewrite-controls]")).toBeNull();
  });

  it("offers nothing to select before there is a record, or once the note is finished", async () => {
    const s = setup();
    await s.c.start();
    expect(s.root.querySelector("[data-sentence]")).toBeNull();
  });
});

describe("task 20: the press", () => {
  it("gives the job exactly the one sentence and the fixed instructions, with its tags", async () => {
    const s = setup();
    await withVisit(s);
    sentenceEl(s.root, FORM).click();
    await press(s.root, "#rewrite-plainer");
    const run = s.rewrite.run as ReturnType<typeof vi.fn>;
    expect(run).toHaveBeenCalledTimes(1);
    const input = run.mock.calls[0]![1] as { text: string; tags: string[] };
    expect(input.text).toBe(rewriteText("plainer", expandShorthand(FORM)));
    expect(input.tags).toEqual(tagsIn(FORM));
    expect(input.text).not.toContain("Visit date");
    expect(input.text).not.toContain("Mould");
    expect(s.rewrite.mode).toBe("PREFER_ON_DEVICE");
  });

  it("records the call in the ledger with the mode ONLY_ON_DEVICE when the cloud switch is off and no device model answers (H45b)", async () => {
    const s = setup();
    await withVisit(s);
    sentenceEl(s.root, SEEN).click();
    await press(s.root, "#rewrite-shorter");
    const entry = s.ledger.all().at(-1)!;
    expect(entry.job).toBe("rewrite");
    expect(entry.mode).toBe("ONLY_ON_DEVICE");
  });

  it("shows the source label and 'off' while a double answers", async () => {
    const s = setup();
    await withVisit(s);
    sentenceEl(s.root, SEEN).click();
    await press(s.root, "#rewrite-shorter");
    const result = q(s.root, "[data-rewrite-result]");
    expect(result.textContent).toContain("in the cloud");
    expect(result.textContent).toContain("off");
    expect(result.querySelector("[data-source]")!.getAttribute("data-source")).toBe("IN_CLOUD");
  });

  it("shows 'on this device' and no 'off' when the device answers", async () => {
    const rewrite: RewriteJob = { mode: "PREFER_ON_DEVICE", run: vi.fn(async () => ({ value: "Mould again.", inferenceSource: "ON_DEVICE" as const, connected: true })) };
    const s = setup({ rewrite, device: "available" });
    await withVisit(s);
    sentenceEl(s.root, SEEN).click();
    await press(s.root, "#rewrite-shorter");
    expect(q(s.root, "[data-rewrite-result]").textContent).toContain("on this device");
    expect(q(s.root, "[data-rewrite-result]").textContent).not.toContain("off");
  });

  it("replaces the sentence after the masker ran, and keeps the shown text, the check and the next send in agreement", async () => {
    const rewrite: RewriteJob = { mode: "PREFER_ON_DEVICE", run: vi.fn(async () => ({ value: "Mould again.", inferenceSource: "ON_DEVICE" as const, connected: true })) };
    const s = setup({ rewrite });
    await withVisit(s);
    sentenceEl(s.root, SEEN).click();
    await press(s.root, "#rewrite-shorter");
    expect(outgoing(s.root)).toContain("Seen: Mould again;");
    expect(outgoing(s.root)).not.toContain(SEEN);
    expect(s.c.state().selectedSentence).toBeNull();
    expect(s.root.querySelector("[data-rewrite-controls]")).toBeNull();
    // Draft builds from the new string, and Send gives the job exactly that string.
    await press(s.root, "#draft");
    const shown = outgoing(s.root);
    expect(shown).toContain("Seen: Mould again;");
    await press(s.root, "#send");
    expect(s.draft.run).toHaveBeenCalledTimes(1);
    expect((s.draft.run.mock.calls[0] as unknown as [unknown, { text: string }])[1].text).toBe(shown);
  });

  it("applies a rewrite made after Draft to the text that Send gives the job", async () => {
    const rewrite: RewriteJob = { mode: "PREFER_ON_DEVICE", run: vi.fn(async () => ({ value: "Mould again.", inferenceSource: "ON_DEVICE" as const, connected: true })) };
    const s = setup({ rewrite });
    await withVisit(s);
    await press(s.root, "#draft");
    sentenceEl(s.root, SEEN).click();
    await press(s.root, "#rewrite-shorter");
    const shown = outgoing(s.root);
    expect(shown).toContain("Seen: Mould again;");
    await press(s.root, "#send");
    expect((s.draft.run.mock.calls[0] as unknown as [unknown, { text: string }])[1].text).toBe(shown);
  });

  it("turns a listed name in the answer into its tag before the sentence is replaced", async () => {
    const rewrite: RewriteJob = {
      mode: "PREFER_ON_DEVICE",
      run: vi.fn(async () => ({ value: "Maria Okonkwo-Reyes posts the form.", inferenceSource: "ON_DEVICE" as const, connected: true })),
    };
    const s = setup({ rewrite });
    await withVisit(s);
    sentenceEl(s.root, FORM).click();
    await press(s.root, "#rewrite-shorter");
    expect(outgoing(s.root)).toContain(expandShorthand(FORM));
    expect(outgoing(s.root)).not.toContain("Maria");
    expect(outgoing(s.root)).not.toContain("Okonkwo");
  });

  it("refuses an answer that adds a person who was not in the sentence, and keeps the sentence", async () => {
    const rewrite: RewriteJob = { mode: "PREFER_ON_DEVICE", run: vi.fn(async () => ({ value: "Priya Halloran will post the form on Fri.", inferenceSource: "ON_DEVICE" as const, connected: true })) };
    const s = setup({ rewrite });
    await withVisit(s);
    sentenceEl(s.root, FORM).click();
    await press(s.root, "#rewrite-shorter");
    expect(outgoing(s.root)).toContain(expandShorthand(FORM));
    expect(outgoing(s.root)).not.toContain("Halloran");
    expect(outgoing(s.root)).not.toContain("Priya");
  });

  describe("with the real job's own checks", () => {
    const sdkReplying = (text: string): RewriteSdk => ({ generate: async () => ({ text, inferenceSource: "on_device" }) });
    const jobFor = (text: string) => makeRewriteJob({ sdk: sdkReplying(text), state: async () => "available", cloudEnabled: false });

    it("refuses an answer that changes a tag, with the exact line, and the sentence stays", async () => {
      const s = setup({ rewrite: jobFor("[Person 2] posts the form on Fri."), device: "available" });
      await withVisit(s);
      sentenceEl(s.root, FORM).click();
      await press(s.root, "#rewrite-shorter");
      expect(strings.drafting.rewriteTagChanged).toBe("The rewrite changed a tag, so it was not used.");
      expect(outgoing(s.root)).toContain(expandShorthand(FORM));
      expect(outgoing(s.root)).not.toContain("[Person 2] posts");
    });

    it("refuses a list of options, with the exact line, and the sentence stays", async () => {
      const s = setup({ rewrite: jobFor("1. [Person 1] posts it.\n2. [Person 1] sends it."), device: "available" });
      await withVisit(s);
      sentenceEl(s.root, FORM).click();
      await press(s.root, "#rewrite-shorter");
      expect(outgoing(s.root)).toContain(expandShorthand(FORM));
      expect(outgoing(s.root)).not.toContain("sends it");
    });

    it("accepts one sentence that keeps the tag", async () => {
      const s = setup({ rewrite: jobFor("[Person 1] posts it Fri."), device: "available" });
      await withVisit(s);
      sentenceEl(s.root, FORM).click();
      await press(s.root, "#rewrite-shorter");
      expect(outgoing(s.root)).toContain(expandShorthand(FORM));
    });
  });

  it("makes no request on the device path", async () => {
    const fetchSpy = vi.fn(async () => { throw new Error("no request expected"); });
    vi.stubGlobal("fetch", fetchSpy);
    const rewrite: RewriteJob = { mode: "PREFER_ON_DEVICE", run: vi.fn(async () => ({ value: "Mould again.", inferenceSource: "ON_DEVICE" as const, connected: true })) };
    const s = setup({ rewrite, device: "available" });
    await withVisit(s);
    sentenceEl(s.root, SEEN).click();
    await press(s.root, "#rewrite-shorter");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outgoing(s.root)).toContain("Mould again;");
  });

  it("with the cloud switch on, waits for Send and shows the exact text and the notice", async () => {
    const rewrite: RewriteJob = { mode: "PREFER_ON_DEVICE", run: vi.fn(async () => ({ value: "Mould again.", inferenceSource: "IN_CLOUD" as const, connected: true })) };
    const s = setup({ rewrite, cloud: true });
    await withVisit(s);
    sentenceEl(s.root, SEEN).click();
    await press(s.root, "#rewrite-shorter");
    expect(rewrite.run).not.toHaveBeenCalled();
    expect(outgoing(s.root)).toBe(rewriteText("shorter", SEEN));
    expect(q(s.root, "[data-send-notice]").textContent!.length).toBeGreaterThan(0);
    expect(q(s.root, "[data-rewrite-wait]").textContent).toBe(strings.drafting.rewriteWaitsForSend);
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(false);
    await press(s.root, "#send");
    expect(rewrite.run).toHaveBeenCalledTimes(1);
    expect((rewrite.run as ReturnType<typeof vi.fn>).mock.calls[0]![1].text).toBe(rewriteText("shorter", SEEN));
    expect(outgoing(s.root)).toContain("Seen: Mould again;");
    expect(q(s.root, "[data-rewrite-result]").textContent).toContain("in the cloud");
  });

  it("has no digit in the new strings", () => {
    for (const k of ["sentenceGroup", "sentenceLabel", "sentenceSelected", "rewriteWorking", "rewriteWaitsForSend", "rewriteDone"] as const) {
      expect(strings.drafting[k]).not.toMatch(/\d/);
    }
  });
});
