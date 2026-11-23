import { renderBoundary } from "./boundary";
import { renderKeptFooter } from "./parts/clearPanel";
import { el } from "./dom";
import { halvesSentences } from "./halves";
import { standingStatements } from "./standing";
import { strings } from "./strings";
import { renderStatusBar } from "./statusBar";
import { currentStep } from "./parts/steps";
import { isColdFirst, type AppState, type Handlers } from "./state";
import { renderFirstScreen } from "./zones/firstScreen";
import { isQuietMasks, renderMasksStep } from "./zones/masksScreen";
import { isQuietSend, renderSendStep } from "./zones/sendScreen";
import { isQuietFinished, renderFinishedStep } from "./zones/finishedScreen";
import { renderFinishedZone } from "./zones/finished";
import { renderLeavesZone } from "./zones/leaves";
import { renderNoteZone } from "./zones/note";

/** The footer link to the notices file the build copies into the site (shell-and-offline R38.2). */
export function noticesLink(): HTMLElement {
  return el("p", { class: "notices", "data-notices": "" }, el("a", { class: "notices-link", href: `/${strings.notices.file}`, target: "_blank", rel: "noopener" }, strings.notices.link));
}

/** The one screen: status bar, then the tool (three zones with the boundary), then the standing statements. */
export function renderScreen(state: AppState, h: Handlers): HTMLElement[] {
  if (isColdFirst(state)) {
    const first = renderFirstScreen(state, h);
    first.append(noticesLink());
    return [
      renderStatusBar({
        network: state.network,
        device: state.device,
        cloud: state.cloud,
        ...(state.cloudStatus ? { cloudStatus: state.cloudStatus } : {}),
        omitTagline: true,
      }),
      first,
    ];
  }
  if (isQuietMasks(state) && currentStep(state) === "masks") {
    return [
      renderStatusBar({
        network: state.network,
        device: state.device,
        cloud: state.cloud,
        ...(state.cloudStatus ? { cloudStatus: state.cloudStatus } : {}),
        omitTagline: true,
      }),
      renderMasksStep(state, h),
    ];
  }
  if (isQuietFinished(state) && currentStep(state) === "finished") {
    return [
      renderStatusBar({
        network: state.network,
        device: state.device,
        cloud: state.cloud,
        ...(state.cloudStatus ? { cloudStatus: state.cloudStatus } : {}),
        omitTagline: true,
      }),
      renderFinishedStep(state, h),
    ];
  }
  if (isQuietSend(state) && currentStep(state) === "send") {
    return [
      renderStatusBar({
        network: state.network,
        device: state.device,
        cloud: state.cloud,
        ...(state.cloudStatus ? { cloudStatus: state.cloudStatus } : {}),
        omitTagline: true,
      }),
      renderSendStep(state, h),
    ];
  }
  const standing = standingStatements({ results: state.results, aiServiceEnabled: state.cloud, tier: state.tier });
  const lines = [standing.writingAid, ...(standing.h2Line ? [standing.h2Line] : []), ...standing.cloudLines];
  return [
    renderStatusBar({
      network: state.network,
      device: state.device,
      cloud: state.cloud,
      ...(state.cloudStatus ? { cloudStatus: state.cloudStatus } : {}),
      halves: halvesSentences({
        aiServiceEnabled: state.cloud,
        results: state.results,
        offline: state.network === "offline",
        cloudRefused: state.cloudStatus?.kind === "refused",
        cloudFailed: state.cloudStatus?.kind === "failed",
      }),
    }),
    el(
      "main",
      { class: "screen", id: "tool" },
      el("h1", { class: "sr-only" }, strings.zones.note),
      renderNoteZone(state, h),
      renderBoundary(),
      renderLeavesZone(state, h),
      renderFinishedZone(state, h),
    ),
    el("footer", { class: "standing", "data-standing": "" }, ...lines.map((t) => el("p", {}, t)), renderKeptFooter(state, h), noticesLink()),
  ];
}
