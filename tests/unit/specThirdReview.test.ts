// Checks the shape of the third-review tasks and requirements in .kiro/specs
// (direction items X1 to X7, acceptance checks Y1 to Y6). It reads documents only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SPECS = ["capture-and-record", "masking", "egress-check", "drafting", "shell-and-offline"];
const SECTION = "## Third review (2026-11-13)";

const read = (spec: string, file: string) => readFileSync(join(__dirname, "../../.kiro/specs", spec, file), "utf8");

function newLines(spec: string): string[] {
  const text = read(spec, "tasks.md");
  const at = text.indexOf(SECTION);
  expect(at, `${spec}/tasks.md has the third-review section`).toBeGreaterThan(-1);
  return text.slice(at).split("\n").filter((l) => l.startsWith("- ["));
}

const requirementNumbers = (spec: string) =>
  new Set([...read(spec, "requirements.md").matchAll(/^### R(\d+)\./gm)].map((m) => Number(m[1])));

describe("third review: new tasks", () => {
  for (const spec of SPECS) {
    describe(spec, () => {
      const lines = newLines(spec);

      it("has new tasks, each an unticked or ticked checkbox with a number", () => {
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) expect(l, l).toMatch(/^- \[[ x]\] \d+\. \S/);
      });

      it("numbers every task once, in order, across the whole file", () => {
        const nums = read(spec, "tasks.md")
          .split("\n")
          .map((l) => /^- \[[ x]\] (\d+)\. /.exec(l)?.[1])
          .filter((n): n is string => n !== undefined)
          .map(Number);
        expect(new Set(nums).size).toBe(nums.length);
        expect([...nums].sort((a, b) => a - b)).toEqual(nums);
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
          const kind = /\b(BUNDLED|DEVICE MODEL)\b/.test(l);
          expect(kind, l).toBe(real);
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

describe("third review: every item has a requirement and a task", () => {
  const items = [...Array.from({ length: 7 }, (_, i) => `X${i + 1}`), ...Array.from({ length: 6 }, (_, i) => `Y${i + 1}`)];
  const requirementText = SPECS.map((s) => {
    const t = read(s, "requirements.md");
    return t.slice(t.indexOf(SECTION));
  }).join("\n");
  const taskText = SPECS.flatMap(newLines).join("\n");
  for (const item of items) {
    it(`${item} is in a requirement`, () => expect(new RegExp(`\\b${item}\\b`).test(requirementText)).toBe(true));
  }
  // Y2 and Y3 and Y4 are unit checks named in the requirement that serves them; X items are named in the tasks.
  for (const item of items.filter((i) => i.startsWith("X"))) {
    it(`${item} is in a task`, () => expect(new RegExp(`\\b${item}\\b`).test(taskText)).toBe(true));
  }
  for (const item of ["Y1", "Y2", "Y3", "Y4", "Y5", "Y6"]) {
    it(`${item} is in a task`, () => expect(new RegExp(`\\b${item}\\b`).test(taskText)).toBe(true));
  }
  it("uses no emoji in the new text", () => {
    const all = SPECS.map((s) => read(s, "tasks.md") + read(s, "requirements.md")).join("\n");
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
  });
});
