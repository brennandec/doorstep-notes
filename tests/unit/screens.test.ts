// Shell-and-offline task 38 (R23.1 to R23.3, V8). Invented people only.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SCREEN_NAMES, missingScreens, screensProblems } from "../../scripts/screens";
import { readResults } from "../../scripts/results";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const entry = (over: object = {}) => ({ date: "2030-01-01T00:00:00.000Z", browser: "Invented Chrome 1", viewport: { width: 1440, height: 900 }, scrollY: 0, ...over });

describe("the fourteen screenshot names (R23.1, R23.2, R26.2, R31.1, R37.1, R40.1)", () => {
  it("are the nine old names, the two whole-journey images, the picture after a reload, the egress fail card and the send blocked", () => {
    expect(SCREEN_NAMES).toHaveLength(14);
    expect(SCREEN_NAMES.slice(0, 9)).toEqual([
      "01-first-run", "02-note-record-masks", "03-outgoing-egress-pass", "04-egress-fail-seeded", "05-finished-note",
      "06-offline", "07-stacked-1024", "08-device-record", "09-device-masks",
    ]);
    expect(SCREEN_NAMES[9]).toBe("10-whole-journey-device");
    expect(SCREEN_NAMES[10]).toBe("11-whole-journey-all-accepted");
    expect(SCREEN_NAMES[11]).toBe("12-after-reload-offline");
    expect(SCREEN_NAMES[12]).toBe("13-egress-fail-card");
    expect(SCREEN_NAMES[13]).toBe("14-send-blocked");
  });

  it("missingScreens fails on a folder that lacks one, and names it", () => {
    const folder = mkdtempSync(join(tmpdir(), "doorstep-screens-"));
    dirs.push(folder);
    for (const n of SCREEN_NAMES) writeFileSync(join(folder, `${n}.png`), "x");
    expect(missingScreens(folder)).toEqual([]);
    rmSync(join(folder, "05-finished-note.png"));
    expect(missingScreens(folder)).toEqual(["05-finished-note"]);
    rmSync(folder, { recursive: true, force: true });
    mkdirSync(folder);
    expect(missingScreens(folder)).toHaveLength(14);
  });
});

describe("screensProblems (R23.2)", () => {
  it("accepts entries with a date, a browser, a viewport and a scroll position", () => {
    expect(screensProblems({ screens: { "01-first-run": entry(), "10-whole-journey-device": entry() } })).toEqual([]);
  });
  it("names each missing field", () => {
    const p = screensProblems({ screens: { "01-first-run": { scrollY: 0 } } });
    expect(p).toEqual(expect.arrayContaining(["01-first-run: no date.", "01-first-run: no browser.", "01-first-run: no viewport."]));
  });
  it("requires a scroll position of 0 for the whole-journey image only", () => {
    expect(screensProblems({ screens: { "10-whole-journey-device": entry({ scrollY: 120 }) } })).toEqual(["10-whole-journey-device: scroll position is not 0."]);
    expect(screensProblems({ screens: { "01-first-run": entry({ scrollY: 120 }) } })).toEqual([]);
    expect(screensProblems({ screens: { "10-whole-journey-device": entry({ scrollY: undefined }) } })).toEqual(["10-whole-journey-device: no scroll position."]);
  });
  it("refuses a name that is not one of the fourteen, and a file with no screens", () => {
    expect(screensProblems({ screens: { "14-extra": entry() } })).toEqual(["14-extra: not one of the fourteen names."]);
    expect(screensProblems({})).toHaveLength(1);
    expect(screensProblems(undefined)).toHaveLength(1);
  });
});

// The two checks below read the real folder. They are the acceptance of V8 and can only pass once real-browser
// tasks 39 and 40 have been run: the first by results/screens.json existing, the second by the same file
// holding the whole-journey entry. Until then they are skipped, not passed.
const screensFile = readResults("screens");
describe("the real screenshots (V8)", () => {
  it.skipIf(screensFile === undefined)("results/screens.json is sound", () => {
    expect(screensProblems(screensFile)).toEqual([]);
  });
  it.skipIf(screensFile === undefined || !existsSync("docs/screens/11-whole-journey-all-accepted.png"))("docs/screens holds all fourteen images", () => {
    expect(missingScreens()).toEqual([]);
  });
});
