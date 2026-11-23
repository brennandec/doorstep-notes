// @vitest-environment happy-dom
// WO-11 label test: the size beside Get the device model, and the still of a real device run.
import { describe, expect, it, vi } from "vitest";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type AppState, type Handlers } from "../../src/app/state";
import { DEVICE_MODEL_SIZE_GB } from "../../src/constants";
import { fill, strings } from "../../src/app/strings";
import { deviceRunStill, deviceStillCaption } from "../../src/app/deviceStill";

function handlers(): Handlers {
  return {
    onNoteInput: vi.fn(), onListInput: vi.fn(), onTryExample: vi.fn(), onRemoveExample: vi.fn(),
    onGetModel: vi.fn(), onMakeRecord: vi.fn(),
  };
}

function mount(state: AppState): HTMLElement {
  const root = document.createElement("div");
  root.append(...renderScreen(state, handlers()));
  return root;
}

/** The note zone, where Get the device model and the still live. Cold first does not paint them. */
function visit(device: AppState["device"]): AppState {
  return emptyState({ started: true, device });
}

describe("the label test", () => {
  it("shows the size beside Get the device model and keeps it out of the progress slot", () => {
    const ready = mount(visit({ state: "downloadable" }));
    expect(ready.querySelector("#get-model")?.textContent).toContain(strings.firstRun.getModel);
    expect(ready.querySelector("[data-model-size]")?.textContent).toBe(fill(strings.firstRun.modelSize, { size: DEVICE_MODEL_SIZE_GB }));
    expect(ready.querySelector("[data-model-size]")?.textContent).toBe("about 4.0 GB");
    expect(ready.querySelector("[data-model-line]")?.textContent).not.toMatch(/\d|chrome|flag|GB/i);

    const downloading = mount(visit({ state: "downloading", percent: 37 }));
    expect(downloading.querySelector("#get-model")).toBeNull();
    expect(downloading.querySelector("[data-model-size]")).toBeNull();
    expect(downloading.querySelector("[data-model-download]")?.textContent).not.toContain("GB");
    expect(downloading.querySelector("progress.model-bar")?.getAttribute("aria-label")).toBe("downloading, 37%");
    expect(downloading.querySelector("[data-device-still]")).toBeNull();
  });

  it("labels the still of a real device run with the date, Chrome version and run file", () => {
    const root = mount(visit({ state: "unavailable" }));
    const label = root.querySelector("[data-still-label]");
    const caption = deviceStillCaption();
    expect(label?.textContent).toBe(caption);
    expect(label?.textContent).toContain(deviceRunStill.date);
    expect(label?.textContent).toContain(deviceRunStill.browser);
    expect(label?.textContent).toContain(deviceRunStill.runFile);
    expect(root.querySelector("[data-still-picture]")?.getAttribute("data-still-picture")).toBe(deviceRunStill.picture);
    expect(root.querySelector("[data-model-line]")?.contains(label ?? document.body)).toBe(false);
    expect(root.querySelector("[data-model-line]")?.textContent).not.toMatch(/\d|chrome|flag|GB/i);
    expect(root.querySelector("[data-device-still] img")?.getAttribute("alt")).toBe(caption);
  });
});
