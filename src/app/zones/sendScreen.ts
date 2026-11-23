// The send step: what would leave, and the listed-name block when a listed name is in that text.
// The record rows stay on the masks step. This screen does not paint the check's longer card.
import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import { button } from "../parts/button";
import { dateClueNodes } from "../parts/dateClue";
import { blockLine } from "../parts/blockLine";
import { renderSteps } from "../parts/steps";
import { noticeFor } from "../sendNotice";
import { requestsOn } from "../ledgerCount";
import { fill, strings } from "../strings";
import type { AppState, Handlers } from "../state";
import { sendEnabled } from "./leaves";

/** The send step before the record rows are open, once a draft has been asked for. */
export function isQuietSend(state: AppState): boolean {
  return state.recordOpen === false
    && state.record !== null
    && state.finished === null
    && state.outgoingText !== ""
    && !state.previewOnly
    && state.error === null
    && !state.working
    && !state.waiting
    && !state.draftGate
    && state.noDraft === null
    && state.confirmClear === null
    && !state.confirmReplace
    && !state.reader.pending
    && !state.reader.asking
    && state.reader.result === null
    && state.reader.line === null;
}

export function renderSendStep(state: AppState, h: Handlers): HTMLElement {
  const s = strings;
  const offline = state.network === "offline";
  const blocked = state.egressLines?.kind === "blocked";
  const notice = noticeFor(state.cloud, state.tier);
  const sendDisabled = !sendEnabled({
    offline,
    hasText: state.outgoingText !== "" && !state.previewOnly,
    noticeShown: notice !== "",
    blocked,
    busy: state.drafting || state.reader.asking,
  });
  const send = button(s.actions.send, "primary", { id: "send", icon: "arrowCrossingLine", disabled: sendDisabled });
  if (h.onSend) send.addEventListener("click", () => h.onSend!());

  let tryListed: HTMLElement | null = null;
  if (state.example && state.record !== null && state.outgoingText !== "" && !blocked && h.onTryListed) {
    const b = button(s.egress.tryListed, "secondary", { id: "try-listed", disabled: state.drafting || state.finished !== null });
    b.addEventListener("click", () => h.onTryListed!());
    tryListed = el("div", { class: "try-listed", "data-try-listed": "" }, b, el("span", { class: "try-listed-help" }, s.egress.tryListedHelp));
  }

  const requests = requestsOn(state.ledger?.entries);
  const bytes = new TextEncoder().encode(state.outgoingText).length;
  const exactLabel = state.exactOpen ? s.firstRun.hideExact : fill(s.firstRun.showExact, { n: bytes });
  const exact = button(exactLabel, "secondary", { id: "show-exact" });
  exact.addEventListener("click", () => h.onToggleExact?.());
  const exactText = el("div", { class: "send-text", "data-outgoing": "", id: "exact-text", hidden: state.exactOpen ? false : true }, state.outgoingText);
  const root = el(
    "main",
    { class: "screen send-step", id: "tool", "data-send-step": "" },
    el("h1", { class: "sr-only" }, strings.zones.leaves),
    renderSteps(state),
    el(
      "section",
      { class: "send-col", "data-send-col": "leaves" },
      el("h2", {}, s.zones.leaves),
      ...dateClueNodes(state.outgoingText, h.onMaskClue),
      blockLine(state.egressLines, h.onMaskBlocked),
      tryListed,
      state.drafting ? el("p", { class: "working", "data-working": "", role: "status" }, s.drafting.working) : null,
      el("p", { class: "send-notice", "data-send-notice": "" }, notice),
      offline ? el("p", { class: "offline-line", role: "status" }, s.cloudDisabledReason) : null,
      state.cloudStatus?.kind === "refused"
        ? el("p", { class: "error refused-line", role: "status", "data-refused-line": "" }, svg(iconSvg("crossedOctagon")), el("span", {}, s.cloud.browserRefusedDraft))
        : null,
      el("p", { class: "send-meta" }, fill(s.firstRun.requestsBefore, { n: requests })),
      el("p", { class: "send-meta" }, s.firstRun.destination),
      el("div", { class: "actions" }, send, exact),
      exactText,
    ),
  );
  root.querySelectorAll(".chip-state").forEach((node) => node.classList.add("sr-only"));
  return root;
}
