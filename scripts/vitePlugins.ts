import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";

const CONFIG_FILE = "firebase.config.local.json";
const CONFIG_URL = "/" + CONFIG_FILE;

/** Development only: serves the local config from the project root at run time. */
export function devConfigMiddleware(root: string): Plugin {
  return {
    name: "dev-config-middleware",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== CONFIG_URL) return next();
        const file = join(root, CONFIG_FILE);
        if (!existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(file));
      });
    },
  };
}

/**
 * Writes the config into the output folder only. Refuses any folder that is not
 * named dist. Never run by a build session: it needs HOSTING_BUILD=1.
 */
export function writeHostingConfig(distDir: string, config: Record<string, string>): string {
  const dir = resolve(distDir);
  if (basename(dir) !== "dist") throw new Error("Hosting config is written only into a folder named dist.");
  const target = join(dir, CONFIG_FILE);
  if (dirname(target) !== dir) throw new Error("Unexpected target path.");
  mkdirSync(dir, { recursive: true });
  writeFileSync(target, JSON.stringify(config, null, 1));
  return target;
}

export function hostingInjection(root: string): Plugin {
  return {
    name: "hosting-config-injection",
    apply: "build",
    closeBundle() {
      if (process.env["HOSTING_BUILD"] !== "1") return;
      const source = join(root, CONFIG_FILE);
      if (!existsSync(source)) throw new Error("Hosting build needs the local config file.");
      writeHostingConfig(join(root, "dist"), JSON.parse(readFileSync(source, "utf8")) as Record<string, string>);
    },
  };
}

/**
 * Production only (hosted-cloud R1.2). The Firebase SDK's own App Check code reads a debug token from
 * a global with a well-known name. In a production build that name is changed inside the SDK, so a
 * debug token set on a hosted page does nothing and the bundle does not carry the name.
 * Dev and e2e builds are left as they are.
 */
export const APP_CHECK_DEBUG_NAME = "FIREBASE_APPCHECK_DEBUG_TOKEN";
export const APP_CHECK_DEBUG_NAME_OFF = "APPCHECK_DEBUG_OFF_IN_PRODUCTION";

export function stripAppCheckDebugName(code: string): string {
  return code.split(APP_CHECK_DEBUG_NAME).join(APP_CHECK_DEBUG_NAME_OFF);
}

export function stripAppCheckDebug(): Plugin {
  return {
    name: "strip-app-check-debug",
    enforce: "pre",
    apply: (_config, env) => env.command === "build" && env.mode === "production",
    transform(code, id) {
      if (!/[\\/]@firebase[\\/]app-check[\\/]/.test(id) || !code.includes(APP_CHECK_DEBUG_NAME)) return null;
      return { code: stripAppCheckDebugName(code), map: null };
    },
  };
}

/**
 * Copies THIRD-PARTY-NOTICES.txt from the project root into the built site (shell-and-offline R38.2).
 * It is emitted as an asset with its own name, so the build fails if the file is missing.
 */
export function noticesFile(root: string): Plugin {
  return {
    name: "third-party-notices",
    apply: "build",
    generateBundle() {
      const source = join(root, "THIRD-PARTY-NOTICES.txt");
      if (!existsSync(source)) throw new Error("THIRD-PARTY-NOTICES.txt is missing. Run npm run notices.");
      this.emitFile({ type: "asset", fileName: "THIRD-PARTY-NOTICES.txt", source: readFileSync(source, "utf8") });
    },
  };
}
