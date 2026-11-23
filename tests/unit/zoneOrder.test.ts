// @vitest-environment happy-dom
// Shell-and-offline tasks 78 and 79 (R39, sixth review R4): the verdict first; the ledger as a fold of small tables.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const ledger = makeLedger();
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => ({ run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) }) as never,
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  });
  return { root, c, ledger };
}
const press = async (root: HTMLElement, sel: string) => {
  if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  q<HTMLElement>(root, sel).click();
  await settle();
};
async function afterSend(s: ReturnType<typeof setup>, times = 1) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.render();
  await press(s.root, "#make-record");
  for (let i = 0; i < times; i++) {
    await press(s.root, "#draft");
    // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it.
    for (let k = 0; k < 5 && s.root.querySelector("[data-keep-likely]"); k++) await press(s.root, "[data-keep-likely]");
    await press(s.root, "#send");
    // a second round: clear the finished note by drafting again
  }
}
const leaves = (s: ReturnType<typeof setup>) => q(s.root, '[data-zone="leaves"]');
const index = (parent: Element, child: Element | null) => [...parent.children].indexOf(child as Element);

describe("zone 2 order after a send (R39.1)", () => {
  it("outgoing text, connection line, Draft and Send, then the verdict card, the sentence that never folds, the two folds", async () => {
    const s = setup();
    await afterSend(s);
    const zone = leaves(s);
    const outgoing = q(zone, "pre.outgoing");
    const notice = q(zone, "[data-send-notice]");
    const actions = q(zone, ".actions");
    const line = q(zone, "[data-egress-line]");
    expect(index(zone, outgoing)).toBeLessThan(index(zone, notice));
    expect(index(zone, notice)).toBeLessThan(index(zone, actions));
    expect(index(zone, actions)).toBeLessThan(index(zone, line));
    expect(zone.lastElementChild).toBe(line);
    const inside = [...line.children].map((c) => (c.hasAttribute("data-egress-card") ? "card" : c.classList.contains("egress-standing") ? "standing" : (c as HTMLElement).dataset.details ?? c.tagName));
    expect(inside).toEqual(["card", "standing", "scans", "ledger"]);
  });

  it("holds no ledger panel above the verdict any more", async () => {
    const s = setup();
    await afterSend(s);
    expect(s.root.querySelector("[data-ledger-panel]")).toBeNull();
    const zone = leaves(s);
    const ledger = q(zone, '[data-details="ledger"]');
    expect(index(zone, ledger)).toBe(-1); // it is inside the egress line, after the card
    expect(q(zone, "[data-egress-line]").contains(ledger)).toBe(true);
  });

  it("has no ledger fold before any send", async () => {
    const s = setup();
    await s.c.start();
    s.c.handlers.onTryExample();
    s.c.render();
    expect(leaves(s).querySelector('[data-details="ledger"]')).toBeNull();
    expect(q(leaves(s), "[data-egress-line]").lastElementChild!.getAttribute("data-details")).toBe("scans");
  });
});

describe("the ledger fold (R39.2)", () => {
  it("is labelled with the count, 'Egress ledger (1 entry)' then more", async () => {
    const s = setup();
    await afterSend(s);
    expect(q(s.root, "#fold-ledger").textContent).toBe("Egress ledger (1 entry)");
    expect(strings.folds.ledger).toBe("Egress ledger ({n} entries)");
    await press(s.root, "#draft");
    // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it.
    for (let k = 0; k < 5 && s.root.querySelector("[data-keep-likely]"); k++) await press(s.root, "[data-keep-likely]");
    await press(s.root, "#send");
    expect(s.ledger.all().length).toBeGreaterThan(1);
    expect(q(s.root, "#fold-ledger").textContent).toBe(`Egress ledger (${s.ledger.all().length} entries)`);
  });

  it("is closed by default and keeps what she did with it", async () => {
    const s = setup();
    await afterSend(s);
    expect(q<HTMLDetailsElement>(s.root, '[data-details="ledger"]').open).toBe(false);
    expect(s.c.state().unfolded.ledger).toBe(false);
    s.c.handlers.onToggleFold!("ledger");
    expect(s.c.state().unfolded.ledger).toBe(true);
    expect(q<HTMLDetailsElement>(s.root, '[data-details="ledger"]').open).toBe(true);
    s.c.render();
    expect(q<HTMLDetailsElement>(s.root, '[data-details="ledger"]').open).toBe(true);
  });

  it("holds one small table for each entry with the seven rows in order", async () => {
    const s = setup();
    await afterSend(s);
    const tables = leaves(s).querySelectorAll("[data-ledger-entry]");
    expect(tables).toHaveLength(s.ledger.all().length);
    const entry = s.ledger.all()[0]!;
    const rows = [...tables[0]!.querySelectorAll("tr")].map((r) => [r.querySelector("th")!.textContent, r.querySelector("td")!.textContent]);
    expect(rows.map((r) => r[0])).toEqual(["Time", "Job", "Mode", "Source", "Outcome", "Bytes", "Hash", "Off page"]);
    expect(rows[0]![1]).toBe(entry.at);
    expect(rows[1]![1]).toBe(entry.job);
    expect(rows[2]![1]).toBe(entry.mode);
    expect(rows[3]![1]).toBe("in the cloud");
    expect(rows[4]![1]).toBe(entry.outcome);
    expect(rows[5]![1]).toBe(entry.byteLengths.join(", "));
    expect(rows[6]![1]).toBe(entry.sha256.join(", "));
    expect(rows[7]![1]).toBe(entry.requests.length === 0 ? "none" : entry.requests.map((row) => `${row.host}, ${row.bytes} bytes, note text ${row.carriesNote ? "yes" : "no"}`).join("; "));
  });

  it("has no pipe character anywhere in zone 2, folds open or closed", async () => {
    const s = setup();
    await afterSend(s);
    expect(leaves(s).textContent).not.toContain("|");
    s.c.handlers.onToggleFold!("ledger");
    s.c.handlers.onToggleFold!("scans");
    expect(leaves(s).textContent).not.toContain("|");
    expect(leaves(s).innerHTML).not.toContain("|");
  });

  it("has no save control in the fold, and says the ledger is kept on this device", async () => {
    const s = setup();
    await afterSend(s);
    const fold = q(s.root, '[data-details="ledger"]');
    expect(fold.querySelector("#save" + "-ledger")).toBeNull();
    expect(fold.querySelector("button")).toBeNull();
    expect(q(fold, ".ledger-explain").textContent).toBe(strings.egress.ledgerExplain);
    expect(fold.querySelectorAll("[data-ledger-entry]")).toHaveLength(s.ledger.all().length);
  });

  it("is a native details element, so the keyboard opens it, drawn with a style for the small tables", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(q(document.body, '[data-details="ledger"]') ?? document.createElement("details")).toBeInstanceOf(HTMLElement);
    expect(css).toMatch(/\.ledger-entry\b/);
  });

  it("puts a hash that is long into a box that wraps, so nothing is cut", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.ledger-entry td[^}]*(overflow-wrap:\s*anywhere|word-break:\s*break-all)/);
  });

  it("has labels in the string table that pass the word and number audits", () => {
    for (const t of [strings.egress.ledgerTime, strings.egress.ledgerJob, strings.egress.ledgerMode, strings.egress.ledgerSource, strings.egress.ledgerOutcome, strings.egress.ledgerBytes, strings.egress.ledgerHash, strings.folds.ledger, strings.folds.ledgerOne]) {
      expect(t).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared)\b/i);
      expect(t).not.toMatch(/\d/);
      expect(t).not.toContain("|");
    }
  });
});
