// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderStatusBar, statesOf, type StatusInput } from "../../src/app/statusBar";

const base: StatusInput = { network: "online", device: { state: "unavailable" }, cloud: false };
const words = (i: StatusInput) => Object.fromEntries(statesOf(i).map((s) => [s.key, s.words]));

describe("status bar", () => {
  it("shows the name and the tagline on the left", () => {
    const bar = renderStatusBar(base);
    expect(bar.querySelector(".name")?.textContent).toBe("Doorstep Notes");
    expect(bar.querySelector(".tagline")?.textContent).toBe("A writing aid with an egress check.");
  });

  it("has three states, each with an icon and words", () => {
    const bar = renderStatusBar(base);
    const items = [...bar.querySelectorAll("li.state")];
    expect(items.map((i) => i.getAttribute("data-state"))).toEqual(["network", "device", "cloud"]);
    for (const item of items) {
      expect(item.querySelector("svg")).not.toBeNull();
      expect((item.querySelector(".state-words")?.textContent ?? "").length).toBeGreaterThan(0);
    }
  });

  it("uses the exact words", () => {
    expect(words({ network: "online", device: { state: "available" }, cloud: true })).toEqual({ network: "online", device: "ready", cloud: "connected" });
    expect(words({ network: "offline", device: { state: "downloading", percent: 41.6 }, cloud: false })).toEqual({
      network: "offline", device: "downloading, 42%", cloud: "off",
    });
    expect(words(base).device).toBe("not on this computer");
    expect(words({ ...base, device: { state: "downloadable" } }).device).toBe("can be downloaded");
  });

  it("shows the four device states in words, and downloading with the integer percent (H35a D3)", () => {
    expect(words({ ...base, device: { state: "unavailable" } }).device).toBe("not on this computer");
    expect(words({ ...base, device: { state: "downloadable" } }).device).toBe("can be downloaded");
    expect(words({ ...base, device: { state: "downloading", percent: 37.4 } }).device).toBe("downloading, 37%");
    expect(words({ ...base, device: { state: "available" } }).device).toBe("ready");
    expect(words({ ...base, device: { state: "unavailable", starting: true } }).device).toBe("starting");
    expect(words({ ...base, device: { state: "downloadable", starting: true } }).device).toBe("starting");
    expect(words({ ...base, device: { state: "downloading", starting: true, percent: 37.4 } }).device).toBe("downloading, 37%");
    expect(words({ ...base, device: { state: "downloadable", didNotStart: true } }).device).toBe("did not start");
  });

  it("changes device and cloud independently, for every combination of the two switches", () => {
    const deviceStates = ["unavailable", "downloadable", "downloading", "available"] as const;
    for (const state of deviceStates) {
      const off = words({ ...base, device: { state }, cloud: false });
      const on = words({ ...base, device: { state }, cloud: true });
      expect(off.device).toBe(on.device);
      expect(off.cloud).not.toBe(on.cloud);
    }
    for (const cloud of [false, true]) {
      const a = words({ ...base, device: { state: "unavailable" }, cloud });
      const b = words({ ...base, device: { state: "available" }, cloud });
      expect(a.cloud).toBe(b.cloud);
      expect(a.device).not.toBe(b.device);
    }
  });

  it("changes the network without touching the other two", () => {
    const a = words({ ...base, network: "online" });
    const b = words({ ...base, network: "offline" });
    expect(a.network).not.toBe(b.network);
    expect(a.device).toBe(b.device);
    expect(a.cloud).toBe(b.cloud);
  });

  it("never tells two values apart by colour alone: words differ and no colour class is used", () => {
    const values = [
      statesOf({ ...base, network: "online" })[0]!, statesOf({ ...base, network: "offline" })[0]!,
      statesOf({ ...base, cloud: false })[2]!, statesOf({ ...base, cloud: true })[2]!,
    ];
    expect(new Set([values[0]!.words, values[1]!.words]).size).toBe(2);
    expect(new Set([values[2]!.words, values[3]!.words]).size).toBe(2);
    const bar = renderStatusBar({ ...base, network: "offline" });
    expect(bar.querySelector("[style]")).toBeNull();
    for (const node of bar.querySelectorAll("[class]")) expect(node.getAttribute("class")).not.toMatch(/color|red|green|fail/i);
  });
});
