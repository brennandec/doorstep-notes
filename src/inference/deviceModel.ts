// Smallest version of the device model wrapper (capture-and-record task 6):
// availability under a time limit, and initialize() that runs only when the
// caller is a user press (sdk-facts 10, 13, 14).
//
// H35a D3: "available" is reported as ready only after a model session has been made in this browser.
// H36c: the only proof of a usable session is one tiny prompt returning a non-empty string within 8 seconds.
// A page load never starts a download: the probe runs at load only when the browser reports "available".
import { DEVICE_AVAILABILITY_TIMEOUT_MS } from "../constants";
import { DownloadContinuing } from "./downloadContinuing";

const PROBE_PROMPT_TIMEOUT_MS = 8000;
import { buildAvailabilityOptions } from "./structure/createOptions";
import type { DeviceModelState } from "./types";

/** The part of a model session this wrapper uses. The browser's own session has more. */
export interface LanguageModelSessionLike {
  destroy?(): void;
  measureInputUsage?(input: unknown): Promise<number>;
  inputQuota?: number;
  prompt?(input: unknown, options?: unknown): Promise<unknown>;
}

export interface LanguageModelLike {
  availability(options?: unknown): Promise<string>;
  /** Makes a session. Called only when availability says "available" (no download), or after a press that started one. */
  create?(options?: unknown): Promise<LanguageModelSessionLike>;
}

export interface DeviceModelDeps {
  languageModel: LanguageModelLike | undefined;
  /** GenerativeModel.initializeDeviceModel from firebase/ai, wired in src/firebase/deviceInit.ts. */
  initializeDeviceModel?: (onProgress: (fraction: number) => void) => Promise<void>;
  timeoutMs?: number;
  probeTimeoutMs?: number;
}

export interface DeviceModel {
  /**
   * Pass { hasPhoto: true } to ask about text and image, the same options the prompt will use.
   * "available" is answered only once a session has answered a tiny prompt; before that the
   * browser's "available" is reported as "downloadable".
   */
  state(kind?: { hasPhoto: boolean }): Promise<DeviceModelState>;
  /** Call from a press only. Progress is a fraction between 0 and 1. Rejects when no usable session can answer afterwards. */
  initialize(onProgress: (fraction: number) => void): Promise<void>;
  canInitialize(): boolean;
  /** Records that a session was made in this browser, by a caller that made one itself. */
  markSessionMade?(): void;
  /** Clears the verified-session flag after a zero-weight or broken-session failure (H36a). */
  clearSessionMade?(): void;
  /** Latest error from a failed probe or initialize attempt, or null before any failed attempt / after success (H36c). */
  probeError?(): Error | null;
  /** H51e: true when the latest availability read ended at its limit without an answer (reported as "unavailable"). */
  noAnswer?(): boolean;
}

/** Text in, text out, English: the same options the prompt will use (sdk-facts 13). */
export const AVAILABILITY_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }],
} as const;

const STATES: readonly string[] = ["unavailable", "downloadable", "downloading", "available"];

const PROBE_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
  required: ["ok"],
  additionalProperties: false,
} as const;

const PROBE_PROMPT = 'Return {"ok":true}';
const NO_ANSWER = Symbol("no answer");

function isValidProbeReply(reply: unknown): boolean {
  if (typeof reply !== "string") return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.trim());
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  const keys = Object.keys(parsed);
  return keys.length === 1 && keys[0] === "ok" && (parsed as { ok: unknown }).ok === true;
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : Object.assign(new Error(String(e ?? "Error")), { name: "Error" });
}

/** Resolves to the promise's value, or to `fallback` after `limit` ms. A rejection resolves to `fallback`. */
async function within<T>(p: Promise<T>, limit: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), limit);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Races `p` against `limit` ms, rejecting with TimeoutError on timeout while preserving errors from `p`. */
async function raceTimeout<T>(p: Promise<T>, limit: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  p.catch(() => undefined);
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error("Device model prompt timed out."), { name: "TimeoutError" })),
          limit,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function makeDeviceModel(deps: DeviceModelDeps): DeviceModel {
  /** True once a model session has answered a tiny prompt in this browser (H35a D3, H36c). */
  let sessionMade = false;
  let lastProbeError: Error | null = null;
  let probing: Promise<boolean> | null = null;
  let availabilityTimedOut = false;
  const promptLimit = deps.probeTimeoutMs ?? PROBE_PROMPT_TIMEOUT_MS;

  // H36a + H36c: verify weights and require one non-empty prompt reply within 8 seconds; destroy either way.
  async function verifySession(session: LanguageModelSessionLike | null | undefined): Promise<void> {
    try {
      if (!session) throw new DOMException("No device model weights available", "QuotaExceededError");
      if (typeof session.inputQuota === "number" && !(session.inputQuota > 0)) {
        throw new DOMException("No device model weights available", "QuotaExceededError");
      }
      if (typeof session.measureInputUsage === "function") {
        const usage = await session.measureInputUsage(PROBE_PROMPT);
        if (typeof usage !== "number" || !Number.isFinite(usage)) {
          throw new DOMException("No device model weights available", "QuotaExceededError");
        }
      }
      if (typeof session.prompt !== "function") {
        throw Object.assign(new Error("No prompt method on device model session."), { name: "NotSupportedError" });
      }
      const reply = await raceTimeout(
        Promise.resolve().then(() => session.prompt!(PROBE_PROMPT, { responseConstraint: PROBE_SCHEMA })),
        promptLimit,
      );
      if (!isValidProbeReply(reply)) {
        throw Object.assign(new Error("Device model did not return a valid structured probe reply."), { name: "NotSupportedError" });
      }
    } finally {
      session?.destroy?.();
    }
  }

  // One probe at a time. A session counts as made only after verifySession answers a prompt.
  function probe(lm: LanguageModelLike, options: unknown): Promise<boolean> {
    if (probing === null) {
      probing = (async () => {
        try {
          if (typeof lm.create !== "function") {
            throw Object.assign(new Error("No model session can be made in this browser."), { name: "NotSupportedError" });
          }
          const session = await lm.create(options);
          await verifySession(session);
          sessionMade = true;
          lastProbeError = null;
          return true;
        } catch (e) {
          sessionMade = false;
          lastProbeError = asError(e);
          return false;
        } finally {
          probing = null;
        }
      })();
    }
    return probing;
  }

  return {
    async state(kind) {
      const lm = deps.languageModel;
      if (!lm) return "unavailable";
      const limit = deps.timeoutMs ?? DEVICE_AVAILABILITY_TIMEOUT_MS;
      const options = kind?.hasPhoto ? buildAvailabilityOptions(kind) : AVAILABILITY_OPTIONS;
      // H51e: a read that ends at the limit is no answer, not an answer that the model is absent.
      const read = await within<string | typeof NO_ANSWER>(lm.availability(options), limit, NO_ANSWER);
      availabilityTimedOut = read === NO_ANSWER;
      const answer = read === NO_ANSWER ? "unavailable" : read;
      const known = (STATES.includes(answer) ? answer : "unavailable") as DeviceModelState;
      if (known !== "available" || sessionMade) return known;
      // Available by the browser's word, no session yet: probe with one tiny prompt.
      // Never run when downloadable/downloading/unavailable so page load never starts a download (H36c).
      const outcome = await within<boolean | "timeout">(probe(lm, options), limit, "timeout");
      if (outcome === true) return "available";
      if (outcome === "timeout") {
        sessionMade = false;
        lastProbeError = Object.assign(new Error("Device model probe timed out."), { name: "TimeoutError" });
      }
      return "downloadable";
    },
    async initialize(onProgress) {
      if (!deps.initializeDeviceModel) throw new Error("The device model cannot be started here.");
      try {
        await deps.initializeDeviceModel(onProgress);
        const lm = deps.languageModel;
        if (!lm || typeof lm.create !== "function") {
          throw Object.assign(new Error("No model session can be made in this browser."), { name: "NotSupportedError" });
        }
        const session = await lm.create(AVAILABILITY_OPTIONS);
        await verifySession(session);
        sessionMade = true;
        lastProbeError = null;
      } catch (e) {
        if (e instanceof DownloadContinuing) throw e;
        sessionMade = false;
        lastProbeError = asError(e);
        throw e;
      }
    },
    canInitialize() {
      return deps.initializeDeviceModel !== undefined;
    },
    markSessionMade() {
      sessionMade = true;
      lastProbeError = null;
    },
    clearSessionMade() {
      sessionMade = false;
    },
    noAnswer() {
      return availabilityTimedOut;
    },
    probeError() {
      return lastProbeError;
    },
  };
}
