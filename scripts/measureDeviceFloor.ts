// WO-11: one fresh Chrome profile. availability() only. No create(), no download.
import { chromium } from "@playwright/test";
import { existsSync, readdirSync, rmSync, statfsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHROME_PATH, describeMachine, deviceLaunchOptions, readAvailability, writeResult } from "../tests/e2e/fixtures/deviceModel";

export async function main(): Promise<void> {
  if (!existsSync(CHROME_PATH)) throw new Error(`Google Chrome is not installed at ${CHROME_PATH}`);
  const dir = mkdtempSync(join(tmpdir(), "doorstep-device-floor-"));
  const filesBefore = readdirSync(dir).length;
  if (filesBefore !== 0) throw new Error("The fresh profile directory was not empty.");
  const launch = deviceLaunchOptions({ DEVICE_MODEL_HEADED: undefined });
  const args = launch.args.filter((arg) => !arg.startsWith("--user-data-dir="));
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>device floor</title>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const pageUrl = `http://127.0.0.1:${port}/`;
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    context = await chromium.launchPersistentContext(dir, {
      executablePath: launch.executablePath,
      headless: true,
      ignoreDefaultArgs: true,
      args,
      viewport: launch.viewport,
    });
    const page = context.pages()[0] ?? (await context.newPage());
    // about:blank does not expose LanguageModel. A localhost page does (results/only-on-device-guard-2026-11-17-h45.json).
    await page.goto(pageUrl);
    await page.evaluate(() => {
      const lm = (globalThis as { LanguageModel?: { create?: (...args: unknown[]) => Promise<unknown> } }).LanguageModel;
      const holder = globalThis as { __deviceFloorCreates?: number };
      holder.__deviceFloorCreates = 0;
      if (!lm?.create) return;
      const create = lm.create.bind(lm);
      lm.create = async (...args: unknown[]) => {
        holder.__deviceFloorCreates = (holder.__deviceFloorCreates ?? 0) + 1;
        return create(...args);
      };
    });
    const availability = await readAvailability(page);
    const observed = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      creates: (globalThis as { __deviceFloorCreates?: number }).__deviceFloorCreates ?? 0,
    }));
    if (observed.creates !== 0) throw new Error(`create() ran ${observed.creates} time(s). The floor check must not start a download.`);
    let profileVolumeFreeBytes: number | null = null;
    try {
      const space = statfsSync(dir);
      profileVolumeFreeBytes = Number(space.bavail) * Number(space.bsize);
    } catch {
      profileVolumeFreeBytes = null;
    }
    const version = context.browser()?.version() ?? "unknown";
    const browser = `Google Chrome ${version}`;
    const answered = availability === "unavailable" || availability === "downloadable" || availability === "downloading" || availability === "available" || availability === "no LanguageModel" || availability === "no answer";
    const path = writeResult("device-floor", {
      status: answered ? "pass" : "miss",
      reason: "Fresh Chrome profile. availability() only. create() was not called. No download was started.",
      profile: "fresh",
      headless: true,
      pageOrigin: "http://127.0.0.1",
      profileFilesBeforeLaunch: filesBefore,
      availability,
      createCalled: false,
      downloadStarted: false,
      userAgent: observed.userAgent,
      hardwareConcurrency: observed.hardwareConcurrency,
      deviceMemoryGb: observed.deviceMemoryGb,
      profileVolumeFreeBytes,
      machine: describeMachine(),
      floorSource: "docs/sdk-facts.md item 5, read 2026-11-12",
    }, browser);
    console.log(path);
  } finally {
    if (context) await Promise.race([context.close().catch(() => undefined), new Promise((r) => setTimeout(r, 15000))]);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
}
