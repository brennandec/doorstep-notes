// H20 R5 and R2.4: the README agrees with itself and with the build she is given.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const result = (f: string) => JSON.parse(readFileSync(`results/${f}`, "utf8")) as { status?: string };

describe("README (H20 R5)", () => {
  it("has no working-title line", () => {
    expect(readme).not.toMatch(/working title/i);
  });

  it("does not say part B or the network-drop check has not run, while the records say they passed", () => {
    expect(result("h2-part-b-2026-11-14-h16.json").status).toBe("pass");
    expect(result("draft-network-drop-2026-11-14-h18.json").status).toBe("pass");
    expect(readme).not.toMatch(/H2 part B[^\n]*has not run/);
    expect(readme).not.toMatch(/Part B, against the real service, has not run/);
    expect(readme).not.toMatch(/network drops mid-call has not run/);
    expect(readme).not.toContain("`results/draft-network-drop.json`).");
  });

  it("says the sentence about the second reader's pass line once", () => {
    const sentence = "Under the guesses the page shows a line for that pass";
    expect(readme.split(sentence).length - 1).toBe(1);
  });

  it("makes screen 14 (the block) the first picture, then 05, then 17", () => {
    const pictures = [...readme.matchAll(/!\[[^\]]*\]\((docs\/screens\/[^)]+)\)/g)].map((m) => m[1]);
    expect(pictures.slice(0, 3)).toEqual([
      "docs/screens/14-send-blocked.png",
      "docs/screens/05-finished-note.png",
      "docs/screens/17-second-reader-real-service.png",
    ]);
    for (const p of pictures) expect(existsSync(p!), p).toBe(true);
  });

  it("names no save control for the ledger and no write to a fixed sample (H20 R2.4)", () => {
    expect(readme).not.toContain(["Save", " ledger"].join(""));
    expect(readme).not.toMatch(/Written to the test double/);
  });
});
