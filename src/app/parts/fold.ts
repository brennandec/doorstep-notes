import { el } from "../dom";

export interface FoldOptions {
  open?: boolean;
  /** called when she opens or closes the fold */
  onToggle?: (open: boolean) => void;
}

/**
 * A native details element: keyboard and screen readers work without extra code (shell-and-offline R30).
 * The id lets a re-render give the focus back to the summary.
 */
export function fold(which: "scans" | "reader" | "ledger" | "measured", summary: string, fold: FoldOptions, ...body: (HTMLElement | null)[]): HTMLDetailsElement {
  const open = fold.open === true;
  const d = el("details", { class: "fold", "data-details": which, open }, el("summary", { id: `fold-${which}` }, summary), ...body);
  let last = open;
  d.addEventListener("toggle", () => {
    if (d.open === last) return;
    last = d.open;
    fold.onToggle?.(d.open);
  });
  return d;
}
