// Runs one TypeScript script from scripts/ in Node through Vite's module loader,
// so the script can import from src/ the same way the app does. No server is
// started and no port is opened. Usage: node scripts/run.mjs scripts/buildSet.ts
import { createServer } from "vite";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run.mjs <script.ts>");
  process.exit(2);
}

const server = await createServer({
  configFile: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
let code = 0;
try {
  const mod = await server.ssrLoadModule(`/${file.replace(/^\.?\//, "")}`);
  if (typeof mod.main !== "function") throw new Error(`${file} exports no main()`);
  await mod.main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
