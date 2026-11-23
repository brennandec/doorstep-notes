// Results files are written by scripts only (measurement R6.2). Every file
// starts with the same four fields: date, browser, script and script version.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ResultsHeader {
  date: string;
  browser: string;
  script: string;
  scriptVersion: string;
}

export interface HeaderInput {
  browser: string;
  script: string;
  scriptVersion: string;
  now?: Date;
}

export function makeHeader(input: HeaderInput): ResultsHeader {
  for (const field of ["browser", "script", "scriptVersion"] as const) {
    if (input[field].trim() === "") throw new Error(`Results header: ${field} is empty.`);
  }
  return {
    date: (input.now ?? new Date()).toISOString(),
    browser: input.browser,
    script: input.script,
    scriptVersion: input.scriptVersion,
  };
}

/** For a Node script, the "browser" field names the runtime, since no browser is involved. */
export function nodeRuntime(): string {
  return `Node ${process.version} (no browser)`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!deepEqual(left[key], right[key])) return false;
  return true;
}

/** True when every named measurement field already has the same value. The header date is not a measurement. */
export function measurementEqual(existing: Record<string, unknown> | undefined, body: object, keys: readonly string[]): boolean {
  if (!existing) return false;
  const next = body as Record<string, unknown>;
  return keys.every((key) => deepEqual(existing[key], next[key]));
}

/** Writes results/<name>.json with the header fields first. The body cannot replace them. */
export function writeResults(name: string, header: ResultsHeader, body: object, root = process.cwd()): string {
  const dir = resolve(root, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify({ ...header, ...body, ...header }, null, 2) + "\n");
  return file;
}

/**
 * Writes the file only when a named measurement changed.
 * The same numbers leave the committed file, including its date, byte for byte.
 */
export function writeMeasured(name: string, header: ResultsHeader, body: object, keys: readonly string[], root = process.cwd()): string {
  const file = join(resolve(root, "results"), `${name}.json`);
  if (measurementEqual(readResults(name, root), body, keys)) return file;
  return writeResults(name, header, body, root);
}

/** Reads results/<name>.json, or undefined when it is missing or not valid JSON. */
export function readResults(name: string, root = process.cwd()): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(resolve(root, "results"), `${name}.json`), "utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
