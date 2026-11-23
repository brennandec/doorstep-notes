// Device measure (measurement task 7, R2, R4, R5). DEVICE MODEL, outside npm test.
// Runs the propose-masks job on each raw synthetic note, in Google Chrome with the built-in
// model, through the one fixture (tests/e2e/fixtures/deviceModel.ts). Each note goes through
// the Firebase SDK, ONLY_ON_DEVICE, with the same create options, schema and task text as the
// app's job (src/inference/proposeMasks). The reply is read and scored in Node.
//
// Time box: 15 minutes (DEVICE_MEASURE_LIMIT_MIN, second review V7); a session may shorten it with the variable
// of the same name. It stops before starting a note once the time is up and reports n.
// Chrome or the model absent, or any state but "available": "not measured" with the reason,
// and no number. The test double is never used. No download is started.
// Run: perl -e 'alarm 1200; exec @ARGV' npm run measure:device
import { SYNTHETIC_SEED } from "../src/constants";
import {
  buildProposeCreateOptions,
  PROPOSE_TASK_TEXT,
} from "../src/inference/proposeMasks/proposeMasks.real";
import { CANDIDATES_SCHEMA } from "../src/inference/proposeMasks/proposeMasks.schema";
import { DEFAULT_POLICY } from "../src/masking/policy";
import { openDevice, summariseRequests } from "../tests/e2e/fixtures/deviceModel";
import { SDK_PAGE_PATH, generate, sdkPageFiles, waitForSdkPage } from "../tests/e2e/device/support";
import type { SyntheticNote } from "./buildSet";
import {
  deviceNotMeasured,
  limitMinutes,
  parseDeviceReply,
  scoreDeviceRun,
  type FilePair,
  type NoteReply,
  type RunTiming,
} from "./deviceScore";
import { addFourthRun, assertThirdRunNotKept, FOURTH_RUN_FILES, keepThirdRun } from "./deviceRuns";
import { makeHeader, readResults, writeResults, type ResultsHeader } from "./results";

export const SCRIPT_NAME = "scripts/measureDevice.ts";
export const SCRIPT_VERSION = "1";
/** One note gets this long to answer. A note that does not is listed as failed and the run stops. */
const NOTE_TIMEOUT_MS = 120_000;

function readSet(): SyntheticNote[] {
  const file = readResults("synthetic-set");
  const notes = file?.["notes"];
  if (!file || !Array.isArray(notes) || Number(file["seed"]) !== SYNTHETIC_SEED) {
    throw new Error("results/synthetic-set.json is missing, unreadable or from another seed. Run npm run measure:set first.");
  }
  return notes as SyntheticNote[];
}

function earlierFiles(): { catchRate: Record<string, unknown>; misses: Record<string, unknown> } {
  const catchRate = readResults("catch-rate");
  const misses = readResults("misses");
  if (!catchRate || !misses) throw new Error("results/catch-rate.json or misses.json is missing. Run npm run measure:exact first.");
  return { catchRate, misses };
}

/**
 * Writes both files. The top of each file keeps the header of the script that wrote its exact
 * part; the device parts carry their own date and browser inside.
 */
function write(pair: FilePair, fallback: ResultsHeader, names: readonly [string, string] = ["catch-rate", "misses"]): void {
  for (const [rawName, body] of [[names[0], pair.catchRate], [names[1], pair.misses]] as const) {
    const name = rawName.replace(/\.json$/, "");
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
    const header: ResultsHeader = {
      date: str("date") || fallback.date,
      browser: str("browser") || fallback.browser,
      script: str("script") || fallback.script,
      scriptVersion: str("scriptVersion") || fallback.scriptVersion,
    };
    const { date: _d, browser: _b, script: _s, scriptVersion: _v, ...rest } = body;
    writeResults(name, header, rest);
  }
}

export async function main(): Promise<void> {
  // The earlier runs are kept and never overwritten (measurement R13.2, R15.1). Refuse before a long run starts.
  assertThirdRunNotKept();
  const notes = readSet();
  const earlier = earlierFiles();
  const limitMin = limitMinutes();
  const sdk = sdkPageFiles();
  const out = await openDevice({ url: SDK_PAGE_PATH, files: sdk.files, local: sdk.local });
  if (!out.ok) {
    const earlierDevice = earlier.catchRate["device"] as { status?: string } | undefined;
    if (earlierDevice && earlierDevice.status !== "not measured") {
      // A measured run stays as it is; a miss does not replace it and does not use up the -run-2 files.
      console.log(`Not measured: ${out.reason} The runs in results/catch-rate.json were left as they are.`);
      return;
    }
    const header = makeHeader({ browser: out.browser, script: SCRIPT_NAME, scriptVersion: SCRIPT_VERSION });
    write(deviceNotMeasured(earlier.catchRate, earlier.misses, out.reason), header);
    console.log(`Not measured: ${out.reason}`);
    return;
  }
  const s = out.session;
  const replies: NoteReply[] = [];
  let stoppedAtLimit = false;
  let stoppedEarlyBecause: string | undefined;
  let outsideRequests = 0;
  const t0 = Date.now();
  try {
    await waitForSdkPage(s.page);
    for (const [i, note] of notes.entries()) {
      if (Date.now() - t0 >= limitMin * 60_000) {
        stoppedAtLimit = true;
        break;
      }
      const started = Date.now();
      const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), NOTE_TIMEOUT_MS));
      const r = await Promise.race([
        generate(s.page, {
          createOptions: buildProposeCreateOptions(),
          promptOptions: { responseConstraint: CANDIDATES_SCHEMA },
          parts: [PROPOSE_TASK_TEXT + note.text],
        }),
        timeout,
      ]);
      const ms = Date.now() - started;
      if (r === "timeout") {
        replies.push({ noteId: note.id, ok: false, reason: `No answer in ${NOTE_TIMEOUT_MS / 1000} seconds.`, ms });
        stoppedEarlyBecause = `Note ${note.id} did not answer in ${NOTE_TIMEOUT_MS / 1000} seconds; the run was stopped.`;
        break;
      }
      if (!r.ok) {
        replies.push({ noteId: note.id, ok: false, reason: `${r.name}: ${r.message}`.slice(0, 200), ms });
      } else if (r.source !== "on_device") {
        replies.push({ noteId: note.id, ok: false, reason: `The SDK reported the source "${r.source}", not on_device.`, ms });
      } else {
        const parsed = parseDeviceReply(r.text);
        replies.push(parsed.ok ? { noteId: note.id, ok: true, candidates: parsed.candidates, ms } : { noteId: note.id, ok: false, reason: parsed.reason, ms });
      }
      if ((i + 1) % 10 === 0) console.log(`${i + 1} of ${notes.length} notes tried, ${Math.round((Date.now() - t0) / 1000)} seconds`);
    }
  } finally {
    // The recorder refuses anything outside the served page; device jobs should make no request at all.
    const outside = summariseRequests(s.recorder.requests, s.origin).outside.filter((x) => x.served !== "local file");
    outsideRequests = outside.length;
    await s.close();
  }
  const elapsedMs = Date.now() - t0;
  const timing: RunTiming = { elapsedMs, limitMin, stoppedAtLimit, ...(stoppedEarlyBecause ? { stoppedEarlyBecause } : {}) };
  const header = makeHeader({ browser: s.browser, script: SCRIPT_NAME, scriptVersion: SCRIPT_VERSION });
  const run = scoreDeviceRun(notes, replies, DEFAULT_POLICY);
  // Copy the current two files (runs 1 to 3) before anything is written.
  keepThirdRun();
  const four = addFourthRun(earlier.catchRate, earlier.misses, run, header, timing);
  const dev = four.tried.catchRate["device"] as Record<string, unknown>;
  if (dev["status"] !== "not measured") dev["outsideRequests"] = outsideRequests;
  if (dev["status"] !== "not measured") {
    // The fourth run is kept whole as the record of the try, whether or not the rule stands.
    write(four.tried, header, FOURTH_RUN_FILES);
  }
  write(four.standing, header);
  console.log(`Dates of birth found by the device pass: third run ${four.dob.third}, fourth run ${four.dob.fourth}. ${four.ruleStands ? "The rule stands." : "The rule is to be taken out again."}`);

  const pct = (p: { score: { caught: number; total: number; falseMasks: number } }) => `${p.score.caught} of ${p.score.total} caught, ${p.score.falseMasks} false masks`;
  console.log(`Chrome: ${s.browser}`);
  console.log(`Tried ${run.attempted} of ${notes.length} notes in ${Math.round(elapsedMs / 1000)} seconds; answered ${run.n}; failed ${run.failed.length}. Limit ${limitMin} minutes${stoppedAtLimit ? " (reached)" : ""}.`);
  console.log(`Exact alone: ${pct(run.exact)}`);
  console.log(`Exact and near: ${pct(run.exactAndNear)}`);
  console.log(`Device alone: ${pct(run.device)}`);
  console.log(`All together: ${pct(run.merged)}`);
  console.log(`Requests outside the page: ${outsideRequests}`);
  if (stoppedEarlyBecause) console.log(stoppedEarlyBecause);
}
