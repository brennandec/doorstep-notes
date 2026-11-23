// @vitest-environment happy-dom
// Exact visible wording. The string table and the painted text are both pinned.
// A move of the table, or a render that no longer paints it, fails these.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { measureRoot } from "../../src/app/measureScreen";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type Handlers } from "../../src/app/state";
import { fill, strings } from "../../src/app/strings";

const handlers = (): Handlers => ({
  onNoteInput: vi.fn(),
  onListInput: vi.fn(),
  onTryExample: vi.fn(),
  onRemoveExample: vi.fn(),
  onGetModel: vi.fn(),
  onMakeRecord: vi.fn(),
  onStartVisit: vi.fn(),
});

function mount(state = emptyState()) {
  const root = document.createElement("div");
  root.append(...renderScreen(state, handlers()));
  return root;
}

describe("exact first-screen wording", () => {
  it("pins the table and the painted controls to the same literals", () => {
    expect(strings.firstRun.sentence).toBe("Listed names stay on this device.");
    expect(strings.firstRun.tryExample).toBe("Try an invented visit");
    expect(strings.firstRun.startVisit).toBe("Start a visit");
    expect(strings.firstRun.nothingLeft).toBe("Nothing has left.");
    expect(strings.firstRun.requestsBefore).toBe("Requests before send: {n}.");
    expect(strings.firstRun.destination).toBe("Destination: the cloud.");
    expect(strings.firstRun.stepNote).toBe("You write the visit here.");
    expect(strings.firstRun.stepRecord).toBe("Listed names become a record on this device.");
    expect(strings.firstRun.stepMasks).toBe("A tag stands in for a listed name.");
    expect(strings.firstRun.stepSend).toBe("The check runs before a send.");
    expect(strings.firstRun.stepFinished).toBe("Names come back on this device.");
    expect(strings.xray.open).toBe("X-ray");
    expect(strings.xray.requests).toBe("Requests");
    expect(strings.xray.preflights).toBe("Preflights");
    expect(strings.about.title).toBe("How it was built and measured");

    const root = mount();
    expect(root.querySelector("h1.first-sentence")?.textContent).toBe("Listed names stay on this device.");
    expect(root.querySelector("#try-example")?.textContent).toBe("Try an invented visit");
    expect(root.querySelector("#start-visit")?.textContent).toBe("Start a visit");
    expect(root.textContent).toContain("You write the visit here.");
    expect(root.textContent).toContain("Listed names become a record on this device.");
    expect(root.textContent).toContain("A tag stands in for a listed name.");
    expect(root.textContent).toContain("The check runs before a send.");
    expect(root.textContent).toContain("Names come back on this device.");
    expect(root.textContent).toContain("Requests before send: 0.");
    expect(root.textContent).toContain("Nothing has left.");
    expect(root.textContent).toContain("Destination: the cloud.");
    const measured = measureRoot(root);
    expect(measured.words).toBeLessThanOrEqual(120);
    expect(measured.words).toBeGreaterThan(0);
    expect(measured.controls).toBe(3);
    expect(root.querySelector("main [data-notices] a")?.textContent).toBe(strings.notices.link);
    expect(measured.text).not.toMatch(/egress/i);
  });
});

describe("exact masks wording", () => {
  it("pins the exact-text control to the byte template", () => {
    expect(strings.firstRun.showExact).toBe("Show the exact text sent ({n} bytes)");
    expect(strings.firstRun.hideExact).toBe("Hide the exact text");
    expect(strings.firstRun.maskClue).toBe("Mask this clue");
    const root = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      noteText: inventedVisit.note,
      clientList: inventedVisit.clientList,
      record: structuredClone(inventedVisit.preparedRecord),
    }));
    const bytes = new TextEncoder().encode(root.querySelector("#exact-text")?.textContent ?? "").length;
    expect(root.querySelector("#show-exact")?.textContent).toBe(`Show the exact text sent (${bytes} bytes)`);
    expect(root.querySelector("#show-exact")?.textContent).toBe(fill(strings.firstRun.showExact, { n: bytes }));
    const measured = measureRoot(root);
    expect(measured.words).toBeLessThanOrEqual(350);
    expect(measured.controls).toBeLessThanOrEqual(30);
    expect(measured.text).not.toMatch(/egress/i);
  });
});
