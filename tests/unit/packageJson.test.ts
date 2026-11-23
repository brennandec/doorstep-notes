import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("package.json", () => {
  const all = { ...pkg.dependencies, ...pkg.devDependencies };

  it("pins every version exactly", () => {
    for (const [name, version] of Object.entries(all)) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("has no runtime dependency other than firebase", () => {
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(["firebase"]);
  });

  it("uses firebase 13.0.0 or later and Playwright 1.65.0", () => {
    const major = Number((pkg.dependencies?.firebase ?? "0").split(".")[0]);
    expect(major).toBeGreaterThanOrEqual(13);
    expect(pkg.devDependencies?.["@playwright/test"]).toBe("1.65.0");
  });
});
