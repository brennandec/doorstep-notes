// @vitest-environment happy-dom
// Shell-and-offline task 58 (R29, fourth review K5, J4, L7): the first screen says what is real.
// The cloud half is read from the build flag and from results/cloud-probe-2026-11-13.json, never typed.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { halvesSentences, PROBE_FILE, READER_FILE } from "../../src/app/halves";
import { AI_SERVICE_ENABLED, DEFAULT_CLOUD_MODEL, READER_CLOUD_MODEL } from "../../src/constants";
import { bundledResults, type ResultsLookup } from "../../src/app/figures";
import { renderStatusBar } from "../../src/app/statusBar";
import { fill, strings } from "../../src/app/strings";

const readme = readFileSync("README.md", "utf8");
/** The first paragraph after the title line. */
function firstParagraph(): string {
  const body = readme.slice(readme.indexOf("\n", readme.indexOf("# ")) + 1).replace(/^\s+/, "");
  return body.split(/\n\s*\n/)[0]!.replace(/\s+/g, " ").trim();
}

const fakeProbe: ResultsLookup = (name) =>
  name === PROBE_FILE
    ? {
        run_1: {
          requests: [
            { url: "https://example.test/v1beta/projects/invented/models/invented-model-x:generateContent", status: 200 },
          ],
        },
      }
    : undefined;

const readerFile = (status: number) => ({
  job: "second reader",
  passes: [{ pass: 1, status, model: "invented-reader-y" }],
});
const fakeBoth: ResultsLookup = (name) => (name === READER_FILE ? readerFile(200) : fakeProbe(name));
const fakeReaderRefused: ResultsLookup = (name) => (name === READER_FILE ? readerFile(403) : fakeProbe(name));

describe("the two halves (R29.2)", () => {
  it("says the device half in Google Chrome's built-in model", () => {
    expect(halvesSentences({ aiServiceEnabled: false, results: () => undefined }).device).toBe(strings.halves.device);
    expect(strings.halves.device).toContain("Google Chrome");
    expect(strings.halves.device).toContain("built-in model");
  });

  it("with the flag off, says the cloud half is off and a fixed sample answers", () => {
    const h = halvesSentences({ aiServiceEnabled: false, results: fakeProbe });
    expect(h.cloud).toBe("The cloud half is off in this build: a fixed sample answers and nothing is sent.");
  });

  it("with the flag on, names the service once, from the probe file", () => {
    const h = halvesSentences({ aiServiceEnabled: true, results: fakeProbe });
    expect(h.cloud).toContain("invented-model-x");
    expect(h.cloud).not.toContain("fixed sample");
    expect(h.cloud.match(/invented-model-x/g)).toHaveLength(1);
  });

  it("with the flag on, names both models, each once, from the probe file and the loop file", () => {
    const h = halvesSentences({ aiServiceEnabled: true, results: fakeBoth });
    expect(h.cloud).toBe(
      "The cloud half is connected: drafts and rewrites use invented-model-x, and the second reader uses invented-reader-y.",
    );
    expect(h.cloud.match(/invented-model-x/g)).toHaveLength(1);
    expect(h.cloud.match(/invented-reader-y/g)).toHaveLength(1);
    expect(h.cloud).not.toContain("fixed sample");
  });

  it("does not name a reader model from a pass that was not answered with 200", () => {
    const h = halvesSentences({ aiServiceEnabled: true, results: fakeReaderRefused });
    expect(h.cloud).not.toContain("invented-reader-y");
    expect(h.cloud).toBe(fill(strings.halves.cloudOn, { draft: "invented-model-x", reader: strings.halves.modelUnnamed }));
  });

  it("with the bundled results and the flag on, names the two recorded models", () => {
    const h = halvesSentences({ aiServiceEnabled: true, results: bundledResults });
    expect(h.cloud).toBe(fill(strings.halves.cloudOn, { draft: DEFAULT_CLOUD_MODEL, reader: READER_CLOUD_MODEL }));
  });

  it("with the flag on and no readable probe file, says it is connected and does not invent a name", () => {
    const h = halvesSentences({ aiServiceEnabled: true, results: () => undefined });
    expect(h.cloud).toBe(strings.halves.cloudOnUnnamed);
    expect(h.cloud).not.toContain("fixed sample");
  });
});

describe("the status area (R29.2)", () => {
  it("shows both halves in the same words, read from the flag and the probe file", () => {
    const h = halvesSentences({ aiServiceEnabled: AI_SERVICE_ENABLED, results: bundledResults });
    const bar = renderStatusBar({ network: "online", device: { state: "unavailable" }, cloud: AI_SERVICE_ENABLED, halves: h });
    const area = bar.querySelector("[data-halves]");
    expect(area).not.toBeNull();
    const text = area!.textContent ?? "";
    expect(text).toContain(h.device);
    expect(text).toContain(h.cloud);
  });

  it("leaves the area out when no halves are given", () => {
    const bar = renderStatusBar({ network: "online", device: { state: "unavailable" }, cloud: false });
    expect(bar.querySelector("[data-halves]")).toBeNull();
  });
});

describe("the README's first paragraph (R29.1, R29.3, L7)", () => {
  const real = halvesSentences({ aiServiceEnabled: AI_SERVICE_ENABLED, results: bundledResults });

  it("holds the same two sentences as the status area", () => {
    const p = firstParagraph();
    expect(p).toContain(real.device);
    expect(p).toContain(real.cloud);
  });

  it("agrees with the build flag: it says the cloud is off exactly when the flag is off", () => {
    const p = firstParagraph();
    expect(p.includes("fixed sample")).toBe(!AI_SERVICE_ENABLED);
  });

  it("is the paragraph straight after the title", () => {
    expect(readme.split("\n")[0]).toBe("# Doorstep Notes");
    expect(firstParagraph()).toContain("A writing aid with an egress check on listed names.");
  });
});
