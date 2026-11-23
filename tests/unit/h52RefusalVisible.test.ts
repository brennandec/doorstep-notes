// @vitest-environment happy-dom
// Order H52, hosted-cloud R5: a refused cloud call is visible where the visitor is looking. 0 real cloud calls.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudStatusView } from "../../src/app/cloudStatus";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderLeavesZone } from "../../src/app/zones/leaves";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { makeDraftJob } from "../../src/inference/draft/draft.real";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const REFUSED = cloudStatusView({ kind: "refused" });
const SENTENCE = "The robot check refused this page. Press Send to try the check again. Your masked record is kept.";

afterEach(() => vi.unstubAllGlobals());

describe("H52 change 1: the refusal line in the leaves zone", () => {
  const OUT = "Visit date: 12/11\nPresent: [Person 1]";

  it("sits directly under the actions row with the exact existing string, as a status line", () => {
    const z = renderLeavesZone(emptyState({ outgoingText: OUT, cloud: true, cloudStatus: REFUSED }));
    const line = z.querySelector("[data-refused-line]") as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.textContent).toBe(SENTENCE);
    expect(line.textContent).toBe(strings.cloud.browserRefusedDraft);
    expect(line.getAttribute("role")).toBe("status");
    expect(line.closest('[role="alert"]')).toBeNull();
    const actions = z.querySelector(".actions") as HTMLElement;
    expect(actions.querySelector("#send")).not.toBeNull();
    expect(actions.nextElementSibling).toBe(line);
  });

  it("is absent when the cloud is connected, failed for another reason, not configured or unknown", () => {
    for (const cloudStatus of [
      cloudStatusView({ kind: "connected" }),
      cloudStatusView({ kind: "failed", detail: "500" }),
      cloudStatusView({ kind: "not-configured" }),
      undefined,
    ]) {
      const z = renderLeavesZone(emptyState({ outgoingText: OUT, cloud: true, ...(cloudStatus ? { cloudStatus } : {}) }));
      expect(z.querySelector("[data-refused-line]")).toBeNull();
    }
  });
});

describe("H52 change 2: the refusal line under Send is scrolled into view only when it is outside the viewport", () => {
  async function refuse(errorTop: number, errorBottom: number) {
    const protoRect = Element.prototype.getBoundingClientRect;
    const protoScroll = (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    const protoFocus = HTMLElement.prototype.focus;
    const scroll = vi.fn();
    const focus = vi.fn(function (this: HTMLElement, o?: FocusOptions) {
      protoFocus.call(this, o);
    });
    (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = scroll;
    HTMLElement.prototype.focus = focus;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const isError = this.hasAttribute("data-refused-line");
      const top = isError ? errorTop : 0;
      const bottom = isError ? errorBottom : 10;
      return { top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
    };
    try {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
      const root = document.createElement("div");
      document.body.append(root);
      let status: Parameters<typeof cloudStatusView>[0] = { kind: "connected" };
      let checks = 0;
      const draft = makeDraftJob({
        sdk: {
          generate: async () => {
            checks += 1;
            await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", { method: "POST" });
            status = { kind: "refused" };
            throw Object.assign(new Error("HTTP status: 403"), { code: "appCheck/fetch-status-error" });
          },
        },
        state: async () => "unavailable",
      });
      const c = makeController({
        root,
        device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
        aiServiceEnabled: true,
        tier: "paid",
        results: () => undefined,
        isOffline: async () => false,
        cloudStatus: () => cloudStatusView(status),
        drafting: {
          draftFor: () => draft,
          ledger: makeLedger(),
          policy: DEFAULT_POLICY,
          online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
          copy: async () => undefined,
        },
      } as ControllerDeps);
      await c.start();
      c.handlers.onTryExample();
      c.handlers.onStartByHand?.();
      c.handlers.onMask?.();
      c.handlers.onOpenRecord?.();
      while (root.querySelector("[data-keep-likely]")) (root.querySelector("[data-keep-likely]") as HTMLElement).click();
      (root.querySelector("#draft") as HTMLButtonElement).click();
      while (root.querySelector("[data-keep-likely]")) (root.querySelector("[data-keep-likely]") as HTMLElement).click();
      await vi.waitFor(() => expect((root.querySelector("#send") as HTMLButtonElement).disabled).toBe(false), { timeout: 3000 });
      (root.querySelector("#send") as HTMLButtonElement).click();
      await vi.waitFor(() => expect(root.querySelector('[role="alert"].error')).not.toBeNull(), { timeout: 3000 });
      return { root, scroll, focus, checks: () => checks, error: root.querySelector('[role="alert"].error') as HTMLElement };
    } finally {
      Element.prototype.getBoundingClientRect = protoRect;
      (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = protoScroll;
      HTMLElement.prototype.focus = protoFocus;
    }
  }

  it("scrolls with block nearest when the refusal line is above the viewport, and does not take focus", async () => {
    const r = await refuse(-2360, -2330);
    expect(r.error.textContent).toContain(SENTENCE);
    expect(r.scroll.mock.contexts[0]).toBe(r.root.querySelector("[data-refused-line]"));
    expect(r.scroll).toHaveBeenCalledTimes(1);
    expect(r.scroll).toHaveBeenCalledWith({ block: "nearest" });
    expect(document.activeElement).not.toBe(r.error);
    expect(r.focus.mock.contexts).not.toContain(r.root.querySelector("[data-refused-line]"));
    expect(r.root.querySelector("[data-refused-line]")?.textContent).toBe(SENTENCE);
  });

  it("does not scroll when the refusal line is already inside the viewport", async () => {
    const r = await refuse(100, 130);
    expect(r.scroll).not.toHaveBeenCalled();
  });

  it("one press tries the check again, and the record, the masks and the check stay usable", async () => {
    const r = await refuse(100, 130);
    const send = r.root.querySelector("#send") as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    expect(r.root.querySelector("[data-working]")).toBeNull();
    expect(r.root.querySelector("[data-record]")).not.toBeNull();
    expect(r.root.querySelector("[data-receipt]")).toBeNull();
    const mask = r.root.querySelector("#mask") as HTMLButtonElement;
    expect(mask).not.toBeNull();
    expect(mask.disabled).toBe(false);
    expect(r.root.querySelector("[data-egress-line]")).not.toBeNull();
    for (const node of r.root.querySelectorAll("[data-record] button, [data-record] input, [data-record] textarea, [data-record] select, [data-mask-section] button")) {
      expect((node as HTMLButtonElement).disabled).toBe(false);
    }
    const before = r.checks();
    send.click();
    await vi.waitFor(() => expect(r.checks()).toBe(before + 1), { timeout: 3000 });
    await vi.waitFor(() => expect(r.root.querySelector("[data-working]")).toBeNull(), { timeout: 3000 });
    expect(r.root.querySelector("[data-refused-line]")?.textContent).toBe(SENTENCE);
    expect((r.root.querySelector("#send") as HTMLButtonElement).disabled).toBe(false);
    expect(r.root.querySelector("[data-record]")?.textContent).not.toBe("");
  });
});
