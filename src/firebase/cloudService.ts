// One cloud service (hosted-cloud R3). It starts the Firebase app, App Check and the AI backend once,
// hands out models to the three cloud features, and keeps the facts the status bar reads: whether the
// cloud is configured and what the last call did (R4).
//
// Builds (R1, R2):
//   production, with a site key in the config: reCAPTCHA Enterprise, limited-use tokens.
//   production, no site key or no config: nothing is started and no call is made. State: not configured.
//   dev and e2e: the debug path, loaded only here, behind a check of the build mode.
//
// Nothing here makes a call until a feature asks. The first ask fetches remote settings, then starts
// App Check, then calls the model. The config file itself stays on this site.
import { readSiteKey, loadFirebaseConfig, type ConfigResult } from "./config";
import { currentSettings, ensureRemoteSettings } from "./remoteConfig";
import { startProductionAppCheck } from "./appCheck";
import { DEVICE_APP_NAME } from "./deviceApp";
import { isBrowserRefusal, watchAppCheck403 } from "../inference/refusal";

/** Error thrown when cloud config or site key is unavailable. */
export class CloudNotConfiguredError extends Error {
  constructor() {
    super("The cloud is not configured.");
    this.name = "CloudNotConfiguredError";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CloudModules {
  app: {
    getApps(): { name: string }[];
    initializeApp(config: any): any;
    /** Drops a cloud app so the next press starts a new robot check. Absent in older test doubles. */
    deleteApp?(app: any): Promise<void>;
  };
  ai: {
    GoogleAIBackend: new () => unknown;
    InferenceMode: Record<string, any>;
    getAI(app: any, options: any): any;
    getGenerativeModel: (service: any, params: any) => { generateContent(text: string): Promise<{ response: { text(): string; inferenceSource?: unknown } }> };
  };
  appCheck: any;
}

export interface CloudServiceDeps {
  /** true in a production build: no debug path, the site key decides */
  production: boolean;
  loadConfig(): Promise<ConfigResult>;
  loadModules(): Promise<CloudModules>;
  /** Present only in a dev or e2e build. */
  loadDebug?(): Promise<{ startDebugAppCheck(app: any, appCheck: any): unknown } | undefined>;
  /** True only when the fetched switch appcheck_limited_use is on. Absent means off. */
  limitedUse?: () => boolean;
  /** When set, generate stops before this many model calls. Absent means no cap. */
  sessionCap?: () => number;
  /** Runs at the start of a cloud call, before App Check. The page fetches remote settings here. */
  prepare?: () => Promise<void>;
}

export class SessionCloudCapError extends Error {
  constructor() {
    super("The session cloud cap is spent.");
    this.name = "SessionCloudCapError";
  }
}

/** What a feature builds from the AI module: the parameters of its model. */
export type ModelParams = (ai: CloudModules["ai"]) => unknown;

export interface CloudService {
  /** Reads the config. Makes no call to the project. */
  configure(): Promise<CloudState>;
  state(): CloudState;
  onChange(listener: (state: CloudState) => void): () => void;
  generate(params: ModelParams, text: string): Promise<{ text: string; inferenceSource: string }>;
}

function detailOf(error: unknown): string {
  const e = error as { customErrorData?: { status?: unknown }; code?: unknown } | null;
  const status = e?.customErrorData?.status;
  if (typeof status === "number" || (typeof status === "string" && /^\w{1,40}$/.test(status))) return `status ${status}`;
  if (typeof e?.code === "string" && /^[\w/.-]{1,40}$/.test(e.code)) return e.code;
  return "no status given";
}

export function makeCloudService(deps: CloudServiceDeps): CloudService {
  let configured: { config: any; siteKey?: string } | undefined;
  let usable: boolean | undefined;
  let failure: string | undefined;
  let browserRefused = false;
  /** True once any call has returned an IN_CLOUD answer. Gates the "connected" state (WO-02). */
  let sawCloudAnswer = false;
  /** Per-call robot check. Off unless the fetched switch says true. */
  const limitedUseOn = () => deps.limitedUse?.() === true;
  let callsMade = 0;
  let starting: Promise<{ ai: CloudModules["ai"]; service: unknown }> | undefined;
  const listeners = new Set<(s: CloudState) => void>();
  let lastShown = "";

  function derive(): CloudState {
    if (usable !== true) return { kind: "not-configured" };
    if (browserRefused) return { kind: "refused" };
    if (failure !== undefined) return { kind: "failed", detail: failure };
    // WO-02: "connected" is a claim that a call reached the cloud. Before the first IN_CLOUD
    // answer the honest state is "ready, not used yet" — this used to fall through to connected.
    return sawCloudAnswer ? { kind: "connected" } : { kind: "ready" };
  }
  function announce(): void {
    const s = derive();
    const key = JSON.stringify(s);
    if (key === lastShown) return;
    lastShown = key;
    for (const l of listeners) l(s);
  }
  // The state before anything is known is "not configured"; listeners hear changes from it.
  lastShown = JSON.stringify({ kind: "not-configured" });

  async function configure(): Promise<CloudState> {
    const result = await deps.loadConfig();
    if (!result.ok) {
      configured = undefined;
      usable = false;
    } else {
      const siteKey = readSiteKey({ appCheckSiteKey: result.siteKey });
      configured = { config: result.config, ...(siteKey !== undefined ? { siteKey } : {}) };
      usable = deps.production ? siteKey !== undefined : true;
    }
    announce();
    return derive();
  }

  /** The robot-check throttle lives on the cloud app. A later press drops that app so the check runs again. */
  async function dropNonDeviceApps(): Promise<void> {
    const { app } = await deps.loadModules();
    if (typeof app.deleteApp !== "function") return;
    const targets = app.getApps().filter((a) => a.name !== DEVICE_APP_NAME);
    for (const target of targets) await app.deleteApp(target);
  }

  async function begin(): Promise<{ ai: CloudModules["ai"]; service: unknown }> {
    if (usable === undefined) await configure();
    if (usable !== true || configured === undefined) throw new CloudNotConfiguredError();
    const { config, siteKey } = configured;
    const { app, ai, appCheck } = await deps.loadModules();
    const existing = app.getApps().find((a) => a.name !== DEVICE_APP_NAME);
    const fbApp = existing ?? app.initializeApp(config);
    // Remote config creates the default app before any cloud call. App Check still
    // has to start on that app. Skipping it means the exchange is never requested,
    // a 403 never arrives, and the model failure is reported as a lost connection.
    if (deps.production) {
      if (siteKey === undefined) throw new CloudNotConfiguredError();
      startProductionAppCheck(fbApp, appCheck, siteKey);
    } else {
      const debug = await deps.loadDebug?.();
      if (debug === undefined) throw new CloudNotConfiguredError();
      debug.startDebugAppCheck(fbApp, appCheck);
    }
    const service = ai.getAI(fbApp, {
      backend: new ai.GoogleAIBackend(),
      // WO-02: cached standard tokens. Limited-use means one robot check PER CALL, which at the
      // pane's 1-in-5 refusal rate puts a 3-call judge path at 1-(4/5)^3 = 49% exposure against
      // about 20% with one cached token. The trade is stated in the README: caching gives up
      // per-call replay protection. Limited-use remains reachable via the WO-10 switch.
      ...(deps.production && limitedUseOn() ? { useLimitedUseAppCheckTokens: true } : {}),
    });
    return { ai, service };
  }

  return {
    configure,
    state: derive,
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async generate(params, text) {
      const cap = deps.sessionCap?.();
      if (typeof cap === "number" && callsMade >= cap) throw new SessionCloudCapError();
      let sawAppCheck403 = false;
      try {
        // A refusal keeps the cloud app, and that app keeps the robot-check throttle.
        // Drop it before the next call so this press starts a new check. The device app stays.
        if (browserRefused) {
          starting = undefined;
          await dropNonDeviceApps();
        }
        // Remote settings, installations included, wait until this first cloud call.
        if (deps.prepare) await deps.prepare();
        // A failed start is not kept: the next call tries again (R3.3).
        starting ??= begin().catch((e: unknown) => {
          starting = undefined;
          throw e;
        });
        const { ai, service } = await starting;
        const model = ai.getGenerativeModel(service, params(ai));
        callsMade += 1;
        const res = await watchAppCheck403(() => model.generateContent(text));
        sawAppCheck403 = res.saw403;
        if (!res.ok) throw res.error;
        const response = res.value.response;
        const out = { text: response.text(), inferenceSource: String(response.inferenceSource) };
        // H43c c4-2: only a cloud answer clears "refused" or "last call failed". A device
        // answer clears neither: after a cloud failure it leaves the failed state showing
        // (never "connected"), and a refusal by the robot check stays until a cloud answer
        // arrives. A device answer after a 403 seen on this call sets "refused".
        if (out.inferenceSource.toUpperCase() === "IN_CLOUD") {
          browserRefused = false;
          failure = undefined;
          sawCloudAnswer = true;
        } else if (sawAppCheck403) {
          browserRefused = true;
          failure = undefined;
        }
        announce();
        return out;
      } catch (e) {
        if (e instanceof CloudNotConfiguredError) throw e;
        if (sawAppCheck403 || isBrowserRefusal(e)) {
          browserRefused = true;
          failure = undefined;
        } else if (!browserRefused) {
          failure = detailOf(e);
        }
        announce();
        throw e;
      }
    },
  };
}

let shared: CloudService | undefined;

/** The one cloud service of the page. The three cloud features and the status bar share it. */
export function cloudService(): CloudService {
  shared ??= makeCloudService({
    production: import.meta.env.MODE === "production",
    loadConfig: () => loadFirebaseConfig(),
    loadModules: async () => {
      const [app, ai, appCheck] = await Promise.all([import("firebase/app"), import("firebase/ai"), import("firebase/app-check")]);
      return { app, ai, appCheck } as unknown as CloudModules;
    },
    // The debug path is loaded only outside a production build; the bundler drops this import from production.
    loadDebug: async () => (import.meta.env.MODE === "production" ? undefined : import("./appCheckDebug")),
    limitedUse: () => currentSettings().appCheckLimitedUse,
    sessionCap: () => currentSettings().sessionCloudCap,
    prepare: () => ensureRemoteSettings().then(() => undefined),
  });
  return shared;
}

export type CloudState =
  | { kind: "not-configured" }
  /** Configured and usable, but no cloud answer has come back yet (WO-02). */
  | { kind: "ready" }
  | { kind: "connected" }
  | { kind: "refused" }
  | { kind: "failed"; /** the status the SDK gave, or a short code; never the message text */ detail: string };
