// BUNDLED. capture-and-record task 34 (R15, H24): a kept device record with three missing note sentences shows three lines
// under the masking controls, and Add to Seen moves one into Seen. 0 device calls, 0 cloud calls. Serves R15.
// The kept document is built in node with the app's own store code over a memory backend and put into the page's IndexedDB.
import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { Page } from "@playwright/test";
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { KEPT_KEY } from "../../../src/constants";
import { checkVisitRecord } from "../../../src/inference/structure/structure.schema";
import { memoryBackend } from "../../../src/storage/backend";
import { emptyVisit, makeKeptStore } from "../../../src/storage/kept";
import { expect, serveForFile, task, test } from "../fixtures/base";
import { newRecordPath, nextRecordSuffix, writeRecord } from "../fixtures/records";

const site = serveForFile("dist");

const THREE = ["Landlord not replied to 2 emails.", "Maria missed the benefits form deadline last wk, letter on the table.", "DOB on form 3/3/87."];

async function putKept(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(
    ([k, v]) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open("doorstep-notes", 1);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains("kv")) open.result.createObjectStore("kv");
        };
        open.onerror = () => fail(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(v, k as string);
          tx.oncomplete = () => { open.result.close(); done(); };
          tx.onerror = () => fail(tx.error);
        };
      }),
    [key, value] as [string, unknown],
  );
}

test("Record missing: a kept device record lists three note sentences, and Add to Seen moves one", async ({ page }, info) => {
  task(info, "capture-and-record 34");
  await page.setViewportSize({ width: 1440, height: 900 });
  const suffix = nextRecordSuffix("record-missing", "h24");
  const file = newRecordPath("record-missing", process.cwd(), suffix);
  const rec: Record<string, unknown> = { status: "fail", spec: "tests/e2e/bundled/recordMissing.spec.ts", linesBefore: null, linesAfter: null, nonLocalRequests: null, screenshot: "test-results/record-missing-h24.png", file };
  writeRecord("record-missing", rec, process.cwd(), suffix);

  let nonLocal = 0;
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") return route.continue();
    nonLocal += 1;
    return route.abort();
  });

  // The kept document: the invented note, the rehearsal's second reply, and recordChecked true.
  const reply = JSON.parse(readFileSync(join("results", "film-rehearsal-2026-11-14-h22b.json"), "utf8")).attempts[1].structureReply as string;
  const checked = checkVisitRecord(JSON.parse(reply));
  if (!checked.ok) throw new Error("the recorded reply is not clean");
  const backend = memoryBackend();
  await makeKeptStore(backend).save({
    example: true,
    clientList: inventedVisit.clientList,
    opened: { note: false, list: false, scans: false, reader: false, ledger: false, measured: false, date: false, present: false, seen: false, agreed: false, risks: false, nextSteps: false },
    visit: { ...emptyVisit(), noteText: inventedVisit.note, record: checked.record, recordSource: "ON_DEVICE", recordChecked: true, step: "record" },
  });
  const stored = await backend.get(KEPT_KEY);
  expect(stored).toBeDefined();

  await page.goto(site.get().url);
  await putKept(page, KEPT_KEY, stored);
  await page.reload();
  // The quiet masks step keeps the missing lines folded. Edit opens the record rows that hold them.
  const edit = page.locator("#edit-record");
  await expect(edit).toBeVisible();
  await edit.click();

  const missing = page.locator('[data-record-missing="3"]');
  await expect(missing).toBeVisible();
  const before = await page.locator("[data-missed-line]").allTextContents();
  expect(before).toEqual(THREE);
  const order = await page.evaluate(() => {
    const m = document.querySelector("[data-mask-section]")!;
    const b = document.querySelector("[data-record-missing]")!;
    const d = document.querySelector("#fold-date, #record-date")!;
    return { afterMask: !!(m.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING), beforeDate: !!(b.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  expect(order).toEqual({ afterMask: true, beforeDate: true });
  const box = await page.locator("#add-seen-0").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  mkdirSync(resolve("test-results"), { recursive: true });
  await page.locator("[data-record]").screenshot({ path: "test-results/record-missing-h24.png" });

  await page.locator("#add-seen-2").click();
  await expect(page.locator('[data-record-missing="2"]')).toBeVisible();
  const after = await page.locator("[data-missed-line]").allTextContents();
  expect(after).toEqual(THREE.slice(0, 2));
  await page.locator("#fold-seen").click();
  await expect(page.locator("#record-seen")).toHaveValue(/DOB on form 3\/3\/87\.$/);

  expect(nonLocal).toBe(0);
  Object.assign(rec, { status: "pass", linesBefore: before, linesAfter: after, nonLocalRequests: nonLocal });
  writeRecord("record-missing", rec, process.cwd(), suffix);
});
