// @vitest-environment happy-dom
// The test-only seeded leak (egress-check R6.2, design "Network recorder").
// The hook exists only in a build made with mode "e2e". The page reads
// window.__seedLeak (a string, an invented listed name) and appends it to the
// body after the preview and before the egress check, to prove a leak is caught.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { E2E_MODE, seedLeakFrom } from "../../src/app/testHooks";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const text = (b: Uint8Array) => new TextDecoder().decode(b);
const body = new TextEncoder().encode('{"contents":[]}');

describe("seedLeakFrom", () => {
  it("gives nothing in any mode but e2e, even when the window property is set", () => {
    for (const mode of ["production", "development", "test", ""]) {
      expect(seedLeakFrom(mode, { __seedLeak: "Tomas Brandvold" }), mode).toBeUndefined();
    }
  });

  it("gives nothing in the e2e build until the property is set to a non-empty string", () => {
    expect(seedLeakFrom(E2E_MODE, {})).toBeUndefined();
    expect(seedLeakFrom(E2E_MODE, { __seedLeak: "" })).toBeUndefined();
    expect(seedLeakFrom(E2E_MODE, { __seedLeak: 7 })).toBeUndefined();
  });

  it("appends the invented name to the body bytes in the e2e build", () => {
    const hook = seedLeakFrom(E2E_MODE, { __seedLeak: "Tomas Brandvold" })!;
    expect(text(hook(body))).toContain("Tomas Brandvold");
    expect(text(hook(body)).startsWith('{"contents":[]}')).toBe(true);
  });
});

describe("the hook is not in the production build path", () => {
  it("main.ts reads the hook only behind the build mode check", () => {
    const main = readFileSync("src/app/main.ts", "utf8");
    expect(main).toMatch(/import\.meta\.env\.MODE === E2E_MODE/);
  });
  it("the e2e build is a separate folder that git ignores", () => {
    const lines = readFileSync(".gitignore", "utf8").split("\n").map((l) => l.trim());
    expect(lines).toContain("dist-e2e/");
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["build:e2e"]).toMatch(/--mode e2e/);
    expect(scripts["build:e2e"]).toMatch(/--outDir dist-e2e/);
    expect(scripts["build"]).not.toMatch(/e2e/);
  });
});

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

describe("a seeded leak through the draft path", () => {
  async function run(seedLeak: ((b: Uint8Array) => Uint8Array) | undefined) {
    const root = document.createElement("div");
    document.body.append(root);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no request expected"); }));
    const ledger = makeLedger();
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: false,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      drafting: {
        draftFor: () => draftDouble,
        ledger,
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => undefined,
        ...(seedLeak ? { seedLeak: () => seedLeak } : {}),
      },
    });
    await c.start();
    const press = async (sel: string) => {
      if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
      (root.querySelector(sel) as HTMLButtonElement).click();
      await settle();
    };
    await press("#try-example");
    await press("#make-record");
    await press("#mask");
    await press("#draft");
    // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it.
    for (let i = 0; i < 5 && root.querySelector("[data-keep-likely]"); i++) await press("[data-keep-likely]");
    await press("#send");
    vi.unstubAllGlobals();
    return { root, ledger };
  }

  it("without the hook the line passes", async () => {
    const { root } = await run(undefined);
    expect(root.querySelector("[data-egress-line]")?.getAttribute("data-kind")).toBe("pass");
  });

  it("with the hook the line fails, says Found, and names the invented client", async () => {
    const hook = seedLeakFrom(E2E_MODE, { __seedLeak: "Priya Halloran" })!;
    const { root, ledger } = await run(hook);
    const line = root.querySelector("[data-egress-line]")!;
    expect(line.getAttribute("data-kind")).toBe("fail");
    expect(line.classList.contains("fail")).toBe(true);
    expect(line.textContent).toContain("Egress check failed");
    expect(line.textContent).toContain("Found");
    expect(line.textContent).toContain("Priya Halloran");
    expect(line.querySelector('[data-icon-name="crossedOctagon"]')).not.toBeNull();
    expect(ledger.all().at(-1)?.listedFound).toBeGreaterThan(0);
  });
});
