// The finished-note slot. The five headings are the record fields. The prose under
// each one is the draft when it has five parts, otherwise the record lines.
// Copy and the .txt file are that same plain text.
import { el } from "../dom";
import { button } from "../parts/button";
import { receiptFacts } from "../parts/receiptFacts";
import { finishedMark } from "../parts/sourceLabel";
import { renderSteps } from "../parts/steps";
import { xrayPanel } from "../parts/xrayPanel";
import { requestsOn } from "../ledgerCount";
import { CASE_HEADINGS, casePartsFor, partsFromRecord, plainCaseNote, repairCasePart, type CaseParts } from "../../drafting/caseNote";
import { fill, strings } from "../strings";
import type { AppState, Handlers } from "../state";

/** The finished step before the record rows are open. */
export function isQuietFinished(state: AppState): boolean {
  return state.recordOpen === false
    && state.finished !== null
    && state.error === null
    && !state.drafting
    && state.confirmClear === null
    && !state.confirmReplace;
}

function downloadNote(text: string): void {
  const file = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "note.txt";
  link.click();
  URL.revokeObjectURL(url);
}

function part(title: string, prose: string): HTMLElement {
  const lines = prose.split(/\n/).map((line) => line.trim()).filter((line) => line !== "");
  return el(
    "section",
    { class: "case-part", "data-case-part": title },
    el("h3", {}, title),
    ...lines.map((line) => el("p", {}, line)),
  );
}

function partsOf(state: AppState): CaseParts {
  const parts = casePartsFor(state.finished?.text, state.record);
  const recordParts = state.record === null
    ? { purpose: "", observed: "", agreed: "", risks: "", next: "" }
    : partsFromRecord(state.record);
  const note = state.noteText;
  return {
    purpose: repairCasePart(parts.purpose, note, recordParts.purpose),
    observed: repairCasePart(parts.observed, note, recordParts.observed),
    agreed: repairCasePart(parts.agreed, note, recordParts.agreed),
    risks: repairCasePart(parts.risks, note, recordParts.risks),
    next: repairCasePart(parts.next, note, recordParts.next),
  };
}

export function renderFinishedStep(state: AppState, h: Handlers): HTMLElement {
  const f = state.finished;
  const parts = partsOf(state);
  const plain = plainCaseNote(parts);
  const held = f?.copyHeld === true;
  const copy = button(strings.actions.copy, "secondary", {
    id: "copy",
    disabled: f === null || held,
    reason: held ? strings.drafting.copyHeld : strings.emptyFinished,
  });
  if (h.onCopyCaseNote && f !== null && !held) copy.addEventListener("click", () => h.onCopyCaseNote!(plain));
  const download = button(strings.caseNote.download, "secondary", { id: "download-txt", disabled: f === null || held });
  if (f !== null && !held) download.addEventListener("click", () => downloadNote(plain));
  const requests = requestsOn(state.ledger?.entries);
  const facts = f ? receiptFacts(f, state.ledger?.entries) : null;
  const toggle = button(state.xrayOpen ? strings.xray.close : strings.xray.open, "secondary", { id: "xray" });
  toggle.addEventListener("click", () => h.onToggleXray?.());
  const panel = state.xrayOpen ? xrayPanel(state.ledger?.entries ?? [], state.ledger?.ms) : null;
  const root = el(
    "main",
    { class: "screen finished-step", id: "tool", "data-finished-step": "" },
    el("h1", { class: "sr-only" }, strings.zones.finished),
    renderSteps(state),
    el("div", { class: "xray-bar" }, toggle),
    panel,
    el(
      "article",
      { class: "case-note", "data-case-note": "" },
      el("h2", {}, strings.zones.finished),
      state.example ? el("span", { class: "mark", "data-mark": "example" }, strings.firstRun.exampleMark) : null,
      parts.purpose.trim() === "" ? null : part(CASE_HEADINGS[0], parts.purpose),
      part(CASE_HEADINGS[1], parts.observed),
      part(CASE_HEADINGS[2], parts.agreed),
      part(CASE_HEADINGS[3], parts.risks),
      part(CASE_HEADINGS[4], parts.next),
      el("div", { class: "actions" }, copy, download),
      el(
        "section",
        { class: "receipt-card", "data-receipt": "" },
        el("h3", {}, strings.caseNote.receipt),
        f ? finishedMark(f.source, f.connected, f.namesRestored) : null,
        el("p", {}, fill(strings.firstRun.requestsBefore, { n: requests })),
        facts ? el("p", { "data-receipt-sent": "" }, facts.sent) : null,
        facts ? el("p", { "data-receipt-produced": "" }, facts.produced) : null,
      ),
    ),
  );
  return root;
}
