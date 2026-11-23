import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

export const PLACEHOLDER = "/*ALLOWED_LIST*/[]";

/** Files the service worker may cache: built HTML, JS, CSS, the manifest, icons and the notices file. */
export function isAllowed(path: string): boolean {
  if (path === "sw.js" || path === "probe.txt") return false;
  if (path === "index.html" || path === "manifest.webmanifest" || path === "THIRD-PARTY-NOTICES.txt") return true;
  if (path.startsWith("icons/") && /\.(png|svg)$/.test(path)) return true;
  if (path.startsWith("assets/") && /\.(js|css)$/.test(path)) return true;
  return false;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export function buildAllowedList(distDir: string): string[] {
  return walk(distDir)
    .map((f) => relative(distDir, f).split(sep).join("/"))
    .filter(isAllowed)
    .map((p) => "/" + p)
    .sort();
}

export function writeAllowedList(distDir: string): string[] {
  const swPath = join(distDir, "sw.js");
  if (!existsSync(swPath)) throw new Error("dist/sw.js is missing");
  const list = buildAllowedList(distDir);
  const source = readFileSync(swPath, "utf8");
  if (!source.includes(PLACEHOLDER)) throw new Error("sw.js has no allowed-list placeholder");
  const version = String(list.length) + "-" + Date.now().toString(36);
  writeFileSync(swPath, source.replace(PLACEHOLDER, JSON.stringify(list)).replace("__CACHE_VERSION__", version));
  return list;
}

export function swAllowedList(): Plugin {
  let outDir = "dist";
  let root = process.cwd();
  let failed = false;
  return {
    name: "sw-allowed-list",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },
    buildEnd(error) {
      failed = Boolean(error);
    },
    // A failed build is reported by its own error; writing the list then would only hide it.
    closeBundle() {
      if (failed) return;
      writeAllowedList(join(root, outDir));
    },
  };
}
