import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as c from "../../src/constants";
import { ICON_NAMES, iconSvg } from "../../src/app/icons";

const css = readFileSync("src/app/styles/app.css", "utf8");

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text and background pair in use in the style file. */
const pairs: [string, string, string][] = [
  ["ink on paper", c.COLOR_INK, c.COLOR_PAPER],
  ["ink on darker paper", c.COLOR_INK, c.COLOR_PAPER_2],
  ["second ink on paper", c.COLOR_INK_2, c.COLOR_PAPER],
  ["second ink on darker paper", c.COLOR_INK_2, c.COLOR_PAPER_2],
  ["paper on accent (primary control)", c.COLOR_PAPER, c.COLOR_ACCENT],
  ["ink on light accent (chip)", c.COLOR_INK, c.COLOR_ACCENT_TINT],
  ["accent on paper", c.COLOR_ACCENT, c.COLOR_PAPER],
  ["failure on paper (egress line, errors)", c.COLOR_FAILURE, c.COLOR_PAPER],
  ["paper on ink (cloud pill)", c.COLOR_PAPER, c.COLOR_INK],
];

describe("style tokens", () => {
  it("defines the custom properties from the constants", () => {
    const vars: Record<string, string> = {
      "--paper": c.COLOR_PAPER, "--paper-2": c.COLOR_PAPER_2, "--ink": c.COLOR_INK, "--ink-2": c.COLOR_INK_2,
      "--hairline": c.COLOR_HAIRLINE, "--accent": c.COLOR_ACCENT, "--failure": c.COLOR_FAILURE, "--accent-tint": c.COLOR_ACCENT_TINT,
    };
    for (const [name, value] of Object.entries(vars)) expect(css, name).toContain(`${name}: ${value};`);
  });

  for (const [label, fg, bg] of pairs) {
    it(`contrast is at least 4.5 to 1: ${label}`, () => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("has no gradient and no dark theme block", () => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/prefers-color-scheme\s*:\s*dark/);
  });

  it("has no font file, no @font-face and no url() to a font", () => {
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/url\([^)]*\.(woff2?|ttf|otf|eot)/i);
    const walk = (p: string): string[] => (!existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p]);
    const fonts = [...walk("public"), ...walk("dist")].filter((f) => /\.(woff2?|ttf|otf|eot)$/i.test(f));
    expect(fonts).toEqual([]);
  });

  it("has no duration above the fade limit", () => {
    const durations = [...css.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map((m) => (m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1])));
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) expect(d).toBeLessThanOrEqual(c.MAX_FADE_MS);
  });

  it("switches transitions off for reduced motion", () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*transition:\s*none/);
  });

  it("states the sizes from the constants", () => {
    expect(css).toContain(`font-size: ${c.BASE_FONT_PX}px;`);
    expect(css).toContain(`min-height: ${c.CONTROL_HEIGHT_PX}px;`);
    expect(css).toContain(`border: ${c.CONTROL_BORDER_PX}px solid var(--ink)`);
    expect(css).toContain(`border-radius: ${c.CONTROL_RADIUS_PX}px;`);
    expect(css).toContain(`outline: ${c.FOCUS_RING_PX}px solid var(--accent); outline-offset: ${c.FOCUS_RING_OFFSET_PX}px;`);
    expect(css).toContain(`min-width: ${c.STACK_WIDTH_PX}px`.replace("min-width: ", "(min-width: ") + ")");
  });

  it("uses no font size under the minimum", () => {
    for (const m of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(c.MIN_FONT_PX);
  });

  it("uses the failure colour only on the failing egress line and on errors", () => {
    const uses = [...css.matchAll(/([^{}]+)\{[^}]*var\(--failure\)[^}]*\}/g)].map((m) => m[1]!.trim());
    expect(uses).toEqual([".egress-line.fail .egress-verdict", ".error"]);
  });
});

describe("icons", () => {
  it("lists exactly the eight drawn icons", () => {
    expect([...ICON_NAMES].sort()).toEqual(["arrowCrossingLine", "camera", "check", "cloud", "crossedOctagon", "eye", "laptop", "pencil"]);
    expect([...ICON_NAMES].join(" ")).not.toMatch(/padlock|lock|shield/i);
  });

  it("draws every icon with one stroke width", () => {
    const widths = new Set<string>();
    for (const name of ICON_NAMES) {
      const svg = iconSvg(name);
      expect(svg).toContain("<svg");
      expect(svg).toContain('aria-hidden="true"');
      for (const m of svg.matchAll(/stroke-width="([^"]+)"/g)) widths.add(m[1]!);
    }
    expect([...widths]).toEqual([String(c.ICON_STROKE_PX)]);
  });

  it("adds a strike line when struck, with the same stroke width", () => {
    expect(iconSvg("arrowCrossingLine", { struck: true })).toContain("M4 4l16 16");
    expect(iconSvg("arrowCrossingLine")).not.toContain("M4 4l16 16");
  });
});
