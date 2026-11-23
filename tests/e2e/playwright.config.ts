// Two projects (browser-on-this-computer document, R17):
//   bundled       Playwright's bundled Chromium, headless, no device model.
//   device-model  Google Chrome with the built-in model, through the one fixture
//                 tests/e2e/fixtures/deviceModel.ts. Headless unless DEVICE_MODEL_HEADED=1.
// No browser window opens on the screen in a build session.
import { defineConfig } from "@playwright/test";

const headedDevice = process.env["DEVICE_MODEL_HEADED"] === "1";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["./reporter/resultsReporter.ts"]],
  outputDir: "../../test-results",
  projects: [
    {
      name: "bundled",
      testMatch: /bundled\/.*\.spec\.ts/,
      use: { headless: true, viewport: { width: 1440, height: 900 } },
    },
    {
      name: "device-model",
      testMatch: /device\/.*\.spec\.ts/,
      use: { headless: !headedDevice },
    },
  ],
});
