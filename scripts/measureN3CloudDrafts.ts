// Order H42 N3 measurement: 12 real IN_CLOUD drafts (temperature: 0) across 4 repo fixture notes x 3 drafts each.
// Runs against dist-e2e via openCloudDevice; uses Device Chrome + real Firebase AI Logic cloud service.
// Invented people only. Prints summary counts without logging secrets.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { expect } from "@playwright/test";
import { inventedVisit } from "../src/app/example/inventedVisit";
import { CLOUD_MODEL_HOST } from "../src/constants";
import { isMissedVisitText } from "../src/inference/missedVisit";
import { checkDailyCloudBudget } from "../tests/e2e/fixtures/cloudCalls";
import { openCloudDevice, recordHeader, replyText } from "../tests/e2e/device/hybridSupport";
import {
  evaluateWrongPersonPronouns,
  findInventedAttribution,
  findMissedVisitFabricatedPresence,
  hasCopiedRecordLabel,
  summarizeMeasuredDrafts,
} from "../tests/e2e/device/n3Audit";
import { appReady, press, settleShell } from "../tests/e2e/device/support";
import { acceptAll } from "../tests/e2e/device/hybridSupport";

interface SynthClient {
  fullName: string;
  otherNames?: string[];
  pronouns?: string;
}

interface SynthFile {
  notes: Array<{ id: string; text: string; clientList: SynthClient[] }>;
}

interface HandwritingManifest {
  note: string;
}

interface FixtureCase {
  id: string;
  label: string;
  note: string;
  clientList: string;
  extraPersonWords: string[];
}

export interface DraftSample {
  fixtureId: string;
  attempt: number;
  outgoingSent: string;
  rawCloudReply: string | null;
  restoredDraft: string;
  sheetNotes: string[];
  finishedLabel: string;
  n4CopiedLabelFail: boolean;
  n5AttributionHit: string | null;
  n6PronounHedgeHit: string | null;
  n7TokenLeakHit: string | null;
  missedVisitFabricatedPresence: string | null;
  hasWrongPersonPronoun: boolean;
  wrongPersonPronounHits: string[];
  hasWrongPersonWarning: boolean;
  silentWrongPersonPronoun: boolean;
}

const formatClientList = (clients: SynthClient[]): string =>
  clients.map((c) => `${c.fullName}; ${(c.otherNames ?? []).join(", ")}; ${c.pronouns ?? ""}`).join("\n");

const HEDGE_RE =
  /\b(?:he|she|they|him|her|them|his|hers|their|theirs|himself|herself|themselves)\s*(?:\/|\bor\b|\band\/or\b)\s*(?:he|she|they|him|her|them|his|hers|their|theirs|himself|herself|themselves)\b|\bor\s+alternatively\b/i;

/** Refuses live measurement with 0 network calls if src/, scripts/, or tests/ has uncommitted changes. */
export function assertCleanMeasurementTree(statusOutput?: string): void {
  const dirty = (
    statusOutput ??
    execFileSync("git", ["status", "--porcelain", "--", "src", "scripts", "tests"], { encoding: "utf8" })
  ).trim();
  if (dirty !== "") {
    throw new Error(
      `Refusing measurement: uncommitted changes in src/scripts/tests:\n${dirty}\nCommit and rebuild before running. 0 network calls made.`,
    );
  }
}

const firstMatch = (text: string, re: RegExp): string | null => {
  const m = text.match(re);
  return m ? m[0] : null;
};

async function clearStorageAndReload(page: import("@playwright/test").Page, origin: string): Promise<void> {
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
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
  await settleShell(page);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
  await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("connected", { timeout: 30_000 });
  await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });
  await expect(page.locator("#note")).toBeVisible({ timeout: 10_000 });
}

import { parseMeasureArgs } from "./measureArgs";
export { parseMeasureArgs };

export async function main(options?: {
  ledgerFile?: string;
  open?: typeof openCloudDevice;
  checkDirty?: boolean;
  dirtyStatusForTest?: string;
  outPath?: string;
}): Promise<void> {
  const ledgerFile = options?.ledgerFile;
  const budget = checkDailyCloudBudget(ledgerFile);
  const neededCalls = 12;
  if (!budget.allowed || budget.remaining < neededCalls) {
    throw new Error(
      `Refusing measurement: daily cloud ledger ${budget.file} is at ${budget.ledger.total}/${budget.ledger.budget} (${budget.remaining} remaining, ${neededCalls} needed). 0 network calls made.`,
    );
  }
  if (options?.open === undefined || options?.checkDirty === true) {
    assertCleanMeasurementTree(options?.dirtyStatusForTest);
  }

  const manifest = JSON.parse(readFileSync("tests/fixtures/handwriting/manifest.json", "utf8")) as HandwritingManifest;
  const synth = JSON.parse(readFileSync("results/synthetic-set.json", "utf8")) as SynthFile;
  const n001 = synth.notes.find((n) => n.id === "n001") ?? synth.notes[0]!;
  const n002 = synth.notes.find((n) => n.id === "n002") ?? synth.notes[1]!;

  const fixtures: FixtureCase[] = [
    {
      id: "inventedVisit",
      label: "inventedVisit",
      note: inventedVisit.note,
      clientList: inventedVisit.clientList,
      extraPersonWords: [],
    },
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
      clientList: formatClientList(n001.clientList),
      extraPersonWords: ["Marta", "Adeyemi"],
    },
    {
      id: "synthetic-n002",
      label: `results/synthetic-set.json#${n002.id}`,
      note: n002.text,
      clientList: formatClientList(n002.clientList),
      extraPersonWords: ["Eilidh"],
    },
  ];

  const open = options?.open ?? openCloudDevice;
  const opened = await open(14, {
    spec: "scripts/measureN3CloudDrafts.ts",
    title: "Order H42c N3 pre-deploy measurement (12 cloud drafts)",
    ...(ledgerFile ? { file: ledgerFile } : {}),
  });
  if (!opened.ok) {
    throw new Error(`openCloudDevice failed: ${opened.reason}`);
  }
  const s = opened.session;
  const page = s.page;
  const capturedReplies: string[] = [];
  s.context.on("response", (res) => {
    const url = res.url();
    if (!url.includes(`//${CLOUD_MODEL_HOST}/`) || !url.includes(":generateContent")) return;
    void res.text().then((body) => {
      capturedReplies.push(replyText(body) ?? "");
    });
  });

  const samples: DraftSample[] = [];
  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const fx of fixtures) {
      await clearStorageAndReload(page, s.origin);
      if (fx.id === "inventedVisit") {
        await press(page, "#try-example");
        await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
      } else {
        await page.locator("#note").fill(fx.note);
        await page.locator("#client-list").fill(fx.clientList);
      }

      await press(page, "#make-record");
      await expect(page.locator("[data-record]")).toBeVisible({ timeout: 150_000 });
      await press(page, "#mask");
      await expect(page.locator("[data-mask-section] .source-label").first()).toBeVisible({ timeout: 150_000 });
      await acceptAll(page);

      for (const word of fx.extraPersonWords) {
        const maskWord = page.locator(`[data-mask-view] [data-likely-word="${word}"]`);
        if ((await maskWord.count()) > 0) await maskWord.first().click();
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        await press(page, "#draft");
        for (let guard = 0; guard < 12; guard++) {
          const keepLikely = page.locator("[data-keep-likely]");
          const blockChip = page.locator("[data-block-chip] button");
          if ((await keepLikely.count()) > 0) {
            const word = await keepLikely.first().getAttribute("data-keep-likely");
            const likelyMask = word ? page.locator(`[data-mask-view] [data-likely-word="${word}"]`) : null;
            if (word && fx.extraPersonWords.includes(word) && likelyMask && (await likelyMask.count()) > 0) {
              await likelyMask.first().click();
            } else {
              await keepLikely.first().click();
            }
            continue;
          }
          if ((await blockChip.count()) > 0) {
            await blockChip.first().click();
            continue;
          }
          if (await page.locator("#send").isEnabled()) break;
          await page.waitForTimeout(100);
        }

        const outgoingSent = await page.locator("[data-outgoing]").innerText();
        const replyIndexBefore = capturedReplies.length;
        await press(page, "#send");
        const finishedSheet = page.locator('[data-zone="finished"] .sheet-text');
        const draftErr = page.locator("[data-draft-error], [data-no-draft]");
        await expect(finishedSheet.or(draftErr).first()).toBeVisible({ timeout: 120_000 });
        if ((await finishedSheet.count()) === 0) {
          throw new Error(`Draft failed for ${fx.id} attempt ${attempt}: ${await draftErr.first().innerText()}`);
        }
        await expect
          .poll(() => capturedReplies.length, { timeout: 15_000, intervals: [100] })
          .toBeGreaterThan(replyIndexBefore);
        const restoredDraft = (await finishedSheet.innerText()).trim();
        console.error(`[N3] ${fx.id} #${attempt} ok (${restoredDraft.length} chars)`);
        const sheetNotes = (await page.locator('[data-zone="finished"] .sheet-notes li').allInnerTexts()).map((t) =>
          t.replace(/\s+/g, " ").trim(),
        );
        const finishedLabel = (await page.locator('[data-zone="finished"] .source-label').first().innerText()).trim();
        const rawCloudReply = capturedReplies[replyIndexBefore] ?? null;

        samples.push({
          fixtureId: fx.id,
          attempt,
          outgoingSent,
          rawCloudReply,
          restoredDraft,
          sheetNotes,
          finishedLabel,
          n4CopiedLabelFail: hasCopiedRecordLabel(restoredDraft),
          n5AttributionHit: findInventedAttribution(restoredDraft, outgoingSent),
          n6PronounHedgeHit: firstMatch(restoredDraft, HEDGE_RE),
          n7TokenLeakHit: firstMatch(restoredDraft, /[[\]{}]/),
          missedVisitFabricatedPresence: findMissedVisitFabricatedPresence({
            note: fx.note,
            outgoingSent,
            rawCloudReply,
            restoredDraft,
          }),
          ...evaluateWrongPersonPronouns({ rawCloudReply, outgoingSent, sheetNotes }),
        });
      }
    }
  } finally {
    await s.close();
  }

  const evaluated = summarizeMeasuredDrafts(
    samples.map((sample) => ({
      ...sample,
      fixtureIsMissedVisit: isMissedVisitText(fixtures.find((f) => f.id === sample.fixtureId)?.note ?? ""),
    })),
  );
  const dateUtc = new Date().toISOString().slice(0, 10);
  const outPath = options?.outPath ?? `results/h42-n3-cloud-drafts-${dateUtc}.json`;
  const out = {
    ...recordHeader(s.browser),
    status: evaluated.status,
    purpose: "Order H43b measurement: 12 real cloud drafts across 4 fixture notes x 3 drafts each (temperature: 0).",
    fixtures: fixtures.map((f) => ({ id: f.id, label: f.label })),
    summary: evaluated.summary,
    samples,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ file: outPath, status: out.status, ...out.summary }, null, 2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(parseMeasureArgs(process.argv.slice(2))).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
