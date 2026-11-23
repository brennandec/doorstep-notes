// @vitest-environment happy-dom
// Shell-and-offline tasks 52 and 53 (R27.3, R27.7, R28): the lines and controls on the screen, and the
// roads the kept data may not take. Invented people only.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderScreen } from "../../src/app/screen";
import { flattenStrings, strings } from "../../src/app/strings";
import { emptyState, type AppState } from "../../src/app/state";
import { inventedVisit } from "../../src/app/example/inventedVisit";

const BANNED = /\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i;

function mount(state: AppState): HTMLElement {
  const root = document.createElement("div");
  root.append(...renderScreen(state, {} as never));
  document.body.replaceChildren(root);
  return root;
}
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

describe("task 52: the lines and the controls", () => {
  // Rewritten by shell-and-offline task 68 (fifth review N5): one line says it, not two.
  it("says it once under the title of zone 1: the line 'Kept in this browser only.' is gone", () => {
    const zone = q(mount(emptyState({ started: true })), '[data-zone="note"]');
    expect(zone.children[0]!.tagName).toBe("H2");
    expect(zone.children[1]!.textContent).toBe("Everything here stays in this browser, on this device.");
    expect(zone.querySelector("[data-kept]")).toBeNull();
    expect(zone.textContent).not.toContain("Kept in this browser only.");
    expect(Object.keys(strings.kept)).not.toContain("line");
  });

  it("puts 'Clear everything this page keeps' and the way it is kept in the footer", () => {
    const root = mount(emptyState({ started: true }));
    const footer = q(root, "footer");
    expect(q(footer, "#clear-all").textContent).toBe("Clear everything this page keeps");
    expect(q(footer, "[data-how-kept]").textContent).toBe(strings.kept.howKept);
  });

  it("says how it is kept in the owner's words and no stronger word", () => {
    expect(strings.kept.howKept).toBe(
      "Kept in this browser's own store on this device. This page does not encrypt it. It relies on the lock of this device. The three clear controls remove it.",
    );
    expect(strings.kept.howKept).not.toMatch(/secure|protected|encrypted by|locked down/i);
  });

  it("shows 'Clear this visit' and 'Clear my list' in zone 1 only when there is something to clear", () => {
    expect(q(mount(emptyState({ started: true })), "#clear-visit")).toBeNull();
    expect(q(mount(emptyState({ started: true })), "#clear-list")).toBeNull();
    const withNote = mount(emptyState({ noteText: "A note" }));
    expect(q(withNote, '[data-zone="note"] #clear-visit').textContent).toBe("Clear this visit");
    expect(q(withNote, "#clear-list")).toBeNull();
    const withBoth = mount(emptyState({ noteText: "A note", clientList: inventedVisit.clientList }));
    expect(q(withBoth, '[data-zone="note"] #clear-list').textContent).toBe("Clear my list");
  });

  it("draws the controls as inline controls, which the style sheet makes at least 44 px", () => {
    const root = mount(emptyState({ noteText: "A note", clientList: "Bea" }));
    for (const id of ["#clear-visit", "#clear-list", "#clear-all"]) {
      expect(q(root, id).classList.contains("inline"), id).toBe(true);
    }
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.btn\.inline\s*\{[^}]*min-height:\s*44px/);
  });

  it("asks with a labelled group, a go-ahead button and a keep button", () => {
    const root = mount(emptyState({ noteText: "A note", confirmClear: "visit" }));
    const panel = q(root, '[data-clear-panel="visit"]');
    expect(panel.getAttribute("role")).toBe("group");
    expect(panel.getAttribute("aria-labelledby")).toBe("clear-ask");
    expect(q(panel, "#clear-go").textContent).toBe(strings.kept.goAhead);
    expect(q(panel, "#clear-keep").textContent).toBe(strings.kept.keep);
    expect(q(mount(emptyState({ confirmClear: "all" })), 'footer [data-clear-panel="all"]')).not.toBeNull();
  });

  it("shows the line about the store in plain words and in no failure colour", () => {
    const root = mount(emptyState({ keptLine: strings.kept.notKept }));
    expect(q(root, "[data-kept-line]").textContent).toBe(strings.kept.notKept);
    const css = readFileSync("src/app/styles/app.css", "utf8");
    const rule = /\.kept-warning\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).not.toMatch(/failure|B3261E/i);
  });

  it("keeps the new strings free of banned words and digits", () => {
    for (const t of flattenStrings(strings.kept)) {
      expect(t).not.toMatch(BANNED);
      expect(t).not.toMatch(/\d/);
    }
  });
});

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((n) => walk(join(path, n)));
}
const importsOf = (text: string) =>
  [...text.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2] ?? "");

describe("task 53: the roads the kept data may not take", () => {
  const src = walk("src").filter((f) => /\.tsx?$/.test(f));

  it("imports the kept store only in the controller and in main", () => {
    const hits = src.filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => /(^|\/)storage\/kept$/.test(i))).sort();
    expect(hits).toEqual(["src/app/controller.ts", "src/app/main.ts"]);
  });

  it("imports no storage module from the egress, inference, firebase, drafting or second-reader folders", () => {
    const folders = ["src/egress/", "src/inference/", "src/firebase/", "src/drafting/", "src/secondReader/"];
    const hits = src
      .filter((f) => folders.some((d) => f.startsWith(d)))
      .filter((f) => importsOf(readFileSync(f, "utf8")).some((i) => /(^|\/)storage\//.test(i)));
    expect(hits).toEqual([]);
  });

  it("makes no network call in the kept store", () => {
    const text = readFileSync("src/storage/kept.ts", "utf8").replace(/\/\/.*$/gm, "");
    expect(text).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/);
  });
});
