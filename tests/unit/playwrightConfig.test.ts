import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startStaticServer } from "../e2e/fixtures/staticServer";

type Config = { projects: { name: string; use: { headless: boolean } }[] };
async function loadConfig(env?: string): Promise<Config> {
  vi.resetModules();
  if (env === undefined) delete process.env["DEVICE_MODEL_HEADED"];
  else process.env["DEVICE_MODEL_HEADED"] = env;
  return (await import("../e2e/playwright.config")).default as unknown as Config;
}
afterEach(() => { delete process.env["DEVICE_MODEL_HEADED"]; });

describe("playwright config", () => {
  it("has the bundled and device-model projects", async () => {
    const c = await loadConfig();
    expect(c.projects.map((p) => p.name)).toEqual(["bundled", "device-model"]);
  });
  it("is headless for every project by default", async () => {
    const c = await loadConfig();
    for (const p of c.projects) expect(p.use.headless, p.name).toBe(true);
  });
  it("only DEVICE_MODEL_HEADED=1 changes it, and only for device-model", async () => {
    for (const v of ["0", "true", "yes", ""]) {
      const c = await loadConfig(v);
      for (const p of c.projects) expect(p.use.headless, `${p.name} with "${v}"`).toBe(true);
    }
    const c = await loadConfig("1");
    expect(c.projects.find((p) => p.name === "bundled")!.use.headless).toBe(true);
    expect(c.projects.find((p) => p.name === "device-model")!.use.headless).toBe(false);
  });
  it("reads no other environment variable that could show a window", () => {
    const source = readFileSync("tests/e2e/playwright.config.ts", "utf8");
    expect([...source.matchAll(/process\.env\[?["'.]?(\w+)/g)].map((m) => m[1])).toEqual(["DEVICE_MODEL_HEADED"]);
    expect(source).not.toMatch(/headless:\s*false/);
  });
  it("has the two scripts under a time limit", () => {
    const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["e2e:bundled"]).toMatch(/alarm 300.*--project=bundled/);
    expect(scripts["e2e:device"]).toMatch(/alarm 300.*--project=device-model/);
  });
});

describe("static server", () => {
  const running: { stop(): Promise<void> }[] = [];
  afterEach(async () => { for (const s of running.splice(0)) await s.stop(); });

  function site() {
    const dir = mkdtempSync(join(tmpdir(), "site-"));
    writeFileSync(join(dir, "index.html"), "<p>hello</p>");
    writeFileSync(join(dir, "probe.txt"), "ok");
    return dir;
  }

  it("serves files, 404s the rest and refuses paths outside the folder", async () => {
    const s = await startStaticServer({ dir: site(), port: 0 });
    running.push(s);
    expect(await (await fetch(s.url + "/")).text()).toBe("<p>hello</p>");
    expect((await fetch(s.url + "/probe.txt?t=1")).status).toBe(200);
    expect((await fetch(s.url + "/nothing.js")).status).toBe(404);
  });

  it("serves a named file from memory ahead of the folder, for the invented config", async () => {
    const s = await startStaticServer({ dir: site(), port: 0, files: { "/firebase.config.local.json": "{\"projectId\":\"invented\"}" } });
    running.push(s);
    const r = await fetch(s.url + "/firebase.config.local.json");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json");
    expect(await r.text()).toBe("{\"projectId\":\"invented\"}");
    expect((await fetch(s.url + "/other.json")).status).toBe(404);
  });

  it("fails when the port is busy and does not fall back", async () => {
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(0, "127.0.0.1", () => r()));
    const busy = (blocker.address() as { port: number }).port;
    await expect(startStaticServer({ dir: site(), port: busy })).rejects.toThrow(/busy/);
    blocker.close();
  });

  it("stops on request and on its own time limit", async () => {
    const a = await startStaticServer({ dir: site(), port: 0 });
    await a.stop();
    await expect(fetch(a.url + "/")).rejects.toThrow();
    const b = await startStaticServer({ dir: site(), port: 0, limitMs: 30 });
    await new Promise((r) => setTimeout(r, 120));
    await expect(fetch(b.url + "/")).rejects.toThrow();
  });
});
