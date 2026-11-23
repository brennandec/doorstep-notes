import { el } from "../dom";
import { fill, strings } from "../strings";
import { fold, type FoldOptions } from "./fold";
import type { LedgerEntry, LedgerRequest } from "../../egress/ledger";

function offPageCell(requests: readonly LedgerRequest[]): HTMLElement {
  if (requests.length === 0) return el("td", { "data-ledger-requests": "" }, "none");
  const children: (HTMLElement | string)[] = [];
  requests.forEach((row, index) => {
    if (index > 0) children.push("; ");
    children.push(el(
      "span",
      {
        "data-ledger-request": "",
        "data-host": row.host,
        "data-bytes": String(row.bytes),
        "data-carries-note": row.carriesNote ? "yes" : "no",
      },
      `${row.host}, ${row.bytes} bytes, note text ${row.carriesNote ? "yes" : "no"}`,
    ));
  });
  return el("td", { "data-ledger-requests": "" }, ...children);
}

export interface LedgerPanelInput {
  /** every entry of the ledger */
  entries: readonly LedgerEntry[];
}

/** One entry as a small table: time, job, mode, source, outcome, bytes, hash (shell-and-offline R39.2). No pipe characters. */
export function ledgerEntryTable(e: LedgerEntry): HTMLElement {
  const s = strings.egress;
  const rows: [string, string][] = [
    [s.ledgerTime, e.at],
    [s.ledgerJob, e.job],
    [s.ledgerMode, e.mode],
    [s.ledgerSource, e.inferenceSource === "ON_DEVICE" ? strings.source.onDevice : strings.source.inCloud],
    [s.ledgerOutcome, e.outcome],
    [s.ledgerBytes, e.byteLengths.join(", ")],
    [s.ledgerHash, e.sha256.join(", ")],
  ];
  const body = el("tbody", {}, ...rows.map(([label, value]) => el("tr", {}, el("th", { scope: "row" }, label), el("td", {}, value))));
  body.append(el("tr", {}, el("th", { scope: "row" }, s.ledgerOffPage), offPageCell(e.requests)));
  return el("table", { class: "ledger-entry", "data-ledger-entry": "" }, body);
}

export const ledgerFoldLabel = (n: number) => fill(n === 1 ? strings.folds.ledgerOne : strings.folds.ledger, { n });

/**
 * The fold "Egress ledger (N entries)": the explanation and one small table for each entry.
 * The ledger stays on this device. Closed by default.
 */
export function ledgerPanel(input: LedgerPanelInput, foldOptions: FoldOptions = {}): HTMLDetailsElement {
  const s = strings.egress;
  return fold(
    "ledger",
    ledgerFoldLabel(input.entries.length),
    foldOptions,
    el("p", { class: "ledger-explain" }, s.ledgerExplain),
    el(
      "div",
      { class: "ledger-entries", "data-ledger-entries": "" },
      ...(input.entries.length === 0 ? [el("p", {}, s.ledgerEmpty)] : input.entries.map(ledgerEntryTable)),
    ),
  );
}
