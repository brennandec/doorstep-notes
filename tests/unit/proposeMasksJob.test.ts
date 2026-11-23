import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeKit, type FirebaseDeps } from "../../src/inference";
import {
  makeProposeMasksJob,
  ProposeFailure,
  type ProposeCall,
  type ProposeSdk,
} from "../../src/inference/proposeMasks/proposeMasks.real";
import { CANDIDATES_SCHEMA, checkCandidates } from "../../src/inference/proposeMasks/proposeMasks.schema";
import { strings } from "../../src/app/strings";

const reply = (over: Partial<{ text: string; inferenceSource: string }> = {}) => ({
  text: JSON.stringify({ candidates: [{ text: "Bea", kind: "name" }, { text: "14 Alder Court", kind: "place" }] }),
  inferenceSource: "on_device",
  ...over,
});
function fakeSdk(r: () => Promise<{ text: string; inferenceSource: string }>) {
  const generate = vi.fn((_c: ProposeCall) => r());
  return { sdk: { generate } as ProposeSdk, generate };
}
const available = async () => "available" as const;

describe("propose-masks job, real implementation (masking task 9)", () => {
  it("is ONLY_ON_DEVICE and sends the raw note with the schema as the response constraint", async () => {
    const { sdk, generate } = fakeSdk(async () => reply());
    const job = makeProposeMasksJob({ sdk, state: available });
    expect(job.mode).toBe("ONLY_ON_DEVICE");
    const r = await job.run(inventedVisit.note);
    expect(r.inferenceSource).toBe("ON_DEVICE");
    expect(r.connected).toBe(true);
    expect(r.value).toEqual([{ text: "Bea", kind: "name" }, { text: "14 Alder Court", kind: "place" }]);
    const call = generate.mock.calls[0]![0];
    expect(call.mode).toBe("ONLY_ON_DEVICE");
    expect(call.promptOptions).toEqual({ responseConstraint: CANDIDATES_SCHEMA });
    expect(call.parts).toHaveLength(1);
    expect(call.parts[0]!.text).toContain("Maria O-R");
    expect(call.parts[0]!.text).toContain(inventedVisit.note);
  });

  it("declares text input only, since the job reads text", async () => {
    const { sdk, generate } = fakeSdk(async () => reply());
    await makeProposeMasksJob({ sdk, state: available }).run("x");
    expect(generate.mock.calls[0]![0].createOptions.expectedInputs).toEqual([{ type: "text", languages: ["en"] }]);
  });

  it("does not call the SDK when the model is unavailable", async () => {
    const { sdk, generate } = fakeSdk(async () => reply());
    const err = await makeProposeMasksJob({ sdk, state: async () => "unavailable" }).run("x").catch((e) => e);
    expect(err).toBeInstanceOf(ProposeFailure);
    expect(err.kind).toBe("absent");
    expect(generate).not.toHaveBeenCalled();
  });

  it("waits while the model downloads, and says it is waiting", async () => {
    let finish!: (v: { text: string; inferenceSource: string }) => void;
    const { sdk, generate } = fakeSdk(() => new Promise((r) => { finish = r; }));
    const waiting = vi.fn();
    const settled = vi.fn();
    const p = makeProposeMasksJob({ sdk, state: async () => "downloading", onWaiting: waiting }).run("x");
    void p.then(settled, settled);
    await new Promise((r) => setTimeout(r, 10));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(waiting).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    finish(reply());
    expect((await p).value).toHaveLength(2);
  });

  it("discards an IN_CLOUD result", async () => {
    const { sdk } = fakeSdk(async () => reply({ inferenceSource: "in_cloud" }));
    const err = await makeProposeMasksJob({ sdk, state: available }).run("x").catch((e) => e);
    expect(err.kind).toBe("notOnDevice");
    expect(err.line).toBe(strings.masking.proposeNotOnDevice);
  });

  it("reports a reply that is not clean, and a reply that is not JSON", async () => {
    for (const text of [JSON.stringify({ candidates: [{ text: 5, kind: "name" }] }), "Sorry, I cannot.", JSON.stringify({ other: [] })]) {
      const { sdk } = fakeSdk(async () => reply({ text }));
      const err = await makeProposeMasksJob({ sdk, state: available }).run("x").catch((e) => e);
      expect(err.kind).toBe("notClean");
    }
  });

  it("maps the model's length error and another error to plain lines", async () => {
    const quota = Object.assign(new Error("too much"), { name: "QuotaExceededError" });
    let { sdk } = fakeSdk(async () => { throw quota; });
    let err = await makeProposeMasksJob({ sdk, state: available }).run("x").catch((e) => e);
    expect([err.kind, err.line]).toEqual(["tooLong", strings.masking.proposeTooLong]);
    ({ sdk } = fakeSdk(async () => { throw new Error("boom"); }));
    err = await makeProposeMasksJob({ sdk, state: available }).run("x").catch((e) => e);
    expect([err.kind, err.line]).toEqual(["failed", strings.masking.proposeFailed]);
  });

  it("accepts an empty list and a reply wrapped in a code fence", async () => {
    const { sdk } = fakeSdk(async () => reply({ text: "```json\n" + JSON.stringify({ candidates: [] }) + "\n```" }));
    expect((await makeProposeMasksJob({ sdk, state: available }).run("x")).value).toEqual([]);
  });

  it("checks candidate shapes", () => {
    expect(checkCandidates({ candidates: [{ text: "a", kind: "name" }] }).ok).toBe(true);
    expect(checkCandidates({ candidates: [{ text: "a", kind: "colour" }] }).ok).toBe(false);
    expect(checkCandidates(null).ok).toBe(false);
  });
});

describe("the job follows the device state alone (masking R4.5, ruling 23)", () => {
  const real = {
    proposeMasks: makeProposeMasksJob({ sdk: { generate: async () => reply() }, state: available }),
  } as unknown as FirebaseDeps["real"];
  it("is real when the device is available and the cloud switch is off", () => {
    const kit = makeKit({ device: "available", cloud: false }, { real });
    expect(kit.plan.proposeMasks).toBe("real");
    expect(kit.proposeMasks).toBe(real.proposeMasks);
  });
  it("is real when the device is available and the cloud switch is on", () => {
    expect(makeKit({ device: "available", cloud: true }, { real }).plan.proposeMasks).toBe("real");
  });
  it("is absent in every other state, whatever the cloud switch says", () => {
    for (const device of ["unavailable", "downloadable", "downloading"] as const) {
      for (const cloud of [false, true]) {
        expect(makeKit({ device, cloud }, { real }).plan.proposeMasks).toBe("absent");
      }
    }
  });
});

describe("imports", () => {
  it("the propose job and the masking folder import no SDK and make no request", () => {
    const files = [
      ...readdirSync("src/inference/proposeMasks").map((f) => `src/inference/proposeMasks/${f}`),
      ...readdirSync("src/masking").map((f) => `src/masking/${f}`),
    ];
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const text = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
      expect(text, f).not.toMatch(/from\s+["'](firebase|@firebase)/);
      expect(text, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|egress\/send|ONLY_IN_CLOUD|PREFER_IN_CLOUD/);
    }
  });

  it("src/masking imports no inference or firebase module (masking R2.4)", () => {
    for (const f of readdirSync("src/masking")) {
      const text = readFileSync(`src/masking/${f}`, "utf8");
      const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
      for (const i of imports) expect(i, `${f}: ${i}`).not.toMatch(/inference|firebase|egress/);
    }
  });
});
