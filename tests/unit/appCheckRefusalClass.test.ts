// @vitest-environment happy-dom
// DOORSTEP-APPCHECK. The refusal a user actually met in release 18, classified correctly.
//
// THE POINT OF THIS FILE. The plate's premise was a robot-check refusal, and the one
// recorded refusal in this repository is not that: results/cloud-probe-2026-11-13.json holds
// "[403 Forbidden] The Gemini API free tier is not available for this project". A model-endpoint
// 403 and an App Check token 403 are different failures that need different recovery advice, and
// the app must never tell a user "your browser was refused" when the truth is "the project has
// no billing". These tests pin the classification that decides which sentence the user sees.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isBrowserRefusal, isCloudRefusal } from "../../src/inference/refusal";

/** The refusal recorded on 2026-11-13, read from the artefact rather than retyped. */
function recordedBillingRefusal(): Error {
  const text = JSON.stringify(JSON.parse(readFileSync("results/cloud-probe-2026-11-13.json", "utf8")) as unknown);
  const hit = text.match(/AI: Error fetching from [^"]*free tier is not available[^"]*/);
  if (hit === null) throw new Error("the recorded billing refusal is not in results/cloud-probe-2026-11-13.json");
  return new Error(JSON.parse(`"${hit[0]}"`) as string);
}

/** What a refused App Check token exchange looks like: the SDK's own code on the error. */
function appCheckStatusError(): Error {
  return Object.assign(new Error("AppCheck: fetch-status-error (403)"), { code: "appCheck/fetch-status-error" });
}

describe("a model-endpoint 403 is a cloud refusal, not a browser refusal", () => {
  it("recognises the recorded billing refusal as a cloud refusal", () => {
    expect(isCloudRefusal(recordedBillingRefusal())).toBe(true);
  });

  it("does NOT blame the browser for the recorded billing refusal", () => {
    // The recovery advice differs: "set up billing" is the owner's act, "reload the page" is the
    // user's. Telling a judge to reload when the project has no billing wastes his visit.
    expect(isBrowserRefusal(recordedBillingRefusal())).toBe(false);
  });

  it("the recorded message carries no App Check marker at all", () => {
    const e = recordedBillingRefusal();
    expect(/AppCheck/i.test(e.message)).toBe(false);
    expect((e as unknown as { code?: string }).code).toBeUndefined();
  });

  it("still recognises a real App Check token refusal as a browser refusal", () => {
    // The distinction only earns its keep if the other side of it is also pinned.
    expect(isBrowserRefusal(appCheckStatusError())).toBe(true);
    expect(isCloudRefusal(appCheckStatusError())).toBe(true);
  });
});

describe("the two refuse for different reasons and must be told apart", () => {
  it("a 403 with no App Check marker is not a browser refusal, whatever its status", () => {
    const modelEndpoint403 = Object.assign(new Error("AI: [403 Forbidden] quota exceeded"), {
      customErrorData: { status: 403 },
    });
    expect(isCloudRefusal(modelEndpoint403)).toBe(true);
    expect(isBrowserRefusal(modelEndpoint403)).toBe(false);
  });

  it("a transport failure is neither", () => {
    const offline = new Error("Failed to fetch");
    expect(isCloudRefusal(offline)).toBe(false);
    expect(isBrowserRefusal(offline)).toBe(false);
  });
});
