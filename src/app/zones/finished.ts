import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import { button } from "../parts/button";
import { finishedMark } from "../parts/sourceLabel";
import { strings } from "../strings";
import { nextStep, type AppState, type Handlers } from "../state";
import { renderReaderPanel } from "./readerPanel";

/**
 * The finished note as a document sheet: serif face, soft shadow, source label top
 * right, names restored on this device, Copy. A device draft carries its own line;
 * the restore notes (unmatched tags, pronoun notes) are listed under the note.
 */
export function renderFinishedZone(state: AppState, h?: Handlers): HTMLElement {
  const f = state.finished;
  const held = f?.copyHeld === true;
  const copy = button(strings.actions.copy, nextStep(state) === "copy" && !held ? "primary" : "secondary", {
    id: "copy",
    disabled: f === null || held,
    reason: held ? strings.drafting.copyHeld : strings.emptyFinished,
  });
  if (h?.onCopyFinished) copy.addEventListener("click", () => h.onCopyFinished!());
  const notes = f?.notes ?? [];
  const flagPrefix = strings.drafting.notPutBack.split("{what}")[0]!;
  // An open flag is a "Not put back" line: it stands in the failure colour with the crossed octagon and words.
  const putBack = (f?.added ?? []).map((a) => {
    const b = button(`${strings.drafting.putBack} ${a.name}`, "secondary", { id: `put-back-${a.tag.replace(/\W+/g, "-")}` });
    b.setAttribute("data-put-back", a.tag);
    if (h?.onRestoreAdded) b.addEventListener("click", () => h.onRestoreAdded!(a.tag));
    return b;
  });
  return el(
    "section",
    { class: "zone zone-finished", "data-zone": "finished", "aria-labelledby": "zone-finished-title" },
    el("h2", { id: "zone-finished-title" }, strings.zones.finished),
    el(
      "div",
      { class: "sheet", "data-sheet": "", ...(f ? { "data-repaired-marks": String(f.repairedMarks ?? 0) } : {}) },
      f ? finishedMark(f.source, f.connected, f.namesRestored) : null,
      f ? el("p", { class: "sheet-text" }, f.text) : el("p", { class: "sheet-empty" }, state.record !== null ? strings.finishedNext : strings.emptyFinished),
      f?.shortLine ? el("p", { class: "sheet-short", "data-short-draft": "" }, f.shortLine) : null,
      notes.length > 0
        ? el(
            "div",
            { class: "sheet-notes", "data-note": "" },
            el("p", { class: "sheet-notes-title" }, strings.drafting.notesTitle),
            el(
              "ul",
              {},
              ...notes.map((n) =>
                n.startsWith(flagPrefix)
                  ? el("li", { class: "error", "data-tag-not-matched": "", role: "alert" }, svg(iconSvg("crossedOctagon")), el("span", {}, n))
                  : el("li", {}, n),
              ),
            ),
          )
        : null,
    ),
    held ? el("p", { class: "error", "data-copy-held": "" }, svg(iconSvg("crossedOctagon")), el("span", {}, strings.drafting.copyHeld)) : null,
    el("div", { class: "actions" }, ...putBack, copy),
    renderReaderPanel(state, h),
  );
}
