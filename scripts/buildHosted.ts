// One named step for a hosted bundle (session H28a). It checks the local config, builds the production
// bundle, writes the config into the output folder and reads the output back. It makes no network call.
// Messages name the item and never print a value of the config.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CONFIG_KEYS, readSiteKey, SITE_KEY_FIELD } from "../src/firebase/config";
import { writeHostingConfig } from "./vitePlugins";

export interface HostedOptions {
  root?: string;
  configFile?: string;
  outDir?: string;
  allowInvented?: boolean;
  /** Test only. The NODE_ENV of the child vite build. Omitted means production. */
  childNodeEnv?: "production" | "development";
}

const DEFAULT_CONFIG_FILE = "firebase.config.local.json";
const INVENTED_FIXTURE = "tests/fixtures/firebase.config.invented.json";
const DEBUG_NAME = "FIREBASE_APPCHECK_DEBUG_TOKEN";
const TEXT_FILE = /\.(js|html|css|json|txt)$/;

function refuse(what: string): never {
  throw new Error(`HOSTED BUILD REFUSED: ${what}`);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** Checks the text of a config file (items b to e). Returns the parsed config. Never prints a value. */
export function checkHostedConfig(text: string, options: HostedOptions = {}): Record<string, string> {
  const root = options.root ?? process.cwd();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuse("the local config file is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return refuse("the local config file is not a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  for (const key of CONFIG_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || value.trim() === "") return refuse(`the config key ${key} is missing or empty`);
    if (/^<.*>$/.test(value.trim())) return refuse(`the config key ${key} is a placeholder`);
  }
  if (readSiteKey(record) === undefined) return refuse(`${SITE_KEY_FIELD} is missing, empty or a placeholder`);
  if (!options.allowInvented) {
    const fixture = resolve(root, INVENTED_FIXTURE);
    if (existsSync(fixture)) {
      const invented = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>;
      if (record["apiKey"] === invented["apiKey"] && record["projectId"] === invented["projectId"]) {
        return refuse("the config is the invented test config");
      }
    }
  }
  return record as Record<string, string>;
}

function checkOutput(outDir: string): void {
  for (const name of ["index.html", "sw.js"]) {
    if (!existsSync(join(outDir, name))) refuse(`the output has no ${name}`);
  }
  const configPath = join(outDir, DEFAULT_CONFIG_FILE);
  if (!existsSync(configPath)) refuse("the output has no config file");
  const written = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  for (const key of CONFIG_KEYS) {
    if (typeof written[key] !== "string" || written[key] === "") refuse(`the output config lacks ${key}`);
  }
  if (readSiteKey(written) === undefined) refuse(`the output config lacks ${SITE_KEY_FIELD}`);
  const files = filesUnder(outDir).filter((f) => TEXT_FILE.test(f));
  const texts = files.map((f) => ({ file: f, text: readFileSync(f, "utf8") }));
  for (const { file, text } of texts) {
    if (text.includes(DEBUG_NAME)) refuse(`a built file holds the App Check debug name (${basename(file)})`);
  }
  const scripts = texts.filter((t) => t.file.endsWith(".js")).map((t) => t.text).join("\n");
  if (!scripts.includes("ReCaptchaEnterpriseProvider")) refuse("the built JavaScript lacks ReCaptchaEnterpriseProvider");
  if (!scripts.includes("useLimitedUseAppCheckTokens")) refuse("the built JavaScript lacks useLimitedUseAppCheckTokens");
  // Session H32. The page sets data-build from import.meta.env.MODE. A production bundle compiles it to "production".
  // The second test is the compiled-out worker registration seen on the live page (prod:!1 in the registerWorker call).
  const buildMarked = /["'`]data-build["'`]\s*,\s*["'`]production["'`]/.test(scripts);
  const workerOff = /prod:\s*(?:!1|false)\s*,\s*doc:/.test(scripts);
  if (!buildMarked || workerOff) refuse("the bundle is not a production build");
  const sw = readFileSync(join(outDir, "sw.js"), "utf8");
  if (sw.includes(DEFAULT_CONFIG_FILE)) refuse("sw.js names the config file");
}

export function buildHosted(options: HostedOptions = {}): string {
  const root = resolve(options.root ?? process.cwd());
  const configPath = resolve(root, options.configFile ?? DEFAULT_CONFIG_FILE);
  const outDirArg = options.outDir ?? "dist";
  const outDir = resolve(root, outDirArg);
  if (!existsSync(configPath)) refuse("the local config file is missing");
  const config = checkHostedConfig(readFileSync(configPath, "utf8"), { root, allowInvented: options.allowInvented ?? false });
  if (basename(outDir) !== "dist") refuse("the output folder is not named dist");
  const vite = join(root, "node_modules/vite/bin/vite.js");
  execFileSync(process.execPath, [vite, "build", "--outDir", outDirArg, "--emptyOutDir"], {
    cwd: root,
    stdio: "pipe",
    timeout: 240_000,
    env: { ...process.env, HOSTING_BUILD: "", NODE_ENV: options.childNodeEnv ?? "production" },
  });
  writeHostingConfig(outDir, config);
  checkOutput(outDir);
  return outDir;
}

export async function main(): Promise<void> {
  const outDir = buildHosted();
  console.log(`Hosted bundle built into ${basename(outDir)}/ with the config file and the site key. Nothing was sent or deployed.`);
}
