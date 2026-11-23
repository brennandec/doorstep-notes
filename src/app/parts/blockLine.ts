// The line beside Send while the block holds (egress-check R15, H35a D5).
// "Not sent: 1 listed name is in the text. Mask it, then send." The names follow as chips.
// Each name is a chip. Pressing it masks the name again. There is no override control here.
// The words carry the meaning, not the colour.
import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import { fill, strings } from "../strings";
import { chip } from "./chip";
import type { EgressLines } from "../../egress/line";
import type { MaskSpan } from "../../masking/types";

/** A chip for a value found in the text that would leave. It is not masked, so it shows as such. */
function blockSpan(name: string): MaskSpan {
  return { start: 0, end: name.length, surfaceForm: name, tag: "", kind: "listed", tagKind: "Person", key: `block:${name}`, accepted: false, sentOnPurpose: false };
}

/** The line, or null when the lines are not a block. `onMask` is called with the name when its chip is pressed. */
export function blockLine(lines: EgressLines | null, onMask?: (name: string) => void): HTMLElement | null {
  if (lines === null || lines.kind !== "blocked" || lines.blocked === undefined) return null;
  const { listed, masked } = lines.blocked;
  const names = listed.length > 0 ? listed : masked;
  if (names.length === 0) return null;
  const e = strings.egress;
  const head = fill(listed.length > 0 ? (names.length === 1 ? e.blockOneListed : e.blockManyListed) : names.length === 1 ? e.blockOneMasked : e.blockManyMasked, { n: names.length });
  const pieces: (Node | string)[] = [svg(iconSvg("crossedOctagon")), head, " "];
  names.forEach((name, i) => {
    if (i > 0) pieces.push(", ");
    const c = chip(blockSpan(name), { onToggle: () => onMask?.(name) });
    c.setAttribute("data-block-chip", name);
    const button = c.querySelector("button");
    button?.setAttribute("aria-label", fill(e.blockChipLabel, { what: name }));
    pieces.push(c);
  });
  return el("p", { class: "block-line", "data-block-line": "", role: "status" }, ...pieces);
}
