// Shared parts of the BUNDLED checks: the test with its browser note, the site helpers
// (build folders served on port 4311 for one file, then stopped), the request recorder
// and the press helpers. Invented people only.
import { test as base, expect, type BrowserContext } from "@playwright/test";
import { startStaticServer, type RunningServer } from "./staticServer";
import { basename } from "node:path";
import { guardCloudCalls } from "./cloudCalls";

export {
  INVENTED_NAMES,
  detail,
  missed,
  openHandEntryIfNeeded,
  openInventedVisit,
  press,
  record,
  runToFinished,
  task,
  useStandIn,
  type Recorder,
} from "./pageHelpers";

export { expect };

/** Every test names the browser it ran in; the reporter reads it. */
export const test = base.extend<{ _browserNote: void; _cloudGuard: void }>({
  _browserNote: [
    async ({ browser }, use, testInfo) => {
      testInfo.annotations.push({ type: "browser", description: `Chromium ${browser.version()} (Playwright 1.65.0 bundled, headless)` });
      await use();
    },
    { auto: true },
  ],
  // Every call to the cloud model made in any context of a test is counted, and stopped at the budget (R41.3).
  _cloudGuard: [
    async ({ browser, context }, use, testInfo) => {
      const spec = basename(testInfo.file);
      const label = `Chromium ${browser.version()} (Playwright 1.65.0 bundled, headless)`;
      await guardCloudCalls(context, spec, testInfo.title, label);
      const original = browser.newContext.bind(browser);
      browser.newContext = (async (...args: Parameters<typeof original>) => {
        const extra = await original(...args);
        await guardCloudCalls(extra, spec, testInfo.title, label);
        return extra;
      }) as typeof browser.newContext;
      await use();
      browser.newContext = original;
    },
    { auto: true },
  ],
});

/** The production build (no test hooks) or the e2e build (with them). */
export type Site = "dist" | "dist-e2e";

export function serveForFile(dir: Site): { get(): RunningServer } {
  let server: RunningServer | undefined;
  test.beforeAll(async () => {
    server = await startStaticServer({ dir });
  });
  test.afterAll(async () => {
    await server?.stop();
  });
  return { get: () => server! };
}
