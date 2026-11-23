import { el, svg } from "../dom";
import { fold, type FoldOptions } from "./fold";
import { iconSvg } from "../icons";
import { strings } from "../strings";
import { scannedSentence } from "../scanned";
import type { EgressLines } from "../../egress/line";

/**
 * The egress check line, fixed at the bottom of zone 2 (look and layout; egress-check R14).
 * After a send it holds a card: one verdict line with an icon (a check mark, or a crossed octagon in the
 * failure colour with words on a failure or a block) and a table of rows, label left and value right.
 * The card holds no paragraph. Under it, always, the standing sentence, then the fold "What this check
 * scans", which holds the scan words and the sentence about near variants. Before any send it shows the
 * waiting line.
 */
const scanned = (f: FoldOptions) =>
  fold(
    "scans",
    strings.folds.scans,
    f,
    el("p", { class: "egress-scanned", "data-egress-scanned": "" }, scannedSentence()),
    el("p", { class: "egress-near", "data-egress-near": "" }, strings.egress.nearVariants),
  );

/**
 * Zone 2 after the controls reads: the verdict card, the sentence that never folds, then two folds:
 * "What this check scans" and "Egress ledger (N entries)" (shell-and-offline R39.1). `ledger` is the
 * second fold, already built, or null before any send.
 */
export function egressLine(lines: EgressLines | null, foldOptions: FoldOptions = {}, ledger: HTMLElement | null = null): HTMLElement {
  if (lines === null) {
    return el(
      "div",
      { class: "egress-line", "data-egress-line": "", "data-kind": "waiting", role: "status" },
      el("p", { class: "egress-headline" }, strings.egressWaiting),
      el("p", { class: "egress-standing" }, strings.egress.standing),
      scanned(foldOptions),
      ledger,
    );
  }
  const icon = el("span", { class: "egress-icon", "data-icon-name": lines.icon }, svg(iconSvg(lines.icon)));
  const verdict = el("div", { class: "egress-verdict", "data-egress-verdict": "" }, icon, el("span", { class: "egress-headline" }, lines.verdict));
  const table = el(
    "table",
    { class: "egress-rows", "data-egress-rows": "" },
    el(
      "tbody",
      {},
      ...lines.rows.map((r) => el("tr", { class: "egress-row" }, el("th", { scope: "row" }, r.label), el("td", {}, r.value))),
    ),
  );
  return el(
    "div",
    {
      class: lines.failure ? "egress-line fail" : "egress-line",
      "data-egress-line": "",
      "data-kind": lines.kind,
      role: lines.failure ? "alert" : "status",
    },
    el(
      "div",
      { class: "egress-card", "data-egress-card": "" },
      verdict,
      table,
      // A fail made by the seeded test path says so (egress-check R16.2). A div, so the card holds no paragraph.
      lines.kind === "fail" && lines.seeded ? el("div", { class: "egress-seeded", "data-egress-seeded": "" }, strings.egress.seededForTest) : null,
    ),
    el("p", { class: "egress-standing" }, lines.standing),
    scanned(foldOptions),
    ledger,
  );
}
