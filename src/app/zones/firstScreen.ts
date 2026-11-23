import { el } from "../dom";
import { button } from "../parts/button";
import { modelDownload } from "../parts/modelProgress";
import { currentStep, STEPS, stepShape } from "../parts/steps";
import { requestsOn } from "../ledgerCount";
import { fill, strings } from "../strings";
import type { AppState, Handlers } from "../state";

const STEP_LINES = [
  ["note", strings.steps.note, strings.firstRun.stepNote],
  ["record", strings.steps.record, strings.firstRun.stepRecord],
  ["masks", strings.steps.masks, strings.firstRun.stepMasks],
  ["send", strings.steps.send, strings.firstRun.stepSend],
  ["finished", strings.steps.finished, strings.firstRun.stepFinished],
] as const;

/** Cold open: the device on one side, what leaves on the other, then the five steps. */
export function renderFirstScreen(state: AppState, h: Handlers): HTMLElement {
  const s = strings.firstRun;
  const requests = requestsOn(state.ledger?.entries);
  const now = currentStep(state);
  const at = STEPS.indexOf(now);
  const tryIt = button(s.tryExample, "primary", { id: "try-example", icon: "eye" });
  tryIt.addEventListener("click", () => h.onTryExample());
  const start = button(s.startVisit, "secondary", { id: "start-visit" });
  start.addEventListener("click", () => h.onStartVisit?.());

  return el(
    "main",
    { class: "screen first-screen", id: "tool", "data-first-screen": "" },
    el(
      "div",
      { class: "first-planes" },
      el(
        "section",
        { class: "first-plane", "data-plane": "device" },
        el("p", { class: "first-plane-label" }, s.planeDevice),
        el("h1", { class: "first-sentence" }, s.sentence),
        el("div", { class: "first-actions" }, tryIt, start),
        state.network === "offline" ? el("p", { class: "offline-line", role: "status", "data-offline-line": "" }, strings.offline) : null,
        state.device.state === "downloading" ? modelDownload(state.device.percent) : null,
      ),
      el(
        "section",
        { class: "first-plane", "data-plane": "leaves" },
        el("p", { class: "first-plane-label" }, strings.zones.leaves),
        el("p", { class: "first-left" }, s.nothingLeft),
        el("p", { class: "first-left" }, fill(s.requestsBefore, { n: requests })),
        el("p", { class: "first-left" }, s.destination),
      ),
    ),
    el(
      "ol",
      { class: "first-steps" },
      ...STEP_LINES.map(([key, name, line], i) =>
        el(
          "li",
          {
            class: `first-step${i === at ? " current" : ""}`,
            "data-first-step": key,
            "aria-current": i === at ? "step" : undefined,
          },
          stepShape(i < at ? "done" : i === at ? "current" : "todo"),
          el("span", { class: "first-step-name" }, name),
          el("span", { class: "first-step-line" }, line),
        ),
      ),
    ),
  );
}
