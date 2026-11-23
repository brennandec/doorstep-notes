import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CHROME_PATH, PROFILE_DIR, deviceLaunchOptions, summariseRequests, writeResult } from "../e2e/fixtures/deviceModel";

// The launch is the one in docs/decisions/2026-11-13-browser-on-this-computer.md, "The launch that works".
describe("DEVICE MODEL fixture launch options", () => {
  const profile = resolve(PROFILE_DIR);

  it("uses the installed Google Chrome by path and drops every default switch", () => {
    const o = deviceLaunchOptions({});
    expect(o.executablePath).toBe("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    expect(CHROME_PATH).toBe(o.executablePath);
    expect(o.ignoreDefaultArgs).toBe(true);
    expect(PROFILE_DIR).toBe(".browser-profile");
  });

  it("passes exactly the documented switches, the profile folder first and about:blank last", () => {
    const o = deviceLaunchOptions({});
    expect(o.args).toEqual([
      `--user-data-dir=${profile}`,
      "--remote-debugging-pipe",
      "--no-first-run",
      "--no-default-browser-check",
      "--use-mock-keychain",
      "--password-store=basic",
      "--headless=new",
      "about:blank",
    ]);
  });

  it("is headless unless DEVICE_MODEL_HEADED is exactly 1", () => {
    for (const value of [undefined, "0", "true", "", "yes"]) {
      const o = deviceLaunchOptions({ DEVICE_MODEL_HEADED: value });
      expect(o.headless, String(value)).toBe(true);
      expect(o.args).toContain("--headless=new");
    }
    const headed = deviceLaunchOptions({ DEVICE_MODEL_HEADED: "1" });
    expect(headed.headless).toBe(false);
    expect(headed.args).not.toContain("--headless=new");
  });

  it("sets no flag for the model, no component-update switch and no download switch", () => {
    const joined = deviceLaunchOptions({}).args.join(" ");
    expect(joined).not.toMatch(/enable-features|enable-blink|disable-component-update|optimization-guide|on-device-model/i);
  });

  it("reads no other environment variable", () => {
    const source = readFileSync("tests/e2e/fixtures/deviceModel.ts", "utf8");
    const names = [...source.matchAll(/env\[\s*["'](\w+)["']\s*\]/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(["DEVICE_MODEL_HEADED"]));
    expect(source).not.toMatch(/process\.env\.\w+/);
  });

  it("calls create() only inside a click handler and never asks for a download", () => {
    const source = readFileSync("tests/e2e/fixtures/deviceModel.ts", "utf8");
    expect(source).toMatch(/addEventListener\("click"[\s\S]*lm\.create\(/);
    expect(source).toMatch(/!== "available"\) return "not available"/);
    expect(source).not.toMatch(/initializeDeviceModel|monitor:/);
  });

  it("reads availability before anything else once the page is open", () => {
    const source = readFileSync("tests/e2e/fixtures/deviceModel.ts", "utf8");
    const open = source.slice(source.indexOf("export async function openDevice"));
    expect(open.indexOf("readAvailability(")).toBeGreaterThan(-1);
    expect(open.indexOf("readAvailability(")).toBeLessThan(open.indexOf("return { ok: true"));
  });
});

describe("DEVICE MODEL results", () => {
  it("writes a miss with its reason, its date, its time and its browser", () => {
    const root = mkdtempSync(join(tmpdir(), "results-"));
    const file = writeResult("device-model-check", { status: "miss", reason: "Chrome is not installed" }, "none", root);
    const body = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    expect(body["status"]).toBe("miss");
    expect(body["reason"]).toBe("Chrome is not installed");
    expect(body["browser"]).toBe("none");
    expect(body["date"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body["time"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("request summary", () => {
  const origin = "http://127.0.0.1:4311";
  it("separates the served page from anything else and flags the cloud model host", () => {
    const s = summariseRequests(
      [
        { url: `${origin}/`, method: "GET", bodyBytes: 0, refused: false },
        { url: `${origin}/assets/x.js`, method: "GET", bodyBytes: 0, refused: false },
        { url: "https://firebasevertexai.googleapis.com/v1beta/x:generateContent", method: "POST", bodyBytes: 120, refused: true },
        { url: "https://example.test/a?token=abc", method: "GET", bodyBytes: 0, refused: true },
      ],
      origin,
    );
    expect(s.total).toBe(4);
    expect(s.sameOrigin).toBe(2);
    expect(s.outside).toHaveLength(2);
    expect(s.cloudModelHost).toBe(1);
    // The query part of an outside address is never written to a results file.
    expect(JSON.stringify(s)).not.toContain("token=abc");
  });
  it("counts nothing outside when only the served page was asked for", () => {
    const s = summariseRequests([{ url: `${origin}/`, method: "GET", bodyBytes: 0, refused: false }], origin);
    expect(s.outside).toEqual([]);
    expect(s.cloudModelHost).toBe(0);
  });
});

describe("DEVICE MODEL fixture keeps the profile", () => {
  const source = readFileSync("tests/e2e/fixtures/deviceModel.ts", "utf8");
  it("clears site data of the served origin only and never deletes the profile folder", () => {
    expect(source).toMatch(/Storage\.clearDataForOrigin", \{ origin, storageTypes: "all" \}/);
    expect(source).not.toMatch(/rmSync|rmdirSync|unlinkSync|fs\.rm|rimraf/);
  });
  it("refuses every request outside the served page and lists it, except what the allow list passes (H15)", () => {
    expect(source).toMatch(/inside = url\.startsWith\(origin\)/);
    expect(source).toMatch(/allowedBy = !inside && options\.allowOutside \? allowedOutside\(/);
    expect(source).toMatch(/refused = !inside && allowedBy === null/);
    expect(source).toMatch(/route\.abort\(\)/);
  });
  it("closes the browser before the server, and each file calls close()", () => {
    expect(source.indexOf("context.close()")).toBeLessThan(source.indexOf("await server.stop();\n  };"));
  });
});
