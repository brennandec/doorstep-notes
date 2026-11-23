// DEVICE MODEL, H03. Handwriting photo check.
// Google Chrome with the built-in model, the built app, headless. One invented page of rough
// notes, drawn in a handwriting typeface (tests/fixtures/handwriting/), is added with the
// camera control and nothing typed, so the only input is the picture. It goes through the
// photo path of src/firebase/structureSdk.ts. The same words in printed type are sent in a
// second session for comparison; the printed page is not what is being checked.
// Pass: the handwriting alone makes a record, shown on the screen, labelled "on this device",
// with at least one word of the page in it, and no request leaves the page.
// With Chrome or the model absent the file records a miss with its reason. It never starts a download.
// Writes results/handwriting.json and docs/screens/15-handwriting-record.png.
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { SCREENS_DIR, appReady, recordAbsent, seconds, settleShell } from "./support";

const DIR = "tests/fixtures/handwriting";
const manifest = JSON.parse(readFileSync(`${DIR}/manifest.json`, "utf8")) as {
  people: string[];
  lines: string[];
  handwriting: { file: string; sha256: string; how: string; width: number; height: number };
  printed: { file: string; sha256: string; how: string };
};
/** Words that only the page holds. A record with none of them was not read from the picture. */
const PAGE_WORDS = ["odalys", "brennan", "ione", "heating", "benefits", "post", "door", "flat"];

interface Run {
  kind: "handwriting" | "printed";
  shown: boolean;
  label: string | null;
  seconds: number | null;
  recordText: string;
  wordsRead: string[];
  errorOnPage: string | null;
  requests: { total: number; outsideThePage: number; toCloudModelHost: number };
  browser: string;
  pageErrors: string[];
}

async function oneRun(kind: "handwriting" | "printed", screenshot: boolean): Promise<Run | { absent: Awaited<ReturnType<typeof openDevice>> & { ok: false } }> {
  const out = await openDevice();
  if (!out.ok) return { absent: out };
  const s = out.session;
  const page = s.page;
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  try {
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    const mark = s.recorder.mark();

    // Only the picture: nothing is typed and the invented visit is not loaded.
    const file = kind === "handwriting" ? manifest.handwriting.file : manifest.printed.file;
    await page.setInputFiles("#photo-input", `${DIR}/${file}`);
    await expect(page.locator("[data-photo-line]")).toBeVisible();
    const make = page.locator("#make-record");
    await expect(make).toBeEnabled();
    const t0 = Date.now();
    await make.click();
    const record = page.locator("[data-record]");
    const error = page.locator(".error").first();
    await Promise.race([
      record.waitFor({ state: "visible", timeout: 150_000 }),
      error.waitFor({ state: "visible", timeout: 150_000 }),
    ]).catch(() => undefined);
    const shown = await record.isVisible();
    const errorOnPage = (await error.isVisible()) ? ((await error.innerText()).trim() || null) : null;
    const secs = seconds(Date.now() - t0);

    let label: string | null = null;
    let recordText = "";
    if (shown) {
      label = (await record.locator(".source-label").first().innerText()).trim();
      // Open the folded parts so the words are in the text.
      for (const id of ["#fold-present", "#fold-seen", "#fold-agreed", "#fold-risks", "#fold-next"]) {
        const b = page.locator(id);
        if ((await b.count()) > 0 && (await b.getAttribute("aria-expanded")) === "false") await b.click();
      }
      recordText = ((await record.innerText()) + " " + (await record.locator("input, textarea").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).join(" ")))).replace(/\s+/g, " ").trim();
      if (screenshot) {
        await page.evaluate(() => document.querySelector(".record-title")?.scrollIntoView({ block: "start" }));
        await page.screenshot({ path: `${SCREENS_DIR}/15-handwriting-record.png` });
      }
    }
    const lower = recordText.toLowerCase();
    const requests = summariseRequests(s.recorder.since(mark), s.origin);
    return {
      kind,
      shown,
      label,
      seconds: shown ? secs : null,
      recordText,
      wordsRead: PAGE_WORDS.filter((w) => lower.includes(w)),
      errorOnPage,
      requests: { total: requests.total, outsideThePage: requests.outside.length, toCloudModelHost: requests.cloudModelHost },
      browser: s.browser,
      pageErrors,
    };
  } finally {
    await s.close();
  }
}

test("H03: a handwriting page alone becomes a record, labelled on this device, shown on the screen", async () => {
  test.setTimeout(290_000);
  const retakeScreens = (process.env.RETAKE_SCREENS ?? "").split(",").map((s) => s.trim());
  const takeScreen15 = retakeScreens.includes("all") || retakeScreens.includes("15-handwriting-record");
  const hand = await oneRun("handwriting", takeScreen15);
  if ("absent" in hand) {
    recordAbsent("handwriting", hand.absent, "miss", { fixture: manifest.handwriting.file });
    test.skip(true, hand.absent.reason);
    return;
  }
  const problems: string[] = [];
  if (!hand.shown) problems.push(`No record was shown. ${hand.errorOnPage ? `The page said: "${hand.errorOnPage}"` : "The page showed no error either."}`);
  if (hand.shown && hand.label !== "on this device") problems.push(`The record was labelled "${hand.label}".`);
  if (hand.shown && hand.wordsRead.length === 0) problems.push("A record was shown, but no word of the page is in it, so it was not read from the picture.");
  if (hand.requests.outsideThePage > 0 || hand.requests.toCloudModelHost > 0) problems.push("A request left the page.");
  if (hand.pageErrors.length > 0) problems.push(`Page errors: ${hand.pageErrors.join(" | ")}`);

  // The printed page, for comparison only. It does not decide the result, and a miss on it is not a failure here.
  const p = await oneRun("printed", false);
  const printed: Run | { skipped: string } = "absent" in p ? { skipped: p.absent.reason } : p;

  const body = {
    fixture: { file: manifest.handwriting.file, sha256: manifest.handwriting.sha256, how: manifest.handwriting.how, width: manifest.handwriting.width, height: manifest.handwriting.height },
    input: "the picture only; nothing typed, the invented visit not loaded",
    path: "camera control, then Make the record, through src/firebase/structureSdk.ts (ONLY_ON_DEVICE)",
    handwriting: { shown: hand.shown, label: hand.label, seconds: hand.seconds, wordsRead: hand.wordsRead, wordsOnPageChecked: PAGE_WORDS, record: hand.recordText, errorOnPage: hand.errorOnPage, requests: hand.requests },
    printedForComparison: printed,
    screen: takeScreen15 && hand.shown ? "docs/screens/15-handwriting-record.png (1440 x 900, record title scrolled to the top)" : null,
    limit: "The handwriting is a handwriting typeface with each word moved and tilted, not a person's own hand. One page, one run, one invented text.",
  };
  writeResult("handwriting", problems.length === 0 ? { status: "pass", ...body } : { status: "fail", reason: problems.join(" "), ...body }, hand.browser);
  expect(problems).toEqual([]);
});
