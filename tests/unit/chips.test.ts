// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { chip, chipLabel } from "../../src/app/parts/chip";
import { renderMaskView } from "../../src/app/parts/maskView";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { mergeProposals } from "../../src/masking/merge";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { maskText, sendOnPurpose } from "../../src/masking/toggle";
import type { MaskSpan } from "../../src/masking/types";

const clients = parseClientList(inventedVisit.clientList).entries;
const note = inventedVisit.note;
function spansFor(): MaskSpan[] {
  const base = exactAndNear(note, clients, DEFAULT_POLICY);
  return applyMask(note, mergeProposals(note, base, [{ text: "Bea", kind: "name" }, { text: "14 Alder Court", kind: "place" }], DEFAULT_POLICY).spans, clients).spans;
}
const find = (spans: MaskSpan[], text: string) => spans.find((s) => s.surfaceForm === text)!;
const noop = { onToggle: () => {} };
const button = (wrap: HTMLElement) => wrap.querySelector<HTMLButtonElement>("button.mask-chip")!;
const enter = () => new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

describe("chips (masking task 13)", () => {
  const spans = spansFor();

  it("shows a listed name with a solid outline, the accent fill class, its tag and words", () => {
    const b = button(chip(find(spans, "Maria O-R"), noop));
    expect(b.className).toBe("mask-chip listed");
    expect(b.querySelector(".chip-text")!.textContent).toBe("[Person 1]");
    expect(b.querySelector(".chip-state")!.textContent).toBe("on your list");
    expect(b.getAttribute("aria-label")).toBe("Masked, on your list: Person 1");
    expect(b.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a near match like a listed name, with its own words", () => {
    const b = button(chip(find(spans, "Tomas Brandvald"), noop));
    expect(b.className).toBe("mask-chip near");
    expect(b.querySelector(".chip-state")!.textContent).toBe("near a listed name");
    expect(b.getAttribute("aria-label")).toBe("Masked, near a listed name: Person 3");
  });

  it("shows a proposed value with a dashed class, its own text and an instruction", () => {
    const b = button(chip(find(spans, "Bea"), noop));
    expect(b.className).toBe("mask-chip proposed");
    expect(b.querySelector(".chip-text")!.textContent).toBe("Bea");
    expect(b.querySelector(".chip-state")!.textContent).toBe("suggested");
    expect(b.getAttribute("aria-label")).toBe("Suggested: Bea. Press to mask.");
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows an accepted proposal and a manual mask with a solid outline and no fill class", () => {
    const accepted = { ...find(spans, "Bea"), accepted: true };
    const a = button(chip(accepted, noop));
    expect(a.className).toBe("mask-chip masked");
    expect(a.getAttribute("aria-label")).toBe("Masked: Person 2");
    const m = maskText(note, spans, "mould").spans.find((s) => s.surfaceForm === "Mould" || s.surfaceForm === "mould")!;
    const mb = button(chip(m, noop));
    expect(mb.className).toBe("mask-chip manual");
    expect(mb.querySelector(".chip-state")!.textContent).toBe("masked by you");
    expect(mb.getAttribute("aria-label")).toMatch(/^Masked: Detail \d$/);
  });

  it("shows a value sent on purpose with an eye icon and the name written out", () => {
    const sent = sendOnPurpose(spans, spans.indexOf(find(spans, "Maria O-R"))).spans.find((s) => s.sentOnPurpose)!;
    const b = button(chip(sent, noop));
    expect(b.className).toBe("mask-chip purpose");
    expect(b.querySelector('[data-icon="eye"]')).not.toBeNull();
    expect(b.querySelector(".chip-text")!.textContent).toBe("Maria O-R");
    expect(b.getAttribute("aria-label")).toBe("Will be sent by name: Maria O-R");
  });

  it("shows an unmasked listed value as not masked", () => {
    const off = { ...find(spans, "Maria"), accepted: false };
    const b = button(chip(off, noop));
    expect(b.className).toBe("mask-chip off");
    expect(b.querySelector(".chip-state")!.textContent).toBe("not masked");
    expect(chipLabel(off)).toBe("Not masked, on your list: Maria. Press to mask.");
  });

  it("gives every kind of chip a state in words, never colour alone", () => {
    const all = [...spans, { ...find(spans, "Bea"), accepted: true }, { ...find(spans, "Maria"), accepted: false }];
    for (const s of all) expect(button(chip(s, noop)).querySelector(".chip-state")!.textContent!.length).toBeGreaterThan(0);
  });

  it("toggles once on a press", () => {
    const onToggle = vi.fn();
    button(chip(find(spans, "Bea"), { onToggle })).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("toggles once on the Enter key and not on another key", () => {
    const onToggle = vi.fn();
    const b = button(chip(find(spans, "Bea"), { onToggle }));
    const e = enter();
    b.dispatchEvent(e);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    b.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("toggles a listed chip as before when no purpose handler is given", () => {
    const onToggle = vi.fn();
    button(chip(find(spans, "Maria O-R"), { onToggle })).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("the chip panel (masking task 18, R13)", () => {
  const spans = spansFor();
  const withPurpose = (over: Partial<Parameters<typeof chip>[1]> = {}) => ({ onToggle: vi.fn(), onPurpose: vi.fn(), onAnnounce: vi.fn(), ...over });
  const mountChip = (s: MaskSpan, h = withPurpose()) => {
    const wrap = chip(s, h);
    document.body.replaceChildren(wrap);
    return { wrap, h, b: button(wrap) };
  };
  const listed = () => find(spans, "Maria O-R");
  const near = () => find(spans, "Tomas Brandvald");
  const WORDS = "Send this name on purpose";

  it("has zero occurrences of the words before a press, on a page with three listed chips", () => {
    const view = renderMaskView({ raw: note, spans: spansFor(), confirmPurpose: () => true });
    document.body.replaceChildren(view.element);
    expect(document.querySelectorAll("button.mask-chip.listed").length).toBeGreaterThanOrEqual(3);
    expect(document.body.textContent).not.toContain(WORDS);
    expect(document.querySelector("[data-purpose]")).toBeNull();
  });

  it("opens a panel on the chip with that one action and one plain line, on a press", () => {
    const { wrap, b } = mountChip(listed());
    b.click();
    const panel = wrap.querySelector("[data-chip-panel]")!;
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-label")).toBe("Options for Person 1");
    expect([...panel.querySelectorAll("button")].map((x) => x.textContent)).toEqual([WORDS]);
    expect(panel.querySelector(".chip-panel-line")!.textContent).toBe(
      "The name will be in the text that leaves. The egress check will report it as sent on purpose.",
    );
    expect(b.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens on the Enter key, once", () => {
    const { wrap, b } = mountChip(listed());
    const e = enter();
    b.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(wrap.querySelectorAll("[data-chip-panel]").length).toBe(1);
  });

  it("moves focus into the panel when it opens", () => {
    const { wrap } = mountChip(listed());
    button(wrap).click();
    expect(document.activeElement).toBe(wrap.querySelector("[data-purpose]"));
  });

  it("closes on Escape and puts focus back on the chip", () => {
    const { wrap, b } = mountChip(listed());
    b.click();
    wrap.querySelector("[data-purpose]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(wrap.querySelector("[data-chip-panel]")).toBeNull();
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).not.toContain(WORDS);
  });

  it("closes on a press outside, and a press inside does not close it", () => {
    const { wrap, b } = mountChip(listed());
    const other = document.createElement("p");
    document.body.append(other);
    b.click();
    wrap.querySelector(".chip-panel-line")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrap.querySelector("[data-chip-panel]")).not.toBeNull();
    other.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrap.querySelector("[data-chip-panel]")).toBeNull();
  });

  it("closes on a second press of the chip", () => {
    const { wrap, b } = mountChip(listed());
    b.click();
    b.click();
    expect(wrap.querySelector("[data-chip-panel]")).toBeNull();
  });

  it("announces opening and closing in words", () => {
    const { b, h } = mountChip(listed());
    b.click();
    expect(h.onAnnounce).toHaveBeenLastCalledWith("Options for Person 1.");
    b.click();
    expect(h.onAnnounce).toHaveBeenLastCalledWith("Options closed.");
  });

  it("calls the purpose handler from the action and closes the panel", () => {
    const { wrap, b, h } = mountChip(listed());
    b.click();
    wrap.querySelector<HTMLButtonElement>("[data-purpose]")!.click();
    expect(h.onPurpose).toHaveBeenCalledTimes(1);
    expect(h.onToggle).not.toHaveBeenCalled();
    expect(wrap.querySelector("[data-chip-panel]")).toBeNull();
  });

  it("offers Unmask on a near chip and not on a listed chip", () => {
    const l = mountChip(listed());
    l.b.click();
    expect(l.wrap.querySelector("[data-unmask]")).toBeNull();
    const n = mountChip(near());
    n.b.click();
    const unmask = n.wrap.querySelector<HTMLButtonElement>("[data-unmask]")!;
    expect(unmask.textContent).toBe("Unmask");
    unmask.click();
    expect(n.h.onToggle).toHaveBeenCalledTimes(1);
    expect(n.wrap.querySelector("[data-chip-panel]")).toBeNull();
  });

  it("does not open a panel for a proposed, manual or unmasked chip, and does not offer the action for a value sent on purpose", () => {
    for (const s of [find(spans, "Bea"), { ...listed(), accepted: false }, { ...listed(), accepted: false, sentOnPurpose: true }]) {
      const { wrap, b, h } = mountChip(s);
      b.click();
      expect(wrap.querySelector("[data-chip-panel]")).toBeNull();
      expect(h.onToggle).toHaveBeenCalledTimes(1);
    }
  });

  it("introduces no new colour and sets the panel controls at 44 px", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    const panel = css.match(/\.chip-panel \{([^}]*)\}/)![1]!;
    expect(panel).not.toMatch(/#[0-9a-fA-F]{3,6}/);
    expect(panel).not.toMatch(/accent|failure/);
    const actions = css.match(/\.chip-purpose, \.chip-unmask \{([^}]*)\}/)![1]!;
    expect(actions).toMatch(/min-height:\s*44px/);
    expect(actions).toMatch(/min-width:\s*44px/);
    expect(actions).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});

describe("the record text with chips and a live region (masking task 13)", () => {
  const mount = (over: Partial<Parameters<typeof renderMaskView>[0]> = {}) => {
    const view = renderMaskView({ raw: note, spans: spansFor(), ...over });
    document.body.replaceChildren(view.element);
    return view;
  };
  const chipFor = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button.mask-chip")].find((b) => b.getAttribute("aria-label")!.includes(text))!;

  it("keeps the words of the note around the chips, and draws one chip for each mask", () => {
    const view = mount();
    expect(view.element.querySelector(".mask-text")!.textContent).toContain("home visit");
    expect(view.element.querySelectorAll("button.mask-chip").length).toBe(spansFor().length);
    expect(view.element.querySelectorAll("button.word").length).toBeGreaterThan(20);
  });

  it("has a polite live region that is not hidden from assistive technology", () => {
    const view = mount();
    expect(view.liveRegion.getAttribute("role")).toBe("status");
    expect(view.liveRegion.getAttribute("aria-live")).toBe("polite");
    expect(view.liveRegion.hasAttribute("hidden")).toBe(false);
    expect(view.liveRegion.getAttribute("aria-hidden")).toBeNull();
  });

  it("announces 'Masked: Person 2' when Bea is accepted, and 'Unmasked: Bea' when it is pressed again", () => {
    const onChange = vi.fn();
    const view = mount({ onChange });
    chipFor("Suggested: Bea").click();
    expect(view.liveRegion.textContent).toBe("Masked: Person 2");
    expect(view.getSpans().find((s) => s.surfaceForm === "Bea")!.accepted).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(expect.any(Array), "Masked: Person 2");
    chipFor("Masked: Person 2").click();
    expect(view.liveRegion.textContent).toBe("Unmasked: Bea");
  });

  it("toggles with the Enter key and announces it", () => {
    const view = mount();
    chipFor("Suggested: Bea").dispatchEvent(enter());
    expect(view.liveRegion.textContent).toBe("Masked: Person 2");
  });

  it("keeps the keyboard focus on the same place after a change", () => {
    mount();
    chipFor("Suggested: Bea").click();
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Masked: Person 2");
  });

  it("masks a plain word with a press or Enter and announces it", () => {
    const view = mount();
    const word = [...document.querySelectorAll<HTMLButtonElement>("button.word")].find((b) => b.textContent === "mould" || b.textContent === "Mould")!;
    word.dispatchEvent(enter());
    expect(view.liveRegion.textContent).toMatch(/^Masked: Detail \d$/);
    expect(view.getSpans().filter((s) => s.kind === "manual").length).toBeGreaterThan(0);
  });

  it("sends a name on purpose only after the named question is confirmed, from the panel", async () => {
    const confirmPurpose = vi.fn(async () => true);
    const view = mount({ confirmPurpose });
    const wrap = chipFor("Masked, on your list: Person 1").parentElement!;
    wrap.querySelector<HTMLButtonElement>("button.mask-chip")!.click();
    expect(view.liveRegion.textContent).toBe("Options for Person 1.");
    wrap.querySelector<HTMLButtonElement>("[data-purpose]")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(confirmPurpose).toHaveBeenCalledWith("Send Maria O-R by name in the text that leaves?");
    expect(view.getSpans().find((s) => s.surfaceForm === "Maria O-R")).toMatchObject({ accepted: false, sentOnPurpose: true });
    expect(view.liveRegion.textContent).toBe("Will be sent by name: Maria O-R");
    expect(document.body.textContent).not.toContain("Send this name on purpose");
  });

  it("leaves the name masked when the question is refused", async () => {
    const view = mount({ confirmPurpose: async () => false });
    const wrap = chipFor("Masked, on your list: Person 1").parentElement!;
    wrap.querySelector<HTMLButtonElement>("button.mask-chip")!.click();
    wrap.querySelector<HTMLButtonElement>("[data-purpose]")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(view.getSpans().find((s) => s.surfaceForm === "Maria O-R")).toMatchObject({ accepted: true, sentOnPurpose: false });
  });
});

describe("chip styles", () => {
  const css = readFileSync("src/app/styles/app.css", "utf8");
  const block = (selector: string) => css.match(new RegExp(`${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  it("makes every control at least 44 px", () => {
    for (const s of [".mask-chip"]) {
      expect(block(s), s).toMatch(/min-height:\s*44px/);
      expect(block(s), s).toMatch(/min-width:\s*44px/);
    }
  });
  it("draws listed and near with the accent fill, proposed with a dashed outline", () => {
    expect(css).toMatch(/\.mask-chip\.listed, \.mask-chip\.near \{[^}]*background: var\(--accent-tint\)/);
    expect(css).toMatch(/\.mask-chip\.proposed \{[^}]*dashed/);
  });
  it("draws the manual chip as a button, heavier on the bottom, with no extra words", () => {
    const manual = css.match(/\.mask-chip\.manual \{([^}]*)\}/)?.[1] ?? "";
    expect(manual).toMatch(/border-bottom-width:\s*3px/);
    expect(manual).toMatch(/min-height:\s*48px/);
    expect(manual).not.toMatch(/content\s*:/);
  });
  it("does not hide the live region with display none", () => {
    expect(block(".sr-only")).not.toMatch(/display:\s*none/);
  });
});
