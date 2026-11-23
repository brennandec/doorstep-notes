// Checks the shape of the fifth-review tasks and requirements in .kiro/specs (direction items N1 to N6,
// acceptance checks P1 to P6), and the honesty rules the review leaves unchanged (shell-and-offline task 71,
// R36). It reads documents and constants only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as c from "../../src/constants";
import { flattenStrings, strings } from "../../src/app/strings";

const SPECS = ["measurement", "egress-check", "shell-and-offline"];
const SECTION = "## Fifth review (2026-11-13)";

const read = (spec: string, file: string) => readFileSync(join(__dirname, "../../.kiro/specs", spec, file), "utf8");
const after = (text: string) => {
  const at = text.indexOf(SECTION);
  expect(at, "has the fifth-review section").toBeGreaterThan(-1);
  return text.slice(at);
};
const newLines = (spec: string) => after(read(spec, "tasks.md")).split("\n").filter((l) => l.startsWith("- ["));
const requirementNumbers = (spec: string) => new Set([...read(spec, "requirements.md").matchAll(/^### R(\d+)\./gm)].map((m) => Number(m[1])));

describe("fifth review: new tasks", () => {
  for (const spec of SPECS) {
    describe(spec, () => {
      const lines = newLines(spec);
      it("has new tasks, each a checkbox with a number", () => {
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) expect(l, l).toMatch(/^- \[[ x]\] \d+\. \S/);
      });
      it("names a requirement that exists", () => {
        const have = requirementNumbers(spec);
        for (const l of lines) {
          const serves = l.split("Serves ")[1];
          expect(serves, l).toBeDefined();
          const refs = [...serves!.matchAll(/\bR(\d+)/g)].map((m) => Number(m[1]));
          expect(refs.length, l).toBeGreaterThan(0);
          for (const r of refs) expect(have.has(r), `R${r} in ${spec}: ${l}`).toBe(true);
        }
      });
      it("marks real-browser tasks with their kind, and no other task", () => {
        for (const l of lines) {
          const real = /^- \[[ x]\] \d+\. REAL BROWSER/.test(l);
          expect(/\b(BUNDLED|DEVICE MODEL)\b/.test(l), l).toBe(real);
        }
      });
      it("puts a test in every task that is not a real-browser run", () => {
        for (const l of lines) if (!/\. REAL BROWSER/.test(l)) expect(/test/i.test(l), l).toBe(true);
      });
      it("ticks a real-browser task only with a results file cited on its line (session F03 ran them)", () => {
        for (const l of lines) if (/\. REAL BROWSER/.test(l) && /^- \[x\]/.test(l)) expect(l, l).toMatch(/results\/[a-z0-9-]+\.json|results\/screens\.json/);
      });
    });
  }
});

describe("fifth review: every direction item and acceptance check is a numbered requirement", () => {
  const text = SPECS.map((s) => after(read(s, "requirements.md"))).join("\n");
  it("names N1 to N6 and P1 to P6", () => {
    for (const id of ["N1", "N2", "N3", "N4", "N5", "N6", "P1", "P2", "P3", "P4", "P5", "P6"]) expect(text, id).toMatch(new RegExp(`\\b${id}\\b`));
  });
});

describe("honesty rules after the fifth review (R36)", () => {
  it("has the cloud on, as set on 2026-11-14 after a status 200 (results/cloud-draft-2026-11-14.json)", () => {
    expect(c.AI_SERVICE_ENABLED).toBe(true);
  });
  it("changes no target", () => {
    expect(c.COLD_START_LIMIT_S).toBe(60);
    expect(c.DEVICE_TOKEN_LIMIT).toBe(9216);
    expect(c.SYNTHETIC_SET_SIZE).toBe(200);
    expect(c.INVENTED_LIST_SIZE).toBe(12);
    expect(c.DEVICE_MEASURE_LIMIT_MIN).toBe(15);
  });
  it("puts the new card strings through the word, emoji and number audits", () => {
    const e = strings.egress;
    const card = [
      e.verdictPass, e.verdictOnPurpose, e.verdictFail, e.verdictFailMasked, e.verdictBlocked, e.verdictOffline,
      e.rowMasked, e.valueMasked, e.valueMaskedFound, e.rowParts, e.partsNone, e.partsFound, e.rowRequest,
      e.requestDouble, e.requestDevice, e.requestHost, e.requestUnknownHost, e.rowNext, e.nextFail, e.nextBlocked,
      e.nearVariants, strings.zoneNoteLine, strings.steps.count,
    ];
    for (const t of card.flatMap(flattenStrings)) {
      expect(t).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(t).not.toMatch(/\d/);
    }
  });
  it("says 'cloud off' in the request row when a double answered", () => {
    expect(strings.egress.requestDouble).toMatch(/cloud off/);
  });
});
