// @vitest-environment happy-dom
// Kept on this device (shell-and-offline R27, fourth review K1, L3). The controller saves as she works
// and restores at start, over a stand-in for the browser store. No request is made by any step.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { KEPT_KEY, KEPT_VERSION } from "../../src/constants";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { selectableSentences } from "../../src/drafting/sentences";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
import type { DeviceModelState } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { makeKeptStore } from "../../src/storage/kept";
import { browserStoreStandIn, type BrowserStoreStandIn } from "../support/browserStoreStandIn";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const openVisit = (root: ParentNode) => root.querySelector<HTMLButtonElement>("#start-visit")?.click();
const text = (root: ParentNode, sel: string) => q(root, sel)?.textContent ?? "";

afterEach(() => vi.unstubAllGlobals());

function setup(opts: { backend?: BrowserStoreStandIn; device?: DeviceModelState; offline?: boolean } = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  const backend = opts.backend ?? browserStoreStandIn();
  const kept = makeKeptStore(backend);
  const fetchSpy = vi.fn(async () => { throw new Error("no request expected"); });
  vi.stubGlobal("fetch", fetchSpy);
  const draft = { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) };
  const ledger = makeLedger();
  const clearLedger = vi.fn(async () => undefined);
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => opts.device ?? "unavailable", create: async () => ({ destroy() {} }) } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => opts.offline ?? false,
    kept,
    proposeMasks: () => proposeMasksDouble,
    drafting: {
      draftFor: () => draft as never,
      rewriteFor: () => ({ mode: "PREFER_ON_DEVICE" as const, run: async () => ({ value: "A shorter line.", inferenceSource: "ON_DEVICE" as const, connected: true }) }),
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => !opts.offline, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
      clearLedger,
    },
  });
  return { root, c, backend, kept, draft, fetchSpy, clearLedger };
}

async function press(root: HTMLElement, sel: string) {
  if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  const b = q<HTMLButtonElement>(root, sel);
  expect(b, `control ${sel}`).not.toBeNull();
  expect(b.disabled, `control ${sel} is enabled`).toBe(false);
  b.click();
  await settle();
}
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const stepOf = (root: ParentNode) => q(root, '[data-steps] [aria-current="step"]').getAttribute("data-step");

/** The invented visit to the Send step: record, masks, one word masked by hand, Draft pressed. */
async function toSend(s: ReturnType<typeof setup>) {
  await s.c.start();
  await press(s.root, "#try-example");
  await press(s.root, "#make-record");
  await press(s.root, "#mask");
  const word = [...s.root.querySelectorAll<HTMLButtonElement>("[data-mask-view] button.word")].find((b) => b.textContent === "Mould")!;
  word.click();
  await settle();
  await press(s.root, "#draft");
  await keepLikely(s.root);
}
// H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it, and then goes on.
async function keepLikely(root: HTMLElement) {
  for (let i = 0; i < 5 && root.querySelector("[data-keep-likely]"); i++) await press(root, "[data-keep-likely]");
}

describe("saves as she works", () => {
  it("saves the note and the list as she types, without drawing the screen again", async () => {
    const s = setup();
    await s.c.start();
    openVisit(s.root);
    // The first character draws the screen once (the first control depends on there being a note);
    // after that, typing does not draw it again, so the cursor stays where it is.
    type(q(s.root, "#note"), "V");
    const note = q<HTMLTextAreaElement>(s.root, "#note");
    type(note, "Visit Mon. Form not sent.");
    type(q(s.root, "#client-list"), "Maria Okonkwo-Reyes");
    await s.kept.flush();
    expect(q(s.root, "#note")).toBe(note);
    const stored = s.backend.dump()[KEPT_KEY] as { version: number; data: { clientList: string; visit: { noteText: string } } };
    expect(stored.version).toBe(KEPT_VERSION);
    expect(stored.data.visit.noteText).toBe("Visit Mon. Form not sent.");
    expect(stored.data.clientList).toBe("Maria Okonkwo-Reyes");
  });

  it("writes nothing before the restore is done, so a quick network event cannot blank it", async () => {
    const s = setup();
    await s.c.start();
    openVisit(s.root);
    type(q(s.root, "#note"), "Kept note");
    await s.kept.flush();
    const again = setup({ backend: s.backend });
    const before = s.backend.writes();
    void again.c.refreshNetwork();
    await again.c.start();
    await again.kept.flush();
    expect(again.c.state().noteText).toBe("Kept note");
    expect(s.backend.writes()).toBeGreaterThanOrEqual(before);
    expect((await makeKeptStore(s.backend).load()).status).toBe("ok");
  });
});

describe("restores at start", () => {
  it("brings back the list and the note, with the network off and no request", async () => {
    const a = setup();
    await a.c.start();
    openVisit(a.root);
    type(q(a.root, "#note"), "Visit Mon. Form not sent.");
    type(q(a.root, "#client-list"), "Maria Okonkwo-Reyes\nBea Hollis");
    await a.kept.flush();
    const b = setup({ backend: a.backend, offline: true });
    await b.c.start();
    expect(b.c.state().noteText).toBe("Visit Mon. Form not sent.");
    expect(b.c.state().clientList).toBe("Maria Okonkwo-Reyes\nBea Hollis");
    expect(q<HTMLTextAreaElement>(b.root, "#note").value).toBe("Visit Mon. Form not sent.");
    expect(q<HTMLTextAreaElement>(b.root, "#client-list").value).toBe("Maria Okonkwo-Reyes\nBea Hollis");
    expect(b.c.state().network).toBe("offline");
    expect(b.fetchSpy).not.toHaveBeenCalled();
  });

  it("brings back the same chips, outgoing text and step at the Send step, and Send still works", async () => {
    const a = setup();
    await toSend(a);
    const chips = [...a.root.querySelectorAll("[data-mask-view] [data-chip]")].map((n) => n.outerHTML);
    const outgoing = text(a.root, "pre.outgoing");
    expect(stepOf(a.root)).toBe("send");
    expect(outgoing).toContain("[Detail 1]");
    expect(outgoing).not.toMatch(/\bBea\b/);
    await a.kept.flush();

    const b = setup({ backend: a.backend });
    await b.c.start();
    expect(b.c.state().example).toBe(true);
    expect(text(b.root, '[data-zone="note"]')).toContain(strings.firstRun.exampleMark);
    expect([...b.root.querySelectorAll("[data-mask-view] [data-chip]")].map((n) => n.outerHTML)).toEqual(chips);
    expect(text(b.root, "pre.outgoing")).toBe(outgoing);
    expect(stepOf(b.root)).toBe("send");

    // Present entries are tagged in the shared core, so a reload does not ask her to keep Bea again.
    // The hand mask on Mould is the stored chip. Send uses the text on the screen.
    await press(b.root, "#send");
    expect(b.draft.run).toHaveBeenCalledTimes(1);
    expect(b.draft.run.mock.calls[0]![1]).toEqual({ text: outgoing });
    expect((b.draft.run.mock.calls[0]![1] as { text: string }).text).not.toMatch(/\bBea\b/);
    expect(stepOf(b.root)).toBe("finished");
  });

  it("brings back the finished note and the step Finished", async () => {
    const a = setup();
    await toSend(a);
    await press(a.root, "#send");
    expect(stepOf(a.root)).toBe("finished");
    const sheet = text(a.root, ".sheet-text");
    expect(sheet).toContain("Maria Okonkwo-Reyes");
    await a.kept.flush();

    const b = setup({ backend: a.backend, offline: true });
    await b.c.start();
    expect(stepOf(b.root)).toBe("finished");
    expect(text(b.root, ".sheet-text")).toBe(sheet);
    expect(q<HTMLButtonElement>(b.root, "#copy").disabled).toBe(false);
    expect(b.fetchSpy).not.toHaveBeenCalled();
  });

  it("stores the step it shows, at every stage", async () => {
    const a = setup();
    const stored = async () => {
      await a.kept.flush();
      const doc = a.backend.dump()[KEPT_KEY] as { data: { visit: { step: string } } } | undefined;
      return doc?.data.visit.step;
    };
    await a.c.start();
    await press(a.root, "#try-example");
    expect(stepOf(a.root)).toBe("record");
    expect(await stored()).toBe("record");
    await press(a.root, "#make-record");
    expect(stepOf(a.root)).toBe("masks");
    expect(await stored()).toBe("masks");
    await press(a.root, "#mask");
    await press(a.root, "#draft");
    await keepLikely(a.root);
    expect(stepOf(a.root)).toBe("send");
    expect(await stored()).toBe("send");
    await press(a.root, "#send");
    expect(stepOf(a.root)).toBe("finished");
    expect(await stored()).toBe("finished");
  });

  it("brings back the parts she opened and her answer about the date", async () => {
    const a = setup();
    await a.c.start();
    await press(a.root, "#try-example");
    await press(a.root, "#make-record");
    await press(a.root, "#fold-note");
    expect(q(a.root, "#note")).not.toBeNull();
    if (a.c.state().date?.line) {
      await press(a.root, "#confirm-date");
      expect(a.c.state().dateChoice?.mode).toBe("confirmed");
    }
    const choice = a.c.state().dateChoice;
    await a.kept.flush();
    const b = setup({ backend: a.backend });
    await b.c.start();
    b.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
    expect(q(b.root, "#note")).not.toBeNull();
    expect(q(b.root, "#fold-list").getAttribute("aria-expanded")).toBe("false");
    expect(b.c.state().dateChoice).toEqual(choice);
  });

  it("brings back a rewrite she made", async () => {
    const a = setup();
    await a.c.start();
    await press(a.root, "#try-example");
    await press(a.root, "#make-record");
    await press(a.root, "#draft");
    await keepLikely(a.root);
    const first = selectableSentences(a.c.state().outgoingText)[0]!;
    a.c.handlers.onSelectSentence?.(first.start);
    await press(a.root, "#rewrite-shorter");
    expect(a.c.state().rewrites).toHaveLength(1);
    expect(text(a.root, "pre.outgoing")).toContain("A shorter line");
    await a.kept.flush();
    const b = setup({ backend: a.backend });
    await b.c.start();
    expect(b.c.state().rewrites).toEqual(a.c.state().rewrites);
    expect(text(b.root, "pre.outgoing")).toContain("A shorter line");
  });
});

describe("a store that does not work", () => {
  it("starts empty and says so for a version it does not know", async () => {
    const backend = browserStoreStandIn();
    await backend.set(KEPT_KEY, { version: KEPT_VERSION + 1, data: {} });
    const s = setup({ backend });
    await s.c.start();
    expect(s.c.state().noteText).toBe("");
    expect(text(s.root, "[data-kept-line]")).toBe(strings.kept.unknownVersion);
    // The next save replaces it and the line goes with the next clear.
    type(q(s.root, "#note"), "A new note");
    await s.kept.flush();
    expect(((backend.dump()[KEPT_KEY] as { version: number }).version)).toBe(KEPT_VERSION);
  });

  it("works for the session and says nothing is kept when the store will not open", async () => {
    const backend = browserStoreStandIn();
    backend.failToOpen();
    const s = setup({ backend });
    await s.c.start();
    expect(text(s.root, "[data-kept-line]")).toBe(strings.kept.notKept);
    await press(s.root, "#try-example");
    await press(s.root, "#make-record");
    expect(s.c.state().record).not.toBeNull();
    expect(backend.writes()).toBe(0);
    expect(s.c.state().error).toBeNull();
  });

  it("says nothing is kept when a save fails, and keeps working", async () => {
    const backend = browserStoreStandIn();
    const s = setup({ backend });
    await s.c.start();
    openVisit(s.root);
    backend.failToWrite();
    type(q(s.root, "#note"), "Visit Mon.");
    await s.kept.flush().catch(() => undefined);
    await settle();
    expect(text(s.root, "[data-kept-line]")).toBe(strings.kept.notKept);
    await press(s.root, "#make-record");
    expect(s.c.state().record).not.toBeNull();
    expect(s.c.state().error).toBeNull();
  });

  it("shows no line when the store works", async () => {
    const s = setup();
    await s.c.start();
    expect(q(s.root, "[data-kept-line]")).toBeNull();
  });
});

describe("the three clears, each asking once", () => {
  async function withVisit() {
    const s = setup();
    await toSend(s);
    await press(s.root, "#send");
    await s.kept.flush();
    return s;
  }
  const stored = (s: ReturnType<typeof setup>) => s.backend.dump()[KEPT_KEY] as { data: { clientList: string; example: boolean; visit: { noteText: string; record: unknown; finished: unknown; outgoingText: string; step: string } } } | undefined;

  it("does nothing until the go-ahead press, and moves focus in", async () => {
    const s = await withVisit();
    await press(s.root, "#clear-visit");
    expect(q(s.root, '[data-clear-panel="visit"]')).not.toBeNull();
    expect(text(s.root, "[data-clear-ask]")).toBe(strings.kept.askVisit);
    expect(document.activeElement?.id).toBe("clear-keep");
    expect(s.c.state().noteText).toBe(inventedVisit.note);
    expect(s.c.state().record).not.toBeNull();
    await press(s.root, "#clear-keep");
    expect(q(s.root, "[data-clear-panel]")).toBeNull();
    expect(s.c.state().record).not.toBeNull();
    expect(document.activeElement?.id).toBe("clear-visit");
  });

  it("closes on Escape and changes nothing", async () => {
    const s = await withVisit();
    await press(s.root, "#clear-list");
    q(s.root, "#clear-keep").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    expect(q(s.root, "[data-clear-panel]")).toBeNull();
    expect(s.c.state().clientList).toBe(inventedVisit.clientList);
    expect(document.activeElement?.id).toBe("clear-list");
  });

  it("'Clear this visit' empties the visit and keeps the list", async () => {
    const s = await withVisit();
    await press(s.root, "#clear-visit");
    await press(s.root, "#clear-go");
    await s.kept.flush();
    const st = s.c.state();
    expect([st.noteText, st.record, st.mask, st.outgoingText, st.finished, st.photo]).toEqual(["", null, null, "", null, null]);
    expect(st.clientList).toBe(inventedVisit.clientList);
    expect(stepOf(s.root)).toBe("note");
    expect(q(s.root, "[data-clear-panel]")).toBeNull();
    const d = stored(s)!.data;
    expect(d.clientList).toBe(inventedVisit.clientList);
    expect(d.visit).toMatchObject({ noteText: "", record: null, finished: null, outgoingText: "", step: "note" });
  });

  it("'Clear my list' empties the list and keeps the visit", async () => {
    const s = await withVisit();
    await press(s.root, "#clear-list");
    await press(s.root, "#clear-go");
    await s.kept.flush();
    expect(s.c.state().clientList).toBe("");
    expect(s.c.state().record).not.toBeNull();
    expect(s.c.state().finished).not.toBeNull();
    const d = stored(s)!.data;
    expect(d.clientList).toBe("");
    expect(d.visit.noteText).toBe(inventedVisit.note);
  });

  it("'Clear everything this page keeps' leaves the store empty and empties the ledger", async () => {
    const s = await withVisit();
    await s.backend.set("ledger", { version: KEPT_VERSION, entries: [] });
    await s.backend.set("note", "from an earlier build");
    await press(s.root, "#clear-all");
    expect(text(s.root, "[data-clear-ask]")).toBe(strings.kept.askAll);
    expect(s.clearLedger).not.toHaveBeenCalled();
    await press(s.root, "#clear-go");
    await s.kept.flush();
    expect(s.backend.isEmpty()).toBe(true);
    expect(s.clearLedger).toHaveBeenCalledTimes(1);
    expect(s.c.state().clientList).toBe("");
    expect(s.c.state().noteText).toBe("");
    expect(s.c.state().example).toBe(false);
    expect(q(s.root, "#try-example")).not.toBeNull();
    // A reload now finds nothing.
    const again = setup({ backend: s.backend });
    await again.c.start();
    expect(again.c.state().clientList).toBe("");
    expect(again.backend.isEmpty()).toBe(true);
  });

  it("shows one panel at a time: a second press replaces the first", async () => {
    const s = await withVisit();
    await press(s.root, "#clear-visit");
    await press(s.root, "#clear-list");
    expect(s.root.querySelectorAll("[data-clear-panel]")).toHaveLength(1);
    expect(q(s.root, "[data-clear-panel]").getAttribute("data-clear-panel")).toBe("list");
  });

  it("the footer control is always there, and the zone controls appear when there is something to clear", async () => {
    const s = setup();
    await s.c.start();
    expect(q(s.root, "#clear-all")).toBeNull();
    openVisit(s.root);
    expect(q(s.root, "#clear-all")).not.toBeNull();
    expect(q(s.root, "#clear-visit")).toBeNull();
    expect(q(s.root, "#clear-list")).toBeNull();
    type(q(s.root, "#note"), "A note");
    s.c.render();
    expect(q(s.root, "#clear-visit")).not.toBeNull();
    expect(q(s.root, "#clear-list")).toBeNull();
  });
});

describe("nothing kept enters a request (R27.7)", () => {
  it("makes no network call through the journey, the reload and the three clears", async () => {
    const xhr = vi.fn();
    class NoXhr { constructor() { xhr(); } }
    vi.stubGlobal("XMLHttpRequest", NoXhr);
    const beacon = vi.fn();
    vi.stubGlobal("navigator", { ...globalThis.navigator, sendBeacon: beacon, onLine: true, language: "en-GB" });
    const a = setup();
    await toSend(a);
    await press(a.root, "#send");
    await a.kept.flush();
    const b = setup({ backend: a.backend, offline: true });
    await b.c.start();
    await press(b.root, "#clear-visit");
    await press(b.root, "#clear-go");
    await press(b.root, "#clear-list");
    await press(b.root, "#clear-go");
    openVisit(b.root);
    await press(b.root, "#clear-all");
    await press(b.root, "#clear-go");
    expect(a.fetchSpy).not.toHaveBeenCalled();
    expect(b.fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("gives the job only the text on the screen, which holds no listed name, after a reload", async () => {
    const a = setup();
    await toSend(a);
    await a.kept.flush();
    const b = setup({ backend: a.backend });
    await b.c.start();
    const shown = text(b.root, "pre.outgoing");
    await press(b.root, "#send");
    expect(b.draft.run).toHaveBeenCalledTimes(1);
    const sent = b.draft.run.mock.calls[0]![1] as { text: string };
    expect(sent.text).toBe(shown);
    expect(sent.text).not.toMatch(/\bBea\b/);
    for (const name of ["Maria", "Okonkwo", "Reyes", "Brandvald", "Brandvold", "Tomas"]) expect(sent.text).not.toContain(name);
    // What she typed is in the store, and none of it is in the text that left.
    expect(JSON.stringify(b.backend.dump())).toContain("Maria");
    expect(sent.text).not.toContain(inventedVisit.note.slice(0, 40));
  });
});

