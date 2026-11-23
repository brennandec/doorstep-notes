// Takes a screenshot into docs/screens/ and records it in results/screens.json (shell-and-offline R23.2):
// the name, the date, the browser, the viewport and the scroll position at the moment of the shot.
// Each call adds or replaces one entry; entries of other names are kept.
import type { Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const SCREENS_FOLDER = "docs/screens";
const FILE = "results/screens.json";

type Entry = { date: string; browser: string; viewport: { width: number; height: number }; scrollY: number; file: string; kind: string };

/**
 * Takes the shot into memory and returns its entry; writes `docs/screens/<name>.png` and `results/screens.json`
 * only when `RETAKE_SCREENS` includes `"all"` or `<name>`, so test runs leave committed screenshots clean.
 */
export async function takeScreen(page: Page, name: string, browser: string, kind: "BUNDLED" | "DEVICE MODEL"): Promise<Entry> {
  const held = await holdScreen(page, name, browser, kind);
  const retake = (process.env["RETAKE_SCREENS"] ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return retake.includes("all") || retake.includes(name) ? held.commit() : held.entry;
}

/**
 * H17: the shot is taken now, into memory, and written to docs/screens/ and results/screens.json only when
 * `commit()` is called, so a run that fails leaves the committed picture as it was.
 */
export async function holdScreen(page: Page, name: string, browser: string, kind: "BUNDLED" | "DEVICE MODEL"): Promise<{ entry: Entry; commit: () => Entry }> {
  const view = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight, scrollY: Math.round(window.scrollY) }));
  const file = `${SCREENS_FOLDER}/${name}.png`;
  const png = await page.screenshot();
  const entry: Entry = {
    date: new Date().toISOString(),
    browser,
    viewport: { width: view.width, height: view.height },
    scrollY: view.scrollY,
    file,
    kind,
  };
  const commit = (): Entry => {
    mkdirSync(SCREENS_FOLDER, { recursive: true });
    writeFileSync(file, png);
    let screens: Record<string, Entry> = {};
    try {
      const old = JSON.parse(readFileSync(FILE, "utf8")) as { screens?: Record<string, Entry> };
      screens = old.screens ?? {};
    } catch {
      screens = {};
    }
    screens[name] = entry;
    const names = Object.keys(screens).sort();
    const sorted: Record<string, Entry> = {};
    for (const n of names) sorted[n] = screens[n]!;
    mkdirSync("results", { recursive: true });
    writeFileSync(FILE, JSON.stringify({ script: "tests/e2e (takeScreen)", note: "Written by the real-browser checks of V8. Invented people only.", screens: sorted }, null, 2) + "\n");
    return entry;
  };
  return { entry, commit };
}

/** The browser label the bundled checks use. */
export async function bundledLabel(page: Page): Promise<string> {
  return `Chromium ${page.context().browser()!.version()} (Playwright 1.65.0 bundled, headless)`;
}
