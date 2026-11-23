// @vitest-environment happy-dom
// Second reader task 7 (R1.4, R2.3 to R2.6): the panel on the screen, wired through the controller.
// Invented people only.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { renderReaderPanel, hasMaskableWords, readerControl } from "../../src/app/zones/readerPanel";
import { emptyState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { SECOND_READER_INSTRUCTIONS } from "../../src/inference/secondReader/instructions";
import { secondReaderDouble } from "../../src/inference/secondReader/secondReader.double";
import type { SecondReaderJob, SecondReaderOutput } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

function setup(opts: { online?: boolean; cloud?: boolean; reader?: SecondReaderJob } = {}) {
  const online = { current: opts.online ?? true };
  const root = document.createElement("div");
  document.body.append(root);
  const reader = opts.reader ?? secondReaderDouble;
  const readerRun = vi.fn((t, i) => reader.run(t, i));
  const spyReader: SecondReaderJob = { mode: "ONLY_IN_CLOUD", run: readerRun } as never;
  const ledger = makeLedger();
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: opts.cloud ?? false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => !online.current,
    secondReader: { readerFor: () => spyReader },
    drafting: {
      draftFor: () => ({ run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) }) as never,
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => online.current, fetch: async () => ({ ok: online.current }), now: () => 1 },
      copy: async () => undefined,
    },
  };
  const c = makeController(deps);
  return { root, c, ledger, readerRun, online };
}
async function withExample(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
  s.c.render();
}
const press = async (root: HTMLElement, sel: string) => {
  (root.querySelector(sel) as HTMLButtonElement).click();
  await settle();
};
/** Bea is an unresolved likely name on the invented visit. Resolve her before any send. */
async function resolveNames(s: ReturnType<typeof setup>) {
  await press(s.root, "#draft");
  for (let i = 0; i < 6 && s.root.querySelector("[data-keep-likely]"); i++) await press(s.root, "[data-keep-likely]");
}
const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent ?? "";

describe("the panel alone", () => {
  const panel = (patch: Parameters<typeof emptyState>[0] = {}, h?: Handlers) => renderReaderPanel(emptyState(patch), h);

  it("has the title, the help text and the standing sentence", () => {
    const p = panel();
    expect(p.querySelector("h3")?.textContent).toBe("Second reader");
    expect(p.querySelector("[data-reader-standing]")?.textContent).toBe(
      "A guess is not a measure. The reader may be wrong or may miss things.",
    );
  });

  it("says the cloud is off in the help text while the cloud is off, and not when it is on", () => {
    expect(panel({ cloud: false }).querySelector("[data-reader-help]")?.textContent).toMatch(/The cloud is off/);
    expect(panel({ cloud: true }).querySelector("[data-reader-help]")?.textContent).not.toMatch(/The cloud is off/);
  });

  it("disables the control without a record, with the reason", () => {
    const b = panel().querySelector("#ask-reader") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe(strings.secondReader.needsText);
    expect(b.textContent).toBe("Ask a second reader");
  });

  it("disables the control offline and shows the line (R4.1)", () => {
    const p = panel({ network: "offline", record: inventedVisit.preparedRecord });
    expect((p.querySelector("#ask-reader") as HTMLButtonElement).disabled).toBe(true);
    expect(p.querySelector("[data-reader-offline]")?.textContent).toBe("The second reader needs a connection.");
  });

  it("enables the control with a record and a connection", () => {
    const p = panel({ record: inventedVisit.preparedRecord });
    expect((p.querySelector("#ask-reader") as HTMLButtonElement).disabled).toBe(false);
  });

  it("readerControl names the reason in order: connection, record, busy", () => {
    expect(readerControl({ hasRecord: false, offline: true, busy: true }).reason).toBe(strings.secondReader.needsConnection);
    expect(readerControl({ hasRecord: false, offline: false, busy: true }).reason).toBe(strings.secondReader.needsText);
    expect(readerControl({ hasRecord: true, offline: false, busy: true }).reason).toBe(strings.secondReader.working);
    expect(readerControl({ hasRecord: true, offline: false, busy: false }).disabled).toBe(false);
  });

  const result = (over: Partial<NonNullable<ReturnType<typeof emptyState>["reader"]["result"]>> = {}) => ({
    guesses: [{ who: "a tenant in a ground-floor flat", evidence: ["Mould in the back bedroom", "[Person 1]"] }],
    replaced: 0,
    allDropped: false,
    source: "IN_CLOUD" as const,
    connected: false,
    pass: { left: false, host: "", model: "", requests: 0, bytes: 0, modelRequests: 0, modelBytes: 0, sha256: "", at: "2026-11-14T09:00:00.000Z", read: "" },
    ...over,
  });
  const withResult = (r = result(), extra: Partial<ReturnType<typeof emptyState>["reader"]> = {}) => ({
    record: inventedVisit.preparedRecord,
    reader: { pending: false, asking: false, result: r, line: null, maskedQuotes: [], announce: "", ...extra },
  });

  it("shows the guess, the source label and off", () => {
    const p = panel(withResult());
    expect(p.querySelector("[data-guess]")?.textContent).toContain("a tenant in a ground-floor flat");
    expect(p.querySelector("[data-source='IN_CLOUD']")?.textContent).toBe("in the cloud");
    expect(p.querySelector("[data-source='not-connected']")?.textContent).toBe("off");
  });

  it("shows no not-connected mark for a connected answer", () => {
    const p = panel(withResult(result({ connected: true })));
    expect(p.querySelector("[data-source='not-connected']")).toBeNull();
  });

  it("shows each kept quote as a chip, and a tag-only quote as plain text", () => {
    const p = panel(withResult());
    expect(p.querySelectorAll("button.mask-chip")).toHaveLength(1);
    expect(p.querySelector("button.mask-chip")?.textContent).toContain("Mould in the back bedroom");
    expect(p.querySelector(".reader-quote.tag-only")?.textContent).toBe("[Person 1]");
    expect(hasMaskableWords("[Person 1]")).toBe(false);
    expect(hasMaskableWords("[Person 1] posts the form")).toBe(true);
  });

  it("calls onMaskQuote on a press and on Enter, once each", () => {
    const onMaskQuote = vi.fn();
    const p = panel(withResult(), { onMaskQuote } as unknown as Handlers);
    const chip = p.querySelector("button.mask-chip") as HTMLButtonElement;
    chip.click();
    expect(onMaskQuote).toHaveBeenCalledWith("Mould in the back bedroom");
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    chip.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(onMaskQuote).toHaveBeenCalledTimes(2);
  });

  it("shows a masked quote as masked, in words, and does not call the handler again", () => {
    const onMaskQuote = vi.fn();
    const p = panel(withResult(result(), { maskedQuotes: ["Mould in the back bedroom"] }), { onMaskQuote } as unknown as Handlers);
    const chip = p.querySelector("button.mask-chip") as HTMLButtonElement;
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(chip.textContent).toContain(strings.masking.state.manual);
    chip.click();
    expect(onMaskQuote).not.toHaveBeenCalled();
  });

  it("says the nothing-to-tap line when every quote was dropped", () => {
    const p = panel(withResult(result({ allDropped: true, guesses: [{ who: "a tenant", evidence: [] }] })));
    expect(p.querySelector("[data-reader-dropped]")?.textContent).toBe(
      "The reader gave no words from your text, so there is nothing to tap.",
    );
    expect(p.querySelectorAll("button.mask-chip")).toHaveLength(0);
  });

  it("says the redaction line when a name was replaced, and not otherwise", () => {
    expect(panel(withResult(result({ replaced: 2 }))).querySelector("[data-reader-redacted]")?.textContent).toBe(
      "The reader produced a name from your list. It is shown as its tag.",
    );
    expect(panel(withResult()).querySelector("[data-reader-redacted]")).toBeNull();
  });

  it("says so when the reader made no guess", () => {
    const p = panel(withResult(result({ guesses: [] })));
    expect(p.querySelector("[data-reader-none]")?.textContent).toBe(strings.secondReader.noGuesses);
  });

  it("offers Ask again once there is a result", () => {
    expect(panel(withResult()).querySelector("#ask-reader")?.textContent).toBe("Ask again");
  });

  it("shows a failure in the error style, with the octagon and words", () => {
    const p = panel(withResult(undefined, { result: null, line: strings.secondReader.needsConnection }));
    const e = p.querySelector("[data-reader-error]")!;
    expect(e.classList.contains("error")).toBe(true);
    expect(e.getAttribute("role")).toBe("alert");
    expect(e.querySelector("svg")).not.toBeNull();
    expect(e.textContent).toBe("The second reader needs a connection.");
  });

  it("has a polite live region", () => {
    const p = panel(withResult(undefined, { announce: "Masked: x" }));
    expect(p.querySelector("[data-live]")?.getAttribute("aria-live")).toBe("polite");
    expect(p.querySelector("[data-live]")?.textContent).toBe("Masked: x");
  });
});

describe("the flow on the screen", () => {
  it("Send is off until she asks: no text is on screen yet", async () => {
    const s = setup();
    await withExample(s);
    expect((s.root.querySelector("#send") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Ask shows the outgoing text and the notice, and does not send (R1.4)", async () => {
    const s = setup();
    await withExample(s);
    await resolveNames(s);
    await press(s.root, "#ask-reader");
    const shown = text(s.root, "pre.outgoing");
    expect(shown).toContain(SECOND_READER_INSTRUCTIONS);
    expect(shown).toMatch(/^Visit date: 12\/11/);
    expect(shown).not.toMatch(/Maria|Okonkwo|Brandvold/);
    expect(text(s.root, "[data-send-notice]")).toMatch(/is off/i);
    expect(s.readerRun).not.toHaveBeenCalled();
    expect(s.ledger.all()).toEqual([]);
    expect((s.root.querySelector("#send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Send gives the job the shown text, writes one ledger entry and shows the result with its label", async () => {
    const s = setup();
    await withExample(s);
    await resolveNames(s);
    await press(s.root, "#ask-reader");
    const shown = text(s.root, "pre.outgoing");
    await press(s.root, "#send");
    expect(s.readerRun).toHaveBeenCalledTimes(1);
    expect(s.readerRun.mock.calls[0]![1]).toEqual({ text: shown });
    expect(s.ledger.all().map((e) => e.job)).toEqual(["secondReader"]);
    const panel = text(s.root, "[data-reader]");
    expect(panel).toContain("a tenant in a ground-floor flat");
    expect(panel).toContain("in the cloud");
    expect(panel).toContain("off");
    expect(text(s.root, "[data-egress-line]")).toMatch(/No listed name left this device: 0 of \d+\./);
    expect(s.root.querySelectorAll("[data-reader] button.mask-chip").length).toBeGreaterThan(0);
  });

  it("pressing a quote masks those words, and asking again sends text without them, with a second ledger entry (R2.3, R2.6)", async () => {
    const s = setup();
    await withExample(s);
    await resolveNames(s);
    await press(s.root, "#ask-reader");
    await press(s.root, "#send");
    const chip = s.root.querySelector("[data-reader] button.mask-chip") as HTMLButtonElement;
    const quote = chip.getAttribute("data-quote")!;
    expect(text(s.root, "pre.outgoing")).toContain(quote);
    chip.click();
    await settle();
    expect(text(s.root, "[data-reader] [data-live]")).toContain(quote);
    expect(s.root.querySelector("[data-reader] button.mask-chip[data-quote]")?.getAttribute("aria-pressed")).toBe("true");
    await press(s.root, "#ask-reader");
    expect(text(s.root, "pre.outgoing")).not.toContain(quote);
    await press(s.root, "#send");
    expect(s.ledger.all().map((e) => e.job)).toEqual(["secondReader", "secondReader"]);
    expect(s.readerRun).toHaveBeenCalledTimes(2);
  });

  it("shows the redaction line when the reader names a listed person, and shows the tag", async () => {
    const leaky: SecondReaderOutput = {
      guesses: [{ who: "MARIA OKONKWO-REYES in the flat", evidence: ["Mould in the back bedroom"] }],
    };
    const s = setup({ reader: { mode: "ONLY_IN_CLOUD", run: async () => ({ value: leaky, inferenceSource: "IN_CLOUD", connected: true }) } });
    await withExample(s);
    await resolveNames(s);
    await press(s.root, "#ask-reader");
    await press(s.root, "#send");
    const panel = text(s.root, "[data-reader]");
    expect(panel).not.toMatch(/okonkwo/i);
    expect(panel).toMatch(/\[Person \d+\] in the flat/);
    expect(text(s.root, "[data-reader-redacted]")).toBe(strings.secondReader.redacted);
    expect(JSON.stringify(s.c.state().reader)).not.toMatch(/okonkwo/i);
  });

  it("offline: the control is off and the line is shown", async () => {
    const s = setup();
    await withExample(s);
    s.online.current = false;
    await s.c.refreshNetwork();
    expect((s.root.querySelector("#ask-reader") as HTMLButtonElement).disabled).toBe(true);
    expect(text(s.root, "[data-reader-offline]")).toBe("The second reader needs a connection.");
  });

  it("if the connection drops after Ask, Send says so, calls nothing, writes no ledger entry and keeps the text", async () => {
    const s = setup();
    await withExample(s);
    await resolveNames(s);
    await press(s.root, "#ask-reader");
    const shown = text(s.root, "pre.outgoing");
    s.online.current = false;
    s.c.handlers.onSend?.();
    await settle();
    expect(text(s.root, "[data-reader-error]")).toBe("The second reader needs a connection.");
    expect(s.readerRun).not.toHaveBeenCalled();
    expect(s.ledger.all()).toEqual([]);
    expect(text(s.root, "pre.outgoing")).toBe(shown);
  });

  it("a cloud failure shows the connection line and keeps the text on screen (R4.3)", async () => {
    const failing: SecondReaderJob = {
      mode: "ONLY_IN_CLOUD",
      async run() {
        throw new Error("service error");
      },
    };
    const s = setup({ reader: failing });
    await withExample(s);
    await resolveNames(s);
    await press(s.root, "#ask-reader");
    const shown = text(s.root, "pre.outgoing");
    await press(s.root, "#send");
    expect(text(s.root, "[data-reader-error]")).toBe("The second reader needs a connection.");
    expect(text(s.root, "pre.outgoing")).toBe(shown);
    expect((s.root.querySelector("#send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("the Draft control leaves the reader's text and returns to the draft", async () => {
    const s = setup();
    await withExample(s);
    await resolveNames(s);
    await press(s.root, "#ask-reader");
    expect(text(s.root, "pre.outgoing")).toContain(SECOND_READER_INSTRUCTIONS);
    await press(s.root, "#draft");
    expect(text(s.root, "pre.outgoing")).not.toContain(SECOND_READER_INSTRUCTIONS);
    expect(s.c.state().reader.pending).toBe(false);
  });

  it("keeps the panel after the finished note in the third zone", async () => {
    const s = setup();
    await withExample(s);
    const zone = s.root.querySelector("[data-zone='finished']")!;
    expect(zone.querySelector("[data-reader]")).not.toBeNull();
    expect(zone.lastElementChild?.hasAttribute("data-reader")).toBe(true);
  });
});
