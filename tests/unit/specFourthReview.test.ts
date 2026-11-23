// Checks the shape of the fourth-review tasks and requirements in .kiro/specs
// (direction items K1 to K7, acceptance checks L1 to L9). It reads documents only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SPECS = ["masking", "measurement", "egress-check", "second-reader", "shell-and-offline"];
const SECTION = "## Fourth review (2026-11-13)";

const read = (spec: string, file: string) => readFileSync(join(__dirname, "../../.kiro/specs", spec, file), "utf8");
const after = (text: string) => {
  const at = text.indexOf(SECTION);
  expect(at, "has the fourth-review section").toBeGreaterThan(-1);
  return text.slice(at);
};
const newLines = (spec: string) => after(read(spec, "tasks.md")).split("\n").filter((l) => l.startsWith("- ["));
const requirementNumbers = (spec: string) => new Set([...read(spec, "requirements.md").matchAll(/^### R(\d+)\./gm)].map((m) => Number(m[1])));

describe("fourth review: new tasks", () => {
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
      it("ticks a real-browser task only when the line records the run and its results file", () => {
        for (const l of lines) if (/^- \[x\] \d+\. REAL BROWSER/.test(l)) expect(l).toMatch(/Ran 2026-11-1[34] .*results\/[a-z0-9-]+\.json/);
      });
    });
  }
});

describe("fourth review: every item has a requirement and a task", () => {
  const items = [...Array.from({ length: 7 }, (_, i) => `K${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `L${i + 1}`)];
  const requirementText = SPECS.map((s) => after(read(s, "requirements.md"))).join("\n");
  const taskText = SPECS.flatMap(newLines).join("\n");
  for (const item of items) {
    it(`${item} is in a requirement`, () => expect(new RegExp(`\\b${item}\\b`).test(requirementText)).toBe(true));
    it(`${item} is in a task`, () => expect(new RegExp(`\\b${item}\\b`).test(taskText)).toBe(true));
  }
  it("uses no emoji in the new text", () => {
    const all = SPECS.map((s) => read(s, "tasks.md") + read(s, "requirements.md")).join("\n");
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
  });
});
