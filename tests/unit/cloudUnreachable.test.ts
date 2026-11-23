// @vitest-environment happy-dom
// H20 R3: while the network is offline, the status bar's cloud state reads "unreachable", never "connected".
import { describe, expect, it } from "vitest";
import { makeController } from "../../src/app/controller";
import { cloudStatusView } from "../../src/app/cloudStatus";
import { statesOf } from "../../src/app/statusBar";
import { strings } from "../../src/app/strings";
import { makeDeviceModel } from "../../src/inference/deviceModel";

const cloudWords = (input: Parameters<typeof statesOf>[0]) => statesOf(input).find((s) => s.key === "cloud")!.words;
const device = { state: "available" as const };

describe("the cloud state offline (H20 R3)", () => {
  it("reads unreachable offline when the cloud is configured and the last call did not fail", () => {
    const view = cloudStatusView({ kind: "connected" });
    expect(cloudWords({ network: "offline", device, cloud: true, cloudStatus: view })).toBe("unreachable");
    expect((strings.status as Record<string, string>).cloudUnreachable).toBe("unreachable");
  });

  it("reads unreachable offline also after a failed call, and with no derived state when the switch is on", () => {
    const failed = cloudStatusView({ kind: "failed", detail: "403" });
    expect(cloudWords({ network: "offline", device, cloud: true, cloudStatus: failed })).toBe("unreachable");
    expect(cloudWords({ network: "offline", device, cloud: true })).toBe("unreachable");
  });

  it("keeps not configured and not connected offline, and connected online", () => {
    const none = cloudStatusView({ kind: "not-configured" });
    expect(cloudWords({ network: "offline", device, cloud: false, cloudStatus: none })).toBe(strings.status.cloudNotConfigured);
    expect(cloudWords({ network: "offline", device, cloud: false })).toBe(strings.status.cloudNotConnected);
    expect(cloudWords({ network: "online", device, cloud: true, cloudStatus: cloudStatusView({ kind: "connected" }) })).toBe("connected");
  });

  it("changes on the page when the network goes and comes back", async () => {
    const offline = { current: false };
    const root = document.createElement("div");
    document.body.append(root);
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: true,
      cloudStatus: () => cloudStatusView({ kind: "connected" }),
      tier: "paid",
      results: () => undefined,
      isOffline: async () => offline.current,
    });
    await c.start();
    const words = () => root.querySelector('[data-state="cloud"] .state-words')?.textContent;
    expect(words()).toBe("connected");
    offline.current = true;
    await c.refreshNetwork();
    expect(words()).toBe("unreachable");
    offline.current = false;
    await c.refreshNetwork();
    expect(words()).toBe("connected");
  });
});
