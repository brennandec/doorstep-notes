// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type Controller } from "../../src/app/controller";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { StructureFailure } from "../../src/inference/structure/structure.real";
import type { StructureJob } from "../../src/inference/types";
import { makeKeptStore } from "../../src/storage/kept";
import { browserStoreStandIn } from "../support/browserStoreStandIn";
import { strings } from "../../src/app/strings";

const tick = () => new Promise((r) => setTimeout(r, 0));
const record = inventedVisit.preparedRecord;

function setup(opts: { structure?: StructureJob; device?: string; results?: Parameters<typeof makeController>[0]["results"] } = {}) {
  const root = document.createElement("div");
  document.body.append(root);
  // The note and the record are kept in the one versioned document (fourth review K1); this was a
  // note store and a record store before.
  const backend = browserStoreStandIn();
  const kept = makeKeptStore(backend);
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => opts.device ?? "available", create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
    aiServiceEnabled: false, tier: "no-cost", results: opts.results ?? (() => undefined),
    isOffline: async () => false,
    structure: opts.structure, kept,
  });
  return { root, c, kept };
}
/** What the kept document holds for the visit, after every save has been written. */
async function keptVisit(kept: ReturnType<typeof makeKeptStore>) {
  await kept.flush();
  const r = await kept.load();
  return r.status === "ok" ? r.data.visit : null;
}
const okJob = (): StructureJob => ({ mode: "ONLY_ON_DEVICE", run: vi.fn(async () => ({ value: structuredClone(record), inferenceSource: "ON_DEVICE" as const, connected: true })) });

async function typeNote(c: Controller, root: HTMLElement, value: string) {
  root.querySelector<HTMLButtonElement>("#start-visit")?.click();
  const area = root.querySelector<HTMLTextAreaElement>("#note")!;
  area.value = value;
  area.dispatchEvent(new Event("input"));
  await tick();
  expect(c.state().noteText).toBe(value);
}

describe("controller: make the record", () => {
  it("is wired only when a structure job is given", async () => {
    expect(setup().c.state().makeRecordWired).toBe(false);
    expect(setup({ structure: okJob() }).c.state().makeRecordWired).toBe(true);
  });
  it("runs the job on a press, shows the record labelled on this device, and saves it", async () => {
    const job = okJob();
    const { c, root, kept } = setup({ structure: job });
    await c.start();
    await typeNote(c, root, inventedVisit.note);
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    await tick(); await tick();
    expect(job.run).toHaveBeenCalledWith({ noteText: inventedVisit.note });
    expect(c.state().record).toEqual(record);
    expect(c.state().recordSource).toBe("ON_DEVICE");
    root.querySelector<HTMLButtonElement>("#edit-record")?.click();
    expect(root.querySelector("[data-record] .source-label")?.textContent).toContain("on this device");
    await kept.flush();
    const stored = await kept.load();
    expect(stored.status === "ok" && stored.data.visit.record).toEqual(record);
  });
  it("asks for a note first when there is none", async () => {
    const job = okJob();
    const { c, root } = setup({ structure: job });
    await c.start();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    // With no note the control is disabled (capture-and-record R13.4); the handler still refuses in words.
    expect(root.querySelector<HTMLButtonElement>("#make-record")!.disabled).toBe(true);
    c.handlers.onMakeRecord();
    await tick();
    expect(job.run).not.toHaveBeenCalled();
    expect(c.state().error).toBe(strings.record.noInput);
  });
  it("stops early with the length line when a passing results file says the note is too long", async () => {
    const job = okJob();
    const results = (n: string) => (n === "device-token-limit" ? { status: "pass" as const, bound: 10, photoAmount: 0 } : undefined);
    const { c, root } = setup({ structure: job, results });
    await c.start();
    await typeNote(c, root, "A short note.");
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    await tick();
    expect(job.run).not.toHaveBeenCalled();
    expect(c.state().error).toBe("This note is too long for the device model. Split it into two parts.");
  });
  it("shows the job's line on a failure, and keeps partial text for editing when the record is not clean", async () => {
    const job: StructureJob = { mode: "ONLY_ON_DEVICE", run: async () => { throw new StructureFailure("notClean", strings.record.cleanFail, { visitDate: "12/11", seen: ["Mould."] }); } };
    const { c, root } = setup({ structure: job });
    await c.start();
    await typeNote(c, root, "12/11 x");
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    await tick(); await tick();
    expect(c.state().error).toBe("The device could not make a clean record. You can edit it by hand.");
    expect(c.state().record).toEqual({ visitDate: "12/11", present: [], seen: ["Mould."], agreed: [], risks: [], nextSteps: [] });
    expect(c.state().recordSource).toBeNull();
    expect(c.state().working).toBe(false);
  });
  it("keeps no record when the result was not from the device", async () => {
    const job: StructureJob = { mode: "ONLY_ON_DEVICE", run: async () => { throw new StructureFailure("notOnDevice", strings.record.notOnDevice); } };
    const { c, root } = setup({ structure: job });
    await c.start();
    await typeNote(c, root, "x");
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    await tick(); await tick();
    expect(c.state().record).toBeNull();
    expect(c.state().error).toBe(strings.record.notOnDevice);
  });
  it("shows the waiting line while the job waits for the download, and no error", async () => {
    let finish!: () => void;
    const job: StructureJob = { mode: "ONLY_ON_DEVICE", run: () => new Promise((r) => { finish = () => r({ value: record, inferenceSource: "ON_DEVICE", connected: true }); }) };
    const { c, root } = setup({ structure: job, device: "downloading" });
    await c.start();
    await typeNote(c, root, inventedVisit.note);
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    await tick();
    expect(c.state().working).toBe(true);
    expect(c.state().error).toBeNull();
    expect(root.querySelector("[data-working]")?.textContent).toMatch(/^waiting for the device model, \d+%$/);
    finish();
    await tick(); await tick();
    expect(c.state().working).toBe(false);
    expect(c.state().record).toEqual(record);
  });
  it("shows the language line for an invented Welsh note", async () => {
    const { c, root } = setup({ structure: okJob() });
    await c.start();
    await typeNote(c, root, "Roedd y fflat yn oer iawn ac nid oedd y landlord wedi ateb ein negeseuon e-bost ers wythnos.");
    c.render();
    expect(root.querySelector("[data-hint]")?.textContent).toBe(strings.record.language);
  });
});

describe("controller: hand entry and edits", () => {
  it("starts an empty record by hand, edits a field, adds and removes a person, and keeps it on this device", async () => {
    const { c, root, kept } = setup();
    await c.start();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    root.querySelector<HTMLButtonElement>("#start-by-hand")!.click();
    expect(c.state().record).toEqual({ visitDate: "", present: [], seen: [], agreed: [], risks: [], nextSteps: [] });
    root.querySelector<HTMLButtonElement>("#edit-record")!.click();
    const date = root.querySelector<HTMLInputElement>("#record-date")!;
    date.value = "2026-11-12"; date.dispatchEvent(new Event("input"));
    const seen = root.querySelector<HTMLTextAreaElement>("#record-seen")!;
    seen.value = "Letter on the table.\nMould by the window."; seen.dispatchEvent(new Event("input"));
    root.querySelector<HTMLInputElement>("#tag-label")!.value = "Dana Whitfield";
    root.querySelector<HTMLSelectElement>("#tag-role")!.value = "worker";
    root.querySelector<HTMLButtonElement>("#add-tag")!.click();
    root.querySelector<HTMLInputElement>("#tag-label")!.value = "Bea";
    root.querySelector<HTMLButtonElement>("#add-tag")!.click();
    root.querySelector<HTMLButtonElement>("#remove-tag-1")!.click();
    await tick();
    const r = c.state().record!;
    expect(r.visitDate).toBe("2026-11-12");
    expect(r.seen).toEqual(["Letter on the table.", "Mould by the window."]);
    expect(r.present).toEqual([{ label: "Dana Whitfield", role: "worker" }]);
    expect(c.state().recordSource).toBeNull();
    expect((await keptVisit(kept))?.record).toEqual(r);
  });
  it("loads the prepared invented record with one more press when the model is absent (try the example, then the first control)", async () => {
    const { c, root } = setup({ device: "unavailable" });
    await c.start();
    root.querySelector<HTMLButtonElement>("#try-example")!.click();
    expect(c.state().record).toBeNull();
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    expect(c.state().record).toEqual(record);
    expect(c.state().example).toBe(true);
  });
});

describe("controller: photo and storage", () => {
  const png = () => new File([new Uint8Array([137, 80, 78, 71])], "page.png", { type: "image/png" });
  it("refuses a GIF with the exact line and stores nothing", async () => {
    const { c, kept } = setup({ structure: okJob() });
    await c.start();
    c.handlers.onPhoto!(new File([new Uint8Array([1])], "a.gif", { type: "image/gif" }));
    await tick();
    expect(c.state().error).toBe("Only JPEG or PNG photos can be read on this device. Convert it to JPEG or PNG first.");
    expect(c.state().photo).toBeNull();
    expect((await keptVisit(kept))?.photo ?? null).toBeNull();
  });
  it("keeps a PNG on this device, passes it to the job, and removes it on request", async () => {
    const job = okJob();
    const { c, root, kept } = setup({ structure: job });
    await c.start();
    c.handlers.onPhoto!(png());
    await tick(); await tick();
    expect(c.state().photo).toEqual({ mimeType: "image/png", base64: "iVBORw==" });
    expect((await keptVisit(kept))?.photo).toEqual({ mimeType: "image/png", base64: "iVBORw==" });
    root.querySelector<HTMLButtonElement>("#make-record")!.click();
    await tick(); await tick();
    expect(job.run).toHaveBeenCalledWith({ noteText: "", photo: { mimeType: "image/png", base64: "iVBORw==" } });
    c.handlers.onRemovePhoto!();
    await tick();
    expect(c.state().photo).toBeNull();
    expect((await keptVisit(kept))?.photo ?? null).toBeNull();
  });
  it("saves typed notes and restores them and the record at start, with the network off", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("no network"); });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const a = setup({ structure: okJob() });
      await a.c.start();
      await typeNote(a.c, a.root, "Visit Mon. Form not sent.");
      await a.c.handlers.onStartByHand?.();
      a.c.handlers.onRecordEdit?.(record);
      await a.kept.flush();
      const stored = await a.kept.load();
      expect(stored.status === "ok" && stored.data.visit.noteText).toBe("Visit Mon. Form not sent.");
      // A new controller over the same storage.
      const root = document.createElement("div");
      const b = makeController({
        root, device: makeDeviceModel({ languageModel: undefined }), aiServiceEnabled: false, tier: "no-cost",
        results: () => undefined, isOffline: async () => true, structure: okJob(), kept: a.kept,
      });
      await b.start();
      expect(b.state().noteText).toBe("Visit Mon. Form not sent.");
      expect(b.state().record).toEqual(record);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
