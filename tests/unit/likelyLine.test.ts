// @vitest-environment happy-dom
// masking task 23 (R15.2 to R15.4, U6): the likely-names line and the dotted underline, without a device model.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderMaskView } from "../../src/app/parts/maskView";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DeviceModelState } from "../../src/inference/types";
import { applyMask } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { fold } from "../../src/masking/fold";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const raw = inventedVisit.note;
const mount = (over: Partial<Parameters<typeof renderMaskView>[0]> = {}) => {
  const spans = applyMask(raw, exactAndNear(raw, clients, DEFAULT_POLICY), clients).spans;
  const view = renderMaskView({ raw, spans, likely: true, ...over });
  document.body.replaceChildren(view.element);
  return view;
};
const line = () => document.querySelector("[data-likely-line]");
const likelyButton = (w: string) => document.querySelector<HTMLButtonElement>(`[data-likely-word="${w}"]`)!;
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 5)); };

describe("the line (R15.2)", () => {
  it("counts and lists the words, with the exact wording for three", () => {
    mount();
    expect(line()!.textContent).toBe("3 words look like names and are not on your list: Alder, Court, Bea. This is a guess by capital letters.");
  });

  it("reads in the singular for one word", () => {
    const view = mount();
    likelyButton("Alder").click();
    likelyButton("Court").click();
    expect(line()!.textContent).toBe("1 word looks like a name and is not on your list: Bea. This is a guess by capital letters.");
    expect(view.liveRegion.textContent).toMatch(/^Masked: /);
  });

  it("is not shown when there is none", () => {
    mount();
    for (const w of ["Alder", "Court", "Bea"]) likelyButton(w).click();
    expect(line()).toBeNull();
    expect(document.querySelector("[data-likely-word]")).toBeNull();
  });

  it("is not shown unless asked for", () => {
    mount({ likely: false });
    expect(line()).toBeNull();
    expect(document.querySelector(".word.likely")).toBeNull();
  });

  it("draws a dotted underline on the likely words only", () => {
    mount();
    const marked = [...document.querySelectorAll(".mask-text .word.likely")].map((n) => n.textContent);
    expect(marked).toEqual(["Alder", "Court", "Bea"]);
    const css = readFileSync("src/app/styles/app.css", "utf8");
    const rule = css.match(/\.word\.likely \{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/underline dotted/);
    expect(rule).toMatch(/var\(--ink\)/);
    expect(rule).not.toMatch(/#[0-9a-fA-F]{3,6}|accent|failure/);
  });

  it("removes the underline from a word that was masked", () => {
    mount();
    likelyButton("Bea").click();
    expect([...document.querySelectorAll(".mask-text .word.likely")].map((n) => n.textContent)).toEqual(["Alder", "Court"]);
  });
});

describe("one press masks a word (R15.3)", () => {
  it("masks it with all its places as a manual mask, announces it, and drops it from the line", () => {
    const view = mount();
    likelyButton("Bea").click();
    const manual = view.getSpans().filter((s) => s.kind === "manual" && s.surfaceForm === "Bea");
    expect(manual.length).toBeGreaterThan(0);
    expect(manual.every((s) => s.accepted)).toBe(true);
    expect(view.liveRegion.textContent).toMatch(/^Masked: Detail \d$/);
    expect(line()!.textContent).not.toContain("Bea");
  });

  it("makes each word in the line a control of at least 44 px", () => {
    mount();
    expect(likelyButton("Alder").tagName).toBe("BUTTON");
    const css = readFileSync("src/app/styles/app.css", "utf8");
    const rule = css.match(/\.likely-word \{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/min-width:\s*44px/);
  });
});

function setup(device: DeviceModelState) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => device, create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => ({ run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) }) as never,
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  });
  return { root, c };
}

describe("on the screen, only when the device model is not available (R15.2)", () => {
  for (const device of ["unavailable", "downloadable", "downloading"] as const) {
    it(`shows the line when the model is ${device}`, async () => {
      const { root, c } = setup(device);
      await c.start();
      c.handlers.onTryExample();
      c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
      c.render();
      root.querySelector<HTMLButtonElement>("#mask")!.click();
      await settle();
      expect(root.querySelector("[data-likely-line]")!.textContent).toBe(
        "1 word looks like a name and is not on your list: Bea. This is a guess by capital letters.",
      );
    });
  }

  it("shows no line when the model is available", async () => {
    const { root, c } = setup("available");
    await c.start();
    c.handlers.onTryExample();
    c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
    c.render();
    root.querySelector<HTMLButtonElement>("#mask")!.click();
    await settle();
    expect(root.querySelector("[data-likely-line]")).toBeNull();
  });

  it("leaves no Bea in the outgoing text after one press (R15.4)", async () => {
    const { root, c } = setup("unavailable");
    await c.start();
    c.handlers.onTryExample();
    c.render();
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    root.querySelector<HTMLButtonElement>("#edit-record")!.click();
    // H35a D2: nothing is in Zone 2 until Draft is pressed.
    expect(root.querySelector("pre.outgoing")!.textContent).toBe("Nothing to send yet.");
    root.querySelector<HTMLButtonElement>("#mask")!.click();
    await settle();
    expect(root.querySelector("pre.outgoing")!.textContent).toBe("Nothing to send yet.");
    root.querySelector<HTMLButtonElement>('[data-likely-word="Bea"]')!.click();
    await settle();
    // The same holds for the text that Draft sends: Bea is a tag in it.
    root.querySelector<HTMLButtonElement>("#draft")!.click();
    await settle();
    expect(fold(root.querySelector("pre.outgoing")!.textContent!)).not.toContain("bea");
    expect(root.querySelector("pre.outgoing")!.textContent).toMatch(/\[Detail \d\]|\[Person \d\]/);
  });
});
