import { defineConfig } from "vitest/config";
import { devConfigMiddleware, hostingInjection, noticesFile, stripAppCheckDebug } from "./scripts/vitePlugins.ts";
import { swAllowedList } from "./scripts/swPlugin.ts";
import { bundleHygiene } from "./scripts/bundleHygiene.ts";

const root = process.cwd();

export default defineConfig({
  plugins: [devConfigMiddleware(root), hostingInjection(root), noticesFile(root), swAllowedList(), stripAppCheckDebug(), bundleHygiene()],
  server: { port: 4311, strictPort: true, host: "127.0.0.1" },
  preview: { port: 4311, strictPort: true, host: "127.0.0.1" },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
