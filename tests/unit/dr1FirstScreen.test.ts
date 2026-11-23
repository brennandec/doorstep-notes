// @vitest-environment happy-dom
// D-R1: stranger first paint. No button. Two device states a stranger actually gets.
import { describe, expect, it, vi } from "vitest";
import { bundledResults } from "../../src/app/figures";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";

const handlers = (): Handlers => ({
  onNoteInput: vi.fn(),
  onListInput: vi.fn(),
  onTryExample: vi.fn(),
  onRemoveExample: vi.fn(),
  onGetModel: vi.fn(),
  onMakeRecord: vi.fn(),
  onStartByHand: vi.fn(),
});

/** Painted text a stranger's innerText reads: a closed fold's body is not painted. */
function painted(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  for (const d of clone.querySelectorAll("details")) {
    if (!(d as HTMLDetailsElement).open) {
      for (const child of [...d.children]) if (child.tagName !== "SUMMARY") child.remove();
    }
  }
  return (clone.textContent ?? "").replace(/\s+/g, " ");
}

function mount(device: { state: "unavailable" | "downloadable"; starting?: boolean }) {
  const root = document.createElement("div");
  root.append(
    ...renderScreen(
      emptyState({ cloud: true, tier: "paid", results: bundledResults, network: "online", device }),
      handlers(),
    ),
  );
  return root;
}

const FIVE = ["Note", "Record", "Masks", "Send", "Finished"] as const;

describe("D-R1 stranger first paint", () => {
  for (const device of [
    { state: "unavailable" as const, starting: true },
    { state: "downloadable" as const },
  ]) {
    it(`hides lab notes on the cold screen when the device is ${device.state}${device.starting ? " starting" : ""}`, () => {
      const text = painted(mount(device));
      expect(text.split("author's computer")).toHaveLength(1);
      expect(text.split("results/")).toHaveLength(1);
      expect(text).not.toMatch(/egress/i);
      expect(text).toContain(strings.firstRun.sentence);
      expect(text).toContain(strings.firstRun.tryExample);
      expect(text).toContain(strings.firstRun.startVisit);
      for (const step of FIVE) expect(text).toContain(step);
    });
    it(`keeps the audience and the job on the started visit when the device is ${device.state}${device.starting ? " starting" : ""}`, () => {
      const root = document.createElement("div");
      root.append(
        ...renderScreen(
          emptyState({ started: true, cloud: true, tier: "paid", results: bundledResults, network: "online", device }),
          handlers(),
        ),
      );
      const text = painted(root);
      expect(text.split("author's computer")).toHaveLength(1);
      expect(text.split("results/")).toHaveLength(1);
      expect(text).toContain("home-visit caseworkers");
      expect(text).toContain("A note stays on this device.");
      expect(text).toContain("A masked copy is what can leave.");
      expect(text).toContain("The egress check stops a send.");
      for (const step of FIVE) expect(text).toContain(step);
    });
  }
});
