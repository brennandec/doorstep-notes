// What the device half did on the author's computer (session H35b, issue A4). Shown to a judge whose
// computer has no device model. Every number and file name comes from the results lookup; none is typed here.
import { el } from "./dom";
import type { ResultFile, ResultsLookup } from "./figures";
import { newestResultName, rankOf } from "./newest";
import { fill, strings } from "./strings";
import type { AppState } from "./state";

export interface DeviceStepRecord {
  file: string;
  what: string;
  seconds: number;
  requests: number;
}
export interface OfflinePressRecord {
  file: string;
  answered: number;
  total: number;
  requests: number;
}

const RUN_BASES = ["hosted-run", "hybrid-run"] as const;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Dated names of every run of the bases, newest first (date, then session or number rank). */
function runNamesNewestFirst(results: ResultsLookup): string[] {
  const names = results.names?.();
  if (names === undefined) return RUN_BASES.map((b) => newestResultName(results, b)).filter((n) => results(n) !== undefined);
  const parsed = names
    .map((n) => ({ n, m: /^(hosted-run|hybrid-run)-(\d{4}-\d{2}-\d{2})(?:-(h\d+(?:-\d+)?|\d+))?$/.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({ n: x.n, key: `${x.m[2]}#${String(rankOf(x.m[3])).padStart(8, "0")}` }));
  parsed.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
  return parsed.map((x) => x.n);
}

/** The newest hosted or hybrid run whose whole status is pass and whose device step holds the fields; else null. */
export function deviceStepRecord(results: ResultsLookup): DeviceStepRecord | null {
  for (const file of runNamesNewestFirst(results)) {
    const run = results(file) as (ResultFile & { steps?: unknown; problems?: unknown }) | undefined;
    if (run?.status !== "pass" || !Array.isArray(run.steps)) continue;
    const problems = Array.isArray(run.problems) ? run.problems.filter((p): p is string => typeof p === "string") : [];
    for (const raw of run.steps as Record<string, unknown>[]) {
      if (raw === null || typeof raw !== "object") continue;
      if (raw.mode !== "ONLY_ON_DEVICE" || raw.inferenceSource !== "ON_DEVICE") continue;
      if (!isNum(raw.seconds) || !isNum(raw.outsideRequests) || typeof raw.what !== "string") continue;
      if (problems.some((p) => p.startsWith(`step ${String(raw.step)}:`))) continue;
      return { file, what: raw.what, seconds: raw.seconds, requests: raw.outsideRequests };
    }
  }
  return null;
}

/** The newest offline-press record, only when it passed and holds its counts. */
export function offlinePressRecord(results: ResultsLookup): OfflinePressRecord | null {
  const file = newestResultName(results, "offline-press");
  const rec = results(file) as (ResultFile & { summary?: { withCall?: unknown; pressesRun?: unknown }; nonLocalThrough?: unknown }) | undefined;
  if (rec?.status !== "pass") return null;
  const { withCall, pressesRun } = rec.summary ?? {};
  if (!isNum(withCall) || !isNum(pressesRun) || !isNum(rec.nonLocalThrough)) return null;
  return { file, answered: withCall, total: pressesRun, requests: rec.nonLocalThrough };
}

/** The panel for a computer with no ready device model; null when the model is available here. */
export function renderDeviceHalfPanel(state: AppState): HTMLElement | null {
  if (state.device.state === "available") return null;
  const t = strings.authorDevicePanel;
  const step = deviceStepRecord(state.results);
  const press = offlinePressRecord(state.results);
  return el(
    "aside",
    { class: "author-device-panel", "data-author-device-panel": "", "aria-labelledby": "author-device-panel-title" },
    el("h3", { id: "author-device-panel-title" }, t.title),
    el(
      "ul",
      {},
      el("li", { "data-author-device-step": "" }, step ? fill(t.step, { what: step.what, seconds: step.seconds, requests: step.requests, file: step.file }) : t.stepNotMeasured),
      el(
        "li",
        { "data-author-offline-press": "" },
        press ? fill(t.offline, { answered: press.answered, total: press.total, requests: press.requests, file: press.file }) : t.offlineNotMeasured,
      ),
    ),
  );
}
