// @vitest-environment happy-dom
// Order H42 verification: Fault A (Second Reader reads rewritten masked record & quotes mask rewritten words),
// Fault B (skipped rewrites surfaced next to middle column, never silent), rewriteDone honesty,
// identical pronoun pair collapse (F4), and cloud draft instructions + generationConfig + cloud=false (F5).
import { describe, expect, it, vi } from "vitest";
import * as cloudServiceMod from "../../src/firebase/cloudService";
import { draftSdk } from "../../src/firebase/draftSdk";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { INSTRUCTIONS, buildOutgoing } from "../../src/drafting/buildOutgoing";
import { selectableSentences } from "../../src/drafting/sentences";
import { makeLedger } from "../../src/egress/ledger";
import { makeKit } from "../../src/inference";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { parseClientList, type ClientEntry } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { restoreAll } from "../../src/masking/pronouns";
import type { MaskResult } from "../../src/masking/types";
import type { Guess } from "../../src/inference/types";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};

const outgoingText = (root: HTMLElement) => root.querySelector("pre.outgoing")?.textContent ?? "";

function setupHarness(options: {
  rewriteResult?: string;
  guessesForText?: (text: string) => Guess[];
  confirmPurpose?: ControllerDeps["confirmPurpose"];
} = {}) {
  const root = document.createElement("div");
  document.body.append(root);

  const draftRun = vi.fn((t, i, m) => draftDouble.run(t, i, m));
  const rewriteRun = vi.fn(async () => ({
    value: options.rewriteResult ?? "Damp in the rear corner by the frame.",
    inferenceSource: "ON_DEVICE" as const,
    connected: true,
  }));
  const readerRun = vi.fn(async (_t: unknown, input: { text: string }) => ({
    value: {
      guesses: options.guessesForText
        ? options.guessesForText(input.text)
        : [{ who: "a tenant with damp", description: "a tenant with damp", why: "specific room", kind: "place", evidence: ["rear corner"] }],
      model: "invented-reader",
      bytes: input.text.length,
    },
    inferenceSource: "IN_CLOUD" as const,
    connected: true,
  }));

  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "available" } }),
    aiServiceEnabled: true,
    tier: "paid",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => ({ run: draftRun }) as never,
      rewriteFor: () => ({ mode: "PREFER_ON_DEVICE" as const, run: rewriteRun }),
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
    secondReader: {
      readerFor: () => ({ run: readerRun }) as never,
    },
    ...(options.confirmPurpose ? { confirmPurpose: options.confirmPurpose } : {}),
  };

  const c = makeController(deps);
  return { root, c, draftRun, rewriteRun, readerRun };
}

async function openPreparedExampleAndRewrite(s: ReturnType<typeof setupHarness>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
  s.c.render();
  await settle();

  // Draft button opens Zone 2 after resolving unlikely word ("Bea").
  (s.root.querySelector("#draft") as HTMLButtonElement).click();
  await settle();
  for (let i = 0; i < 6 && s.root.querySelector("[data-keep-likely]"); i++) {
    (s.root.querySelector("[data-keep-likely]") as HTMLElement).click();
    await settle();
  }

  // Rewrite the Seen mould sentence (on-device, no extra Send step needed for PREFER_ON_DEVICE? wait: cloud=true needs Send).
  const target = selectableSentences(s.c.state().outgoingText).find((r) => r.text.includes("back bedroom"))!;
  expect(target).toBeDefined();
  s.c.handlers.onSelectSentence?.(target.start);
  await settle();
  (s.root.querySelector("#rewrite-shorter") as HTMLButtonElement).click();
  await settle();
  if (s.c.state().rewrite.pending !== null) {
    (s.root.querySelector("#send") as HTMLButtonElement).click();
    await settle();
  }
  return target.text;
}

describe("Order H42 Fault A + Fault B + F1-F5", () => {
  it("F1: Second Reader reads the same rewritten masked record as Draft, keeps quotes against it, and updates the middle column", async () => {
    const rewritten = "Damp in the rear corner.";
    const expectedLine = rewritten.replace(/\.$/, "");
    const s = setupHarness({
      rewriteResult: rewritten,
      guessesForText: () => [
        { who: "tenant with damp", description: "tenant with damp", why: "unique words", kind: "place", evidence: ["rear corner"] },
      ],
    });
    const original = await openPreparedExampleAndRewrite(s);
    expect(s.c.state().rewrites).toHaveLength(1);
    expect(outgoingText(s.root)).toContain(expectedLine);
    expect(outgoingText(s.root)).not.toContain(original);

    (s.root.querySelector("#ask-reader") as HTMLButtonElement).click();
    await settle();

    // Middle column ("What leaves") immediately reflects the rewritten sentence, not the un-rewritten original.
    expect(outgoingText(s.root)).toContain(expectedLine);
    expect(outgoingText(s.root)).not.toContain(original);

    (s.root.querySelector("#send") as HTMLButtonElement).click();
    await settle();

    expect(s.readerRun).toHaveBeenCalledTimes(1);
    const sentToReader = String((s.readerRun.mock.calls[0]?.[1] as { text?: string } | undefined)?.text ?? "");
    expect(sentToReader).toContain(expectedLine);
    expect(sentToReader).not.toContain(original);
    // Because Second Reader read the rewritten sentence, the quote "rear corner" survives keepEvidence!
    const renderedQuotes = [...s.root.querySelectorAll("[data-reader] [data-quote]")].map((e) => e.getAttribute("data-quote"));
    expect(renderedQuotes).toContain("rear corner");
  });

  it("F3: pressing a quote chip on words existing only in a rewritten sentence masks them in next draft and next reader requests and shows the mask", async () => {
    const rewritten = "Damp in the rear corner.";
    const s = setupHarness({
      rewriteResult: rewritten,
      guessesForText: () => [
        { who: "tenant with damp", description: "tenant with damp", why: "corner wording", kind: "place", evidence: ["rear corner"] },
      ],
    });
    await openPreparedExampleAndRewrite(s);

    (s.root.querySelector("#ask-reader") as HTMLButtonElement).click();
    await settle();
    (s.root.querySelector("#send") as HTMLButtonElement).click();
    await settle();

    const quoteChip = s.root.querySelector('[data-reader] button[data-quote="rear corner"]') as HTMLButtonElement | null;
    expect(quoteChip).not.toBeNull();
    quoteChip!.click();
    await settle();
    expect(s.root.querySelector('[data-reader] button[data-quote="rear corner"]')?.getAttribute("data-chip")).toBe("manual");

    // Next reader request ("Ask again") masks "rear corner" into [Detail 1] on the page and in the wire request.
    (s.root.querySelector("#ask-reader") as HTMLButtonElement).click();
    await settle();
    expect(outgoingText(s.root)).toContain("Damp in the [Detail 1]");
    expect(outgoingText(s.root)).not.toContain("rear corner");
    (s.root.querySelector("#send") as HTMLButtonElement).click();
    await settle();

    expect(s.readerRun).toHaveBeenCalledTimes(2);
    const secondReaderReq = String((s.readerRun.mock.calls[1]?.[1] as { text?: string } | undefined)?.text ?? "");
    expect(secondReaderReq).toContain("Damp in the [Detail 1]");
    expect(secondReaderReq).not.toContain("rear corner");

    // Next draft request also keeps the rewritten sentence and masks "rear corner" into [Detail 1].
    (s.root.querySelector("#draft") as HTMLButtonElement).click();
    await settle();
    expect(outgoingText(s.root)).toContain("Damp in the [Detail 1]");
    expect(outgoingText(s.root)).not.toContain("rear corner");
    (s.root.querySelector("#send") as HTMLButtonElement).click();
    await settle();

    expect(s.draftRun).toHaveBeenCalledTimes(1);
    const sentToDraft = String((s.draftRun.mock.calls[0]?.[1] as { text?: string } | undefined)?.text ?? "");
    expect(sentToDraft).toContain("Damp in the [Detail 1]");
    expect(sentToDraft).not.toContain("rear corner");
  });

  it("F2 + Item 4: surfaces skipped rewrite count beside the middle column and clears 'Sentence replaced.' when a mask or record change invalidates it", async () => {
    const rewritten = "Damp by window.";
    const s = setupHarness({ rewriteResult: rewritten });
    await openPreparedExampleAndRewrite(s);

    expect(s.root.querySelector("[data-rewrite-result]")?.textContent).toContain(strings.drafting.rewriteDone);
    expect(s.root.querySelector("[data-rewrite-skipped]")).toBeNull();

    // Open Mask step and mask "bedroom" inside the rewritten original sentence, invalidating the stored rewrite target.
    (s.root.querySelector("#mask") as HTMLButtonElement).click();
    await settle();
    const bedroomBtn = [...s.root.querySelectorAll<HTMLButtonElement>("[data-mask-text] button.word")].find(
      (b) => b.textContent?.trim().toLowerCase() === "bedroom",
    );
    expect(bedroomBtn).toBeDefined();
    bedroomBtn!.click();
    await settle();

    // Fault B line is rendered beside/inside the middle column ("What leaves"), and rewriteDone is no longer falsely shown.
    const skippedLine = s.root.querySelector('[data-zone="leaves"] [data-rewrite-skipped]');
    expect(skippedLine?.textContent).toMatch(/1\b/);
    expect(s.root.querySelector("[data-rewrite-result]")).toBeNull();

    // Editing the record itself also never leaves a stale "Sentence replaced." claim when rewrites no longer match.
    const nextRecord = { ...inventedVisit.preparedRecord, seen: ["Completely different observation."] };
    s.c.handlers.onRecordEdit?.(nextRecord);
    s.c.render();
    await settle();
    expect(s.root.querySelector("[data-rewrite-result]")).toBeNull();
    expect(s.root.querySelector('[data-zone="leaves"] [data-rewrite-skipped]')?.textContent).toMatch(/1\b/);
  });

  it("F4: collapses identical pronoun pairs joined by or, and/or, or / deterministically in src/masking/pronouns.ts", () => {
    const mask: MaskResult = {
      maskedText: "",
      spans: [],
      map: { "[Person 1]": "Maria Okonkwo-Reyes", "[Person 2]": "Tomas Brandvold" },
      clientByTag: { "[Person 1]": "c1", "[Person 2]": "c2" },
      surfaceForms: [],
      listedNames: [],
      sentOnPurpose: [],
    };
    const clients = parseClientList("Maria Okonkwo-Reyes; ; she/her\nTomas Brandvold; ; he/him").entries as ClientEntry[];
    expect(restoreAll("[Person 2] offered to help {her:Person 1} or {her:Person 1} with the form.", mask, clients).text).toBe(
      "Tomas Brandvold offered to help her with the form.",
    );
    expect(restoreAll("{Her:Person 1} or {her:Person 1} form was posted.", mask, clients).text).toBe("Her or her form was posted.");
    expect(restoreAll("The worker spoke to her or her. {she:Person 1} confirmed.", mask, clients).text).toBe(
      "The worker spoke to her. She confirmed.",
    );
    expect(restoreAll("Her or her form was posted. {she:Person 1} confirmed.", mask, clients).text).toBe(
      "Her or her form was posted. She confirmed.",
    );
    expect(restoreAll("[Person 1] will sign {her:Person 1} and/or {her:Person 1} claim, then {she:Person 1}/{she:Person 1} posts it.", mask, clients).text).toBe(
      "Maria Okonkwo-Reyes will sign her and/or her claim, then she posts it.",
    );
    expect(restoreAll("The worker spoke to {her:Person 1} and/or {her:Person 1}.", mask, clients).text).toBe(
      "The worker spoke to her.",
    );
    // Distinct tags remain distinct even if both map to the same pronoun word.
    expect(restoreAll("{he:Person 2} or {she:Person 1} will post it.", mask, [
      { ...clients[0]!, pronouns: "he/him" },
      clients[1]!,
    ]).text).toBe("He or he will post it.");
  });

  it("F5: draftSdk passes deterministic temperature: 0 inCloudParams at runtime and INSTRUCTIONS includes attribution & missed-visit bans", async () => {
    const generate = vi.fn(async (_opts: unknown) => ({ text: "Draft.", inferenceSource: "IN_CLOUD" }));
    const spy = vi.spyOn(cloudServiceMod, "cloudService").mockReturnValue({ generate } as never);
    try {
      await draftSdk.generate({
        mode: "PREFER_IN_CLOUD",
        inCloudModel: "gemini-3.8-flash",
        createOptions: { expectedInputs: [], expectedOutputs: [], initialPrompts: [] },
        text: "Visit date: 12/11\n\n" + INSTRUCTIONS,
      });
      expect(generate).toHaveBeenCalledTimes(1);
      const buildParams = generate.mock.calls[0]![0] as (ai: unknown) => unknown;
      expect(
        buildParams({
          GoogleAIBackend: class {},
          InferenceMode: { ONLY_ON_DEVICE: "only_on_device", PREFER_ON_DEVICE: "prefer_on_device", PREFER_IN_CLOUD: "prefer_in_cloud" },
        }),
      ).toMatchObject({
        mode: "prefer_in_cloud",
        inCloudParams: { model: "gemini-3.8-flash", generationConfig: { temperature: 0 } },
      });
    } finally {
      spy.mockRestore();
    }
    expect(INSTRUCTIONS).toMatch(/label|Visit date|Present|Seen|Agreed|Risks|Next steps/i);
    expect(INSTRUCTIONS).toMatch(/reported|stated|speaker|attribute/i);
    expect(INSTRUCTIONS).toMatch(/sent by|whose|form|own/i);
    expect(INSTRUCTIONS).toMatch(/no household member was present/i);
    const out = buildOutgoing({ record: inventedVisit.preparedRecord, clients: parseClientList(inventedVisit.clientList).entries, policy: DEFAULT_POLICY });
    expect(out.text.endsWith(INSTRUCTIONS)).toBe(true);
  });

  it("F2: literal unmask + re-mask of [Person 1] inside a rewritten sentence toggles skipped=1/result=null then restores rewritten sentence with skipped=0", async () => {
    const rewritten = "[Person 1] checked the back lock.";
    const s = setupHarness({ rewriteResult: rewritten, confirmPurpose: () => true });
    await s.c.start();
    s.c.handlers.onListInput("Maria Patel; ; she/her\nTomas Brandvold; ; he/him");
    s.c.handlers.onRecordEdit?.({
      ...inventedVisit.preparedRecord,
      present: [{ label: "nurse", role: "worker" }],
      seen: ["Marie checked the back lock yesterday afternoon.", "Window frame dry today."],
    });
    s.c.render();
    await settle();

    (s.root.querySelector("#draft") as HTMLButtonElement).click();
    await settle();
    for (let i = 0; i < 6 && s.root.querySelector("[data-keep-likely]"); i++) {
      (s.root.querySelector("[data-keep-likely]") as HTMLElement).click();
      await settle();
    }

    const target = selectableSentences(s.c.state().outgoingText).find((r) => r.text.includes("[Person 1]"))!;
    expect(target).toBeDefined();
    s.c.handlers.onSelectSentence?.(target.start);
    await settle();
    (s.root.querySelector("#rewrite-shorter") as HTMLButtonElement).click();
    await settle();
    if (s.c.state().rewrite.pending !== null) {
      (s.root.querySelector("#send") as HTMLButtonElement).click();
      await settle();
    }

    expect(outgoingText(s.root)).toContain("[Person 1] checked the back lock");
    expect(s.root.querySelector("[data-rewrite-result]")?.textContent).toContain(strings.drafting.rewriteDone);
    expect(s.root.querySelector("[data-rewrite-skipped]")).toBeNull();

    // Open Mask view, unmask "Marie" ([Person 1] near chip -> panel -> [data-unmask]).
    (s.root.querySelector("#mask") as HTMLButtonElement).click();
    await settle();
    const nearChip = [...s.root.querySelectorAll<HTMLButtonElement>('[data-mask-text] [data-chip="near"]')].find(
      (b) => b.textContent?.includes("[Person 1]"),
    );
    expect(nearChip).toBeDefined();
    nearChip!.click();
    await settle();
    const unmaskBtn = s.root.querySelector<HTMLButtonElement>("[data-chip-panel] [data-unmask]");
    expect(unmaskBtn).not.toBeNull();
    unmaskBtn!.click();
    await settle();

    expect(s.root.querySelector('[data-zone="leaves"] [data-rewrite-skipped]')?.textContent).toMatch(/1\b/);
    expect(s.root.querySelector("[data-rewrite-result]")).toBeNull();
    expect(outgoingText(s.root)).toContain("Marie checked the back lock yesterday afternoon");
    expect(outgoingText(s.root)).not.toContain("[Person 1] checked the back lock.");

    // Re-mask "Marie" ([data-chip="off"]) back to [Person 1]: skipped returns to 0 and rewritten sentence returns.
    const offChip = s.root.querySelector<HTMLButtonElement>('[data-mask-text] [data-chip="off"]');
    expect(offChip).not.toBeNull();
    offChip!.click();
    await settle();

    expect(s.root.querySelector("[data-rewrite-skipped]")).toBeNull();
    expect(outgoingText(s.root)).toContain("[Person 1] checked the back lock");
    expect(outgoingText(s.root)).not.toContain("yesterday afternoon");
  });

  it("F5 cloud=false: fixed sample answers handle Draft and Second Reader with zero cloud calls while keeping rewritten outgoing path", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const realDraftRun = vi.fn();
    const realReaderRun = vi.fn();
    const realRewriteRun = vi.fn(async () => ({
      value: "Damp in the rear corner.",
      inferenceSource: "ON_DEVICE" as const,
      connected: true,
    }));
    const kit = makeKit(
      { device: "available", cloud: false },
      {
        real: {
          structure: { mode: "ONLY_ON_DEVICE", run: vi.fn() } as never,
          proposeMasks: { mode: "ONLY_ON_DEVICE", run: vi.fn() } as never,
          draft: { run: realDraftRun } as never,
          rewrite: { mode: "PREFER_ON_DEVICE", run: realRewriteRun } as never,
          secondReader: { run: realReaderRun } as never,
        },
      },
    );
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "available" } }),
      aiServiceEnabled: false,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      drafting: {
        draftFor: () => kit.draft,
        rewriteFor: () => kit.rewrite,
        ledger: makeLedger(),
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => undefined,
      },
      secondReader: { readerFor: () => kit.secondReader },
    });
    await c.start();
    expect(root.textContent).toContain(strings.halves.cloudOff);

    c.handlers.onTryExample();
    c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
    c.render();
    await settle();

    (root.querySelector("#draft") as HTMLButtonElement).click();
    await settle();
    for (let i = 0; i < 6 && root.querySelector("[data-keep-likely]"); i++) {
      (root.querySelector("[data-keep-likely]") as HTMLElement).click();
      await settle();
    }

    const target = selectableSentences(c.state().outgoingText).find((r) => r.text.includes("back bedroom"))!;
    c.handlers.onSelectSentence?.(target.start);
    await settle();
    (root.querySelector("#rewrite-shorter") as HTMLButtonElement).click();
    await settle();
    expect(c.state().rewrites).toHaveLength(1);
    expect(outgoingText(root)).toContain("Damp in the rear corner");

    (root.querySelector("#send") as HTMLButtonElement).click();
    await settle();
    expect(realDraftRun).not.toHaveBeenCalled();
    expect(root.querySelector('[data-zone="finished"] .sheet-text')).not.toBeNull();

    (root.querySelector("#ask-reader") as HTMLButtonElement).click();
    await settle();
    expect(outgoingText(root)).toContain("Damp in the rear corner");
    (root.querySelector("#send") as HTMLButtonElement).click();
    await settle();
    expect(realReaderRun).not.toHaveBeenCalled();
    expect(root.querySelectorAll("[data-reader] [data-guess]").length).toBeGreaterThan(0);
    expect(realDraftRun.mock.calls.length + realReaderRun.mock.calls.length).toBe(0);
  });
});
