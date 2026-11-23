// Fetched settings for the six jobs. Compiled defaults live in src/constants.ts.
// A fetch that takes longer than REMOTE_CONFIG_FETCH_TIMEOUT_MS, or that aborts, keeps those defaults.
// The request bodies sent to the config service and the installations service carry an installation
// id, an app id and an SDK version. They never carry note text.
import { AI_SERVICE_ENABLED, DEFAULT_CLOUD_MODEL, READER_CLOUD_MODEL, REMOTE_CONFIG_FETCH_TIMEOUT_MS, SESSION_CLOUD_CAP } from "../constants";
import { DEVICE_APP_NAME } from "./deviceApp";
import { DEFAULT_POLICY, IDENTIFIER_CATEGORIES, type IdentifierCategory, type MaskPolicy } from "../masking/policy";

export const RC_KEYS = ["draft_model", "reader_model", "cloud_enabled", "session_cloud_cap", "appcheck_limited_use", "mask_policy"] as const;

export interface RemoteSettings {
  draftModel: string;
  readerModel: string;
  cloudEnabled: boolean;
  sessionCloudCap: number;
  appCheckLimitedUse: boolean;
  policy: MaskPolicy;
  /** ISO time the values settled, whether they came from a fetch or from the compiled defaults. */
  fetchTime: string;
  source: "defaults" | "remote";
}

export interface ConfigFetchIds {
  installationId: string;
  installationToken: string;
  appId: string;
  sdkVersion: string;
  projectId: string;
}

export function defaultPolicy(): MaskPolicy {
  return {
    ...DEFAULT_POLICY,
    name: "compiled",
    version: 1,
    categories: [...IDENTIFIER_CATEGORIES],
  };
}

export function compiledDefaults(now = new Date().toISOString()): RemoteSettings {
  return {
    draftModel: DEFAULT_CLOUD_MODEL,
    readerModel: READER_CLOUD_MODEL,
    cloudEnabled: AI_SERVICE_ENABLED,
    sessionCloudCap: SESSION_CLOUD_CAP,
    appCheckLimitedUse: false,
    policy: defaultPolicy(),
    fetchTime: now,
    source: "defaults",
  };
}

let active: RemoteSettings = compiledDefaults("1970-01-01T00:00:00.000Z");

export function currentSettings(): RemoteSettings {
  return active;
}

export function replaceSettings(next: RemoteSettings): void {
  active = next;
}

/** The page may call the cloud only when the build permit, the config and the kill switch all say yes. */
export function cloudPermit(permit: boolean, configured: boolean, settings: RemoteSettings = currentSettings()): boolean {
  return permit && configured && settings.cloudEnabled;
}

function flag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  const text = raw.trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  return fallback;
}

function modelOf(raw: string | undefined, fallback: string): string {
  if (raw === undefined) return fallback;
  const name = raw.trim();
  if (name === "") return fallback;
  // Stable names have no preview, experimental or latest suffix (models page, read 2026-11-21).
  if (/preview|-latest|-exp/i.test(name)) return fallback;
  return name;
}

function capOf(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return SESSION_CLOUD_CAP;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return SESSION_CLOUD_CAP;
  return n;
}

function policyOf(raw: string | undefined, fromRemote: boolean): MaskPolicy {
  const base = defaultPolicy();
  const source = fromRemote ? "remote" : "default";
  if (raw === undefined || raw.trim() === "") return { ...base, source };
  try {
    const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown; categories?: unknown };
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((c): c is IdentifierCategory => (IDENTIFIER_CATEGORIES as readonly string[]).includes(String(c)))
      : [...IDENTIFIER_CATEGORIES];
    const version = typeof parsed.version === "number" && Number.isInteger(parsed.version) && parsed.version >= 0 ? parsed.version : base.version;
    const name = typeof parsed.name === "string" && parsed.name.trim() !== "" ? parsed.name.trim() : base.name;
    return { ...base, name, version, categories, source };
  } catch {
    return { ...base, source: "default" };
  }
}

export function parseRemoteValues(values: Record<string, string | undefined>, fetchTime: string, fromRemote: boolean): RemoteSettings {
  const defaults = compiledDefaults(fetchTime);
  return {
    draftModel: modelOf(values["draft_model"], defaults.draftModel),
    readerModel: modelOf(values["reader_model"], defaults.readerModel),
    cloudEnabled: flag(values["cloud_enabled"], defaults.cloudEnabled),
    sessionCloudCap: capOf(values["session_cloud_cap"]),
    appCheckLimitedUse: flag(values["appcheck_limited_use"], false),
    policy: policyOf(values["mask_policy"], fromRemote),
    fetchTime,
    source: fromRemote ? "remote" : "defaults",
  };
}

/** The installations body the installed SDK posts. Fields only: no note text. */
export function installationsBody(ids: ConfigFetchIds): string {
  return JSON.stringify({
    fid: ids.installationId,
    authVersion: "FIS_v2",
    appId: ids.appId,
    sdkVersion: ids.sdkVersion,
  });
}

/** The config-fetch body the installed SDK posts. Fields only: no note text. */
export function remoteConfigBody(ids: ConfigFetchIds): string {
  return JSON.stringify({
    sdk_version: ids.sdkVersion,
    app_instance_id: ids.installationId,
    app_instance_id_token: ids.installationToken,
    app_id: ids.appId,
  });
}

export function configFetchUrls(projectId: string): { installations: string; remoteConfig: string } {
  const id = encodeURIComponent(projectId);
  return {
    installations: `https://firebaseinstallations.googleapis.com/v1/projects/${id}/installations`,
    remoteConfig: `https://firebaseremoteconfig.googleapis.com/v1/projects/${id}/namespaces/firebase:fetch`,
  };
}

/** Posts the two bodies. The caller supplies fetch, so a test can read the bytes. */
export async function postConfigFetches(fetchImpl: typeof fetch, ids: ConfigFetchIds, signal: AbortSignal): Promise<void> {
  const urls = configFetchUrls(ids.projectId);
  await fetchImpl(urls.installations, { method: "POST", body: installationsBody(ids), signal });
  await fetchImpl(urls.remoteConfig, { method: "POST", body: remoteConfigBody(ids), signal });
}

export async function loadRemoteSettings(deps: {
  fetchValues: (signal: AbortSignal) => Promise<Record<string, string | undefined>>;
  timeoutMs?: number;
  now?: () => string;
  signal?: AbortSignal;
}): Promise<RemoteSettings> {
  const now = () => deps.now?.() ?? new Date().toISOString();
  if (deps.signal?.aborted) return compiledDefaults(now());
  const timeoutMs = deps.timeoutMs ?? REMOTE_CONFIG_FETCH_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const onParent = () => ac.abort();
  deps.signal?.addEventListener("abort", onParent, { once: true });
  try {
    const values = await deps.fetchValues(ac.signal);
    if (ac.signal.aborted) return compiledDefaults(now());
    return parseRemoteValues(values, now(), true);
  } catch {
    return compiledDefaults(now());
  } finally {
    clearTimeout(timer);
    deps.signal?.removeEventListener("abort", onParent);
  }
}

export function applyFetchBudget(
  rc: { settings: { fetchTimeoutMillis: number }; defaultConfig: Record<string, string | number | boolean> },
  settings: RemoteSettings = compiledDefaults(),
): void {
  rc.settings.fetchTimeoutMillis = REMOTE_CONFIG_FETCH_TIMEOUT_MS;
  const policy = settings.policy;
  rc.defaultConfig = {
    draft_model: settings.draftModel,
    reader_model: settings.readerModel,
    cloud_enabled: settings.cloudEnabled ? "true" : "false",
    session_cloud_cap: String(settings.sessionCloudCap),
    appcheck_limited_use: settings.appCheckLimitedUse ? "true" : "false",
    mask_policy: JSON.stringify({ name: policy.name, version: policy.version, categories: policy.categories }),
  };
}

export function readActivated(
  rc: { fetchTimeMillis: number; lastFetchStatus: string },
  read: (key: string) => string,
  now?: string,
): RemoteSettings {
  if (rc.lastFetchStatus !== "success") return compiledDefaults(now);
  const values: Record<string, string> = {};
  for (const key of RC_KEYS) values[key] = read(key);
  const fetchTime = rc.fetchTimeMillis > 0 ? new Date(rc.fetchTimeMillis).toISOString() : (now ?? new Date().toISOString());
  return parseRemoteValues(values, fetchTime, true);
}

export async function loadPageSettings(deps: {
  loadConfig: () => Promise<{ ok: boolean }>;
  activate?: (signal: AbortSignal) => Promise<RemoteSettings>;
  timeoutMs?: number;
  now?: () => string;
  signal?: AbortSignal;
}): Promise<RemoteSettings> {
  const now = () => deps.now?.() ?? new Date().toISOString();
  const settle = (settings: RemoteSettings) => {
    replaceSettings(settings);
    return settings;
  };
  if (deps.signal?.aborted) return settle(compiledDefaults(now()));
  const cfg = await deps.loadConfig();
  if (!cfg.ok) return settle(compiledDefaults(now()));
  const timeoutMs = deps.timeoutMs ?? REMOTE_CONFIG_FETCH_TIMEOUT_MS;
  const activate = deps.activate ?? ((signal: AbortSignal) => activateSdk(signal, timeoutMs));
  try {
    return settle(await withDeadline(activate(deps.signal ?? new AbortController().signal), timeoutMs, deps.signal));
  } catch {
    return settle(compiledDefaults(now()));
  }
}

function withDeadline<T>(work: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error("abort"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    const onAbort = () => reject(new Error("abort"));
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

async function activateSdk(signal: AbortSignal, timeoutMs: number): Promise<RemoteSettings> {
  if (signal.aborted) throw new Error("abort");
  const [{ getApps, initializeApp }, rcMod] = await Promise.all([import("firebase/app"), import("firebase/remote-config")]);
  const { loadFirebaseConfig } = await import("./config");
  const loaded = await loadFirebaseConfig();
  if (!loaded.ok) return compiledDefaults();
  const existing = getApps().find((a) => a.name !== DEVICE_APP_NAME);
  const app = existing ?? initializeApp(loaded.config);
  const rc = rcMod.getRemoteConfig(app);
  applyFetchBudget(rc);
  rc.settings.fetchTimeoutMillis = timeoutMs;
  await rcMod.fetchAndActivate(rc);
  return readActivated(rc, (key) => rcMod.getValue(rc, key).asString());
}

let remoteOnce: Promise<RemoteSettings> | undefined;

/** Installations and Remote Config, once, on the first cloud call. A later call waits for the same fetch. */
export function ensureRemoteSettings(): Promise<RemoteSettings> {
  remoteOnce ??= loadPageSettings({
    loadConfig: async () => {
      const { loadFirebaseConfig } = await import("./config");
      return loadFirebaseConfig();
    },
  }).then(
    (settings) => settings,
    (error) => {
      remoteOnce = undefined;
      throw error;
    },
  );
  return remoteOnce;
}
