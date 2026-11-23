// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { makeDeviceModel } from "../../src/inference/deviceModel";

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

describe("H36d: constrained JSON probe & starting header word", () => {
  it("1a. rejects Chromium EchoAILanguageModel output at load as not ready -> did not start and destroys probe session", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async (input?: unknown) => {
      return `On-device model is not available in Chromium, this API is just echoing back the input:\n${String(input)}\n\nRemember to respond in JSON.`;
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
    expect(root.querySelector("#get-model")).not.toBeNull();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("1b. rejects Chromium EchoAILanguageModel output on #get-model press with 0 occurrences of ready -> did not start", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async (input?: unknown) => {
      return `On-device model is not available in Chromium, this API is just echoing back the input:\n${String(input)}`;
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

    const seen: string[] = [];
    const record = () => {
      const w = deviceWords(root);
      if (w && seen[seen.length - 1] !== w) seen.push(w);
    };

    await c.start();
    record();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    const obs = new MutationObserver(record);
    obs.observe(root, { childList: true, characterData: true, subtree: true });

    (root.querySelector("#get-model") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(deviceWords(root)).toBe("did not start");
    });
    obs.disconnect();

    expect(seen).not.toContain("ready");
    expect(c.state().device.state).not.toBe("available");
    expect(root.querySelector("#get-model")).not.toBeNull();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("2. accepts a single-boolean-field JSON object { ok: true } under responseConstraint as ready and destroys probe session", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async (_input?: unknown, _options?: unknown) => '{"ok":true}');
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
    const options = prompt.mock.calls[0]?.[1] as { responseConstraint?: Record<string, unknown> } | undefined;
    expect(options?.responseConstraint).toBeDefined();
    const schema = options!.responseConstraint!;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, { type?: string }>;
    const req = schema.required as string[];
    expect(req).toHaveLength(1);
    expect(props[req[0]!]?.type).toBe("boolean");
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("3a. rejects JSON object whose boolean field is false -> not ready, did not start, session destroyed", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async () => '{"ok":false}');
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
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("3b. rejects JSON whose field is non-boolean -> not ready, did not start, session destroyed", async () => {
    const destroy = vi.fn();
    const prompt = vi.fn(async () => '{"ok":"true"}');
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
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("4a. header reads starting from the moment load probe begins until it ends (fake clock), never not-on-this-computer or can-be-downloaded", async () => {
    vi.useFakeTimers();
    try {
      const destroy = vi.fn();
      const prompt = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => resolve('{"ok":true}'), 5000);
          }),
      );
      const { root, c } = mount({
        device: makeDeviceModel({
          languageModel: {
            availability: async () => "available",
            create: async () => ({ prompt, destroy }),
          },
        }),
      });

      const seen: string[] = [];
      const record = () => {
        const w = deviceWords(root);
        if (w && seen[seen.length - 1] !== w) seen.push(w);
      };
      const obs = new MutationObserver(record);
      obs.observe(root, { childList: true, characterData: true, subtree: true });

      const done = c.start();
      record();
      expect(deviceWords(root)).toBe("starting");

      await flush();
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(deviceWords(root)).toBe("starting");

      await vi.advanceTimersByTimeAsync(2500);
      expect(deviceWords(root)).toBe("starting");
      expect(destroy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2499);
      expect(deviceWords(root)).toBe("starting");
      expect(destroy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      await done;
      obs.disconnect();

      expect(deviceWords(root)).toBe("ready");
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(seen).not.toContain("not on this computer");
      expect(seen).not.toContain("can be downloaded");
    } finally {
      vi.useRealTimers();
    }
  });

  it("4b. header reads starting before progress and after 100% while #get-model probe waits (fake clock), never can-be-downloaded", async () => {
    vi.useFakeTimers();
    try {
      const destroy = vi.fn();
      const prompt = vi.fn(
        (input?: unknown) =>
          new Promise<string>((resolve) => {
            setTimeout(
              () => resolve(`On-device model is not available in Chromium, this API is just echoing back the input:\n${String(input)}`),
              3000,
            );
          }),
      );
      let current = "downloadable";
      const { root, c } = mount({
        device: makeDeviceModel({
          languageModel: {
            availability: async () => current,
            create: async () => ({ prompt, destroy }),
          },
          initializeDeviceModel: async (cb) => {
            await new Promise<void>((resolve) => setTimeout(resolve, 1000));
            cb(0.4);
            await new Promise<void>((resolve) => setTimeout(resolve, 1000));
            cb(1);
            current = "available";
          },
        }),
      });

      await c.start();
      expect(deviceWords(root)).toBe("can be downloaded");
      (root.querySelector("#start-visit") as HTMLButtonElement).click();

      const duringAttempt: string[] = [];
      const record = () => {
        const w = deviceWords(root);
        if (w && duringAttempt[duringAttempt.length - 1] !== w) duringAttempt.push(w);
      };
      const obs = new MutationObserver(record);
      obs.observe(root, { childList: true, characterData: true, subtree: true });

      (root.querySelector("#get-model") as HTMLButtonElement).click();
      record();
      expect(deviceWords(root)).toBe("starting");

      await vi.advanceTimersByTimeAsync(1000);
      await flush();
      expect(deviceWords(root)).toBe("downloading, 40%");

      await vi.advanceTimersByTimeAsync(1000);
      await flush();
      expect(deviceWords(root)).toBe("starting");
      expect(prompt).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      await flush();
      obs.disconnect();

      expect(deviceWords(root)).toBe("did not start");
      expect(duringAttempt).not.toContain("can be downloaded");
      expect(duringAttempt).not.toContain("not on this computer");
      expect(duringAttempt).not.toContain("ready");
      expect(destroy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
