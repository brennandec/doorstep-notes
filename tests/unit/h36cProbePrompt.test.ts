// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { makeStructureJob, type StructureSdk } from "../../src/inference/structure/structure.real";
import { strings } from "../../src/app/strings";

function mount(deps: Partial<ControllerDeps> & Pick<ControllerDeps, "device">) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const c = makeController({
    root,
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    ...deps,
  });
  return { root, c };
}

const deviceWords = (root: HTMLElement): string =>
  (root.querySelector('[data-state="device"] .state-words')?.textContent ?? "").trim();

const flush = () => Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());

describe("H36c: ready only after one tiny prompt is answered", () => {
  it("keeps a session without inputQuota/measureInputUsage whose prompt throws out of ready, sets header to did not start, and destroys it", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async () => {
      throw new DOMException("No device weights", "QuotaExceededError");
    });
    let current = "downloadable";
    const { root, c } = mount({
      device: makeDeviceModel({
        languageModel: {
          availability: async () => current,
          create: async () => ({ prompt, destroy }),
        },
        initializeDeviceModel: async () => {
          current = "available";
        },
      }),
    });

    await c.start();
    expect(deviceWords(root)).toBe(strings.status.deviceDownloadable);
    expect(prompt).not.toHaveBeenCalled();

    c.handlers.onTryExample();
    (root.querySelector("#get-model") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector('[role="alert"]')?.textContent ?? "").toContain("QuotaExceededError");
    });

    expect(c.state().device.state).not.toBe("available");
    expect(deviceWords(root)).toBe("did not start");
    expect(root.querySelector("#get-model")).not.toBeNull();
    expect(root.querySelector("#make-record")?.textContent).toContain(strings.actions.useExampleRecord);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("sets header to did not start and destroys probe session when load probe prompt throws without weights properties", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async () => {
      throw new DOMException("No device weights", "QuotaExceededError");
    });
    const { root, c } = mount({
      device: makeDeviceModel({
        languageModel: {
          availability: async () => "available",
          create: async () => ({ prompt, destroy }),
        },
      }),
    });

    await c.start();
    expect(c.state().device.state).not.toBe("available");
    expect(deviceWords(root)).toBe("did not start");
    expect(root.querySelector('[role="alert"]')?.textContent ?? "").toContain("QuotaExceededError");
    expect(root.querySelector("#get-model")).not.toBeNull();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("marks ready and destroys the probe session when a session without weights properties answers a short word with text", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async (_input?: unknown) => '{"ok":true}');
    const { root, c } = mount({
      device: makeDeviceModel({
        languageModel: {
          availability: async () => "available",
          create: async () => ({ prompt, destroy }),
        },
      }),
    });

    await c.start();
    expect(c.state().device.state).toBe("available");
    expect(deviceWords(root)).toBe(strings.status.deviceReady);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(typeof prompt.mock.calls[0]?.[0]).toBe("string");
    expect((prompt.mock.calls[0]?.[0] as string).trim().length).toBeGreaterThan(0);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects empty or whitespace prompt answers as did not start and destroys the probe session", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async () => "   ");
    const { root, c } = mount({
      device: makeDeviceModel({
        languageModel: {
          availability: async () => "available",
          create: async () => ({ prompt, destroy }),
        },
      }),
    });

    await c.start();
    expect(c.state().device.state).not.toBe("available");
    expect(deviceWords(root)).toBe("did not start");
    expect(root.querySelector("#get-model")).not.toBeNull();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps model unready with did not start and destroys probe session after 8 seconds when prompt never answers (fake clock)", async () => {
    vi.useFakeTimers();
    try {
      const destroy = vi.fn();
      const prompt = vi.fn(() => new Promise<string>(() => {}));
      const { root, c } = mount({
        device: makeDeviceModel({
          languageModel: {
            availability: async () => "available",
            create: async () => ({ prompt, destroy }),
          },
        }),
      });

      let done = false;
      const starting = c.start().then(() => {
        done = true;
      });
      await flush();
      expect(prompt).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(7999);
      expect(done).toBe(false);
      expect(destroy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await starting;
      expect(done).toBe(true);
      expect(c.state().device.state).not.toBe("available");
      expect(deviceWords(root)).toBe("did not start");
      expect(root.querySelector("#get-model")).not.toBeNull();
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("demotes header to did not start and keeps model button when Make the record fails", async () => {
    const sdk: StructureSdk = {
      generate: async () => {
        throw new DOMException("No weights", "QuotaExceededError");
      },
    };
    const { root, c } = mount({
      device: makeDeviceModel({
        languageModel: {
          availability: async () => "available",
          create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }),
        },
      }),
      structure: makeStructureJob({ sdk, state: async () => "available" }),
    });

    await c.start();
    expect(deviceWords(root)).toBe(strings.status.deviceReady);
    c.handlers.onTryExample();
    (root.querySelector("#make-record") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(root.querySelector('[role="alert"]')?.textContent ?? "").toContain("QuotaExceededError");
    });
    expect(deviceWords(root)).toBe("did not start");
    expect(root.querySelector("#get-model")).not.toBeNull();
    expect(root.querySelector("#make-record")?.textContent).toContain(strings.actions.useExampleRecord);
  });

  it("handles a hanging prompt on Get the device model press with fake clock, reads did not start, keeps button, and destroys session", async () => {
    vi.useFakeTimers();
    try {
      const destroy = vi.fn();
      const prompt = vi.fn(() => new Promise<string>(() => {}));
      let current = "downloadable";
      const { root, c } = mount({
        device: makeDeviceModel({
          languageModel: {
            availability: async () => current,
            create: async () => ({ prompt, destroy }),
          },
          initializeDeviceModel: async () => {
            current = "available";
          },
        }),
      });

      await c.start();
      expect(deviceWords(root)).toBe(strings.status.deviceDownloadable);
      (root.querySelector("#start-visit") as HTMLButtonElement).click();

      (root.querySelector("#get-model") as HTMLButtonElement).click();
      await flush();
      await flush();
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(destroy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(8000);
      await flush();
      await flush();

      expect(c.state().device.state).not.toBe("available");
      expect(deviceWords(root)).toBe("did not start");
      expect(root.querySelector('[role="alert"]')?.textContent ?? "").toContain("The device model could not be started");
      expect(root.querySelector("#get-model")).not.toBeNull();
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a bare session without prompt method as did not start and destroys it", async () => {
    const destroy = vi.fn();
    const { root, c } = mount({
      device: makeDeviceModel({
        languageModel: {
          availability: async () => "available",
          create: async () => ({ destroy }),
        },
      }),
    });

    await c.start();
    expect(c.state().device.state).not.toBe("available");
    expect(deviceWords(root)).toBe("did not start");
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
