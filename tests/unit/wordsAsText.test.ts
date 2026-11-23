// @vitest-environment happy-dom
// masking task 20 (R14, U5): words read as text. One tab stop, arrow keys, no box at rest.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderMaskView } from "../../src/app/parts/maskView";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const raw = inventedVisit.note;
const mount = () => {
  const spans = applyMask(raw, exactAndNear(raw, clients, DEFAULT_POLICY), clients).spans;
  const view = renderMaskView({ raw, spans, confirmPurpose: () => true });
  document.body.replaceChildren(view.element);
  return view;
};
const items = () => [...document.querySelectorAll<HTMLElement>(".mask-text button.word, .mask-text button.mask-chip")];
const key = (target: Element, k: string) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
const css = readFileSync("src/app/styles/app.css", "utf8");

describe("ordinary words at rest and on hover or focus (R14.1, R14.2)", () => {
  const rule = css.match(/\n\.word \{([^}]*)\}/)![1]!;
  it("has no underline, border, background or box at rest", () => {
    expect(rule).toMatch(/text-decoration:\s*none/);
    expect(rule).toMatch(/border:\s*none/);
    expect(rule).toMatch(/background:\s*none/);
    expect(rule).not.toMatch(/border-bottom|box-shadow|outline/);
    expect(rule).not.toMatch(/padding:\s*0 /);
  });
  it("shows an underline on pointer hover and on keyboard focus, in the ink colour", () => {
    const hover = css.match(/\.word:hover, \.word:focus-visible \{([^}]*)\}/)![1]!;
    expect(hover).toMatch(/text-decoration:\s*underline/);
    expect(hover).not.toMatch(/#[0-9a-fA-F]{3,6}|accent|failure/);
    expect(rule).toMatch(/color:\s*inherit/);
  });
  it("exempts a word from the 44 px rule by name, with a target as tall as the text line (R14.5)", () => {
    expect(rule).toMatch(/min-height:\s*1\.5em/);
    expect(rule).not.toMatch(/min-height:\s*44px/);
    const e2e = readFileSync("tests/e2e/bundled/interface.spec.ts", "utf8");
    expect(e2e).toMatch(/classList\.contains\("word"\)/);
  });
  it("keeps the chips' outlines and 44 px targets (R14.4)", () => {
    const chip = css.match(/\n\.mask-chip \{([^}]*)\}/)![1]!;
    expect(chip).toMatch(/min-height:\s*44px/);
    expect(chip).toMatch(/border:\s*1\.5px solid/);
  });
});

describe("the record text is one tab stop (R14.3)", () => {
  it("gives exactly one word or chip a tab stop, and all the others none", () => {
    mount();
    const all = items();
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((n) => n.tabIndex === 0).length).toBe(1);
    expect(all.filter((n) => n.tabIndex === -1).length).toBe(all.length - 1);
    expect(all[0]!.tabIndex).toBe(0);
  });

  it("moves the arrow keys from word to word, and chips are part of the walk", () => {
    mount();
    const all = items();
    all[0]!.focus();
    const e = key(all[0]!, "ArrowRight");
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(all[1]);
    key(all[1]!, "ArrowDown");
    expect(document.activeElement).toBe(all[2]);
    key(all[2]!, "ArrowLeft");
    expect(document.activeElement).toBe(all[1]);
    key(all[1]!, "ArrowUp");
    expect(document.activeElement).toBe(all[0]);
    key(all[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(all[0]);
    key(all[0]!, "End");
    expect(document.activeElement).toBe(all[all.length - 1]);
    key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(all[0]);
    const chipAt = all.findIndex((n) => n.classList.contains("mask-chip"));
    expect(chipAt).toBeGreaterThan(0);
    all[chipAt - 1]!.focus();
    key(all[chipAt - 1]!, "ArrowRight");
    expect(document.activeElement).toBe(all[chipAt]);
  });

  it("keeps the single tab stop where the focus is", () => {
    mount();
    const all = items();
    all[5]!.focus();
    expect(items().filter((n) => n.tabIndex === 0)).toEqual([all[5]]);
  });

  it("ignores other keys", () => {
    mount();
    const all = items();
    all[0]!.focus();
    expect(key(all[0]!, "a").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(all[0]);
  });

  it("masks the word under focus on Enter and announces it", () => {
    const view = mount();
    const word = items().find((n) => n.classList.contains("word") && n.textContent === "Mould")!;
    word.focus();
    const e = key(word, "Enter");
    expect(e.defaultPrevented).toBe(true);
    expect(view.liveRegion.textContent).toMatch(/^Masked: Detail \d$/);
    expect(view.getSpans().some((s) => s.kind === "manual" && s.surfaceForm === "Mould")).toBe(true);
  });

  it("keeps one tab stop after a change redraws the text", () => {
    mount();
    const word = items().find((n) => n.classList.contains("word") && n.textContent === "Mould")!;
    word.click();
    expect(items().filter((n) => n.tabIndex === 0).length).toBe(1);
  });
});
