// DEVICE MODEL. capture-and-record task 8. Structured-output syntax check.
// One prompt with a two-field schema, ONLY_ON_DEVICE, through the Firebase SDK in Google Chrome.
// Writes results/device-structured-output.json: the option names used, whether the reply
// parsed, whether its keys are exactly the schema's, the source the SDK reported, the date
// and the browser; or a miss with its reason.
import { expect, test } from "@playwright/test";
import { openDevice, summariseRequests, writeResult } from "../fixtures/deviceModel";
import { SDK_PAGE_PATH, generate, recordAbsent, sdkPageFiles, waitForSdkPage } from "./support";

const SCHEMA = {
  type: "object",
  properties: { visitDay: { type: "string" }, peoplePresent: { type: "integer" } },
  required: ["visitDay", "peoplePresent"],
  additionalProperties: false,
} as const;

const OPTION_NAMES = {
  mode: "InferenceMode.ONLY_ON_DEVICE",
  schema: "onDeviceParams.promptOptions.responseConstraint",
  systemPrompt: "onDeviceParams.createOptions.initialPrompts",
} as const;

test("Structured output: a JSON Schema in onDeviceParams.promptOptions.responseConstraint gives JSON with the schema's keys", async () => {
  test.setTimeout(240_000);
  const sdk = sdkPageFiles();
  const out = await openDevice({ url: SDK_PAGE_PATH, files: sdk.files, local: sdk.local });
  if (!out.ok) {
    recordAbsent("device-structured-output", out, "miss", { optionNames: OPTION_NAMES });
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  try {
    await waitForSdkPage(s.page);
    const r = await generate(s.page, {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [{ role: "system", content: [{ type: "text", value: "You reply with one JSON object and nothing else." }] }],
      },
      promptOptions: { responseConstraint: SCHEMA },
      parts: ["Tuesday's visit had three people present: the worker, one client and her sister. Give the day and how many people were present."],
    });
    let parsed: unknown = null;
    let parses = false;
    if (r.ok) {
      try {
        parsed = JSON.parse(r.text);
        parses = true;
      } catch {
        parses = false;
      }
    }
    const keys = parses && parsed !== null && typeof parsed === "object" ? Object.keys(parsed as object).sort() : null;
    const keysMatch = keys !== null && JSON.stringify(keys) === JSON.stringify(Object.keys(SCHEMA.properties).sort());
    const requests = summariseRequests(s.recorder.requests, s.origin);
    const sdkRequests = requests.outside.filter((x) => x.served !== "local file");
    const passed = r.ok && parses && keysMatch && r.source === "on_device" && sdkRequests.length === 0;
    writeResult(
      "device-structured-output",
      passed
        ? {
            status: "pass",
            optionNames: OPTION_NAMES,
            replyParsed: true,
            keysExactlyTheSchemas: true,
            keys,
            sourceReported: r.ok ? r.source : null,
            seconds: r.ok ? Math.round(r.ms / 100) / 10 : null,
            sdkVersion: "firebase 13.0.0",
            requestsOutsideThePage: sdkRequests.length,
            replyText: r.ok ? r.text.slice(0, 200) : null,
          }
        : {
            status: "fail",
            reason: r.ok
              ? `Reply parsed: ${parses}. Keys exactly the schema's: ${keysMatch}. Source reported: ${r.source}. Requests outside the page: ${sdkRequests.length}.`
              : `The call failed: ${r.name}: ${r.message}`,
            optionNames: OPTION_NAMES,
            replyParsed: parses,
            replyText: r.ok ? r.text.slice(0, 200) : null,
          },
      s.browser,
    );
    expect(passed).toBe(true);
  } finally {
    await s.close();
  }
});
