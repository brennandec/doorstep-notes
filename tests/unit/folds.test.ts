// @vitest-environment happy-dom
// Shell-and-offline task 59 (R30, fourth review K6, J5, L8 unit part): small print folds behind the native
// details element. Invented people only.
import { describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { scannedSentence } from "../../src/app/scanned";
import { egressLine } from "../../src/app/parts/egressLine";
import { allFolded, emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderReaderPanel } from "../../src/app/zones/readerPanel";
import { renderLeavesZone } from "../../src/app/zones/leaves";
import { buildLines } from "../../src/egress/line";
import { checkEgress } from "../../src/egress/check";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { makeLedger } from "../../src/egress/ledger";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { makeKeptStore } from "../../src/storage/kept";
import { browserStoreStandIn, type BrowserStoreStandIn } from "../support/browserStoreStandIn";

const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

const passLines = buildLines({
  result: checkEgress({ captured: [{ url: "", body: new TextEncoder().encode("x") }], listedNames: ["Maria Okonkwo-Reyes"], surfaceForms: [], sentOnPurpose: [] }),
  connected: false,
});

describe("allFolded", () => {
  it("has the two new parts, closed", () => {
    expect(allFolded().scans).toBe(false);
    expect(allFolded().reader).toBe(false);
  });
});

describe("What this check scans (R30.1)", () => {
  it("is a closed details with a summary, holding the scan words", () => {
    for (const lines of [null, passLines]) {
      const line = egressLine(lines);
      const d = q<HTMLDetailsElement>(line, "details");
      expect(d).not.toBeNull();
      expect(d.open).toBe(false);
      expect(q(d, "summary").textContent).toBe(strings.folds.scans);
      expect(strings.folds.scans).toBe("What this check scans");
      expect(q(d, "[data-egress-scanned]").textContent).toBe(scannedSentence());
    }
  });

  it("leaves the egress line and the standing sentence outside the fold (R30.3)", () => {
    const line = egressLine(passLines);
    const d = q(line, "details");
    const headline = q(line, ".egress-headline");
    const standing = q(line, ".egress-standing");
    expect(standing.textContent).toBe(strings.egress.standing);
    expect(d.contains(headline)).toBe(false);
    expect(d.contains(standing)).toBe(false);
    expect(d.parentElement).toBe(line);
  });

  it("is open when asked to be, and reports a change", () => {
    const seen = vi.fn();
    const line = egressLine(passLines, { open: true, onToggle: seen });
    const d = q<HTMLDetailsElement>(line, "details");
    expect(d.open).toBe(true);
    d.open = false;
    d.dispatchEvent(new Event("toggle"));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("does not report the toggle that its own opening causes", () => {
    const seen = vi.fn();
    const d = q<HTMLDetailsElement>(egressLine(passLines, { open: true, onToggle: seen }), "details");
    d.dispatchEvent(new Event("toggle"));
    expect(seen).not.toHaveBeenCalled();
  });

  it("keeps the egress line the last child of zone 2", () => {
    const zone = renderLeavesZone(emptyState());
    expect(zone.lastElementChild?.matches("[data-egress-line]")).toBe(true);
  });
});

describe("What a second reader is (R30.2)", () => {
  it("is a closed details with a summary, holding the explanation", () => {
    const panel = renderReaderPanel(emptyState());
    const d = q<HTMLDetailsElement>(panel, "details");
    expect(d.open).toBe(false);
    expect(q(d, "summary").textContent).toBe(strings.folds.reader);
    expect(strings.folds.reader).toBe("What a second reader is");
    expect(q(d, "[data-reader-help]").textContent).toContain(strings.secondReader.help);
  });

  it("leaves the control, the results and the standing sentence outside the fold", () => {
    const panel = renderReaderPanel(emptyState());
    const d = q(panel, "details");
    expect(d.contains(q(panel, "#ask-reader"))).toBe(false);
    expect(d.contains(q(panel, "[data-reader-standing]"))).toBe(false);
  });
});

describe("a standing sentence never folds (R30.3)", () => {
  it("the text of the standing sentence is outside every details element on the whole screen", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: false,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      kept: makeKeptStore(browserStoreStandIn()),
    });
    await c.start();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    const standing = [...root.querySelectorAll(".egress-standing")].filter((n) => n.textContent === strings.egress.standing);
    expect(standing).toHaveLength(1);
    expect(standing[0]!.closest("details")).toBeNull();
    for (const d of root.querySelectorAll("details")) expect(d.open).toBe(false);
    expect([...root.querySelectorAll("details > summary")].map((s) => s.textContent)).toEqual([strings.folds.measured, strings.folds.scans, strings.folds.reader]);
  });
});

function setup(backend: BrowserStoreStandIn = browserStoreStandIn()) {
  const root = document.createElement("div");
  document.body.append(root);
  const kept = makeKeptStore(backend);
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    kept,
    drafting: {
      draftFor: () => ({ run: (t: never, i: never, m: never) => draftDouble.run(t, i, m) }) as never,
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  });
  return { root, c, backend, kept };
}

function open(root: HTMLElement, which: "scans" | "reader") {
  const d = q<HTMLDetailsElement>(root, `details[data-details="${which}"]`);
  expect(d, which).not.toBeNull();
  d.open = true;
  d.dispatchEvent(new Event("toggle"));
}

describe("an opened fold is kept and restored (R30.4)", () => {
  it("stays open through a render and after a reload", async () => {
    const a = setup();
    await a.c.start();
    (a.root.querySelector("#start-visit") as HTMLButtonElement).click();
    open(a.root, "scans");
    await settle();
    expect(a.c.state().unfolded.scans).toBe(true);
    expect(q<HTMLDetailsElement>(a.root, 'details[data-details="scans"]').open).toBe(true);
    expect(q<HTMLDetailsElement>(a.root, 'details[data-details="reader"]').open).toBe(false);
    open(a.root, "reader");
    await settle();
    await a.kept.flush();

    const b = setup(a.backend);
    await b.c.start();
    (b.root.querySelector("#start-visit") as HTMLButtonElement).click();
    expect(q<HTMLDetailsElement>(b.root, 'details[data-details="scans"]').open).toBe(true);
    expect(q<HTMLDetailsElement>(b.root, 'details[data-details="reader"]').open).toBe(true);
  });

  it("closes again when she closes it", async () => {
    const a = setup();
    await a.c.start();
    (a.root.querySelector("#start-visit") as HTMLButtonElement).click();
    open(a.root, "scans");
    await settle();
    const d = q<HTMLDetailsElement>(a.root, 'details[data-details="scans"]');
    d.open = false;
    d.dispatchEvent(new Event("toggle"));
    await settle();
    expect(a.c.state().unfolded.scans).toBe(false);
  });
});

describe("the fold summary has the same focus ring as every control (shell-and-offline R5.3)", () => {
  it("is 3 px in the accent, 2 px away", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toContain("details.fold > summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }");
  });
});
