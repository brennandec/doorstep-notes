// A small set of drawn inline SVGs with one stroke weight. No padlock and no
// shield: they would say "safe" (look and layout, Parts, Icons).
import { ICON_STROKE_PX } from "../constants";

export const ICON_NAMES = [
  "laptop",
  "cloud",
  "arrowCrossingLine",
  "check",
  "crossedOctagon",
  "pencil",
  "camera",
  "eye",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

const shapes: Record<IconName, string> = {
  laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7 9.5 4.25 4.25 0 0 0 7 18z"/>',
  arrowCrossingLine: '<path d="M12 3v18"/><path d="M3 12h15"/><path d="M14 8l4 4-4 4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  crossedOctagon: '<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M9 9l6 6M15 9l-6 6"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};

const STRIKE = '<path d="M4 4l16 16"/>';

/** Returns the SVG markup. `struck` adds a diagonal line, used for "offline". */
export function iconSvg(name: IconName, options: { struck?: boolean } = {}): string {
  const extra = options.struck ? STRIKE : "";
  return (
    `<svg class="icon icon-${name}" data-icon="${name}" viewBox="0 0 24 24" width="24" height="24" fill="none" ` +
    `stroke="currentColor" stroke-width="${ICON_STROKE_PX}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `${shapes[name]}${extra}</svg>`
  );
}
