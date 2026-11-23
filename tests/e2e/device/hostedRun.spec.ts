// H28b: one run of the walk against the hosted page, in Google Chrome, with the built-in model.
// Invented visit only. At most 4 cloud model calls. No retry. No screen. No debug token written.
import { readFileSync } from "node:fs";
import { test } from "@playwright/test";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { normalizeTokens, TOKEN_ROLES } from "../../../src/masking/tokenForms";
import {
  describeRequest,
  nextFreeRecord,
  redactedPath,
  writeNewRecord,
  type RecordedRequest,
} from "../fixtures/deviceModel";
import {
  acceptAll,
  draftProblems,
  finishedZoneCheck,
  leakCheck,
  leakProblems,
  readCard,
  recordHeader,
  replyText,
  requestsSection,
  watchCloudReplies,
  words,
  type LeakResult,
} from "./hybridSupport";
import {
  assertHostedPass,
  evaluateHostedVerdicts,
  hostedVerdictFields,
  finalizeHostedOutcome,
  hostedPreflight,
  openHostedDevice,
  readDebugTokenGlobal,
  readServiceWorker,
  type HostedDeviceHalf,
  type HostedPreflight,
  type HostedRobotCheck,
} from "./hostedSupport";
import { appReady, press, seconds, settleShell } from "./support";
import { fetchNetworkEntryScript, verifyLoadedRelease, type LoadedReleaseCheck } from "../fixtures/records";

const CAP = 4;

/**
 * H34b amendment E, structure only. Per reply: the pronoun tokens whose tag equals the nearest tag before them in the
 * same sentence, with no other tag between, split by role word. A tag is a bare tag or the tag of an earlier token. A
 * sentence ends at . ! ? followed by a space, or at a line break. Counts only; the reply text is never kept. The same
 * function stands in cloudDraftForms.spec.ts.
 */
function tokensNamingThePreviousTag(text: string): { total: number; byRole: Record<string, number> } {
  const byRole: Record<string, number> = Object.fromEntries(TOKEN_ROLES.map((r) => [r, 0]));
  let total = 0;
  const mention = new RegExp(String.raw`\{(${TOKEN_ROLES.join("|")}):((?:Person|Place|Date|Detail) \d+)\}|\[((?:Person|Place|Date|Detail) \d+)\]`, "gi");
  for (const sentence of normalizeTokens(text).split(/(?<=[.!?])\s+|\r?\n+/)) {
    let previous: string | null = null;
    for (const m of sentence.matchAll(mention)) {
      const label = (m[2] ?? m[3])!.toLowerCase();
      if (m[1] !== undefined && previous === label) {
        byRole[m[1].toLowerCase()]!++;
        total++;
      }
      previous = label;
    }
  }
  return { total, byRole };
}

/** HOSTED_PREFLIGHT_ONLY=1: the readings that need no press. No file, no press, no model call. */
async function preflightOnly(): Promise<void> {
  const out = await openHostedDevice(CAP);
  if (!out.ok) throw new Error(`PREFLIGHT the hosted page did not open: ${out.reason}`);
  const s = out.session;
  const page = s.page;
  const problems: string[] = [];
  const line = (text: string) => console.log(`PREFLIGHT ${text}`);
  try {
    const pre = await hostedPreflight(page);
    line(`configStatus200=${pre.configStatus200} configParses=${pre.configParses} sixKeys=${pre.sixKeys} siteKeyServed=${pre.siteKeyServed}`);
    line(`indexHtmlSha256=${pre.indexHtmlSha256}`);
    line(`swJsSha256=${pre.swJsSha256}`);
    if (![pre.configStatus200, pre.configParses, pre.sixKeys, pre.siteKeyServed].every(Boolean)) problems.push("the hosted config or site key is not served complete");
    await settleShell(page);
    const worker = await readServiceWorker(page);
    line(`buildMode=${worker.build}`);
    line(`worker registered=${worker.registered} active=${worker.active} cachedFiles=${worker.cachedFiles} note=${worker.note}`);
    await page.locator('[data-state="device"] .state-words').getByText("ready", { exact: true }).waitFor({ timeout: 30_000 });
    await page.locator('[data-state="cloud"] .state-words').getByText("ready, not used yet", { exact: true }).waitFor({ timeout: 30_000 });
    const token = await readDebugTokenGlobal(page);
    line(`debugTokenGlobal=${token}`);
    const exchanges = s.recorder.requests.filter((r) => {
      try {
        return new URL(r.url).host === "content-firebaseappcheck.googleapis.com";
      } catch {
        return false;
      }
    }).length;
    line(`appCheckExchangesSoFar=${exchanges}`);
    line(`generateContentCalls=${s.recorder.generateContentCount()}`);
    if (token !== "undefined") problems.push("the debug token global is defined");
    if (worker.build !== "production") problems.push(`the build mode is "${worker.build}", not "production"`);
    if (!worker.registered || !worker.active) problems.push("the worker is not registered and active");
  } catch (error) {
    problems.push(`a reading threw: ${String((error as Error).message ?? error).split("\n")[0]}`);
  } finally {
    await s.close();
  }
  for (const p of problems) console.log(`PREFLIGHT problem: ${p}`);
  if (problems.length > 0) throw new Error(`PREFLIGHT failed: ${problems[0]}`);
}

interface Step {
  step: number;
  what: string;
  mode: string;
  inferenceSource: string;
  label: string;
  presses: number;
  seconds: number;
  outsideRequests: number;
}

const gen = (r: RecordedRequest) => r.url.includes(":generateContent");

test("H28b: one run against the hosted page", async () => {
  test.setTimeout(270_000);
  if (process.env.HOSTED_PREFLIGHT_ONLY === "1") {
    await preflightOnly();
    return;
  }
  const out = await openHostedDevice(CAP);
  const file = nextFreeRecord("hosted-run").file;
  if (!out.ok) {
    writeNewRecord(file, {
      ...recordHeader(out.browser),
      status: "miss",
      ...hostedVerdictFields({ robotCheck: "not run", deviceHalf: "miss" }),
      what: "One run against the hosted page in Google Chrome with the built-in model and the real cloud, invented visit",
      reason: out.reason,
      cloudCalls: { generateContent: 0, cap: CAP, stoppedAtCap: false },
      appCheck: { provider: "reCAPTCHA Enterprise", scriptLoaded: false, exchanges: [] },
    });
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  const replies = watchCloudReplies(s.context);
  // The same replies, read once more for amendment E. Slot i here is slot i of replies.replies: both listen to the same event.
  const naming: ({ total: number; byRole: Record<string, number> } | null)[] = [];
  const namingReads: Promise<void>[] = [];
  s.context.on("response", (res) => {
    const url = res.url();
    if (!url.includes(`//${CLOUD_MODEL_HOST}/`) || !url.includes(":generateContent")) return;
    const slot = naming.length;
    naming.push(null);
    namingReads.push(
      res.text().then(
        (body) => {
          const text = replyText(body);
          naming[slot] = text === null ? null : tokensNamingThePreviousTag(text);
        },
        () => undefined,
      ),
    );
  });
  const steps: Step[] = [];
  const problems: string[] = [];
  const leaks: { step: number; result: LeakResult }[] = [];
  let presses = 0;
  const tap = async (selector: string) => {
    presses++;
    await press(page, selector);
  };
  const note = (step: number, what: string, mode: string, label: string, started: number, since: number, source: string) => {
    const outside = s.recorder.since(since).filter((r) => !r.url.startsWith(s.origin)).length;
    steps.push({ step, what, mode, inferenceSource: source, label, presses, seconds: seconds(Date.now() - started), outsideRequests: outside });
    presses = 0;
  };
  const sourceOf = (label: string) => (label.includes("in the cloud") ? "IN_CLOUD" : label.includes("on this device") ? "ON_DEVICE" : "not shown");
  const checkLeaks = (step: number, since: number, sentText: string) => {
    const result = leakCheck(s.recorder.since(since), sentText);
    leaks.push({ step, result });
    problems.push(...leakProblems(result).map((p) => `step ${step}: ${p}`));
  };
  let pre: HostedPreflight | null = null;
  let debugTokenGlobal = "not read";
  let observed: { network: string; device: string; cloud: string } | null = null;
  let navigationToReadyS: number | null = null;
  let deviceHeaderWordsSeen: string[] = [];
  let serviceWorker: { registered: boolean; active: boolean; cachedFiles: number; note: string; build: string } | null = null;
  let loadedScript: string | null = null;
  let networkScript: string | null = null;
  let loadedRelease: LoadedReleaseCheck | null = null;
  let deviceReadySeen = false;
  let preflightMissed = false;
  try {
    pre = await hostedPreflight(page);
    const booleans = [pre.configStatus200, pre.configParses, pre.sixKeys, pre.siteKeyServed];
    if (booleans.some((b) => !b)) {
      preflightMissed = true;
      problems.push("the hosted config or site key is not served");
      return;
    }
    const startedLoad = Date.now();
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as Record<string, unknown>).__h36dDeviceWords = seen;
      let done = false;
      let observer: MutationObserver | null = null;
      let timer: ReturnType<typeof setInterval> | null = null;
      const sample = () => {
        if (done) return;
        const el = document.querySelector('[data-state="device"] .state-words');
        const text = (el?.textContent ?? "").trim();
        if (text && seen[seen.length - 1] !== text) seen.push(text);
        if (text === "ready") {
          done = true;
          observer?.disconnect();
          if (timer !== null) clearInterval(timer);
        }
      };
      const start = () => {
        sample();
        if (!done && !observer && document.documentElement) {
          observer = new MutationObserver(sample);
          observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
        }
        if (!done && timer === null) timer = setInterval(sample, 25);
      };
      if (document.documentElement) start();
      document.addEventListener("DOMContentLoaded", start, { once: true });
    });
    await settleShell(page);
    loadedRelease = await verifyLoadedRelease({
      readLoadedScript: () =>
        page.evaluate(() => {
          const script = document.querySelector('script[type="module"][src]') as HTMLScriptElement | null;
          return script?.getAttribute("src") ?? script?.src ?? null;
        }),
      readNetworkScript: () => fetchNetworkEntryScript(s.origin),
      reload: async () => {
        await page.reload();
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null).catch(() => undefined);
        await appReady(page);
      },
    });
    loadedScript = loadedRelease.loadedScript;
    networkScript = loadedRelease.networkScript;
    serviceWorker = await readServiceWorker(page);
    if (!loadedRelease.matches) {
      throw new Error(
        `loaded release mismatch after 1 reload: loadedScript=${loadedScript ?? "none"} networkScript=${networkScript ?? "none"}`,
      );
    }
    const loadMark = s.recorder.mark();
    await page.locator('[data-state="device"] .state-words').getByText("ready", { exact: true }).waitFor({ timeout: 30_000 });
    deviceReadySeen = true;
    deviceHeaderWordsSeen = await page.evaluate(
      () => (window as unknown as Record<string, string[]>).__h36dDeviceWords ?? [],
    );
    navigationToReadyS = seconds(
      await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const end = performance.now();
        return nav ? Math.max(0, end - nav.startTime) : end;
      }),
    );
    await page.locator('[data-state="cloud"] .state-words').getByText("ready, not used yet", { exact: true }).waitFor({ timeout: 30_000 });
    debugTokenGlobal = await readDebugTokenGlobal(page);
    note(1, "page load", "none", "Device model: ready, Cloud: connected", startedLoad, loadMark, "none");

    let mark = s.recorder.mark();
    let started = Date.now();
    await tap("#try-example");
    await page.locator('[data-mark="example"]').first().waitFor();
    await tap("#make-record");
    const record = page.locator("[data-record]");
    await record.waitFor({ timeout: 150_000 });
    const recordLabel = (await record.locator(".source-label").first().innerText()).replace(/\s+/g, " ").trim();
    await tap("#mask");
    await page.locator("[data-mask-view] .mask-chip").first().waitFor();
    await page.locator("[data-mask-section] .source-label").first().waitFor({ timeout: 150_000 });
    const accepted = await acceptAll(page);
    presses += accepted;
    note(2, "Make the record, Mask, accept every device suggestion", "ONLY_ON_DEVICE", recordLabel, started, mark, sourceOf(recordLabel));
    if (recordLabel !== "on this device") problems.push(`step 2: the record was labelled "${recordLabel}".`);
    if (steps[steps.length - 1]?.outsideRequests !== 0) problems.push(`step 2: ${steps[steps.length - 1]?.outsideRequests} request(s) left the page during the device steps.`);
    checkLeaks(2, mark, "");

    mark = s.recorder.mark();
    started = Date.now();
    replies.step = "step 3: second reader";
    await tap("#ask-reader");
    const sentReader = await page.locator("[data-outgoing]").innerText();
    await tap("#send");
    await page.locator("[data-reader-pass], [data-reader-error]").first().waitFor({ timeout: 120_000 });
    const readerError = (await page.locator("[data-reader-error]").count()) > 0;
    const readerLabel = (await page.locator(".reader-source .source-label").count()) > 0
      ? (await page.locator(".reader-source .source-label").first().innerText()).replace(/\s+/g, " ").trim()
      : "not shown";
    const guesses = await page.locator("[data-reader] [data-guess]").count();
    note(3, "Ask a second reader, Send", "ONLY_IN_CLOUD", readerLabel, started, mark, sourceOf(readerLabel));
    if (readerError) problems.push("step 3: the reader showed an error.");
    if (guesses < 1) problems.push("step 3: no guess was shown.");
    if (sourceOf(readerLabel) !== "IN_CLOUD") problems.push(`step 3: the reader was labelled "${readerLabel}".`);
    checkLeaks(3, mark, sentReader);

    mark = s.recorder.mark();
    started = Date.now();
    replies.step = "step 4: draft";
    await tap("#draft");
    const sheet = page.locator('[data-zone="finished"] .sheet-text');
    const send = page.locator("#send");
    await sheet.or(send).first().waitFor({ timeout: 60_000 });
    if (!(await sheet.isVisible())) await tap("#send");
    await sheet.waitFor({ timeout: 150_000 });
    const cloudLabel = (await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + ").replace(/\s+/g, " ").trim();
    const cloudText = await sheet.innerText();
    const zone = await finishedZoneCheck(page, "step 4");
    note(4, "Draft, Send", "PREFER_IN_CLOUD", cloudLabel, started, mark, sourceOf(cloudLabel));
    if (!cloudLabel.includes("in the cloud")) problems.push(`step 4: the finished note was labelled "${cloudLabel}".`);
    if (!cloudText.includes("Maria Okonkwo-Reyes")) problems.push("step 4: the names were not put back in the finished note.");
    problems.push(...draftProblems("step 4: the cloud draft", cloudText));
    problems.push(...zone.problems);
    checkLeaks(4, mark, await page.locator("[data-outgoing]").innerText());

    observed = { network: await words(page, "network"), device: await words(page, "device"), cloud: await words(page, "cloud") };
    note(5, "end state", "none", `${observed.network}; ${observed.device}; ${observed.cloud}`, Date.now(), s.recorder.mark(), "none");
  } catch (error) {
    problems.push(String((error as Error).message ?? error).split("\n")[0] ?? "the walk stopped");
  } finally {
    await s.recorder.responseBodies().catch(() => undefined);
    await replies.done().catch(() => undefined);
    await Promise.all(namingReads).catch(() => undefined);
    const requests = s.recorder.requests;
    const described = requests.map((r) => describeRequest(r, s.origin));
    const exchanges = requests
      .filter((r) => {
        try {
          return new URL(r.url).host === "content-firebaseappcheck.googleapis.com";
        } catch {
          return false;
        }
      })
      .map((r) => ({ path: redactedPath(r.url), status: r.status ?? "not seen", responseBodyBytes: r.responseBodyBytes }));
    const scriptLoaded = described.some((r) => r.passedBy === "App Check script");
    const generateContent = requests.filter(gen).length;
    const stoppedAtCap = s.recorder.stoppedAtCap();
    const refused = described.filter((r) => r.passedBy === "refused");
    const outcome = finalizeHostedOutcome({
      preflightMissed,
      baseProblems: problems,
      loadedReleaseMatches: loadedRelease?.matches === true,
      serviceWorker,
      debugTokenGlobal,
      namesDebug: namesDebug(requests),
      refused,
      deviceReadySeen,
      scriptLoaded,
      exchanges,
      generateContent,
      stoppedAtCap,
      steps,
    });
    problems.splice(0, problems.length, ...outcome.problems);
    const { miss, status, verdicts } = outcome;
    if (!existsRecord(file)) {
      let body: Record<string, unknown>;
      try {
        body = recordBody(status, verdicts, miss ? problems[0] : undefined);
      } catch (error) {
        // H44 item 5: the verdicts are written on every run, even when the full record could not be built.
        body = {
          ...recordHeader(s.browser),
          status,
          ...hostedVerdictFields(verdicts),
          reason: `the full record could not be built: ${String((error as Error).message ?? error).split("\n")[0]}`,
          problems,
        };
      }
      writeNewRecord(file, body);
    }
    await s.close();
    assertHostedPass(status, problems, file);
  }

  function existsRecord(path: string): boolean {
    try {
      readFileSync(path);
      return true;
    } catch {
      return false;
    }
  }

  function namesDebug(requests: RecordedRequest[]): boolean {
    let token = "";
    try {
      token = readFileSync("appcheck-debug-token.local", "utf8").trim();
    } catch {
      token = "";
    }
    for (const r of requests) {
      const path = redactedPath(r.url);
      if (path.includes("exchangeDebugToken")) return true;
      const body = r.body ? r.body.toString("utf8") : "";
      if (token.length >= 8 && (r.url.includes(token) || body.includes(token))) return true;
    }
    return false;
  }

  function recordBody(
    status: "pass" | "fail" | "miss",
    verdicts: { robotCheck: HostedRobotCheck; deviceHalf: HostedDeviceHalf },
    reason?: string,
  ) {
    const requests = s.recorder.requests;
    const exchanges = requests
      .filter((r) => {
        try {
          return new URL(r.url).host === "content-firebaseappcheck.googleapis.com";
        } catch {
          return false;
        }
      })
      .map((r) => ({ path: redactedPath(r.url), status: r.status ?? "not seen", responseBodyBytes: r.responseBodyBytes }));
    const described = requests.map((r) => describeRequest(r, s.origin));
    const counts = { generateContent: s.recorder.generateContentCount(), appCheck: s.recorder.appCheckCount(), stoppedAtCap: s.recorder.stoppedAtCap() };
    return {
      ...recordHeader(s.browser),
      status,
      ...hostedVerdictFields(verdicts),
      ...(reason ? { reason } : {}),
      what: "One run against the hosted page in Google Chrome with the built-in model and the real cloud, invented visit",
      hostedOrigin: s.origin.replace(/\/$/, ""),
      served: {
        indexHtmlSha256: pre?.indexHtmlSha256 ?? "",
        swJsSha256: pre?.swJsSha256 ?? "",
        configServed: pre?.configStatus200 === true && pre.configParses === true && pre.sixKeys === true,
        siteKeyServed: pre?.siteKeyServed === true,
      },
      debugTokenGlobal,
      navigationToReadyS,
      deviceHeaderWordsSeen,
      serviceWorker,
      loadedScript,
      networkScript,
      loadedRelease,
      appCheck: {
        provider: "reCAPTCHA Enterprise",
        scriptLoaded: described.some((r) => r.passedBy === "App Check script"),
        exchanges,
      },
      cloudCalls: { generateContent: counts.generateContent, cap: CAP, stoppedAtCap: counts.stoppedAtCap },
      cloudReplies: replies.replies,
      cloudReplyTokensNamingThePreviousTag: replies.replies.map((r, i) => ({ step: r.step, ...(naming[i] ?? { total: null, byRole: null }) })),
      steps,
      observed,
      requests: requestsSection(requests, s.origin, counts),
      refusedOutsideRequests: described.filter((r) => r.passedBy === "refused"),
      leakChecks: leaks,
      problems,
    };
  }
});
