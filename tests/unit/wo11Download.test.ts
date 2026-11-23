// @vitest-environment happy-dom
// WO-11: a fake LanguageModel. Progress comes from downloadprogress. The press returns at 120 s.
// The download promise is kept, and the device jobs switch on at available with no reload.
import { afterEach, describe, expect, it, vi } from "vitest";

let initialize: (onProgress: (fraction: number) => void) => Promise<void> = async () => {};
vi.mock("../../src/firebase/deviceApp", () => ({
  deviceOnlyService: async () => ({
    ai: {
      getGenerativeModel: () => ({ initializeDeviceModel: (p: (fraction: number) => void) => initialize(p) }),
      InferenceMode: { ONLY_ON_DEVICE: "only_on_device" },
    },
    service: {},
  }),
}));

import { DEVICE_INITIALIZE_TIMEOUT_MS } from "../../src/constants";
import { initializeDeviceModelFromPress } from "../../src/firebase/deviceInit";
import { installDownloadProgressWatch } from "../../src/inference/downloadProgress";
import { makeDeviceModel, type LanguageModelLike } from "../../src/inference/deviceModel";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { proposeMasksDouble } from "../../src/inference/proposeMasks/proposeMasks.double";
import { strings } from "../../src/app/strings";

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { LanguageModel?: unknown }).LanguageModel;
});

describe("WO-11 fake LanguageModel", () => {
  it("renders downloadprogress, returns the press at 120 s, and switches the device jobs on with no reload", async () => {
    vi.useFakeTimers();
    let availability = "downloadable";
    let creates = 0;
    let finishDownload: () => void = () => {};
    const monitors: EventTarget[] = [];
    const session = { prompt: async () => '{"ok":true}', destroy() {} };
    const languageModel: LanguageModelLike = {
      availability: async () => availability,
      create: async (options?: unknown) => {
        creates += 1;
        if (creates === 1) {
          const record = options !== null && typeof options === "object" ? (options as { monitor?: (m: EventTarget) => void }) : {};
          const target = new EventTarget();
          record.monitor?.(target);
          monitors.push(target);
          return new Promise((resolve) => {
            finishDownload = () => resolve(session);
          });
        }
        return session;
      },
    };
    installDownloadProgressWatch(languageModel);
    (globalThis as { LanguageModel?: LanguageModelLike }).LanguageModel = languageModel;
    initialize = async () => {
      await languageModel.create?.({});
    };

    const reloads = { n: 0 };
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {
      reloads.n += 1;
    });

    const root = document.createElement("div");
    document.body.replaceChildren(root);
    let asked = 0;
    const device = makeDeviceModel({
      languageModel,
      initializeDeviceModel: initializeDeviceModelFromPress,
    });
    const c = makeController({
      root,
      aiServiceEnabled: false,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      device,
      proposeMasks: () => {
        asked += 1;
        return proposeMasksDouble;
      },
    } as ControllerDeps);

    await c.start();
    c.handlers.onGetModel();
    await vi.advanceTimersByTimeAsync(0);
    expect(monitors).toHaveLength(1);

    const event = new Event("downloadprogress") as Event & { loaded: number };
    event.loaded = 0.37;
    monitors[0]!.dispatchEvent(event);

    const bar = root.querySelector("progress.model-bar");
    expect(bar?.getAttribute("value")).toBe("37");
    expect(bar?.getAttribute("max")).toBe("100");
    expect(bar?.getAttribute("aria-label")).toBe("downloading, 37%");
    expect(root.querySelector("[data-model-download]")?.textContent).not.toContain("GB");
    expect(root.querySelector('[data-state="device"] .state-words')?.textContent).toBe("downloading, 37%");

    await vi.advanceTimersByTimeAsync(DEVICE_INITIALIZE_TIMEOUT_MS);
    expect(c.state().device.starting).not.toBe(true);
    expect(c.state().device.state).toBe("downloading");
    expect(c.state().device.didNotStart).not.toBe(true);
    expect(c.state().error).toBeNull();
    expect(root.querySelector('[data-state="device"] .state-words')?.textContent).toBe("downloading, 37%");
    expect(asked).toBe(0);

    c.handlers.onTryExample();
    c.handlers.onStartByHand!();
    c.handlers.onMask!();
    expect(c.state().mask).not.toBeNull();
    expect(c.state().mask?.line).toBe(strings.masking.deviceDownloading.replace("{percent}", "37"));
    expect(asked).toBe(0);

    availability = "available";
    finishDownload();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(0);

    expect(c.state().device.state).toBe("available");
    expect(asked).toBe(1);
    expect(c.state().mask?.proposals).not.toBeNull();
    expect(root.querySelector('[data-state="device"] .state-words')?.textContent).toBe("ready");
    expect(reloads.n).toBe(0);
    expect(reload).not.toHaveBeenCalled();
    reload.mockRestore();
  });
});
