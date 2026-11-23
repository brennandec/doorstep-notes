// @vitest-environment happy-dom
// Second reader task 3 (R1.2, R1.5): the interface, the mode and the double.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { sourceLabel } from "../../src/app/parts/sourceLabel";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { makeKit, type FirebaseDeps } from "../../src/inference";
import * as doubles from "../../src/inference/doubles";
import { secondReaderDouble } from "../../src/inference/secondReader/secondReader.double";
import { SECOND_READER_INSTRUCTIONS, secondReaderText } from "../../src/inference/secondReader/instructions";
import type { SecondReaderJob } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { keepEvidence } from "../../src/secondReader/evidence";

const ticket = {} as never;
const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const text = secondReaderText(outgoing.maskedRecord);

describe("the second reader's mode", () => {
  it("is ONLY_IN_CLOUD on the double", () => {
    expect(secondReaderDouble.mode).toBe("ONLY_IN_CLOUD");
  });

  it("is ONLY_IN_CLOUD in the interface type, with no device fallback", () => {
    const types = readFileSync("src/inference/types.ts", "utf8");
    expect(types).toMatch(/interface SecondReaderJob \{\s*readonly mode: "ONLY_IN_CLOUD"/);
  });

  it("is re-exported from the doubles module as the same object", () => {
    expect(doubles.secondReaderDouble).toBe(secondReaderDouble);
  });
});

describe("the second reader's text", () => {
  it("is the masked record followed by the fixed instructions", () => {
    expect(text).toBe(`${outgoing.maskedRecord}\n\n${SECOND_READER_INSTRUCTIONS}`);
  });

  it("asks who the text is about and which words point there", () => {
    expect(SECOND_READER_INSTRUCTIONS).toMatch(/who/i);
    expect(SECOND_READER_INSTRUCTIONS).toMatch(/words/i);
  });

  it("holds no digits-free claim words from the banned list", () => {
    expect(SECOND_READER_INSTRUCTIONS).not.toMatch(/\b(safe|anonymised|guaranteed|cleared)\b/i);
  });
});

describe("the double", () => {
  it("answers with source IN_CLOUD and connected false", async () => {
    const r = await secondReaderDouble.run(ticket, { text });
    expect(r.inferenceSource).toBe("IN_CLOUD");
    expect(r.connected).toBe(false);
  });

  it("makes no request", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await secondReaderDouble.run(ticket, { text });
    vi.unstubAllGlobals();
    expect(spy).not.toHaveBeenCalled();
  });

  it("gives one guess, a tenant in a ground-floor flat, with quotes taken from the text", async () => {
    const r = await secondReaderDouble.run(ticket, { text });
    expect(r.value.guesses).toHaveLength(1);
    expect(r.value.guesses[0]!.who).toBe("a tenant in a ground-floor flat");
    expect(r.value.guesses[0]!.evidence.length).toBeGreaterThan(0);
    const kept = keepEvidence(r.value.guesses, outgoing.maskedRecord);
    expect(kept.dropped).toBe(0);
    expect(kept.guesses[0]!.evidence).toEqual(r.value.guesses[0]!.evidence);
  });

  it("gives the same answer twice", async () => {
    const a = await secondReaderDouble.run(ticket, { text });
    const b = await secondReaderDouble.run(ticket, { text });
    expect(a).toEqual(b);
  });

  it("names nobody on the list in its answer", async () => {
    const r = await secondReaderDouble.run(ticket, { text });
    for (const c of clients) expect(JSON.stringify(r.value)).not.toContain(c.fullName);
  });

  it("gives no quotes when the text has nothing to quote", async () => {
    const r = await secondReaderDouble.run(ticket, { text: "Nothing here." });
    expect(r.value.guesses[0]!.evidence).toEqual([]);
  });

  it("is shown with the word off", async () => {
    const r = await secondReaderDouble.run(ticket, { text });
    const label = sourceLabel(r.inferenceSource, r.connected);
    expect(label.textContent).toContain(strings.source.inCloud);
    expect(label.textContent).toContain("off");
  });
});

function deps(real: SecondReaderJob): FirebaseDeps {
  const other = { value: undefined as never, inferenceSource: "ON_DEVICE" as const, connected: true };
  return {
    real: {
      structure: { mode: "ONLY_ON_DEVICE", run: async () => other },
      proposeMasks: { mode: "ONLY_ON_DEVICE", run: async () => other },
      draft: { run: async () => other },
      rewrite: { mode: "PREFER_ON_DEVICE", run: async () => other },
      secondReader: real,
    },
  };
}

describe("the kit", () => {
  const real: SecondReaderJob = {
    mode: "ONLY_IN_CLOUD",
    run: async () => ({ value: { guesses: [] }, inferenceSource: "IN_CLOUD", connected: true }),
  };

  it("uses the double while the cloud switch is off, whatever the device model is", () => {
    for (const device of ["unavailable", "downloadable", "downloading", "available"] as const) {
      const kit = makeKit({ device, cloud: false }, deps(real));
      expect(kit.secondReader).toBe(secondReaderDouble);
      expect(kit.plan.secondReader).toBe("double");
    }
  });

  it("uses the real job when the cloud switch is on, whatever the device model is", () => {
    for (const device of ["unavailable", "downloadable", "downloading", "available"] as const) {
      const kit = makeKit({ device, cloud: true }, deps(real));
      expect(kit.secondReader).toBe(real);
      expect(kit.plan.secondReader).toBe("real");
    }
  });
});
