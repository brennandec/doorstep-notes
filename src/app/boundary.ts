import { el, svg } from "./dom";
import { iconSvg } from "./icons";
import { strings } from "./strings";

/** The labelled rule between this device and the cloud. Vertical at 1100 px and wider, horizontal below. */
export function renderBoundary(): HTMLElement {
  return el(
    "div",
    { class: "boundary", role: "separator", "data-boundary": "" },
    el("span", { class: "label label-device" }, svg(iconSvg("laptop")), el("span", {}, strings.boundary.device)),
    el("span", { class: "rule" }),
    el("span", { class: "label label-cloud" }, svg(iconSvg("cloud")), el("span", {}, strings.boundary.cloud)),
  );
}
