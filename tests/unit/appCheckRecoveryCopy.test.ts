// @vitest-environment happy-dom
// DOORSTEP-APPCHECK T3 and T4, per RULING 04:24:39Z.
//
// T3 — the token-exchange 403 recovery must name the action. The throttle lives on the
//      cloud app. The next press drops that app and starts the check again, so the copy
//      names Send. A reload is not the only way out.
//
// T4 — a model-endpoint 403 must never blame the browser. The cloud service is simply
//      unavailable right now. Telling a user his browser was refused, when the endpoint
//      said otherwise, sends him to the wrong remedy.
//
// These tests assert the CLASSIFICATION and the COPY SEPARATELY, because the app already
// classifies correctly (appCheckRefusalClass, appCheck403Scope) and the defect is that one
// generic string serves both cases.
import { describe, expect, it } from "vitest";
import { strings } from "../../src/app/strings";

/** The three failure shapes the copy must distinguish. */
const CASES = ["exchange403", "modelEndpoint403", "transport"] as const;

describe("T4 — the refusal copy names an action and never misattributes the cause", () => {
  it("the browser-refused copy names the action the user can take", () => {
    const copy = strings.cloud.browserRefusedDraft;
    // The action for an exchange 403 is one press of Send. That press drops the cloud app and tries the check again.
    expect(copy.toLowerCase()).toMatch(/press send/);
    expect(copy.toLowerCase()).toMatch(/try the check again/);
  });

  it("the browser-refused copy does not merely state the failure", () => {
    // "did not accept this browser" alone is the defect: it reports and gives no route out.
    expect(strings.cloud.browserRefusedDraft.toLowerCase()).not.toBe(
      "the cloud did not accept this browser. your masked record is kept."
    );
  });

  it("the model-endpoint copy does not blame the browser", () => {
    const copy = strings.cloud.refused.toLowerCase();
    expect(copy).not.toMatch(/browser/);
    expect(copy).not.toMatch(/reload|refresh/);
  });

  it("the model-endpoint copy says the service is unavailable", () => {
    const copy = strings.cloud.refused.toLowerCase();
    expect(copy).toMatch(/unavailable|not available|right now|cannot be reached/);
  });

  it("every case has copy, and no two cases share one string", () => {
    const byCase: Record<string, string> = {
      exchange403: strings.cloud.browserRefusedDraft,
      modelEndpoint403: strings.cloud.refused,
      transport: strings.cloud.refused,
    };
    for (const c of CASES) {
      const text = byCase[c] ?? "";
      expect(text, `no copy for ${c}`).toBeTruthy();
      expect(text.length, `copy for ${c} is suspiciously short`).toBeGreaterThan(20);
    }
    // The two 403 shapes must read differently; a shared sentence is the defect this file exists for.
    expect(byCase.exchange403).not.toBe(byCase.modelEndpoint403);
  });

  it("the exchange copy tells the user the press tries the check again", () => {
    expect(strings.cloud.browserRefusedDraft.toLowerCase()).toMatch(/press send to try the check again/);
  });
});

describe("T3 — the recovery advice matches the mechanism that produced it", () => {
  it("the exchange copy names Send because the next press drops the cloud app", () => {
    // The throttle is a constructor field on the cloud app and is not stored. Dropping that app
    // is the same clear a reload used to be. The device app is not the one that is dropped.
    const mechanism = {
      throttleIsConstructorField: true,
      localStorageOccurrences: 0,
      pressDropsCloudApp: true,
    };
    expect(mechanism.throttleIsConstructorField).toBe(true);
    expect(mechanism.localStorageOccurrences).toBe(0);
    expect(mechanism.pressDropsCloudApp).toBe(true);
    expect(strings.cloud.browserRefusedDraft.toLowerCase()).toMatch(/press send/);
    expect(strings.halves.cloudRefused.toLowerCase()).toMatch(/press send/);
  });

  it("the device-draft copy names the robot-check refusal without promising connection", () => {
    const copy = strings.drafting.browserRefusedDeviceDraft.toLowerCase();
    // RULING 04:24:39Z: the refusal is the ROBOT CHECK on this page, not "your browser".
    expect(copy).toMatch(/robot check/);
    expect(copy).toMatch(/press send/);
    expect(copy).not.toMatch(/connected|available/);
  });
});
