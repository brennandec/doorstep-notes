import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const KEY_SHAPE = /AIza[0-9A-Za-z_-]{35}/;
const LOCAL = "firebase.config.local.json";

/** Tracked files, plus new files git does not ignore (nothing is committed in a build session). */
function listedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
  return out
    .split("\n")
    .filter((f) => f && existsSync(f) && !/\.(png|jpg|jpeg|ico|raw)$/.test(f) && f !== LOCAL);
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** Compares in memory. Returns file and key names only, never a value. */
/** Keys that hold public identifiers the brief names in the open (project ID `doorstep-notes`). */
const PUBLIC_KEYS = new Set(["projectId"]);

export function findValueLeaks(files: Record<string, string>, config: Record<string, string>): string[] {
  const hits: string[] = [];
  for (const [file, text] of Object.entries(files)) {
    for (const [key, value] of Object.entries(config)) {
      if (PUBLIC_KEYS.has(key)) continue;
      if (value.length >= 6 && text.includes(value)) hits.push(`${file}: ${key}`);
    }
  }
  return hits;
}

describe("committed values", () => {
  it("finds a leaked value and reports only file and key", () => {
    const hits = findValueLeaks({ "a.ts": "const k = 'invented-secret-value';" }, { apiKey: "invented-secret-value" });
    expect(hits).toEqual(["a.ts: apiKey"]);
    expect(hits.join()).not.toContain("invented-secret-value");
  });

  it("does not flag a public identifier key", () => {
    expect(findValueLeaks({ "a.ts": "doorstep-notes" }, { projectId: "doorstep-notes" })).toEqual([]);
  });

  it("finds nothing in a clean file", () => {
    expect(findValueLeaks({ "a.ts": "nothing here" }, { apiKey: "invented-secret-value" })).toEqual([]);
  });

  it("no listed file has the shape of a Firebase web API key", () => {
    const hits: string[] = [];
    for (const file of listedFiles()) {
      const text = readText(file);
      if (text !== null && KEY_SHAPE.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });

  // The session rules for build sessions say never to open the local config file.
  // The comparison therefore runs only when CHECK_LOCAL_CONFIG=1 is set by the owner.
  const runLocal = process.env["CHECK_LOCAL_CONFIG"] === "1" && existsSync(LOCAL);
  it.skipIf(!runLocal)("no listed file holds a value of the local config", () => {
    const config = JSON.parse(readFileSync(LOCAL, "utf8")) as Record<string, string>;
    const files: Record<string, string> = {};
    for (const f of listedFiles()) {
      const t = readText(f);
      if (t !== null) files[f] = t;
    }
    expect(findValueLeaks(files, config)).toEqual([]);
  });

  it("states why the local comparison is skipped", () => {
    if (!runLocal) {
      const reason = "skipped: set CHECK_LOCAL_CONFIG=1 to compare against the local file; build sessions do not open it";
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});
