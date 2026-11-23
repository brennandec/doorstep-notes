// The check of shell-and-offline R34.3 (fifth review N3): no text box in the three zones hides part of its own text.
//
// `collectBoxes` runs inside the page (pass it to `page.evaluate`). It is self-contained: it uses nothing from
// this module. `findCut` is plain logic over what it collected, so a unit test can run it on stand-in boxes.
//
// A text box is an element inside a zone that has text of its own. It hides text when
//   - it clips (overflow is not visible) and its content is wider or taller than it, or
//   - its text spills out of its box, so that something after it can cover the spill.
// Left out on purpose, and named here: the outgoing text and the ledger text (they scroll inside themselves,
// the whole text stays in them), text drawn hidden for assistive technology (`sr-only`), a folded record line (cut with an ellipsis by design, shell R24.1), and the
// body of a `details` element that is closed (it is not shown).

export interface BoxInfo {
  label: string;
  text: string;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  overflowX: string;
  overflowY: string;
  boxBottom: number;
  boxRight: number;
  textBottom: number;
  textRight: number;
}

export interface Cut {
  label: string;
  text: string;
  reason: "clipped across" | "clipped down" | "spills below" | "spills right";
  /** how far the text goes past its box, in pixels */
  by: number;
}

const HANGING_SPACE_PX = 4;

/** Names the boxes that hide text. A pixel of slack absorbs rounding. */
export function findCut(boxes: BoxInfo[]): Cut[] {
  const out: Cut[] = [];
  for (const b of boxes) {
    const add = (reason: Cut["reason"], by: number) => out.push({ label: b.label, text: b.text, reason, by: Math.round(by) });
    if (b.overflowX !== "visible" && b.scrollWidth > b.clientWidth + 1) add("clipped across", b.scrollWidth - b.clientWidth);
    else if (b.overflowY !== "visible" && b.scrollHeight > b.clientHeight + 1) add("clipped down", b.scrollHeight - b.clientHeight);
    else if (b.textBottom > b.boxBottom + 1) add("spills below", b.textBottom - b.boxBottom);
    // A space that hangs at the end of a pre-wrap line may stand a few pixels past the box; that hides nothing.
    else if (b.textRight > b.boxRight + HANGING_SPACE_PX) add("spills right", b.textRight - b.boxRight);
  }
  return out;
}

/** Runs in the page. Returns one entry per text box in the three zones. */
export function collectBoxes(): BoxInfo[] {
  const exempt = ".outgoing, .ledger-text, .record-fold .fold-text, .sr-only";
  const out: BoxInfo[] = [];
  const zones = Array.from(document.querySelectorAll("[data-zone]"));
  for (const zone of zones) {
    for (const node of Array.from(zone.querySelectorAll("*"))) {
      const e = node as HTMLElement;
      if (e.closest(exempt) !== null) continue;
      const closed = e.closest("details:not([open])");
      if (closed !== null && !(e.tagName === "SUMMARY" || e.closest("summary") !== null)) continue;
      const rect = e.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // not shown
      const own = Array.from(e.childNodes).filter((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (own.length === 0) continue;
      const range = document.createRange();
      let textBottom = -Infinity;
      let textRight = -Infinity;
      for (const t of own) {
        range.selectNodeContents(t);
        const r = range.getBoundingClientRect();
        textBottom = Math.max(textBottom, r.bottom);
        textRight = Math.max(textRight, r.right);
      }
      const cs = getComputedStyle(e);
      const inline = cs.display === "inline"; // an inline box has no box of its own to hide text in
      if (inline) continue;
      out.push({
        label: `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).join(".") : ""}`,
        text: (e.textContent ?? "").trim().slice(0, 60),
        clientWidth: e.clientWidth,
        scrollWidth: e.scrollWidth,
        clientHeight: e.clientHeight,
        scrollHeight: e.scrollHeight,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        boxBottom: rect.bottom - parseFloat(cs.borderBottomWidth || "0"),
        boxRight: rect.right,
        textBottom,
        textRight,
      });
    }
  }
  return out;
}
