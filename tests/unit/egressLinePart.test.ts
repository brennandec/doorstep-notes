// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { egressLine } from "../../src/app/parts/egressLine";
import { renderScreen } from "../../src/app/screen";
import { emptyState } from "../../src/app/state";
import { buildBlockedLine, buildLines } from "../../src/egress/line";
import type { CheckResult } from "../../src/egress/check";

const result = (over: Partial<CheckResult> = {}): CheckResult => ({
  listedChecked: 12,
  listedFound: [],
  maskedChecked: 4,
  maskedFound: [],
  onPurposeFound: [],
  passed: true,
  ...over,
});
const failing = result({ passed: false, listedFound: ["Priya Halloran"] });

describe("egress line part", () => {
  it("shows the waiting line and the standing sentence before any send", () => {
    const n = egressLine(null);
    expect(n.hasAttribute("data-egress-line")).toBe(true);
    expect(n.dataset.kind).toBe("waiting");
    expect(n.classList.contains("fail")).toBe(false);
    expect(n.querySelector("svg")).toBeNull();
    expect(n.textContent).toContain("The egress check runs before anything is sent.");
    expect(n.querySelector(".egress-standing")?.textContent).toContain("can still identify a person");
  });

  // Rewritten by egress-check task 26 (fifth review N1): the line is a card with a verdict and a table.
  it("pass: a check mark icon, the verdict, three rows, and no failure class", () => {
    const n = egressLine(buildLines({ result: result(), connected: true }));
    expect(n.classList.contains("fail")).toBe(false);
    expect(n.getAttribute("role")).toBe("status");
    expect(n.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(n.querySelector('[data-icon="crossedOctagon"]')).toBeNull();
    expect(n.querySelector(".egress-headline")?.textContent).toBe("No listed name left this device: 0 of 12.");
    const rows = [...n.querySelectorAll(".egress-rows tr")];
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector("th")?.textContent)).toEqual([
      "Masked values in the text sent",
      "Single name parts of 3 letters or more",
      "The request",
    ]);
    expect(rows[0]!.querySelector("td")?.textContent).toBe("0 of 4");
    expect(n.querySelector(".egress-standing")?.textContent).toContain("listed names and masked values only");
  });

  it("the card holds no paragraph element, and the table is a real table with row headers", () => {
    for (const lines of [buildLines({ result: result(), connected: true }), buildLines({ result: failing, connected: false }), buildBlockedLine(failing)]) {
      const card = egressLine(lines).querySelector("[data-egress-card]")!;
      expect(card).not.toBeNull();
      expect(card.querySelector("p")).toBeNull();
      expect(card.querySelector("table")).not.toBeNull();
      expect(card.querySelectorAll("th[scope=row]").length).toBe(card.querySelectorAll("tr").length);
    }
  });

  it("the card is not the standing sentence or the fold: both stand outside it", () => {
    const n = egressLine(buildLines({ result: result(), connected: true }));
    const card = n.querySelector("[data-egress-card]")!;
    expect(card.contains(n.querySelector(".egress-standing"))).toBe(false);
    expect(card.contains(n.querySelector("details"))).toBe(false);
  });

  it("on purpose: a check mark icon and no failure class", () => {
    const n = egressLine(buildLines({ result: result({ onPurposeFound: ["Priya Halloran"] }), connected: true }));
    expect(n.classList.contains("fail")).toBe(false);
    expect(n.querySelector('[data-icon="check"]')).not.toBeNull();
    expect(n.querySelector(".egress-headline")?.textContent).toContain("sent on purpose: Priya Halloran");
  });

  it("fail: the crossed octagon, the failure class and the words", () => {
    const n = egressLine(buildLines({ result: failing, connected: true }));
    expect(n.classList.contains("fail")).toBe(true);
    expect(n.getAttribute("role")).toBe("alert");
    expect(n.querySelector('[data-icon="crossedOctagon"]')).not.toBeNull();
    expect(n.querySelector('[data-icon="check"]')).toBeNull();
    const words = n.querySelector(".egress-headline")?.textContent ?? "";
    expect(words).toContain("Egress check failed");
    expect(words).toContain("Found 1 of 12 listed names");
    expect(words).toContain("Priya Halloran");
    expect(n.querySelectorAll(".egress-rows tr")).toHaveLength(5);
    expect(n.querySelector(".egress-rows")?.textContent).toContain("this text has left this device.");
    expect(n.querySelector(".egress-rows")?.textContent).toContain("report it to whoever runs this page; mask the name before the next send.");
  });

  it("blocked before sending: the crossed octagon, the failure class and the words", () => {
    const n = egressLine(buildBlockedLine(failing));
    expect(n.classList.contains("fail")).toBe(true);
    expect(n.querySelector('[data-icon="crossedOctagon"]')).not.toBeNull();
    expect(n.textContent).toContain("Found in the text that would leave: Priya Halloran.");
    expect(n.querySelector(".egress-standing")).not.toBeNull();
  });

  it("the block verdict names a person once, even when the same name is found in two lists (session G03, seen in picture 14)", () => {
    const twice = result({ passed: false, listedFound: ["Priya Halloran"], maskedFound: ["Priya Halloran"] });
    const n = egressLine(buildBlockedLine(twice));
    expect(n.textContent).toContain("Found in the text that would leave: Priya Halloran.");
    expect(n.textContent).not.toContain("Priya Halloran, Priya Halloran");
  });

  it("not connected: the request row says so", () => {
    const n = egressLine(buildLines({ result: result(), connected: false }));
    expect(n.querySelector(".egress-rows")?.textContent).toMatch(/cloud off/i);
    expect(egressLine(buildLines({ result: result(), connected: true })).querySelector(".egress-rows")?.textContent).not.toMatch(/cloud off/i);
  });

  it("holds the near-variants sentence inside the fold, not in the card", () => {
    const n = egressLine(buildLines({ result: result(), connected: true }));
    const d = n.querySelector("details")!;
    expect(d.textContent).toContain("Near variants that were not masked are not checked.");
    expect(n.querySelector("[data-egress-card]")!.textContent).not.toContain("Near variants");
  });

  it("puts the icon before the words and uses no emoji", () => {
    const n = egressLine(buildLines({ result: failing, connected: true }));
    const main = n.querySelector(".egress-verdict")!;
    expect(main.firstElementChild?.classList.contains("egress-icon")).toBe(true);
    expect(n.textContent).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it("is the last child of zone 2 and shows the lines from the state", () => {
    const lines = buildLines({ result: failing, connected: true });
    const nodes = renderScreen(emptyState({ egressLines: lines }), { } as never);
    const holder = document.createElement("div");
    holder.append(...nodes);
    const zone = holder.querySelector('[data-zone="leaves"]')!;
    expect(zone.lastElementChild?.hasAttribute("data-egress-line")).toBe(true);
    expect(zone.lastElementChild?.classList.contains("fail")).toBe(true);
    const empty = document.createElement("div");
    empty.append(...renderScreen(emptyState({ started: true }), {} as never));
    expect(empty.querySelector('[data-zone="leaves"]')?.lastElementChild?.classList.contains("fail")).toBe(false);
  });
});

describe("egress line style", () => {
  const css = readFileSync("src/app/styles/app.css", "utf8");
  it("lets the line flow after the controls in every state, never stuck over them (H35b D7)", () => {
    const rule = css.match(/\.egress-line\s*\{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/position:\s*static/);
    expect(rule).toMatch(/margin-top:\s*0/);
    expect(rule).not.toMatch(/position:\s*sticky/);
  });
  it("keeps the block line under the Not sent line, with the line flowing (session H01, H35b)", () => {
    const rule = css.match(/\.egress-line\[data-kind="blocked"\]\s*\{([^}]*)\}/)?.[1];
    expect(rule).toBeDefined();
    expect(css.match(/\.egress-line\s*\{([^}]*)\}/)![1]).toMatch(/position:\s*static/);
  });
  it("makes the verdict at least the interface size, 18 px, in weight 600 (OPEN-QUESTIONS, fifth review)", () => {
    const rule = css.match(/\.egress-headline\s*\{([^}]*)\}/)![1]!;
    expect(Number(rule.match(/font-size:\s*(\d+)px/)![1])).toBeGreaterThanOrEqual(18);
    expect(rule).toMatch(/font-weight:\s*600/);
  });
  it("sets the failure colour only on the failing verdict, and the standing sentence keeps the second ink", () => {
    expect(css).toMatch(/\.egress-line\.fail \.egress-verdict\s*\{\s*color:\s*var\(--failure\);\s*\}/);
    expect(css).toMatch(/\.egress-standing\s*\{[^}]*color:\s*var\(--ink-2\)/);
    const base = css.match(/\.egress-line\s*\{([^}]*)\}/)![1]!;
    expect(base).not.toContain("--failure");
  });
  it("lays the rows out label left, value right, in the table", () => {
    expect(css).toMatch(/\.egress-rows\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.egress-rows th\s*\{[^}]*text-align:\s*left/);
    expect(css).toMatch(/\.egress-rows td\s*\{[^}]*text-align:\s*right/);
  });
});
