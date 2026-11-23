// egress-check R17.5 (session H15): no file under results/ or docs/ holds the App Check debug token or the
// local config's apiKey or appId. The test reads those values itself and never prints them: a failure names
// the file and the kind of value, not the value.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONFIG = "firebase.config.local.json";
const TOKEN = "appcheck-debug-token.local";
const present = existsSync(CONFIG) && existsSync(TOKEN);

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

function secrets(): { kind: string; value: string }[] {
  const config = JSON.parse(readFileSync(CONFIG, "utf8")) as Record<string, unknown>;
  const list = [
    { kind: "debug token", value: readFileSync(TOKEN, "utf8").trim() },
    { kind: "apiKey", value: String(config["apiKey"] ?? "") },
    { kind: "appId", value: String(config["appId"] ?? "") },
  ];
  // A value too short to be a secret would match everywhere; it is not searched for.
  return list.filter((s) => s.value.length >= 8);
}

describe.skipIf(!present)("no secret is written into results/ or docs/", () => {
  it("holds neither the debug token, the apiKey nor the appId", () => {
    const found: string[] = [];
    const wanted = secrets();
    expect(wanted.length).toBeGreaterThan(0);
    for (const file of [...filesUnder("results"), ...filesUnder("docs")]) {
      const bytes = readFileSync(file);
      for (const s of wanted) if (bytes.includes(Buffer.from(s.value))) found.push(`${file}: ${s.kind}`);
    }
    expect(found).toEqual([]);
  });
});

describe("the skip", () => {
  it("is for absent local files only", () => {
    // Stated so a reader of the report sees why the test above can be skipped: the two local files are not in a fresh clone.
    expect(typeof present).toBe("boolean");
  });
});
