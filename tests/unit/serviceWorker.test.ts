import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLACEHOLDER, buildAllowedList, isAllowed, writeAllowedList } from "../../scripts/swPlugin.ts";
import { COLOR_PAPER, WORKING_TITLE } from "../../src/constants";

const sw = readFileSync("public/sw.js", "utf8").replace(/\/\/.*$/gm, "");

function fakeDist(): string {
  const dist = join(mkdtempSync(join(tmpdir(), "dist-")), "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(dist, "icons"), { recursive: true });
  for (const [f, c] of [
    ["index.html", "<html></html>"],
    ["manifest.webmanifest", "{}"],
    ["THIRD-PARTY-NOTICES.txt", "notices"],
    ["assets/app-1.js", "1"],
    ["assets/app-1.css", "1"],
    ["assets/data.json", "{}"],
    ["assets/font.woff2", "x"],
    ["icons/icon-192.png", "x"],
    ["probe.txt", "ok"],
    ["firebase.config.local.json", "{}"],
    ["results.json", "{}"],
  ] as const) writeFileSync(join(dist, f), c);
  copyFileSync("public/sw.js", join(dist, "sw.js"));
  return dist;
}

describe("service worker allowed list", () => {
  it("allows only built HTML, JS, CSS, the manifest, icons and the notices file", () => {
    const list = buildAllowedList(fakeDist());
    expect(list).toEqual(["/THIRD-PARTY-NOTICES.txt", "/assets/app-1.css", "/assets/app-1.js", "/icons/icon-192.png", "/index.html", "/manifest.webmanifest"]);
  });

  it("refuses the probe, the worker itself, config, data and fonts", () => {
    for (const p of ["probe.txt", "sw.js", "firebase.config.local.json", "assets/data.json", "assets/f.woff2", "results.json"]) {
      expect(isAllowed(p), p).toBe(false);
    }
  });

  it("writes the list into sw.js in dist and nowhere else", () => {
    const dist = fakeDist();
    const list = writeAllowedList(dist);
    const built = readFileSync(join(dist, "sw.js"), "utf8");
    expect(built).not.toContain(PLACEHOLDER);
    expect(built).not.toContain("__CACHE_VERSION__");
    for (const entry of list) expect(isAllowed(entry.slice(1))).toBe(true);
    expect(readFileSync("public/sw.js", "utf8")).toContain(PLACEHOLDER);
  });

  it("checks the real built sw.js when dist exists", () => {
    if (!existsSync("dist/sw.js")) return;
    const text = readFileSync("dist/sw.js", "utf8");
    const match = text.match(/const ALLOWED = (\[.*?\]);/s);
    expect(match).not.toBeNull();
    const list = JSON.parse(match![1]!) as string[];
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) expect(isAllowed(entry.slice(1)), entry).toBe(true);
  });
});

describe("sw.js source", () => {
  it("answers a link to the notices file with the file, not with the app (R38.2)", () => {
    expect(sw).toMatch(/pathname === "\/THIRD-PARTY-NOTICES\.txt"/);
  });
  it("has no IndexedDB access", () => {
    expect(sw).not.toMatch(/indexedDB|IDBFactory|openDatabase/i);
  });
  it("passes /probe.txt through to the network", () => {
    expect(sw).toMatch(/pathname === "\/probe\.txt"\) return;/);
  });
  it("handles same-origin requests only, so no Firebase or Google request is cached", () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return;/);
    expect(sw).not.toMatch(/googleapis|firebase|google\.com/i);
  });
  it("has a fetch handler", () => {
    expect(sw).toContain('addEventListener("fetch"');
  });
});

describe("manifest", () => {
  const m = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as Record<string, unknown>;
  it("holds name, icons, start url, display and colours", () => {
    expect(m["name"]).toBe(WORKING_TITLE);
    expect(m["short_name"]).toBe(WORKING_TITLE);
    expect(m["start_url"]).toBe("/");
    expect(m["display"]).toBe("standalone");
    expect(m["theme_color"]).toBe(COLOR_PAPER);
    expect(m["background_color"]).toBe(COLOR_PAPER);
    const icons = m["icons"] as { sizes: string; src: string }[];
    expect(icons.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
    for (const i of icons) expect(existsSync(join("public", i.src))).toBe(true);
  });
});
