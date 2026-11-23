// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { button } from "../../src/app/parts/button";
import { sourceLabel } from "../../src/app/parts/sourceLabel";

describe("button", () => {
  it("draws primary and secondary buttons with their kind", () => {
    const p = button("Make the record", "primary");
    const s = button("Try an invented visit", "secondary");
    expect(p.className).toBe("btn primary");
    expect(s.className).toBe("btn secondary");
    expect(p.type).toBe("button");
    expect(p.textContent).toBe("Make the record");
  });
  it("carries a reason when disabled", () => {
    const b = button("Send", "primary", { disabled: true, reason: "Not available while you are offline." });
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("Not available while you are offline.");
  });
});

describe("source label", () => {
  it("shows 'on this device' with a laptop outline for ON_DEVICE", () => {
    const l = sourceLabel("ON_DEVICE", true);
    expect(l.classList.contains("device")).toBe(true);
    expect(l.textContent).toBe("on this device");
    expect(l.querySelector('[data-icon="laptop"]')).not.toBeNull();
  });
  it("shows 'in the cloud' with a cloud outline for IN_CLOUD", () => {
    const l = sourceLabel("IN_CLOUD", true);
    expect(l.classList.contains("cloud")).toBe(true);
    expect(l.textContent).toBe("in the cloud");
    expect(l.querySelector('[data-icon="cloud"]')).not.toBeNull();
  });
  it("the two variants differ in icon, text and shape class", () => {
    const a = sourceLabel("ON_DEVICE", true);
    const b = sourceLabel("IN_CLOUD", true);
    expect(a.textContent).not.toBe(b.textContent);
    expect(a.className).not.toBe(b.className);
    expect(a.innerHTML).not.toBe(b.innerHTML);
  });
  it("adds 'not connected' for a double result", () => {
    const l = sourceLabel("IN_CLOUD", false);
    expect(l.textContent).toContain("in the cloud");
    expect(l.textContent).toContain("off");
    expect(l.querySelector('[data-source="not-connected"]')).not.toBeNull();
    expect(sourceLabel("IN_CLOUD", true).textContent).not.toContain("off");
  });
});
