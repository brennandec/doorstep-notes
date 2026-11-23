// Run-time loader for the Firebase web config (ruling 16).
// In development and tests a dev-server middleware serves the project's local
// config file at CONFIG_URL. It is fetched, never imported, so it is never
// bundled. A hosting build writes the same values into dist/ (see
// scripts/vitePlugins.ts). This module never prints or logs any value.

export const CONFIG_URL = "/firebase.config.local.json";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const CONFIG_KEYS: readonly (keyof FirebaseWebConfig)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

export type ConfigResult =
  | { ok: true; config: FirebaseWebConfig; /** the App Check site key, when the file holds a real one */ siteKey?: string }
  | { ok: false; reason: "not found" | "not valid" };

/** The optional field of the config file that holds the reCAPTCHA Enterprise site key (hosted-cloud R2.2). */
export const SITE_KEY_FIELD = "appCheckSiteKey";

/** A site key is a non-empty string that is not an angle-bracket placeholder such as the example file's. */
export function readSiteKey(record: Record<string, unknown>): string | undefined {
  const value = record[SITE_KEY_FIELD];
  if (typeof value !== "string") return undefined;
  const key = value.trim();
  if (key === "" || /^<.*>$/.test(key)) return undefined;
  return key;
}

type Fetcher = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

export async function loadFirebaseConfig(
  fetcher: Fetcher = (url) => fetch(url, { cache: "no-store" }),
): Promise<ConfigResult> {
  let text: string;
  try {
    const response = await fetcher(CONFIG_URL);
    if (!response.ok) return { ok: false, reason: "not found" };
    text = await response.text();
  } catch {
    return { ok: false, reason: "not found" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A static server may answer with its HTML page: that is "not found".
    return { ok: false, reason: "not found" };
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "not valid" };
  const record = parsed as Record<string, unknown>;
  const config = {} as FirebaseWebConfig;
  for (const key of CONFIG_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || value.length === 0) return { ok: false, reason: "not valid" };
    config[key] = value;
  }
  const siteKey = readSiteKey(record);
  return { ok: true, config, ...(siteKey !== undefined ? { siteKey } : {}) };
}
