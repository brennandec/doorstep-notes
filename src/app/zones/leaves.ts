import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import { button } from "../parts/button";
import { dateClueNodes } from "../parts/dateClue";
import { blockLine } from "../parts/blockLine";
import { egressLine } from "../parts/egressLine";
import { noticeFor } from "../sendNotice";
import { fill, strings } from "../strings";
import { nextStep, type AppState, type Handlers } from "../state";
import { ledgerPanel } from "../parts/ledgerPanel";
import { sourceLabel } from "../parts/sourceLabel";
import { selectableSentences } from "../../drafting/sentences";

/** Send needs text, the notice on screen, a connection, no block from the preview check, and no draft running. */
export function sendEnabled(input: {
  offline: boolean;
  hasText: boolean;
  noticeShown: boolean;
  blocked: boolean;
  busy?: boolean;
}): boolean {
  return !input.offline && input.hasText && input.noticeShown && !input.blocked && input.busy !== true;
}

/**
 * The outgoing text in the monospace block. Each sentence of the masked record part can be selected
 * with the pointer or the keyboard (drafting R10.1). The wrapping adds no text: the block's text is the
 * string given to the job, character for character.
 */
function outgoingBlock(state: AppState, h?: Handlers): HTMLElement {
  const text = state.outgoingText;
  const pre = el("pre", { class: "outgoing", "data-outgoing": "" });
  const canSelect =
    h?.onSelectSentence !== undefined && state.record !== null && !state.drafting && !state.reader.pending && state.finished === null &&
    state.rewrite.pending === null && !state.rewrite.working;
  const ranges = canSelect ? selectableSentences(text) : [];
  if (text === "") {
    pre.append(strings.emptyOutgoing);
    return pre;
  }
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) pre.append(text.slice(at, r.start));
    const selected = state.selectedSentence === r.start;
    const span = el(
      "span",
      {
        class: selected ? "sentence selected" : "sentence",
        id: `sentence-${r.start}`,
        role: "button",
        tabindex: "0",
        "aria-pressed": selected ? "true" : "false",
        "aria-label": fill(strings.drafting.sentenceLabel, { what: r.text }),
        "data-sentence": String(r.start),
      },
      r.text,
    );
    const toggle = () => h!.onSelectSentence!(selected ? null : r.start);
    span.addEventListener("click", toggle);
    span.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggle();
    });
    pre.append(span);
    at = r.end;
  }
  if (at < text.length) pre.append(text.slice(at));
  return pre;
}

/** "Shorter" and "Plainer" for the selected sentence, and what the last press did. */
function rewriteControls(state: AppState, h?: Handlers): (HTMLElement | null)[] {
  const d = strings.drafting;
  const out: (HTMLElement | null)[] = [];
  if (state.selectedSentence !== null && h?.onRewrite) {
    const shorter = button(d.rewriteShorter, "secondary", { id: "rewrite-shorter", disabled: state.rewrite.working });
    const plainer = button(d.rewritePlainer, "secondary", { id: "rewrite-plainer", disabled: state.rewrite.working });
    shorter.addEventListener("click", () => h.onRewrite!("shorter"));
    plainer.addEventListener("click", () => h.onRewrite!("plainer"));
    out.push(
      el(
        "div",
        { class: "rewrite-controls", role: "group", "aria-label": d.sentenceGroup, "data-rewrite-controls": "" },
        el("span", { class: "rewrite-selected" }, d.sentenceSelected),
        el("div", { class: "actions" }, shorter, plainer),
      ),
    );
  }
  const r = state.rewrite;
  if (r.working) out.push(el("p", { class: "working", role: "status", "data-rewrite-working": "" }, d.rewriteWorking));
  if (r.pending) out.push(el("p", { class: "rewrite-wait", role: "status", "data-rewrite-wait": "" }, d.rewriteWaitsForSend));
  if (r.line) out.push(el("p", { class: "rewrite-line", role: "status", "data-rewrite-line": "" }, r.line));
  if ((r.skipped ?? 0) > 0) {
    const n = r.skipped!;
    out.push(
      el(
        "p",
        { class: "rewrite-skipped", role: "status", "data-rewrite-skipped": "" },
        fill(n === 1 ? d.rewriteSkippedOne : d.rewriteSkippedMany, { n: String(n) }),
      ),
    );
  }
  if (r.result) {
    out.push(
      el("div", { class: "rewrite-result", "data-rewrite-result": "" }, sourceLabel(r.result.source, r.result.connected), el("span", {}, d.rewriteDone)),
    );
  }
  return out;
}

/** The question beside Draft when a finished note is already on the page. Escape keeps it. */
function replacePanel(h?: Handlers): HTMLElement {
  const yes = el("button", { type: "button", class: "btn secondary", id: "replace-yes", "data-kind": "secondary" }, el("span", {}, strings.drafting.replaceYes));
  const no = el("button", { type: "button", class: "btn secondary", id: "replace-no", "data-kind": "secondary" }, el("span", {}, strings.drafting.replaceNo));
  yes.addEventListener("click", () => h?.onConfirmReplace?.());
  no.addEventListener("click", () => h?.onCancelReplace?.());
  const box = el(
    "div",
    { class: "clear-panel", role: "group", "aria-labelledby": "replace-ask", "data-replace-panel": "" },
    el("p", { id: "replace-ask", "data-replace-ask": "" }, strings.drafting.askReplace),
    el("div", { class: "actions" }, yes, no),
  );
  box.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape") {
      e.stopPropagation();
      h?.onCancelReplace?.();
    }
  });
  return box;
}

/**
 * Zone 2, "What leaves": the exact outgoing text in the monospace block, the send
 * notice, the Draft and Send controls, and the egress check line fixed last.
 */
export function renderLeavesZone(state: AppState, h?: Handlers): HTMLElement {
  const s = strings;
  const offline = state.network === "offline";
  const hasText = state.outgoingText !== "";
  const notice = noticeFor(state.cloud, state.tier);
  const noticeShown = notice !== "";
  const blocked = state.egressLines?.kind === "blocked";
  const reason = !noticeShown ? s.sendNeedsNotice : offline ? s.cloudDisabledReason : blocked ? s.sendBlocked : s.sendNotReady;

  const step = nextStep(state);
  const draftDisabled = state.record === null || state.drafting;
  const draft = button(s.actions.draft, step === "draft" ? "primary" : "secondary", {
    id: "draft",
    disabled: draftDisabled,
    reason: s.drafting.needsRecord,
  });
  // H35a D6: while a second reader request waits for Send, the same control says whom it sends to.
  const readerWaits = state.reader.pending && !state.reader.asking;
  const sendDisabled = !sendEnabled({ offline, hasText: hasText && !state.previewOnly, noticeShown, blocked, busy: state.drafting || state.reader.asking });
  const send = button(readerWaits ? s.actions.sendToReader : s.actions.send, step === "send" ? "primary" : "secondary", {
    id: "send",
    icon: "arrowCrossingLine",
    disabled: sendDisabled,
    reason,
  });
  const leavesReasons: string[] = [];
  if (draftDisabled && !state.drafting) leavesReasons.push(s.drafting.needsRecord);
  if (state.draftGate) leavesReasons.push(s.masking.resolveBeforeDraft);
  if (!state.draftGate && sendDisabled && !state.drafting && !state.reader.asking && !blocked && !offline && !leavesReasons.includes(reason)) {
    leavesReasons.push(reason);
  }
  const leavesReaderPrepared = readerWaits
    ? el("span", { class: "leaves-reader-prepared", "data-leaves-reader-prepared": "", role: "status" }, s.secondReader.leavesPrepared)
    : null;
  if (h?.onDraft) draft.addEventListener("click", () => h.onDraft!());
  if (h?.onSend) send.addEventListener("click", () => h.onSend!());

  let deviceDraft: HTMLElement | null = null;
  if (state.offerDeviceDraft) {
    deviceDraft = button(s.cloud.deviceDraft, "secondary", { id: "device-draft", icon: "laptop", disabled: state.drafting });
    if (h?.onDeviceDraft) deviceDraft.addEventListener("click", () => h.onDeviceDraft!());
  }

  let noDraft: HTMLElement | null = null;
  if (state.noDraft) {
    const copy = button(s.drafting.copyMasked, "secondary", { id: "copy-masked" });
    if (h?.onCopyMasked) copy.addEventListener("click", () => h.onCopyMasked!());
    noDraft = el("div", { class: "no-draft" }, el("p", { "data-no-draft": "", role: "status" }, state.noDraft.line), copy);
  }

  // The invented visit only: one press unmasks one listed name, so a first-time reader meets the block (egress-check R15.4).
  let tryListed: HTMLElement | null = null;
  if (state.example && state.record !== null && hasText && !blocked && h?.onTryListed) {
    const b = button(s.egress.tryListed, "secondary", { id: "try-listed", disabled: state.drafting || state.finished !== null });
    b.addEventListener("click", () => h.onTryListed!());
    tryListed = el("div", { class: "try-listed", "data-try-listed": "" }, b, el("span", { class: "try-listed-help" }, s.egress.tryListedHelp));
  }

  // Hosted-cloud R5 (order H52): when the browser check turned the cloud away, the line is under Send, where the
  // press happened. The state is "the cloud did not accept this browser", for a draft and for a second reader alike,
  // so the sentence is cloud.browserRefusedDraft, whole and saying what is kept, not the lower-case status-bar words
  // (status.cloudBrowserRefused), which are a fragment. A status line, not an alert: the note column holds the alert.
  const refusedLine =
    state.cloudStatus?.kind === "refused"
      ? el("p", { class: "error refused-line", role: "status", "data-refused-line": "" }, svg(iconSvg("crossedOctagon")), el("span", {}, s.cloud.browserRefusedDraft))
      : null;

  return el(
    "section",
    { class: "zone zone-leaves", "data-zone": "leaves", "aria-labelledby": "zone-leaves-title" },
    el("h2", { id: "zone-leaves-title" }, s.zones.leaves),
    outgoingBlock(state, h),
    ...dateClueNodes(state.outgoingText, h?.onMaskClue),
    tryListed,
    ...rewriteControls(state, h),
    noticeShown ? el("p", { class: "send-notice", "data-send-notice": "" }, notice) : null,
    state.drafting ? el("p", { class: "working", "data-working": "", role: "status" }, s.drafting.working) : null,
    noDraft,
    el("div", { class: "actions" }, draft, send, deviceDraft, leavesReaderPrepared),
    state.confirmReplace ? replacePanel(h) : null,
    refusedLine,
    leavesReasons.length > 0
      ? el(
          "p",
          {
            class: "control-reason",
            "data-control-reason": "leaves",
            ...(state.draftGate ? { "data-draft-reason": "", role: "status" } : {}),
          },
          leavesReasons.join(" "),
        )
      : null,
    blockLine(state.egressLines, h?.onMaskBlocked),
    offline ? el("p", { class: "offline-line", role: "status" }, s.cloudDisabledReason) : null,
    // Last child of the zone: the egress check line. It ends in the two folds, the scan words and the ledger (R39.1).
    egressLine(
      state.egressLines,
      { open: state.unfolded.scans, onToggle: h?.onToggleFold ? () => h.onToggleFold!("scans") : undefined },
      state.ledger
        ? ledgerPanel(
            { entries: state.ledger.entries },
            { open: state.unfolded.ledger, onToggle: h?.onToggleFold ? () => h.onToggleFold!("ledger") : undefined },
          )
        : null,
    ),
  );
}
