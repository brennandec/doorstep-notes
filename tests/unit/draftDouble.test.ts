// Drafting task 6 (R1.4, R1.5): the draft interface, its double and its labels.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { decideMode } from "../../src/drafting/chooseMode";
import { draftLabels } from "../../src/drafting/labels";
import { draftDouble } from "../../src/inference/draft/draft.double";
import * as doubles from "../../src/inference/doubles";
import { makeKit, type FirebaseDeps } from "../../src/inference";
import type { DeviceModelState, DraftJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { restoreAll } from "../../src/masking/pronouns";
import { strings } from "../../src/app/strings";

const ticket = {} as never;
const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });

function realDraft(): DraftJob & { run: ReturnType<typeof vi.fn> } {
  return {
    run: vi.fn(async (_t, input, mode) => ({
      value: { text: `device note for ${input.text.length}`, short: mode === "ONLY_ON_DEVICE" },
      inferenceSource: mode === "ONLY_ON_DEVICE" ? ("ON_DEVICE" as const) : ("IN_CLOUD" as const),
      connected: true,
    })),
  } as never;
}
function deps(draft: DraftJob): FirebaseDeps {
  const other = { value: undefined as never, inferenceSource: "ON_DEVICE" as const, connected: true };
  return {
    real: {
      structure: { mode: "ONLY_ON_DEVICE", run: async () => other },
      proposeMasks: { mode: "ONLY_ON_DEVICE", run: async () => other },
      draft,
      rewrite: { mode: "PREFER_ON_DEVICE", run: async () => other },
      secondReader: { mode: "ONLY_IN_CLOUD", run: async () => other },
    },
  };
}
const online = (ok: boolean) => ({ navigatorOnLine: () => ok, fetch: async () => ({ ok }), now: () => 1 });

describe("the draft double", () => {
  it("answers PREFER_IN_CLOUD with source IN_CLOUD and connected false, and makes no request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await draftDouble.run(ticket, { text: outgoing.text }, "PREFER_IN_CLOUD");
    vi.unstubAllGlobals();
    expect(r.inferenceSource).toBe("IN_CLOUD");
    expect(r.connected).toBe(false);
    expect(r.value.short).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("writes a fixed note for the invented masked record, with tags and pronoun tokens", async () => {
    const r = await draftDouble.run(ticket, { text: outgoing.text }, "PREFER_IN_CLOUD");
    const again = await draftDouble.run(ticket, { text: outgoing.text }, "PREFER_IN_CLOUD");
    expect(r.value.text).toBe(again.value.text);
    expect(r.value.text).toContain("12/11");
    expect(r.value.text).toMatch(/\[Person 1\]/);
    expect(r.value.text).toMatch(/\{(she|he|they|He|She|They):Person 1\}/);
  });

  it("holds no name from the client list, and restores with the list's pronouns", async () => {
    const r = await draftDouble.run(ticket, { text: outgoing.text }, "PREFER_IN_CLOUD");
    for (const c of clients) expect(r.value.text).not.toContain(c.fullName);
    const restored = restoreAll(r.value.text, outgoing.mask, clients);
    expect(restored.text).toContain("Maria Okonkwo-Reyes");
    expect(restored.tokensReplaced).toBeGreaterThan(0);
    expect(restored.text).not.toMatch(/\{\w+:Person/);
  });

  it("is a different answer for ONLY_ON_DEVICE: shorter, ON_DEVICE", async () => {
    const long = await draftDouble.run(ticket, { text: outgoing.text }, "PREFER_IN_CLOUD");
    const short = await draftDouble.run(ticket, { text: outgoing.text }, "ONLY_ON_DEVICE");
    expect(short.inferenceSource).toBe("ON_DEVICE");
    expect(short.value.short).toBe(true);
    expect(short.value.text.length).toBeLessThan(long.value.text.length);
  });

  it("is also exported from the doubles file", () => {
    expect(doubles.draftDouble).toBe(draftDouble);
  });
});

describe("the mode follows the network (R1.3), through the kit", () => {
  const cases: [string, boolean, boolean, DeviceModelState][] = [
    ["online, cloud flag off: the double answers, IN_CLOUD, not connected", true, false, "unavailable"],
    ["online, cloud flag on: the real job is called with PREFER_IN_CLOUD", true, true, "available"],
  ];
  for (const [name, up, cloudOn, device] of cases) {
    it(name, async () => {
      const real = realDraft();
      const kit = makeKit({ device, cloud: cloudOn }, deps(real));
      const choice = await decideMode(online(up), device);
      expect(choice.kind).toBe("cloud");
      if (choice.kind !== "cloud") return;
      const r = await kit.draft.run(ticket, { text: "x" }, choice.mode);
      if (cloudOn) {
        expect(real.run).toHaveBeenCalledWith(ticket, { text: "x" }, "PREFER_IN_CLOUD");
        expect(r.connected).toBe(true);
      } else {
        expect(real.run).not.toHaveBeenCalled();
        expect(r.inferenceSource).toBe("IN_CLOUD");
        expect(r.connected).toBe(false);
      }
    });
  }

  it("offline with the model available: the real job is called with ONLY_ON_DEVICE, even with the cloud flag off", async () => {
    const real = realDraft();
    const kit = makeKit({ device: "available", cloud: false }, deps(real));
    const choice = await decideMode(online(false), "available");
    expect(choice).toEqual({ kind: "device", mode: "ONLY_ON_DEVICE" });
    const r = await kit.draft.run(ticket, { text: "x" }, "ONLY_ON_DEVICE");
    expect(real.run).toHaveBeenCalledWith(ticket, { text: "x" }, "ONLY_ON_DEVICE");
    expect(r.inferenceSource).toBe("ON_DEVICE");
    expect(r.value.short).toBe(true);
  });
});

describe("labels (R1.4)", () => {
  it("a cloud answer from the double: in the cloud, not connected, no short-draft line", () => {
    const l = draftLabels({ value: { text: "t", short: false }, inferenceSource: "IN_CLOUD", connected: false });
    expect(l).toEqual({ source: "IN_CLOUD", connected: false, shortLine: null });
  });

  it("a device answer carries 'Shorter draft made on this device.'", () => {
    const l = draftLabels({ value: { text: "t", short: true }, inferenceSource: "ON_DEVICE", connected: true });
    expect(l.source).toBe("ON_DEVICE");
    expect(l.shortLine).toBe("Shorter draft made on this device.");
    expect(strings.drafting.shortDraft).toBe("Shorter draft made on this device.");
  });

  it("a PREFER_IN_CLOUD call that the SDK answered on the device is still labelled as a device draft", () => {
    const l = draftLabels({ value: { text: "t", short: false }, inferenceSource: "ON_DEVICE", connected: true });
    expect(l.shortLine).toBe(strings.drafting.shortDraft);
  });

  it("takes the source from inferenceSource, not from the mode", () => {
    expect(readFileSync("src/drafting/labels.ts", "utf8")).not.toMatch(/ONLY_ON_DEVICE|PREFER_IN_CLOUD/);
  });
});
