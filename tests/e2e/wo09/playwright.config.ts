// WO-09 only. The bundled project does not match this folder, so a normal bundled run spends nothing.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 2_400_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { headless: true, viewport: { width: 1440, height: 900 } },
  projects: [{ name: "wo09", testMatch: /wo09Real\.spec\.ts/ }],
});
