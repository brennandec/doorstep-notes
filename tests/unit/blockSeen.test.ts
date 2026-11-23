// @vitest-environment happy-dom
// Egress-check tasks 29 to 32 (R15, sixth review R2): the block is seen. Invented people only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { blockLine } from "../../src/app/parts/blockLine";
import { renderSteps } from "../../src/app/parts/steps";
import { flattenStrings, strings } from "../../src/app/strings";
import { emptyState } from "../../src/app/state";
import { buildBlockedLine } from "../../src/egress/line";
import { makeLedger } from "../../src/egress/ledger";
import { makePreview } from "../../src/egress/send";
import { checkEgress } from "../../src/egress/check";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DraftJob } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const BANNED = /\b(safe|private by design|anonymised|guaranteed|cleared)\b/i;

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const draft: DraftJob = { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) } as never;
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => draft,
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  };
  const c = makeController(deps);
  return { root, c, draft };
}
async function withExample(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
  s.c.render();
}
const press = async (root: HTMLElement, sel: string) => {
  (root.querySelector(sel) as HTMLElement).click();
  await settle();
};
const q = (root: ParentNode, sel: string) => root.querySelector(sel) as HTMLElement | null;
// H35a D8: Draft stops while a word that looks like an unlisted name (Bea) is unresolved. She keeps it, and Draft goes on.
const draft = async (root: HTMLElement) => {
  await press(root, "#draft");
  for (let i = 0; i < 5 && q(root, "[data-keep-likely]"); i++) await press(root, "[data-keep-likely]");
};

afterEach(() => vi.restoreAllMocks());

describe("the block line (R15.1, R15.2)", () => {
  const found = (listed: string[], masked: string[] = []) =>
    buildBlockedLine(checkEgress({ captured: [], listedNames: [], surfaceForms: [], sentOnPurpose: [] }) && { listedFound: listed, maskedFound: masked } as never);

  it("says one listed name in the words of H35a D5, with the name as a chip and no override", () => {
    const line = blockLine(found(["Maria Okonkwo-Reyes"]), () => undefined)!;
    expect(line.textContent).toContain("Not sent: 1 listed name is in the text. Mask it, then send.");
    expect(line.textContent).toContain("Maria Okonkwo-Reyes");
    expect(line.textContent).not.toContain("Send this name on purpose");
    expect(line.querySelectorAll("[data-block-chip]")).toHaveLength(1);
    expect(line.querySelector("button.mask-chip")).not.toBeNull();
  });

  it("puts the chips after the sentence", () => {
    const line = blockLine(found(["Maria Okonkwo-Reyes"]), () => undefined)!;
    const sentence = line.textContent!.indexOf("Mask it, then send.");
    expect(sentence).toBeGreaterThan(-1);
    expect(line.textContent!.indexOf("Maria Okonkwo-Reyes")).toBeGreaterThan(sentence);
  });

  it("says how many when there are more, one chip each", () => {
    const line = blockLine(found(["Maria Okonkwo-Reyes", "Priya Halloran"]), () => undefined)!;
    expect(line.textContent).toContain("Not sent: 2 listed names are in the text. Mask them, then send.");
    expect(line.querySelectorAll("[data-block-chip]")).toHaveLength(2);
  });

  it("says masked values when only masked values were found", () => {
    const line = blockLine(found([], ["Bea"]), () => undefined)!;
    expect(line.textContent).toContain("Not sent: 1 masked value is in the text. Mask it, then send.");
    const many = blockLine(found([], ["Bea", "Joe"]), () => undefined)!;
    expect(many.textContent).toContain("Not sent: 2 masked values are in the text. Mask them, then send.");
  });

  it("is drawn for a block and for nothing else", () => {
    expect(blockLine(null)).toBeNull();
    const pass = { ...found(["x"]), kind: "pass" } as never;
    expect(blockLine(pass)).toBeNull();
  });

  it("calls back with the name when its chip is pressed, by click and by Enter", () => {
    const seen: string[] = [];
    const line = blockLine(found(["Priya Halloran"]), (n) => seen.push(n))!;
    (line.querySelector("button.mask-chip") as HTMLElement).click();
    line.querySelector("button.mask-chip")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(seen).toEqual(["Priya Halloran", "Priya Halloran"]);
  });

  it("words are in the string table and pass the word audit; the table holds no digit", () => {
    for (const t of [strings.egress.blockOneListed, strings.egress.blockManyListed, strings.egress.blockOneMasked, strings.egress.blockManyMasked, strings.egress.nextBlocked, strings.egress.nextBlockedMany, strings.egress.tryListed, strings.egress.tryListedHelp, strings.steps.stopped]) {
      expect(t).not.toMatch(BANNED);
      expect(t).not.toMatch(/\d/);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(flattenStrings(strings).some((t) => /Send this name on purpose/.test(t) && t !== strings.masking.purposeAction)).toBe(false);
  });
});

describe("the step line (R15.3)", () => {
  it("shows Send as stopped in words and in shape while the block holds", () => {
    const blocked = buildBlockedLine({ listedFound: ["Priya Halloran"], maskedFound: [] } as never);
    const steps = renderSteps(emptyState({ egressLines: blocked }));
    const send = steps.querySelector('[data-step="send"]')!;
    expect(send.hasAttribute("data-stopped")).toBe(true);
    expect(send.textContent).toContain("Send: stopped");
    expect(send.querySelector('[data-icon="crossedOctagon"]')).not.toBeNull();
    // no other step is stopped
    expect(steps.querySelectorAll("[data-stopped]")).toHaveLength(1);
  });
  it("is not stopped without a block", () => {
    const steps = renderSteps(emptyState());
    expect(steps.querySelector("[data-stopped]")).toBeNull();
    expect(steps.querySelector('[data-step="send"]')!.textContent).not.toContain("stopped");
  });
});

describe("Try to send a listed name (R15.4)", () => {
  it("is not there without the invented visit", async () => {
    const s = setup();
    await s.c.start();
    expect(q(s.root, "#try-listed")).toBeNull();
  });

  it("is under the outgoing text on the invented visit", async () => {
    const s = setup();
    await withExample(s);
    await draft(s.root);
    const zone = q(s.root, '[data-zone="leaves"]')!;
    const control = q(zone, "#try-listed")!;
    expect(control.textContent).toBe("Try to send a listed name");
    const kids = [...zone.children];
    expect(kids.indexOf(control.parentElement!)).toBeGreaterThan(kids.indexOf(q(zone, "pre.outgoing")!));
  });

  it("one press unmasks one listed name and the block shows: line, chip, Send unavailable, step stopped", async () => {
    const s = setup();
    await withExample(s);
    await draft(s.root);
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(false);
    await press(s.root, "#try-listed");
    const line = q(s.root, "[data-block-line]")!;
    expect(line.textContent).toMatch(/^Not sent: 1 listed name is in the text\. Mask it, then send\. /);
    expect(line.querySelectorAll("[data-block-chip]")).toHaveLength(1);
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(true);
    expect(q(s.root, '[data-step="send"]')!.hasAttribute("data-stopped")).toBe(true);
    // the name now stands in the text that would leave
    expect(q(s.root, "pre.outgoing")!.textContent).toMatch(/Maria|Okonkwo|Brandvold|Priya|Halloran/);
  });

  it("is not offered before Draft: Zone 2 is empty until Draft is pressed (H35a D2)", async () => {
    const s = setup();
    await withExample(s);
    expect(q(s.root, "#try-listed")).toBeNull();
    expect(q(s.root, "pre.outgoing")!.textContent).toBe(strings.emptyOutgoing);
    expect(q(s.root, "[data-block-line]")).toBeNull();
  });

  it("pressing the chip masks the name again: the line goes, the step is not stopped, Send is back", async () => {
    const s = setup();
    await withExample(s);
    await draft(s.root);
    const before = q(s.root, "pre.outgoing")!.textContent;
    await press(s.root, "#try-listed");
    expect(q(s.root, "pre.outgoing")!.textContent).not.toBe(before);
    await press(s.root, "[data-block-chip] button.mask-chip");
    expect(q(s.root, "[data-block-line]")).toBeNull();
    expect(q(s.root, "[data-stopped]")).toBeNull();
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(false);
    expect(q(s.root, "pre.outgoing")!.textContent).toBe(before);
    expect(q(s.root, "#try-listed")).not.toBeNull();
  });

  it("makes no request while the block holds, and a press on Send does nothing (R15.5)", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);
    const xhr = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhr);
    const s = setup();
    await withExample(s);
    await draft(s.root);
    const probes = fetchSpy.mock.calls.length; // the offline probe, made before the block
    await press(s.root, "#try-listed");
    await press(s.root, "#send");
    s.c.handlers.onSend?.();
    await settle();
    expect(s.draft.run).not.toHaveBeenCalled();
    expect(s.c.state().finished).toBeNull();
    expect(fetchSpy.mock.calls.length).toBe(probes);
    expect(xhr).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("a listed name typed into the outgoing text (R15.6)", () => {
  const names = ["Maria Okonkwo-Reyes", "Priya Halloran"];
  it("blocks the preview and names the typed name", () => {
    const text = "Visit date: 12/11. Present: [Person 1]. She said Priya Halloran called twice.";
    const p = makePreview(text, { listedNames: names, surfaceForms: [], sentOnPurpose: [] });
    expect(p.canSend).toBe(false);
    expect(p.blockedLine?.kind).toBe("blocked");
    expect(p.blockedLine?.blocked?.listed).toEqual(["Priya Halloran"]);
    const line = blockLine(p.blockedLine, () => undefined)!;
    expect(line.textContent).toContain("Priya Halloran");
  });
  it("a typed first name alone blocks too, as a single part of three letters or more", () => {
    const p = makePreview("Present: [Person 1]. Maria called.", { listedNames: names, surfaceForms: [], sentOnPurpose: [] });
    expect(p.canSend).toBe(false);
    expect(p.blockedLine?.blocked?.listed).toEqual(["Maria Okonkwo-Reyes"]);
  });
  it("a text with no listed name is not blocked and has no line", () => {
    const p = makePreview("Present: [Person 1]. Tomorrow is fine.", { listedNames: names, surfaceForms: [], sentOnPurpose: [] });
    expect(p.canSend).toBe(true);
    expect(blockLine(p.blockedLine)).toBeNull();
  });
});

describe("one name for each person on the list (R15.1)", () => {
  const groups = [["Maria Okonkwo-Reyes", "Maria O-R", "Mari"], ["Priya Halloran"]];
  it("shows a person once when two of their names are found", async () => {
    const { onePerPerson } = await import("../../src/egress/line");
    expect(onePerPerson(["Maria Okonkwo-Reyes", "Maria O-R"], groups)).toEqual(["Maria Okonkwo-Reyes"]);
    expect(onePerPerson(["Maria O-R", "Priya Halloran"], groups)).toEqual(["Maria O-R", "Priya Halloran"]);
  });
  it("keeps a name that is in no group, and every name without groups", async () => {
    const { onePerPerson } = await import("../../src/egress/line");
    expect(onePerPerson(["Someone Else"], groups)).toEqual(["Someone Else"]);
    expect(onePerPerson(["Maria Okonkwo-Reyes", "Maria O-R"], undefined)).toEqual(["Maria Okonkwo-Reyes", "Maria O-R"]);
  });
  it("is used by the preview: two names of one person are one chip", () => {
    const p = makePreview("Present: Maria Okonkwo-Reyes, also Maria O-R.", { listedNames: groups.flat(), listedGroups: groups, surfaceForms: [], sentOnPurpose: [] });
    expect(p.blockedLine?.blocked?.listed).toEqual(["Maria Okonkwo-Reyes"]);
  });
});
