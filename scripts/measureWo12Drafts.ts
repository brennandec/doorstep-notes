// WO-12 measurement on the quiet screens.
// Cloud: 12 sends, one generateContent each, no second reader.
// Device: the same 12 visits with the page offline, so Draft runs on the Nano model and no generateContent leaves.
// Invented people only. Prints counts. Does not print a config or a token.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";
import { inventedVisit } from "../src/app/example/inventedVisit";
import { CASE_HEADINGS, plainCaseNote, reportingVerbAbsentFromNote } from "../src/drafting/caseNote";
import { CLOUD_MODEL_HOST } from "../src/constants";
import { isMissedVisitText } from "../src/inference/missedVisit";
import { checkDailyCloudBudget } from "../tests/e2e/fixtures/cloudCalls";
import { openDevice } from "../tests/e2e/fixtures/deviceModel";
import { openCloudDevice, recordHeader, replyText } from "../tests/e2e/device/hybridSupport";
import { findInventedAttribution, findMissedVisitFabricatedPresence } from "../tests/e2e/device/n3Audit";
import { appReady, settleShell } from "../tests/e2e/device/support";
import { assertCleanMeasurementTree } from "./measureN3CloudDrafts";
import {
  fivePartsPresent,
  namesPutBack,
  cloudWordsBeforeDraft,
  summarizeWo12,
  tagLeak,
  unclearAfterSecondPerson,
  type CasePartText,
} from "./wo12Score";

interface SynthClient {
  fullName: string;
  otherNames?: string[];
  pronouns?: string;
}

interface FixtureCase {
  id: string;
  label: string;
  note: string;
  clientList: string;
  extraPersonWords: string[];
}

const PART_KEYS = ["purpose", "observed", "agreed", "risks", "next"] as const;

function parseArgs(argv: readonly string[]): { mode: "cloud" | "device" | null; outPath?: string } {
  let mode: "cloud" | "device" | null = null;
  let outPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--mode") {
      const value = argv[i + 1];
      if (value === "cloud" || value === "device") mode = value;
      i += 1;
    } else if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value === "cloud" || value === "device") mode = value;
    } else if (arg === "--out" && argv[i + 1]) {
      outPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length).trim();
      if (value !== "") outPath = value;
    }
  }
  return { mode, ...(outPath ? { outPath } : {}) };
}

function clientNames(list: string): string[] {
  return list
    .split("\n")
    .map((line) => line.split(";")[0]?.trim() ?? "")
    .filter((name) => name !== "");
}

function loadFixtures(): FixtureCase[] {
  const manifest = JSON.parse(readFileSync("tests/fixtures/handwriting/manifest.json", "utf8")) as { note: string };
  const synth = JSON.parse(readFileSync("results/synthetic-set.json", "utf8")) as {
    notes: Array<{ id: string; text: string; clientList: SynthClient[] }>;
  };
  const n001 = synth.notes.find((note) => note.id === "n001") ?? synth.notes[0]!;
  const n002 = synth.notes.find((note) => note.id === "n002") ?? synth.notes[1]!;
  const format = (clients: SynthClient[]) =>
    clients.map((client) => `${client.fullName}; ${(client.otherNames ?? []).join(", ")}; ${client.pronouns ?? ""}`).join("\n");
  return [
    { id: "inventedVisit", label: "inventedVisit", note: inventedVisit.note, clientList: inventedVisit.clientList, extraPersonWords: [] },
    {
      id: "handwriting-manifest",
      label: "tests/fixtures/handwriting/manifest.json",
      note: manifest.note,
      clientList: "Odalys Brennan-Webb; ; she/her\nIone; ; she/her",
      extraPersonWords: [],
    },
    {
      id: "synthetic-n001",
      label: `results/synthetic-set.json#${n001.id}`,
      note: n001.text,
      clientList: format(n001.clientList),
      extraPersonWords: ["Marta", "Adeyemi"],
    },
    {
      id: "synthetic-n002",
      label: `results/synthetic-set.json#${n002.id}`,
      note: n002.text,
      clientList: format(n002.clientList),
      extraPersonWords: ["Eilidh"],
    },
  ];
}

async function resetVisit(page: Page, origin: string, mode: "cloud" | "device"): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        try {
          localStorage.clear();
          sessionStorage.clear();
          const req = indexedDB.open("doorstep-notes", 1);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
          };
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction("kv", "readwrite");
              tx.objectStore("kv").clear();
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => {
                db.close();
                resolve();
              };
            } catch {
              db.close();
              resolve();
            }
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      }),
  );
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await appReady(page);
  await settleShell(page);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
  if (mode === "cloud") {
    // WO-02: "connected" is only after an IN_CLOUD answer. Before the draft call the chip
    // reads the ready words. The 2026-11-22 run stopped here on "connected" and made 0 calls.
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText(cloudWordsBeforeDraft(), { timeout: 30_000 });
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
  } else {
    await page.context().setOffline(true);
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("offline", { timeout: 15_000 });
  }
}

async function loadFixture(page: Page, fx: FixtureCase): Promise<void> {
  if (fx.id === "inventedVisit") {
    await page.locator("#try-example").click();
    await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
  } else {
    await page.locator("#note").fill(fx.note);
    await page.locator("#client-list").fill(fx.clientList);
  }
  await page.locator("#make-record").click();
  await expect(page.locator("#open-send")).toBeVisible({ timeout: 180_000 });
}

async function readOutgoing(page: Page): Promise<string> {
  const node = page.locator("#exact-text, [data-outgoing]").first();
  if ((await node.count()) === 0) return "";
  return (await node.evaluate((el) => el.textContent ?? "")).trim();
}

async function enabled(locator: Locator): Promise<boolean> {
  return locator.isEnabled({ timeout: 1_000 }).catch(() => false);
}

async function resolveAsk(page: Page, extra: readonly string[]): Promise<"finished" | "send" | "stuck"> {
  let askedOnce = false;
  for (let guard = 0; guard < 40; guard++) {
    if ((await page.locator("[data-case-note]").count()) > 0) return "finished";
    const send = page.locator("#send");
    if ((await send.count()) > 0 && (await enabled(send))) return "send";
    if ((await page.locator("[data-working]").count()) > 0) {
      await page.waitForTimeout(400);
      continue;
    }
    const keep = page.locator("[data-keep-likely]");
    if ((await keep.count()) > 0) {
      const word = await keep.first().getAttribute("data-keep-likely");
      const mask = word ? page.locator(`[data-likely-word="${word}"]`) : null;
      if (word && extra.includes(word) && mask && (await mask.count()) > 0) await mask.first().click();
      else await keep.first().click();
      askedOnce = false;
      continue;
    }
    const block = page.locator("[data-block-chip] button");
    if ((await block.count()) > 0) {
      await block.first().click();
      askedOnce = false;
      continue;
    }
    if (!askedOnce) {
      const open = page.locator("#open-send");
      if ((await open.count()) > 0 && (await enabled(open))) {
        await open.click();
        askedOnce = true;
        await page.waitForTimeout(300);
        continue;
      }
      const draft = page.locator("#draft");
      if ((await draft.count()) > 0 && (await enabled(draft))) {
        await draft.click();
        askedOnce = true;
        await page.waitForTimeout(300);
        continue;
      }
    }
    await page.waitForTimeout(250);
  }
  if ((await page.locator("[data-case-note]").count()) > 0) return "finished";
  if ((await page.locator("#send").isEnabled().catch(() => false))) return "send";
  return "stuck";
}

async function readParts(page: Page): Promise<CasePartText> {
  const parts: CasePartText = { purpose: "", observed: "", agreed: "", risks: "", next: "" };
  const sections = page.locator("[data-case-part]");
  const count = await sections.count();
  for (let i = 0; i < Math.min(count, PART_KEYS.length); i++) {
    const heading = ((await sections.nth(i).locator("h3").innerText()) || "").trim();
    const keyAt = CASE_HEADINGS.indexOf(heading as (typeof CASE_HEADINGS)[number]);
    if (keyAt < 0) continue;
    const paras = sections.nth(i).locator("p");
    const n = await paras.count();
    const lines: string[] = [];
    for (let p = 0; p < n; p++) lines.push((await paras.nth(p).innerText()).trim());
    parts[PART_KEYS[keyAt]!] = lines.filter((line) => line !== "").join("\n");
  }
  return parts;
}

async function failureLine(page: Page): Promise<string> {
  const err = page.locator("[data-refused-line], [data-draft-error], [data-no-draft], .error");
  if ((await err.count()) === 0) return "";
  return (await err.first().innerText()).replace(/\s+/g, " ").trim();
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.mode === null) {
    throw new Error("Refusing measurement: pass --mode cloud or --mode device. 0 calls made.");
  }
  const mode = args.mode;
  if (mode === "cloud") {
    const budget = checkDailyCloudBudget();
    if (!budget.allowed || budget.remaining < 12) {
      throw new Error(
        `Refusing measurement: daily cloud ledger ${budget.file} is at ${budget.ledger.total}/${budget.ledger.budget} (${budget.remaining} remaining, 12 needed). 0 network calls made.`,
      );
    }
  }
  assertCleanMeasurementTree();
  const fixtures = loadFixtures();
  // Device drafts use the Nano profile and the e2e bundle. openCloudDevice reads the
  // Firebase config and the App Check token, which this mode does not need.
  const opened =
    mode === "cloud"
      ? await openCloudDevice(12, {
          spec: "scripts/measureWo12Drafts.ts",
          title: "WO-12 12 cloud drafts",
        })
      : await openDevice({
          dir: "dist-e2e",
          allowOutside: false,
          generateContentCap: 0,
          serverLimitMs: 100 * 60 * 1000,
        });
  if (!opened.ok) {
    throw new Error(`${mode === "cloud" ? "openCloudDevice" : "openDevice"} failed: ${opened.reason}`);
  }
  const session = opened.session;
  const page = session.page;
  const captured: string[] = [];
  session.context.on("response", (res) => {
    const url = res.url();
    if (!url.includes(`//${CLOUD_MODEL_HOST}/`) || !url.includes(":generateContent")) return;
    void res.text().then((body) => {
      captured.push(replyText(body) ?? "");
    });
  });

  const samples: Array<Record<string, unknown>> = [];
  let runError: string | null = null;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const fx of fixtures) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (captured.length > 12) throw new Error(`Stopping: generateContent replies ${captured.length} exceed 12.`);
        try {
        await resetVisit(page, session.origin, mode);
        await loadFixture(page, fx);
        const outgoingSent = await readOutgoing(page);
        const before = captured.length;
        const asked = await resolveAsk(page, fx.extraPersonWords);
        let cloudCalls = 0;
        if (mode === "cloud" && asked === "send") {
          await page.locator("#send").click();
          cloudCalls = 1;
        } else if (mode === "cloud" && asked !== "finished") {
          samples.push({
            fixtureId: fx.id,
            attempt,
            error: await failureLine(page),
            asked,
            fiveParts: false,
            invented: false,
            tagLeak: false,
            unclear: false,
            namesBack: false,
            cloudCalls: 0,
          });
          console.error(`[WO-12] ${fx.id} #${attempt} stuck before send`);
          continue;
        }
        if (mode === "cloud" && asked === "finished") {
          samples.push({
            fixtureId: fx.id,
            attempt,
            error: "the note finished before Send, so this attempt was not a cloud call",
            asked,
            fiveParts: false,
            invented: false,
            tagLeak: false,
            unclear: false,
            namesBack: false,
            cloudCalls: 0,
          });
          console.error(`[WO-12] ${fx.id} #${attempt} finished before send`);
          continue;
        }
        if (mode === "device" && asked === "send") {
          samples.push({
            fixtureId: fx.id,
            attempt,
            error: "send stayed available while the page was supposed to be offline",
            asked,
            fiveParts: false,
            invented: false,
            tagLeak: false,
            unclear: false,
            namesBack: false,
            cloudCalls: 0,
          });
          console.error(`[WO-12] ${fx.id} #${attempt} offline draft did not run`);
          continue;
        }
        const note = page.locator("[data-case-note]");
        const err = page.locator("[data-refused-line], [data-draft-error], [data-no-draft], .error");
        await expect(note.or(err).first()).toBeVisible({ timeout: 180_000 });
        if ((await note.count()) === 0) {
          samples.push({
            fixtureId: fx.id,
            attempt,
            error: await failureLine(page),
            fiveParts: false,
            invented: false,
            tagLeak: false,
            unclear: false,
            namesBack: false,
            cloudCalls,
          });
          console.error(`[WO-12] ${fx.id} #${attempt} no case note`);
          continue;
        }
        if (mode === "cloud") {
          await expect.poll(() => captured.length, { timeout: 20_000, intervals: [200] }).toBeGreaterThan(before);
          cloudCalls = captured.length - before;
        }
        const parts = await readParts(page);
        const shown = plainCaseNote(parts);
        const raw = mode === "cloud" ? captured[before] ?? null : null;
        const names = clientNames(fx.clientList);
        const inventedHit =
          reportingVerbAbsentFromNote(shown, fx.note) ??
          findInventedAttribution(shown, outgoingSent) ??
          findMissedVisitFabricatedPresence({
            note: fx.note,
            outgoingSent,
            rawCloudReply: raw,
            restoredDraft: shown,
          });
        const leak = tagLeak(shown);
        const unclearHit = unclearAfterSecondPerson(shown, names);
        const flags = {
          fiveParts: fivePartsPresent(parts),
          invented: inventedHit !== null,
          tagLeak: leak !== null,
          unclear: unclearHit !== null,
          namesBack: namesPutBack({ shown, raw, names }),
        };
        const source = await page.locator("[data-receipt] [data-source]").first().getAttribute("data-source").catch(() => null);
        samples.push({
          fixtureId: fx.id,
          attempt,
          outgoingSent,
          rawReply: raw,
          parts,
          shown,
          source,
          inventedHit,
          leak,
          unclearHit,
          cloudCalls,
          callsSoFar: captured.length,
          ...flags,
        });
        console.error(`[WO-12] ${mode} ${fx.id} #${attempt} five=${flags.fiveParts} calls=${captured.length}`);
        } catch (error) {
          const message = error instanceof Error ? error.message.split("\n")[0] ?? "attempt failed" : String(error);
          samples.push({
            fixtureId: fx.id,
            attempt,
            error: message,
            fiveParts: false,
            invented: false,
            tagLeak: false,
            unclear: false,
            namesBack: false,
            cloudCalls: 0,
          });
          console.error(`[WO-12] ${fx.id} #${attempt} ${message}`);
        }
      }
    }
  } catch (error) {
    runError = error instanceof Error ? error.message : String(error);
  } finally {
    await session.close();
  }
  if (runError) console.error(runError);

  const flags = samples.map((sample) => ({
    fiveParts: sample["fiveParts"] === true,
    invented: sample["invented"] === true,
    tagLeak: sample["tagLeak"] === true,
    unclear: sample["unclear"] === true,
    namesBack: sample["namesBack"] === true,
  }));
  const summary = summarizeWo12(flags, mode);
  const dateUtc = new Date().toISOString().slice(0, 10);
  const outPath = args.outPath ?? `results/wo12-${mode}-drafts-${dateUtc}.json`;
  const tree = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const out = {
    ...recordHeader(session.browser),
    plate: "WO-12",
    mode,
    sourceTree: tree,
    fixtureIsMissedVisit: fixtures.map((fx) => ({ id: fx.id, missed: isMissedVisitText(fx.note) })),
    generateContentReplies: captured.length,
    summary,
    samples,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ file: outPath, mode, generateContentReplies: captured.length, runError, ...summary }));
  if (runError) throw new Error(runError);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
