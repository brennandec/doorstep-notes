// Checks the shape of the second-review tasks and requirements in .kiro/specs
// (direction items U1 to U11, acceptance checks V1 to V8). It reads documents only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SPECS = ["capture-and-record", "masking", "measurement", "egress-check", "drafting", "second-reader", "shell-and-offline"];
const WITH_NEW_TASKS = SPECS.filter((s) => s !== "second-reader");
const SECTION = "## Second review (2026-11-13)";

const read = (spec: string, file: string) => readFileSync(join(__dirname, "../../.kiro/specs", spec, file), "utf8");

/** The lines of tasks.md after the second-review heading. */
function newTaskLines(spec: string): string[] {
  const text = read(spec, "tasks.md");
  const at = text.indexOf(SECTION);
  expect(at, `${spec}/tasks.md has the second-review section`).toBeGreaterThan(-1);
  return text.slice(at).split("\n");
}

function checkboxLines(spec: string): string[] {
  return newTaskLines(spec).filter((l) => l.startsWith("- ["));
}

function allTaskNumbers(spec: string): number[] {
  return read(spec, "tasks.md")
    .split("\n")
    .map((l) => /^- \[[ x]\] (\d+)\. /.exec(l)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
}

function requirementNumbers(spec: string): Set<number> {
  const found = [...read(spec, "requirements.md").matchAll(/^### R(\d+)\./gm)].map((m) => Number(m[1]));
  return new Set(found);
}

describe("second review: new tasks", () => {
  for (const spec of WITH_NEW_TASKS) {
    describe(spec, () => {
      const lines = checkboxLines(spec);

      it("has new tasks and every one is a line of the form '- [ ] 7. text' or '- [x] 7. text'", () => {
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) expect(l, l).toMatch(/^- \[[ x]\] \d+\. \S/);
      });

      it("numbers every task once, in order, across the whole file", () => {
        const nums = allTaskNumbers(spec);
        expect(new Set(nums).size).toBe(nums.length);
        expect([...nums].sort((a, b) => a - b)).toEqual(nums);
      });

      it("names the requirement each task serves, and that requirement exists in the spec", () => {
        const have = requirementNumbers(spec);
        for (const l of lines) {
          const serves = l.split("Serves ")[1];
          expect(serves, `no "Serves" in: ${l}`).toBeDefined();
          const refs = [...serves!.matchAll(/\bR(\d+)(?:\.\d+)?/g)].map((m) => Number(m[1]));
          expect(refs.length, l).toBeGreaterThan(0);
          for (const r of refs) expect(have.has(r), `R${r} is not a requirement of ${spec}: ${l}`).toBe(true);
        }
      });

      it("marks every real-browser task REAL BROWSER with its kind", () => {
        for (const l of lines) {
          const real = /^- \[[ x]\] \d+\. REAL BROWSER/.test(l);
          const mentionsKind = /\b(BUNDLED|DEVICE MODEL)\b/.test(l);
          if (real) expect(mentionsKind, l).toBe(true);
          else expect(mentionsKind, `a kind without REAL BROWSER: ${l}`).toBe(false);
          if (/Playwright|Google Chrome with the built-in model/.test(l) && !real) {
            expect.fail(`a browser task not marked REAL BROWSER: ${l}`);
          }
        }
      });

      it("puts the test before or with the code in every task that is not a real-browser run", () => {
        for (const l of lines) {
          if (/^- \[[ x]\] \d+\. REAL BROWSER/.test(l)) continue;
          expect(/test/i.test(l), l).toBe(true);
        }
      });

      it("uses no emoji", () => {
        const all = read(spec, "tasks.md") + read(spec, "requirements.md");
        expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
      });
    });
  }
});

describe("second review: every direction item and acceptance check has a requirement and a task", () => {
  const items = [...Array.from({ length: 11 }, (_, i) => `U${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `V${i + 1}`)];
  const requirementText = WITH_NEW_TASKS.map((s) => {
    const t = read(s, "requirements.md");
    return t.slice(t.indexOf(SECTION));
  }).join("\n");
  const taskText = WITH_NEW_TASKS.flatMap(checkboxLines).join("\n");

  for (const item of items) {
    it(`${item} is in a requirement`, () => {
      expect(new RegExp(`\\b${item}\\b`).test(requirementText)).toBe(true);
    });
    it(`${item} is in a task`, () => {
      expect(new RegExp(`\\b${item}\\b`).test(taskText)).toBe(true);
    });
  }

  it("ticks a REAL BROWSER task of the second review only when the line records the run and its results file", () => {
    const real = taskText.split("\n").filter((l) => /^- \[[ x]\] \d+\. REAL BROWSER/.test(l));
    expect(real.length).toBeGreaterThan(0);
    for (const l of real) {
      if (/^- \[x\]/.test(l)) expect(l, l).toMatch(/Ran 2026-11-1[34] .*results\/[a-z0-9-]+\.json/);
    }
  });
});
