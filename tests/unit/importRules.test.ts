import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((n) => walk(join(path, n)));
}
const src = walk("src").filter((f) => /\.tsx?$/.test(f));
const read = (f: string) => readFileSync(f, "utf8");
const importsOf = (text: string) =>
  [...text.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );

describe("import rules", () => {
  it("imports firebase/ai only in src/firebase and src/inference", () => {
    const hits = src
      .filter((f) => !f.startsWith("src/firebase/") && !f.startsWith("src/inference/"))
      .filter((f) => importsOf(read(f)).some((i) => i === "firebase/ai"));
    expect(hits).toEqual([]);
  });

  it("the import scanner sees a firebase/ai import", () => {
    expect(importsOf(`import { getAI } from "firebase/ai";`)).toContain("firebase/ai");
    expect(importsOf(`const m = await import("firebase/ai");`)).toContain("firebase/ai");
  });

  it("has no inference or firebase import in worker code", () => {
    const workers = [...src.filter((f) => /worker/i.test(f)), "public/sw.js", ...walk("public").filter((f) => /worker/i.test(f))]
      .filter((f) => existsSync(f));
    expect(workers).toContain("public/sw.js");
    for (const file of workers) {
      const text = read(file);
      for (const i of importsOf(text)) {
        expect(i, file).not.toMatch(/inference|firebase/);
      }
      expect(text, file).not.toMatch(/importScripts\([^)]*(inference|firebase)/);
    }
    // No file starts a worker that could reach the Prompt API.
    const starters = src.filter((f) => /new\s+(Shared)?Worker\(/.test(read(f)));
    expect(starters).toEqual([]);
  });

  it("touches browser storage only under src/storage", () => {
    const hits = src
      .filter((f) => !f.startsWith("src/storage/"))
      .filter((f) => /\b(indexedDB|localStorage|sessionStorage)\b/.test(read(f).replace(/\/\/.*$/gm, "")));
    expect(hits).toEqual([]);
  });

  it("does not import the storage module's internals from outside", () => {
    const hits = src
      .filter((f) => !f.startsWith("src/storage/"))
      .filter((f) => importsOf(read(f)).some((i) => /storage\/.*\/internal/.test(i)));
    expect(hits).toEqual([]);
  });
});
