import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe(".gitignore and config files", () => {
  const lines = readFileSync(".gitignore", "utf8").split("\n").map((l) => l.trim());

  it("ignores the local config, the browser profile and dist", () => {
    expect(lines).toContain("firebase.config.local.json");
    expect(lines).toContain(".browser-profile/");
    expect(lines).toContain("dist/");
  });

  it("keeps placeholders in the example config", () => {
    const example = JSON.parse(readFileSync("firebase.config.example.json", "utf8")) as Record<string, string>;
    expect(Object.keys(example).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(example)) {
      expect(value, key).toBe(`<${key}>`);
    }
  });
});
