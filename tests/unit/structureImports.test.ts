import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("structure job imports", () => {
  const files = readdirSync("src/inference/structure").map((f) => `src/inference/structure/${f}`);
  it("imports no SDK and no cloud-only path, and makes no request", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      expect(text, f).not.toMatch(/from\s+["'](firebase|@firebase)/);
      expect(text, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|egress\/send|IN_CLOUD_ONLY|ONLY_IN_CLOUD|PREFER_IN_CLOUD/);
    }
  });
});
