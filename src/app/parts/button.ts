import { el, svg } from "../dom";
import { iconSvg, type IconName } from "../icons";

export type ButtonKind = "primary" | "secondary";

/** A drawn button: 48 px high, 1.5 px ink border, 10 px radius (styles in app.css). */
export function button(text: string, kind: ButtonKind, options: { id?: string; icon?: IconName; disabled?: boolean; reason?: string } = {}): HTMLButtonElement {
  const b = el(
    "button",
    {
      type: "button",
      class: `btn ${kind}`,
      id: options.id,
      disabled: options.disabled,
      "data-kind": kind,
      title: options.disabled ? options.reason : undefined,
    },
    options.icon ? svg(iconSvg(options.icon)) : null,
    el("span", {}, text),
  );
  return b;
}
