// DEVICE MODEL. capture-and-record task 16. Token limit.
// Finds the largest invented note the device model accepts together with the real schema and
// the real system prompt of the structure job, without and with an invented photo, by
// bisection on the note's length in characters. Token counting is not available for hybrid
// (sdk-facts 18), so the figure is characters and best effort (ruling 9).
// Writes results/device-token-limit.json: `bound` is the most characters the guard may allow
// for note + schema + system prompt, `photoAmount` is what a photo costs in the same unit;
// or a miss with its reason. src/inference/lengthGuard.ts reads both.
import { expect, test } from "@playwright/test";
import { DEVICE_TOKEN_LIMIT } from "../../../src/constants";
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { buildCreateOptions, SYSTEM_PROMPT } from "../../../src/inference/structure/createOptions";
import { TASK_TEXT } from "../../../src/inference/structure/structure.real";
import { VISIT_RECORD_SCHEMA } from "../../../src/inference/structure/structure.schema";
import { openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { SDK_PAGE_PATH, generate, recordAbsent, sdkPageFiles, waitForSdkPage } from "./support";

const SCHEMA_CHARS = JSON.stringify(VISIT_RECORD_SCHEMA).length;
const STOP_WHEN_WITHIN_CHARS = 1500;
const TIME_BUDGET_MS = 225_000;

/** An invented note of about this many characters: the invented visit, repeated and cut. */
function noteOfLength(chars: number): string {
  let text = "";
  while (text.length < chars) text += inventedVisit.note + "\n";
  return text.slice(0, chars);
}

interface Probe {
  chars: number;
  accepted: boolean;
  error?: string;
  seconds: number;
}

test("Token limit: the largest invented note accepted with the schema and system prompt, without and with a photo", async () => {
  test.setTimeout(290_000);
  const sdk = sdkPageFiles();
  const out = await openDevice({ url: SDK_PAGE_PATH, files: sdk.files, local: sdk.local });
  if (!out.ok) {
    recordAbsent("device-token-limit", out, "miss");
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const started = Date.now();
  const probes: { withoutPhoto: Probe[]; withPhoto: Probe[] } = { withoutPhoto: [], withPhoto: [] };
  try {
    await waitForSdkPage(s.page);
    // An invented picture: printed lines drawn on a canvas, 900 by 260 pixels (not handwriting).
    const png = await s.page.evaluate(() => (window as unknown as { __png(w: number, h: number, l: string[]): string }).__png(900, 260, ["12/11 visit flat 3. Mould in back bedroom.", "Landlord not replied to 2 emails.", "Agreed: ring landlord Monday."]));

    const tryChars = async (chars: number, withPhoto: boolean): Promise<Probe> => {
      const parts: unknown[] = [{ text: TASK_TEXT + noteOfLength(chars) }];
      if (withPhoto) parts.push({ inlineData: { data: png, mimeType: "image/png" } });
      const r = await generate(s.page, {
        createOptions: buildCreateOptions({ hasPhoto: withPhoto }),
        promptOptions: { responseConstraint: VISIT_RECORD_SCHEMA },
        parts,
      });
      const p: Probe = r.ok
        ? { chars, accepted: true, seconds: Math.round(r.ms / 100) / 10 }
        : { chars, accepted: false, error: r.name, seconds: Math.round(r.ms / 100) / 10 };
      (withPhoto ? probes.withPhoto : probes.withoutPhoto).push(p);
      return p;
    };

    /** Largest accepted length between a length known to work and a length expected to fail. */
    const search = async (withPhoto: boolean, lo: number, hi: number): Promise<{ bound: number | null; reason?: string }> => {
      if (!(await tryChars(lo, withPhoto)).accepted) return { bound: null, reason: `even ${lo} characters were not accepted` };
      while (hi - lo > STOP_WHEN_WITHIN_CHARS) {
        if (Date.now() - started > TIME_BUDGET_MS) return { bound: lo, reason: "stopped at the time budget before the search closed" };
        const mid = Math.round((lo + hi) / 2);
        if ((await tryChars(mid, withPhoto)).accepted) lo = mid;
        else hi = mid;
      }
      return { bound: lo };
    };

    // Expect roughly 4 characters a token: 9216 tokens is about 37000 characters.
    const first = await tryChars(60_000, false);
    if (first.accepted) {
      writeResult("device-token-limit", { status: "fail", reason: "60000 characters were accepted; the search range is too small", probes }, s.browser);
      throw new Error("range too small");
    }
    const noPhoto = await search(false, 2_000, 60_000);
    const withPhoto = noPhoto.bound === null ? { bound: null, reason: "no search without a photo" } : await search(true, 1_000, Math.max(noPhoto.bound + 4_000, 8_000));
    const requests = summariseRequests(s.recorder.requests, s.origin).outside.filter((x) => x.served !== "local file");

    if (noPhoto.bound === null) {
      writeResult("device-token-limit", { status: "fail", reason: noPhoto.reason ?? "no bound found", probes }, s.browser);
      expect(noPhoto.bound).not.toBeNull();
      return;
    }
    const fixed = SCHEMA_CHARS + SYSTEM_PROMPT.length;
    // The guard counts note + schema + system prompt. The task sentence is not counted by the guard, so it is taken off the bound.
    const bound = noPhoto.bound + fixed - TASK_TEXT.length;
    const photoBound = withPhoto.bound === null ? null : withPhoto.bound + fixed - TASK_TEXT.length;
    const photoAmount = photoBound === null ? null : Math.max(0, bound - photoBound);
    const closed = !noPhoto.reason && !withPhoto.reason;
    writeResult(
      "device-token-limit",
      photoAmount === null
        ? { status: "fail", reason: `No bound with a photo: ${withPhoto.reason ?? "unknown"}`, noteCharsWithoutPhoto: noPhoto.bound, probes }
        : {
            status: "pass",
            unit: "characters",
            bound,
            photoAmount,
            noteCharsWithoutPhoto: noPhoto.bound,
            noteCharsWithPhoto: withPhoto.bound,
            schemaChars: SCHEMA_CHARS,
            systemPromptChars: SYSTEM_PROMPT.length,
            taskSentenceChars: TASK_TEXT.length,
            contextWindowDocumented: DEVICE_TOKEN_LIMIT,
            searchClosedWithin: STOP_WHEN_WITHIN_CHARS,
            searchClosed: closed,
            photo: "one invented picture of printed text, 900 by 260 pixels, PNG; handwriting and larger photos are not measured",
            text: "the invented visit repeated; another kind of text may use more or fewer tokens per character",
            how: "bisection on note length through the Firebase SDK, ONLY_ON_DEVICE, with the structure job's own system prompt, schema and task sentence",
            requestsOutsideThePage: requests.length,
            probes,
          },
      s.browser,
    );
    expect(photoAmount).not.toBeNull();
    expect(requests).toEqual([]);
  } finally {
    await s.close();
  }
});
