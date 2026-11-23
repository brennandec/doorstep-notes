import { strings } from "../strings";
import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import type { InferenceSource } from "../../inference/types";

/**
 * Source label, top right of every result. The text comes from inferenceSource.
 * "on this device": outlined pill with a laptop outline.
 * "in the cloud": filled block with a cloud outline. The shapes differ, not only the fill.
 * A double result also shows "off".
 */
export function sourceLabel(source: InferenceSource, connected: boolean): HTMLElement {
  const device = source === "ON_DEVICE";
  const pill = el(
    "span",
    { class: `source-label ${device ? "device" : "cloud"}`, "data-source": source },
    svg(iconSvg(device ? "laptop" : "cloud")),
    el("span", {}, device ? strings.source.onDevice : strings.source.inCloud),
  );
  if (connected) return pill;
  return el(
    "span",
    { class: "source-labels" },
    pill,
    el("span", { class: "source-label device not-connected", "data-source": "not-connected" }, el("span", {}, strings.source.notConnected)),
  );
}

/**
 * The mark on the finished note (drafting R13, sixth review R5). While the cloud is off a fixed sample
 * answered, so the note carries one mark, "names put back on this device; draft text is a fixed sample:
 * cloud off", and not "in the cloud" beside "off". The mark says both facts so a restored
 * name beside it is not read as a leak. A note from the device keeps "on this device". Once connected the
 * note carries one mark, the inference source: "in the cloud" or "on this device". A restored name does
 * not add a second mark.
 */
export function finishedMark(source: InferenceSource, connected: boolean, namesRestored?: boolean): HTMLElement {
  void namesRestored;
  if (!connected && source !== "ON_DEVICE") {
    return el(
      "span",
      { class: "source-label device test-double", "data-source": "test-double" },
      svg(iconSvg("cloud", { struck: true })),
      el("span", {}, strings.source.testDouble),
    );
  }
  return sourceLabel(source, true);
}
