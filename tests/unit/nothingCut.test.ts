// @vitest-environment happy-dom
// Shell-and-offline task 65 (R34.1, R34.2, fifth review N3): nothing in a zone is cut.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderLeavesZone } from "../../src/app/zones/leaves";
import { renderNoteZone } from "../../src/app/zones/note";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";

const css = readFileSync("src/app/styles/app.css", "utf8");
const handlers = {} as never;

describe("the offline notice (R34.1)", () => {
  it("reads in full: Not available while you are offline.", () => {
    expect(strings.cloudDisabledReason).toBe("Not available while you are offline.");
    const zone = renderLeavesZone(emptyState({ network: "offline", outgoingText: "Masked text" }));
    const notice = zone.querySelector(".offline-line");
    expect(notice?.textContent).toBe("Not available while you are offline.");
  });

  it("is a plain paragraph in the zone: not a flex container whose padding narrows its text", () => {
    const rule = css.match(/\.offline-line\s*\{([^}]*)\}/)![1]!;
    expect(rule).not.toMatch(/display:\s*flex/);
    expect(rule).not.toMatch(/padding:\s*[^;]*1\.5rem/);
    const inZone = css.match(/\.zone \.offline-line\s*\{([^}]*)\}/);
    expect(inZone).not.toBeNull();
    expect(inZone![1]).toMatch(/padding:\s*0\.5rem 0/);
  });

  it("the note zone's offline line is the same plain paragraph", () => {
    const zone = renderNoteZone(emptyState({ network: "offline" }), handlers);
    expect(zone.querySelector(".offline-line")?.textContent).toBe(strings.offline);
  });
});

describe("no child of a zone shrinks below its content (R34.2)", () => {
  it("sets flex-shrink 0 on every child of a zone", () => {
    expect(css).toMatch(/\.zone > \*\s*\{\s*flex-shrink:\s*0;\s*\}/);
  });
  it("lets no zone box clip its own text: no fixed height on a text paragraph", () => {
    for (const sel of [".send-notice", ".offline-line", ".zone-line", ".egress-standing", ".egress-headline"]) {
      const m = css.match(new RegExp(`${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g")) ?? [];
      for (const rule of m) expect(rule, sel).not.toMatch(/(^|[;{\s])(height|max-height):/);
    }
  });
});
