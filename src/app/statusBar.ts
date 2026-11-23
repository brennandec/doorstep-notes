import { TAGLINE, WORKING_TITLE } from "../constants";
import type { DeviceModelState } from "../inference/types";
import { el, svg } from "./dom";
import type { Halves } from "./halves";
import type { CloudStatusView } from "./cloudStatus";
import { iconSvg, type IconName } from "./icons";
import { fill, strings } from "./strings";

export interface StatusInput {
  network: "online" | "offline";
  device: { state: DeviceModelState; percent?: number; starting?: boolean; didNotStart?: boolean; noAnswer?: boolean };
  /** the cloud switch (AI_SERVICE_ENABLED) */
  cloud: boolean;
  /** the cloud state derived from the config and the last call; when given, its words are shown (hosted-cloud R4) */
  cloudStatus?: CloudStatusView;
  /** the two halves in one sentence each (R29.2); left out when not given */
  halves?: Halves;
  /** Cold first screen leaves the tagline off. The visit screen keeps it. */
  omitTagline?: boolean;
}

export interface StateView {
  key: "network" | "device" | "cloud";
  label: string;
  words: string;
  icon: IconName;
  struck: boolean;
}

/** Network, device model and cloud are separate; each is an icon and words, never colour alone. */
export function statesOf(input: StatusInput): StateView[] {
  const s = strings.status;
  const d = input.device;
  const deviceWords =
    d.state === "available" ? s.deviceReady
    : d.state === "downloading" ? fill(s.deviceDownloading, { percent: Math.round(d.percent ?? 0) })
    : d.starting ? s.deviceStarting
    : d.noAnswer ? s.deviceNoAnswer
    : d.didNotStart ? s.deviceDidNotStart
    : d.state === "downloadable" ? s.deviceDownloadable
    : s.deviceAbsent;
  return [
    { key: "network", label: s.networkLabel, words: input.network === "online" ? s.online : s.offline, icon: "arrowCrossingLine", struck: input.network === "offline" },
    { key: "device", label: s.deviceLabel, words: deviceWords, icon: "laptop", struck: false },
    cloudWords(input),
  ];
}

function cloudWords(input: StatusInput): StateView {
  const s = strings.status;
  const offline = input.network === "offline";
  if (input.cloudStatus) {
    const c = input.cloudStatus;
    // Offline, a configured cloud cannot be reached: never "connected" (H20 R3).
    if (offline && c.kind !== "not-configured") return { key: "cloud", label: s.cloudLabel, words: s.cloudUnreachable, icon: "cloud", struck: true };
    return { key: "cloud", label: s.cloudLabel, words: c.words, icon: "cloud", struck: c.kind !== "connected" };
  }
  if (offline && input.cloud) return { key: "cloud", label: s.cloudLabel, words: s.cloudUnreachable, icon: "cloud", struck: true };
  return { key: "cloud", label: s.cloudLabel, words: input.cloud ? s.cloudConnected : s.cloudNotConnected, icon: "cloud", struck: !input.cloud };
}

export function renderStatusBar(input: StatusInput): HTMLElement {
  const items = statesOf(input).map((v) =>
    el(
      "li",
      { class: "state", "data-state": v.key },
      svg(iconSvg(v.icon, { struck: v.struck })),
      el("span", { class: "state-label" }, `${v.label}:`),
      el("span", { class: "state-words" }, v.words),
    ),
  );
  return el(
    "header",
    { class: "status-bar", role: "banner" },
    el(
      "div",
      { class: "left" },
      el("span", { class: "name" }, WORKING_TITLE),
      input.omitTagline ? null : el("span", { class: "tagline" }, TAGLINE),
    ),
    el("ul", { class: "states", "aria-label": "Status" }, ...items),
    input.halves !== undefined &&
      el("p", { class: "halves", "data-halves": "" }, el("span", {}, input.halves.device), " ", el("span", {}, input.halves.cloud)),
  );
}
