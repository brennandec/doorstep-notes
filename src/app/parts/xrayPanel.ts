// Reviewer X-ray. One row set per ledger entry: mode, source, ms, requests.
// The ledger word is rendered only while this panel is open.
import { el } from "../dom";
import { preflightsOf, requestsOf } from "../ledgerCount";
import { fill, strings } from "../strings";
import type { LedgerEntry } from "../../egress/ledger";

function row(label: string, value: string): HTMLElement {
  return el("tr", {}, el("th", { scope: "row" }, label), el("td", {}, value));
}

export function xrayTable(entry: LedgerEntry, ms: number | null): HTMLElement {
  const source = entry.inferenceSource === "ON_DEVICE" ? strings.source.onDevice : strings.source.inCloud;
  const taken = ms === null ? strings.xray.notMeasured : fill(strings.xray.msValue, { n: ms });
  const requests = requestsOf(entry);
  const preflights = preflightsOf(entry);
  return el(
    "table",
    { class: "xray-entry", "data-xray-entry": "" },
    el(
      "tbody",
      {},
      row(strings.xray.mode, entry.mode),
      row(strings.xray.source, source),
      row(strings.xray.ms, taken),
      row(strings.xray.requests, fill(strings.xray.requestsValue, { n: requests })),
      row(strings.xray.preflights, fill(strings.xray.preflightsValue, { n: preflights })),
    ),
  );
}

/** The open reviewer view. Callers omit this until the toggle is on. */
export function xrayPanel(entries: readonly LedgerEntry[], ms?: readonly (number | null)[]): HTMLElement {
  const tables = entries.length === 0
    ? [el("p", {}, strings.xray.empty)]
    : entries.map((entry, i) => xrayTable(entry, ms?.[i] ?? null));
  return el(
    "section",
    { class: "xray", "data-xray": "" },
    el("h2", {}, strings.egress.ledgerTitle),
    ...tables,
  );
}
