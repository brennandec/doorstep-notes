// A masked value as a chip (look and layout, Chips; masking R5).
// listed and near: solid outline, light accent fill.
// proposed, not accepted: dashed outline, no fill, until she accepts it.
// manual: the unmask control. Same ink border as a button, with a heavier bottom edge. No extra words.
// accepted proposals: solid outline, no fill.
// sent on purpose: solid ink outline with an eye icon.
// The state is always in words as well as outline style (R5.4).
// A chip is a button. A press or the Enter key toggles it.
import { fill, strings } from "../strings";
import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import { tagLabel } from "../../masking/tags";
import type { MaskSpan } from "../../masking/types";

export type ChipClass = "listed" | "near" | "proposed" | "manual" | "masked" | "purpose" | "off";

/** Which look and words the span has right now. */
export function chipClass(s: MaskSpan): ChipClass {
  if (s.sentOnPurpose) return "purpose";
  if (s.kind === "listed" || s.kind === "near") return s.accepted ? s.kind : "off";
  if (s.kind === "manual") return "manual";
  return s.accepted ? "masked" : "proposed";
}

export function chipState(c: ChipClass): string {
  const t = strings.masking.state;
  return { listed: t.listed, near: t.near, proposed: t.proposed, manual: t.manual, masked: t.masked, purpose: t.purpose, off: t.notMasked }[c];
}

/** The words assistive technology reads (design.md, Chips). */
export function chipLabel(s: MaskSpan): string {
  const l = strings.masking.label;
  const c = chipClass(s);
  const tag = tagLabel(s.tag);
  switch (c) {
    case "listed": return fill(l.listed, { what: tag });
    case "near": return fill(l.near, { what: tag });
    case "manual":
    case "masked": return fill(l.masked, { what: tag });
    case "proposed": return fill(l.proposed, { what: s.surfaceForm });
    case "purpose": return fill(l.purpose, { what: s.surfaceForm });
    case "off": return fill(l.notMasked, { what: s.surfaceForm });
  }
}

export interface ChipHandlers {
  onToggle(): void;
  /** Present when "Send this name on purpose" may be offered. Without it a listed chip toggles as before. */
  onPurpose?(): void;
  /** Words for the polite live region: the panel opening and closing. */
  onAnnounce?(text: string): void;
}

/** A listed or near value that is masked opens a small panel on its chip (masking R13). */
function opensPanel(s: MaskSpan, h: ChipHandlers): boolean {
  return h.onPurpose !== undefined && s.accepted && !s.sentOnPurpose && (s.kind === "listed" || s.kind === "near");
}

/**
 * The chip button. A masked listed or near value opens a panel on the chip when pressed (click or
 * Enter): "Send this name on purpose", one line saying what it means, and for a near value "Unmask".
 * The words "Send this name on purpose" are not in the document until the panel is open.
 */
export function chip(s: MaskSpan, h: ChipHandlers): HTMLElement {
  const c = chipClass(s);
  const showsTag = s.accepted && !s.sentOnPurpose;
  const panelFlag = opensPanel(s, h);
  const button = el(
    "button",
    {
      type: "button",
      class: `mask-chip ${c}`,
      "data-chip": c,
      "data-start": String(s.start),
      "data-end": String(s.end),
      "aria-pressed": s.accepted ? "true" : "false",
      "aria-label": chipLabel(s),
      ...(panelFlag ? { "aria-haspopup": "true", "aria-expanded": "false" } : {}),
    },
    c === "purpose" ? svg(iconSvg("eye")) : null,
    el("span", { class: "chip-text" }, showsTag ? s.tag : s.surfaceForm),
    el("span", { class: "chip-state" }, chipState(c)),
  );
  const wrap = el("span", { class: "chip-wrap" }, button);

  let panel: HTMLElement | null = null;
  const outside = (e: Event) => {
    if (!wrap.contains(e.target as Node)) close(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || panel === null) return;
    e.preventDefault();
    close(true);
  };
  function close(returnFocus: boolean) {
    if (panel === null) return;
    panel.remove();
    panel = null;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", outside, true);
    wrap.removeEventListener("keydown", onKey);
    h.onAnnounce?.(strings.masking.panelClosed);
    if (returnFocus) button.focus();
  }
  function open() {
    const what = tagLabel(s.tag);
    const purpose = el("button", { type: "button", class: "chip-purpose", "data-purpose": "" }, strings.masking.purposeAction);
    purpose.addEventListener("click", () => {
      close(true);
      h.onPurpose?.();
    });
    const actions: HTMLElement[] = [purpose];
    if (s.kind === "near") {
      const unmask = el("button", { type: "button", class: "chip-unmask", "data-unmask": "" }, strings.masking.panelUnmask);
      unmask.addEventListener("click", () => {
        close(false);
        h.onToggle();
      });
      actions.push(unmask);
    }
    panel = el(
      "div",
      { class: "chip-panel", role: "group", "aria-label": fill(strings.masking.panelLabel, { what }), "data-chip-panel": "" },
      el("p", { class: "chip-panel-line" }, strings.masking.panelLine),
      el("div", { class: "chip-panel-actions" }, ...actions),
    );
    wrap.append(panel);
    button.setAttribute("aria-expanded", "true");
    document.addEventListener("click", outside, true);
    wrap.addEventListener("keydown", onKey);
    h.onAnnounce?.(fill(strings.masking.panelOpened, { what }));
    purpose.focus();
  }

  const activate = () => {
    if (!panelFlag) return h.onToggle();
    if (panel === null) open();
    else close(true);
  };
  button.addEventListener("click", activate);
  button.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    // Enter acts once. Stopping the default keeps the browser from also sending a click.
    e.preventDefault();
    activate();
  });
  return wrap;
}
