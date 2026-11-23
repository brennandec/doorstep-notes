// Shared pure browser-interaction helpers for Playwright specs without registering test fixtures.
import { expect, type BrowserContext, type Page, type Request, type TestInfo } from "@playwright/test";
import type { RecordedRequest } from "../../../src/egress/assertNoLeak";

/**
 * Sets the stand-in explicitly (shell-and-offline R41.2). With AI_SERVICE_ENABLED true, a spec that
 * tests the test doubles calls this before it opens the page. It works only on the e2e build
 * (serveForFile("dist-e2e")), which reads window.__cloudStandIn; no call to the cloud model is made.
 */
export async function useStandIn(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    (window as unknown as { __cloudStandIn?: boolean }).__cloudStandIn = true;
  });
}

export function task(info: TestInfo, ...tasks: string[]): void {
  for (const t of tasks) info.annotations.push({ type: "task", description: t });
}

export function missed(info: TestInfo, reason: string): void {
  info.annotations.push({ type: "missed", description: reason });
}

export async function detail(info: TestInfo, value: unknown): Promise<void> {
  await info.attach("detail", { body: JSON.stringify(value), contentType: "application/json" });
}

export interface Recorder {
  requests: RecordedRequest[];
  hosts(): string[];
  /** requests whose host is not the served page's host */
  outside(origin: string): string[];
}

/** Records every request the context sees: the page's and a service worker's. */
export function record(context: BrowserContext): Recorder {
  const requests: RecordedRequest[] = [];
  context.on("request", (r: Request) => {
    const buf = r.postDataBuffer();
    requests.push({ url: r.url(), method: r.method(), postData: buf ? new Uint8Array(buf) : null });
  });
  return {
    requests,
    hosts: () => [...new Set(requests.map((r) => new URL(r.url).host))],
    outside: (origin) => requests.map((r) => r.url).filter((u) => !u.startsWith(origin)),
  };
}

/** The quiet masks step hides the old record. Edit opens those rows again, and the old assertions stay. */
async function revealRecord(page: Page): Promise<void> {
  const edit = page.locator("#edit-record");
  if ((await edit.count()) > 0) await edit.click();
}

/** One press per step. Waits for the control to be enabled first. */
export async function press(page: Page, selector: string): Promise<void> {
  if ((await page.locator(selector).count()) === 0) await revealRecord(page);
  const b = page.locator(selector);
  await expect(b).toBeEnabled();
  await b.click();
  if (selector === "#make-record") await revealRecord(page);
}

/**
 * With no device model the first control reads "Enter the record by hand" and, with the invented example
 * loaded, one press opens hand entry with the prepared record (capture-and-record R13.3).
 */
export async function openHandEntryIfNeeded(page: Page): Promise<void> {
  const first = page.locator("#make-record");
  if ((await first.textContent())?.match(/by hand|example's record/)) await press(page, "#make-record");
}

export async function openInventedVisit(page: Page, url: string): Promise<void> {
  await page.goto(url);
  // Wait until the device model state has been read (the status bar settles). Both controls are on the cold screen.
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
  await expect(page.locator("#try-example")).toBeVisible();
  await press(page, "#try-example");
  await expect(page.locator('[data-zone="note"] h2')).toHaveText("Your note");
  await expect(page.locator('[data-mark="example"]').first()).toBeVisible();
  await openHandEntryIfNeeded(page);
}

/** The path with no device model: example, Mask, Draft, Send. Returns once the finished note shows. */
export async function runToFinished(page: Page): Promise<void> {
  await expect(page.locator("[data-record]")).toBeVisible();
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  // H35a D8: Draft pauses on an unlisted name-like word (Bea) until she chooses keep or mask.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();
}

export const INVENTED_NAMES = [
  "Maria Okonkwo-Reyes", "Tomas Brandvold", "Priya Halloran", "Joel Ashworth-Nkemelu", "Sunniva Teodorescu",
  "Kwabena Lindqvist", "Rosalind Achterberg", "Emeka Fairbairn", "Halina Quarshie", "Dmitri Oyelaran",
  "Wren Castellano-Hughes", "Agnieszka Mbatha",
];
