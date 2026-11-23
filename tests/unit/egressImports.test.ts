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
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const importsOf = (text: string) =>
  [...text.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );

// A call to the run method of a cloud job: draft, rewrite or second reader.
const CLOUD_RUN = /\b(\w*(?:draft|rewrite|secondReader)\w*)\s*\.\s*run\s*\(/i;
const MAKES_TICKET = /\bas\s+EgressTicket\b|<EgressTicket>/;

describe("one road out (import scan)", () => {
  it("finds a cloud job call and a ticket made by hand when they are there", () => {
    expect(CLOUD_RUN.test("await kit.draft.run(t, input, mode)")).toBe(true);
    expect(CLOUD_RUN.test("await secondReaderDouble.run(t, x)")).toBe(true);
    expect(CLOUD_RUN.test("await job.run(rawText)")).toBe(false);
    expect(MAKES_TICKET.test("const t = {} as EgressTicket;")).toBe(true);
  });

  it("calls a cloud job's run only from src/egress/send.ts (or inside src/inference, which defines the jobs)", () => {
    const hits = src
      .filter((f) => f !== "src/egress/send.ts" && !f.startsWith("src/inference/"))
      .filter((f) => CLOUD_RUN.test(code(f)));
    expect(hits).toEqual([]);
  });

  it("makes an EgressTicket only in src/egress/send.ts", () => {
    const hits = src.filter((f) => f !== "src/egress/send.ts").filter((f) => MAKES_TICKET.test(code(f)));
    expect(hits).toEqual([]);
  });

  it("send.ts is where the ticket is made and fetch is wrapped", () => {
    const text = code("src/egress/send.ts");
    expect(text).toMatch(/as EgressTicket/);
    expect(text).toMatch(/withCapture\(/);
  });

  it("keeps the ONLY_ON_DEVICE jobs from importing send.ts", () => {
    const deviceJobFiles = src.filter(
      (f) =>
        f.startsWith("src/inference/structure/") ||
        f.startsWith("src/inference/proposeMasks/") ||
        f === "src/firebase/structureSdk.ts" ||
        f === "src/firebase/proposeSdk.ts" ||
        f === "src/masking/devicePass.ts" ||
        f === "src/inference/lengthGuard.ts",
    );
    expect(deviceJobFiles.length).toBeGreaterThan(4);
    const hits = deviceJobFiles.filter((f) => importsOf(read(f)).some((i) => /egress\/send/.test(i)));
    expect(hits).toEqual([]);
  });

  it("keeps all of src/inference and src/masking from importing send.ts", () => {
    const hits = src
      .filter((f) => f.startsWith("src/inference/") || f.startsWith("src/masking/"))
      .filter((f) => importsOf(read(f)).some((i) => /egress\/send/.test(i)));
    expect(hits).toEqual([]);
  });

  it("declares the two device jobs as ONLY_ON_DEVICE", () => {
    const types = read("src/inference/types.ts");
    expect(types).toMatch(/interface StructureJob \{\s*readonly mode: "ONLY_ON_DEVICE"/);
    expect(types).toMatch(/interface ProposeMasksJob \{\s*readonly mode: "ONLY_ON_DEVICE"/);
  });

  it("makes no network call in src/egress except through the captured fetch of a job", () => {
    const hits = walk("src/egress")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /\bfetch\s*\(/.test(code(f)));
    expect(hits).toEqual([]);
  });
});
