// The download slot. WO-11 owns the size and the live feed. This paints the percent the page already has.
import { el } from "../dom";
import { fill, strings } from "../strings";

export function modelDownload(percent: number | undefined): HTMLElement {
  const label = fill(strings.firstRun.downloadingModel, { percent: Math.round(percent ?? 0) });
  const value = String(Math.max(0, Math.min(100, Math.round(percent ?? 0))));
  return el(
    "div",
    { class: "model-download", "data-model-download": "" },
    el("p", { class: "model-progress", role: "status" }, label),
    el("progress", { class: "model-bar", max: "100", value, "aria-label": label }),
  );
}
