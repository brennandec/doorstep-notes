// Pure Playwright-free hosted-check verdict evaluators and exit assertion (Order H43 A1.1 & A2).

export type HostedRobotCheck = "accepted" | "refused" | "not run";
export type HostedDeviceHalf = "pass" | "fail" | "miss";

export interface HostedStepSummary {
  step: number;
  inferenceSource: string;
  label: string;
  outsideRequests: number;
}

export interface HostedExchangeSummary {
  path: string;
  status: number | string;
  responseBodyBytes?: number;
}

export interface HostedWorkerReading {
  registered: boolean;
  active: boolean;
  cachedFiles: number;
  note: string;
  build: string;
}

/**
 * H43 A1.1: separates whether the robot check accepted or refused the test browser from whether
 * the device half and page infrastructure passed, independent of each other.
 */
export function evaluateHostedVerdicts(input: {
  miss: boolean;
  openOk: boolean;
  loadedReleaseMatches: boolean;
  serviceWorker: HostedWorkerReading | null;
  debugTokenGlobal: string;
  namesDebug: boolean;
  refusedCount: number;
  deviceReadySeen: boolean;
  scriptLoaded: boolean;
  scriptBlocked?: boolean;
  exchanges: readonly HostedExchangeSummary[];
  modelCalls: number;
  steps: readonly HostedStepSummary[];
  problems: readonly string[];
}): { robotCheck: HostedRobotCheck; deviceHalf: HostedDeviceHalf } {
  if (!input.openOk || input.miss) {
    return { robotCheck: "not run", deviceHalf: "miss" };
  }

  const swOk =
    input.serviceWorker !== null &&
    input.serviceWorker.registered &&
    input.serviceWorker.active &&
    input.serviceWorker.cachedFiles >= 1 &&
    !input.serviceWorker.note.startsWith("failed") &&
    input.serviceWorker.build === "production";
  const step1Ok = input.deviceReadySeen && input.steps.some((s) => s.step === 1);
  const step2 = input.steps.find((s) => s.step === 2);
  const step2Ok =
    step2 !== undefined &&
    step2.inferenceSource === "ON_DEVICE" &&
    step2.label === "on this device" &&
    step2.outsideRequests === 0 &&
    !input.problems.some((p) => p.startsWith("step 2:"));
  const deviceHalf: HostedDeviceHalf =
    input.loadedReleaseMatches && swOk && input.debugTokenGlobal === "undefined" && !input.namesDebug && input.refusedCount === 0 && step1Ok && step2Ok
      ? "pass"
      : "fail";

  const step3 = input.steps.find((s) => s.step === 3);
  const step4 = input.steps.find((s) => s.step === 4);
  if (input.exchanges.length === 0 && step3 === undefined && step4 === undefined && !input.scriptBlocked) {
    return { robotCheck: "not run", deviceHalf };
  }

  const exchangeSeen = input.exchanges.some((e) => String(e.path).endsWith(":exchangeRecaptchaEnterpriseToken"));
  const exchangeOk =
    input.exchanges.length >= 1 &&
    input.exchanges.every((e) => e.status === 200 && (e.responseBodyBytes === undefined || e.responseBodyBytes > 0)) &&
    exchangeSeen;
  const accepted = input.scriptLoaded && exchangeOk;
  return { robotCheck: accepted ? "accepted" : "refused", deviceHalf };
}

/**
 * H44 item 5: the two verdicts as they sit in every hosted record, pass, fail or miss: the two top-level fields the
 * page-facing readers already use, and the same two inside `verdicts`, which a reader of the record looks for.
 */
export function hostedVerdictFields(v: { robotCheck: HostedRobotCheck; deviceHalf: HostedDeviceHalf }): {
  robotCheck: HostedRobotCheck;
  deviceHalf: HostedDeviceHalf;
  verdicts: { robotCheck: HostedRobotCheck; deviceHalf: HostedDeviceHalf };
} {
  return { robotCheck: v.robotCheck, deviceHalf: v.deviceHalf, verdicts: { robotCheck: v.robotCheck, deviceHalf: v.deviceHalf } };
}

export interface HostedOutcome {
  problems: string[];
  miss: boolean;
  status: "pass" | "fail" | "miss";
  verdicts: { robotCheck: HostedRobotCheck; deviceHalf: HostedDeviceHalf };
}

/**
 * Finalizes `problems`, `status`, and independent verdicts for `hostedRun.spec.ts`.
 * When preflight fails (`preflightMissed`), post-navigation checks did not run and are not
 * appended as failure problems, preserving `miss: true`, `status: "miss"`, and `{ robotCheck: "not run", deviceHalf: "miss" }`.
 */
export function finalizeHostedOutcome(input: {
  preflightMissed: boolean;
  baseProblems: readonly string[];
  loadedReleaseMatches: boolean;
  serviceWorker: HostedWorkerReading | null;
  debugTokenGlobal: string;
  namesDebug: boolean;
  refused: readonly { host: string }[];
  deviceReadySeen: boolean;
  scriptLoaded: boolean;
  exchanges: readonly HostedExchangeSummary[];
  generateContent: number;
  stoppedAtCap: boolean;
  steps: readonly HostedStepSummary[];
}): HostedOutcome {
  const problems = [...input.baseProblems];
  if (input.preflightMissed) {
    const missProblems = problems.length > 0 ? problems : ["the hosted config or site key is not served"];
    const miss = missProblems.length === 1 && missProblems[0] === "the hosted config or site key is not served";
    return {
      problems: missProblems,
      miss,
      status: miss ? "miss" : "fail",
      verdicts: { robotCheck: "not run", deviceHalf: miss ? "miss" : "fail" },
    };
  }

  const exchangeSeen = input.exchanges.some((e) => String(e.path).endsWith(":exchangeRecaptchaEnterpriseToken"));
  const exchangeOk = input.exchanges.length >= 1 && input.exchanges.every((e) => e.status === 200) && exchangeSeen;
  if (input.serviceWorker) {
    if (!input.serviceWorker.registered) problems.push("the service worker was not registered.");
    if (!input.serviceWorker.active) problems.push("the service worker was not active.");
    if (input.serviceWorker.cachedFiles < 1) problems.push("no file was cached by the service worker.");
    if (input.serviceWorker.note.startsWith("failed")) problems.push(`the page noted its worker as "${input.serviceWorker.note}".`);
    if (input.serviceWorker.build !== "production") problems.push(`the page's data-build was "${input.serviceWorker.build}", not "production".`);
  }
  if (input.debugTokenGlobal !== "undefined") problems.push("the debug token global was not undefined.");
  if (input.namesDebug) problems.push("a request path or body names a debug token.");
  if (!exchangeOk) problems.push("the App Check token exchange was missing or not status 200.");
  if (!input.scriptLoaded) problems.push("the reCAPTCHA script was not loaded.");
  if (input.generateContent < 2 || input.generateContent > 4) {
    problems.push(`generateContent calls were ${input.generateContent}, not between 2 and 4.`);
  }
  if (input.stoppedAtCap) problems.push("a generateContent request was stopped at the cap.");
  const step3 = input.steps.find((st) => st.step === 3);
  const step4 = input.steps.find((st) => st.step === 4);
  if (step3?.inferenceSource !== "IN_CLOUD") problems.push("step 3 was not in the cloud.");
  if (step4?.inferenceSource !== "IN_CLOUD") problems.push("step 4 was not in the cloud.");
  if (input.refused.length > 0) problems.push(`${input.refused.length} outside request(s) were refused.`);

  const miss = problems.length === 1 && problems[0] === "the hosted config or site key is not served";
  const status = miss ? "miss" : problems.length === 0 ? "pass" : "fail";
  const verdicts = evaluateHostedVerdicts({
    miss,
    openOk: true,
    loadedReleaseMatches: input.loadedReleaseMatches,
    serviceWorker: input.serviceWorker,
    debugTokenGlobal: input.debugTokenGlobal,
    namesDebug: input.namesDebug,
    refusedCount: input.refused.length,
    deviceReadySeen: input.deviceReadySeen,
    scriptLoaded: input.scriptLoaded,
    scriptBlocked: !input.scriptLoaded && input.refused.some((r) => /google|gstatic|recaptcha|appcheck/i.test(r.host)),
    exchanges: input.exchanges,
    modelCalls: input.generateContent,
    steps: input.steps,
    problems,
  });
  return { problems, miss, status, verdicts };
}

/** Throws after the hosted record has been written whenever the status is not `"pass"` or problems remain. */
export function assertHostedPass(status: "pass" | "fail" | "miss", problems: readonly string[], recordFile: string): void {
  if (status === "pass" && problems.length === 0) return;
  const detail = problems.length > 0 ? problems.join(" ") : `status ${status}`;
  throw new Error(`Hosted check did not pass (${status}; record: ${recordFile}): ${detail}`);
}
