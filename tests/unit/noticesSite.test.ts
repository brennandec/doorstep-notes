// @vitest-environment happy-dom
// Shell-and-offline task 76 (R38.2, R38.4): the notices file in the built site, the footer link, the README.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderScreen } from "../../src/app/screen";
import { flattenStrings, strings } from "../../src/app/strings";
import { emptyState } from "../../src/app/state";
import { noticesFile } from "../../scripts/vitePlugins";
import { isAllowed } from "../../scripts/swPlugin";

const BANNED = /\b(safe|private by design|anonymised|guaranteed|cleared)\b/i;

describe("the footer link", () => {
  const mount = () => {
    const root = document.createElement("div");
    root.append(...renderScreen(emptyState({ started: true }), {} as never));
    return root;
  };

  it("reads 'Third-party notices' and points at the file, inside the footer", () => {
    const link = mount().querySelector("footer a.notices-link") as HTMLAnchorElement;
    expect(link.textContent).toBe("Third-party notices");
    expect(link.getAttribute("href")).toBe("/THIRD-PARTY-NOTICES.txt");
  });

  it("opens in its own tab without handing over the opener", () => {
    const link = mount().querySelector("a.notices-link")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("has words in the string table that pass the word and number audits", () => {
    for (const t of Object.values(strings.notices)) {
      expect(t).not.toMatch(BANNED);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/\d/);
    }
    expect(flattenStrings(strings.notices)).toHaveLength(2);
  });

  it("is at least 44 px high in the style sheet", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.notices-link\s*\{[^}]*min-height:\s*44px/);
  });
});

describe("the file in the built site", () => {
  it("is on the service worker's allowed list and the plugin emits it under its own name", () => {
    expect(isAllowed("THIRD-PARTY-NOTICES.txt")).toBe(true);
    const plugin = noticesFile(process.cwd()) as unknown as { generateBundle: (this: { emitFile: (f: unknown) => void }) => void };
    const emitted: { fileName?: string; source?: string }[] = [];
    plugin.generateBundle.call({ emitFile: (f) => emitted.push(f as never) });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.fileName).toBe("THIRD-PARTY-NOTICES.txt");
    expect(emitted[0]!.source).toBe(readFileSync("THIRD-PARTY-NOTICES.txt", "utf8"));
  });

  it("fails the build when the file is missing", () => {
    const plugin = noticesFile("/nonexistent-folder") as unknown as { generateBundle: (this: { emitFile: () => void }) => void };
    expect(() => plugin.generateBundle.call({ emitFile: () => undefined })).toThrow(/THIRD-PARTY-NOTICES/);
  });

  it("is in the real build when dist exists", () => {
    if (!existsSync("dist/index.html")) return;
    expect(existsSync("dist/THIRD-PARTY-NOTICES.txt")).toBe(true);
    expect(readFileSync("dist/THIRD-PARTY-NOTICES.txt", "utf8")).toBe(readFileSync("THIRD-PARTY-NOTICES.txt", "utf8"));
  });
});

describe("the README", () => {
  it("names THIRD-PARTY-NOTICES.txt in the licence section and keeps the project's licence statement", () => {
    const readme = readFileSync("README.md", "utf8");
    const at = readme.indexOf("## Third-party notices");
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at);
    expect(section).toContain("THIRD-PARTY-NOTICES.txt");
    expect(section).toContain("npm run notices");
    expect(section).toContain("This project is under the MIT licence. See `LICENSE`.");
    expect(section).toContain("`NOTICE.md`");
  });
});
