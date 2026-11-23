// The three clear controls and the question each one asks once (shell-and-offline R27.4).
// "Clear this visit" and "Clear my list" stand in zone 1 when there is something to clear;
// "Clear everything this page keeps" stands in the footer. The question is a small panel beside the
// control: a go-ahead button and a keep button. Escape closes it and does nothing else.
import { el } from "../dom";
import { strings } from "../strings";
import type { AppState, ClearKind, Handlers } from "../state";

const CONTROL_ID: Record<ClearKind, string> = { visit: "clear-visit", list: "clear-list", all: "clear-all" };
const ASK: Record<ClearKind, string> = { visit: strings.kept.askVisit, list: strings.kept.askList, all: strings.kept.askAll };
const LABEL: Record<ClearKind, string> = { visit: strings.kept.clearVisit, list: strings.kept.clearList, all: strings.kept.clearAll };

/** The id of the control that opened a question, so focus can go back to it. */
export const clearControlId = (which: ClearKind): string => CONTROL_ID[which];

/** True when the visit holds anything that "Clear this visit" would remove. */
export function hasVisit(s: AppState): boolean {
  return s.noteText !== "" || s.photo !== null || s.record !== null || s.mask !== null || s.outgoingText !== "" || s.finished !== null;
}

function control(which: ClearKind, h: Handlers): HTMLElement {
  const b = el("button", { type: "button", class: "btn inline clear-control", id: CONTROL_ID[which], "data-kind": "inline" }, LABEL[which]);
  b.addEventListener("click", () => h.onAskClear?.(which));
  return b;
}

function panel(which: ClearKind, h: Handlers): HTMLElement {
  const go = el("button", { type: "button", class: "btn secondary", id: "clear-go", "data-kind": "secondary" }, el("span", {}, strings.kept.goAhead));
  const keep = el("button", { type: "button", class: "btn secondary", id: "clear-keep", "data-kind": "secondary" }, el("span", {}, strings.kept.keep));
  go.addEventListener("click", () => h.onConfirmClear?.());
  keep.addEventListener("click", () => h.onCancelClear?.());
  const box = el(
    "div",
    { class: "clear-panel", role: "group", "aria-labelledby": "clear-ask", "data-clear-panel": which },
    el("p", { id: "clear-ask", "data-clear-ask": "" }, ASK[which]),
    el("div", { class: "actions" }, go, keep),
  );
  box.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") {
      e.stopPropagation();
      h.onCancelClear?.();
    }
  });
  return box;
}

/** The two controls of zone 1, each shown when there is something to clear (or while it is asking), and the open question. */
export function renderClearControls(state: AppState, h: Handlers): HTMLElement | null {
  const open = state.confirmClear === "visit" || state.confirmClear === "list" ? state.confirmClear : null;
  const showVisit = hasVisit(state) || open === "visit";
  const showList = state.clientList !== "" || open === "list";
  if (!showVisit && !showList) return null;
  return el(
    "div",
    { class: "kept-controls", "data-kept-controls": "" },
    showVisit ? control("visit", h) : null,
    showList ? control("list", h) : null,
    open ? panel(open, h) : null,
  );
}

/** The footer: how it is kept, and the control that removes everything. */
export function renderKeptFooter(state: AppState, h: Handlers): HTMLElement {
  return el(
    "div",
    { class: "kept-footer", "data-kept-footer": "" },
    el("p", { "data-how-kept": "" }, strings.kept.howKept),
    control("all", h),
    state.confirmClear === "all" ? panel("all", h) : null,
  );
}
