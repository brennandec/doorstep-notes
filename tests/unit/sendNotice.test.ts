// @vitest-environment happy-dom
// Drafting task 1 (R3): the notice shown wherever something is about to be sent.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CLOUD_TIER, CONSTANT_SOURCES, NOTICE_RETENTION_DAYS } from "../../src/constants";
import { NO_COST_NOTICE, noticeFor, PAID_NOTICE, sendNotice, NOT_CONNECTED_NOTICE } from "../../src/app/sendNotice";
import { emptyState } from "../../src/app/state";

describe("the no-cost tier notice (Rule 10, R3.1)", () => {
  it("says the three points in plain words", () => {
    expect(NO_COST_NOTICE).toContain("may be used by the provider to improve its products");
    expect(NO_COST_NOTICE).toContain("may be read by reviewers");
    expect(NO_COST_NOTICE).toMatch(/provider says not to send sensitive or personal information/);
    expect(NO_COST_NOTICE).toMatch(/invented people only/);
  });

  it("is marked in the file for the product owner to check", () => {
    const source = readFileSync("src/app/sendNotice.ts", "utf8");
    expect(source).toMatch(/TO BE CONFIRMED by the product\s+\/\/ owner/);
    expect(source).toMatch(/OPEN-QUESTIONS 1/);
  });

  it("is the only place that holds the notice text", () => {
    const strings = readFileSync("src/app/strings.ts", "utf8");
    expect(strings).not.toContain("improve its products");
    const leaves = readFileSync("src/app/zones/leaves.ts", "utf8");
    expect(leaves).not.toContain("improve its products");
  });

  it("adds the retention point from a constant, not from digits in the text", () => {
    const text = noticeFor(true, "no-cost");
    expect(text).toContain(`${NOTICE_RETENTION_DAYS} days`);
    expect(text).toMatch(/keeps what is sent and what it answers/);
    expect(readFileSync("src/app/sendNotice.ts", "utf8")).not.toMatch(/\b55\b/);
    expect(CONSTANT_SOURCES.NOTICE_RETENTION_DAYS).toMatch(/\S/);
  });
});

describe("noticeFor (R3.2)", () => {
  it("says the cloud is off, and that nothing is sent, while the cloud flag is off", () => {
    const text = noticeFor(false, "no-cost");
    expect(text).toBe(NOT_CONNECTED_NOTICE);
    expect(text).toMatch(/is off/i);
    expect(text).toMatch(/nothing is sent/i);
    expect(text).toMatch(/invented people only/i);
  });

  it("states the tier from CLOUD_TIER when the cloud flag is on", () => {
    expect(noticeFor(true, "no-cost")).toContain(NO_COST_NOTICE);
    expect(noticeFor(true, "paid")).toBe(PAID_NOTICE);
    expect(noticeFor(true, "paid")).not.toContain("improve its products and may be read");
    expect(sendNotice("no-cost")).toBe(NO_COST_NOTICE);
    expect(sendNotice("paid")).toBe(PAID_NOTICE);
  });

  it("is paid in the code, from the decision file, with no number of days", () => {
    expect(CLOUD_TIER).toBe("paid");
    expect(CONSTANT_SOURCES.CLOUD_TIER).toContain("docs/decisions/2026-11-14-cloud-tier.md");
    expect(PAID_NOTICE).toMatch(/paid tier of the Gemini Developer API, through Firebase AI Logic/);
    expect(PAID_NOTICE).toMatch(/does not use prompts or responses on the paid tier to improve its products/);
    expect(PAID_NOTICE).toMatch(/limited period to detect misuse/);
    expect(PAID_NOTICE).not.toMatch(/\d/);
    expect(noticeFor(true, "paid")).not.toMatch(/\bdays\b/);
  });
});

describe("Send is disabled until the notice is on screen (R3.4)", () => {
  const withText = () =>
    emptyState({ outgoingText: "Visit date: 2026-11-12", network: "online", cloud: true, tier: "no-cost" });

  it("shows the notice of the tier the page runs on beside Send", async () => {
    const { renderLeavesZone } = await import("../../src/app/zones/leaves");
    const zone = renderLeavesZone(emptyState({ outgoingText: "Visit date: 2026-11-12", network: "online", cloud: true, tier: CLOUD_TIER }));
    expect(zone.querySelector("[data-send-notice]")?.textContent).toContain("paid tier of the Gemini Developer API");
  });

  it("is enabled when the notice is shown and there is text", async () => {
    const { renderLeavesZone } = await import("../../src/app/zones/leaves");
    const zone = renderLeavesZone(withText());
    expect(zone.querySelector("[data-send-notice]")?.textContent).toContain("no-cost tier");
    expect((zone.querySelector("#send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("is disabled when the notice is absent", async () => {
    vi.resetModules();
    vi.doMock("../../src/app/sendNotice", async (original) => ({
      ...(await original<typeof import("../../src/app/sendNotice")>()),
      noticeFor: () => "",
    }));
    const { renderLeavesZone } = await import("../../src/app/zones/leaves");
    const zone = renderLeavesZone(withText());
    expect(zone.querySelector("[data-send-notice]")).toBeNull();
    expect((zone.querySelector("#send") as HTMLButtonElement).disabled).toBe(true);
    vi.doUnmock("../../src/app/sendNotice");
    vi.resetModules();
  });
});
