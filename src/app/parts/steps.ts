// The line of five steps at the top of zone 1 (shell-and-offline R20.1, R20.2, direction U3).
// Ordered list with an accessible name. The current step is marked in words and in shape.
// Ink only: it adds no colour.
import { ICON_STROKE_PX } from "../../constants";
import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import type { AppState } from "../state";
import { fill, strings } from "../strings";

export const STEPS = ["note", "record", "masks", "send", "finished"] as const;
export type StepName = (typeof STEPS)[number];

/**
 * Where she is. Note when there is no note; Record when a note exists and no record does; Masks when a
 * record exists and no draft has been asked for; Send from the moment a draft is asked for until the
 * finished note exists; Finished when it does. A record made by hand with no note starts at Masks.
 */
export function currentStep(s: AppState): StepName {
  if (s.finished !== null) return "finished";
  if (s.record !== null) return s.outgoingText !== "" && !s.previewOnly ? "send" : "masks";
  return s.noteText.trim() !== "" || s.photo !== null ? "record" : "note";
}

const marker = (kind: "filled" | "outlined"): Element =>
  svg(
    `<svg class="icon step-shape" data-icon="step-${kind}" viewBox="0 0 24 24" width="24" height="24" ` +
      `stroke="currentColor" stroke-width="${ICON_STROKE_PX}" fill="${kind === "filled" ? "currentColor" : "none"}" aria-hidden="true" focusable="false">` +
      `<circle cx="12" cy="12" r="7"/></svg>`,
  );

/** The one step mark: filled for the current step, outlined for a later one, the check when it is done. */
export function stepShape(place: "done" | "current" | "todo" | "stopped"): Element {
  if (place === "stopped") return svg(iconSvg("crossedOctagon"));
  if (place === "done") return svg(iconSvg("check"));
  return marker(place === "current" ? "filled" : "outlined");
}

export function renderSteps(state: AppState): HTMLElement {
  const now = currentStep(state);
  const at = STEPS.indexOf(now);
  const items = STEPS.map((name, i) => {
    const current = i === at;
    const done = i < at;
    const word = strings.steps[name];
    // A block (egress-check R15.3): Send shows as stopped, in words and in shape (the crossed octagon).
    const stopped = name === "send" && state.egressLines?.kind === "blocked";
    // "Step N of 5:" stays in the page for assistive technology and is drawn hidden, so the line fits on one
    // row (shell-and-offline R35.3). The current step is marked in shape and in weight.
    const count = current ? el("span", { class: "step-count sr-only" }, fill(strings.steps.count, { n: i + 1, total: STEPS.length })) : null;
    return el(
      "li",
      {
        class: `step ${current ? "current" : done ? "done" : "todo"}${stopped ? " stopped" : ""}`,
        "data-stopped": stopped ? "" : undefined,
        "data-step": name,
        "aria-current": current ? "step" : undefined,
      },
      stepShape(stopped ? "stopped" : done ? "done" : current ? "current" : "todo"),
      el("span", { class: "step-text" }, count, word, stopped ? strings.steps.stopped : null),
      // A finished step says so in words for assistive technology.
      done ? el("span", { class: "sr-only" }, ` ${strings.steps.finishedMark}`) : null,
    );
  });
  return el("ol", { class: "steps", "data-steps": "", "aria-label": strings.steps.name }, ...items);
}
