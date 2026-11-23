// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController } from "../../src/app/controller";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { StructureFailure } from "../../src/inference/structure/structure.real";
import { checkVisitRecord } from "../../src/inference/structure/structure.schema";
import type { StructureJob, VisitRecord } from "../../src/inference/types";
import { makeKeptStore } from "../../src/storage/kept";
import { browserStoreStandIn } from "../support/browserStoreStandIn";

const tick = () => new Promise((r) => setTimeout(r, 0));

function reply(file: string, index: number): VisitRecord {
  const j = JSON.parse(readFileSync(`results/${file}.json`, "utf8")) as { attempts: { structureReply: string }[] };
  const c = checkVisitRecord(JSON.parse(j.attempts[index]!.structureReply));
  if (!c.ok) throw new Error("reply is not clean");
  return c.record;
}
const k1 = reply("film-rehearsal-2026-11-14-h22b", 0);
const k2 = reply("film-rehearsal-2026-11-14-h22b", 1);
const THREE = ["Landlord not replied to 2 emails.", "Maria missed the benefits form deadline last wk, letter on the table.", "DOB on form 3/3/87."];

const job = (record: VisitRecord, fromModel: boolean): StructureJob => ({
  mode: "ONLY_ON_DEVICE",
  run: vi.fn(async () => ({ value: structuredClone(record), inferenceSource: "ON_DEVICE" as const, connected: true, ...(fromModel ? { fromModel: true as const } : {}) })),
});

function setup(structure: StructureJob, backend = browserStoreStandIn()) {
  const root = document.createElement("div");
  document.body.append(root);
  const kept = makeKeptStore(backend);
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "available", create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
    aiServiceEnabled: false, tier: "no-cost", results: () => undefined,
    isOffline: async () => false, structure, kept,
  });
  return { root, c, kept, backend };
}
async function makeRecord(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.root.querySelector<HTMLButtonElement>("#try-example")!.click();
  await tick();
  s.root.querySelector<HTMLButtonElement>("#make-record")!.click();
  await tick(); await tick();
  s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
}
const lines = (root: HTMLElement) => [...root.querySelectorAll("[data-missed-line]")].map((e) => e.textContent);

describe("the record lists what it left out (R15)", () => {
  it("lists the three sentences under the masking controls, and adds nothing by itself", async () => {
    const s = setup(job(k2, true));
    await makeRecord(s);
    const block = s.root.querySelector('[data-record-missing="3"]')!;
    expect(block).not.toBeNull();
    expect(lines(s.root)).toEqual(THREE);
    const maskSection = s.root.querySelector("[data-mask-section]")!;
    const dateFold = s.root.querySelector("#fold-date")!;
    expect(maskSection.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(block.compareDocumentPosition(dateFold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const b = s.root.querySelector("#add-seen-2")!;
    expect(b.getAttribute("data-kind")).toBe("inline");
    expect(b.getAttribute("aria-label")).toBe("Add to Seen: DOB on form 3/3/87.");
    expect(s.c.state().record!.seen).toEqual(k2.seen);
    expect(block.classList.contains("record-missing")).toBe(true);
    expect(block.classList.contains("date-line")).toBe(false);
  });

  it("moves a line into Seen on a press, keeps the focus on the next line, and the next Mask press reads it", async () => {
    const s = setup(job(k2, true));
    await makeRecord(s);
    s.root.querySelector<HTMLButtonElement>("#add-seen-2")!.click();
    await tick();
    const st = s.c.state();
    expect(st.record!.seen.at(-1)).toBe("DOB on form 3/3/87.");
    expect(s.root.querySelectorAll("[data-missed-line]")).toHaveLength(2);
    expect(st.mask).toBeNull();
    expect(document.activeElement?.id).toBe("add-seen-1");
    s.root.querySelector<HTMLButtonElement>("#mask")!.click();
    await tick(); await tick();
    expect(s.c.state().mask!.raw).toContain("3/3/87");
  });

  it("follows what she types into Seen while the textarea keeps its focus", async () => {
    const s = setup(job(k2, true));
    await makeRecord(s);
    s.root.querySelector<HTMLButtonElement>("#fold-seen")!.click();
    await tick();
    const area = s.root.querySelector<HTMLTextAreaElement>("#record-seen")!;
    area.focus();
    area.value = `${k2.seen.join("\n")}\nLandlord not replied to 2 emails.`;
    area.dispatchEvent(new Event("input"));
    await tick();
    expect(s.root.querySelector('[data-record-missing="2"]')).not.toBeNull();
    expect(s.root.querySelector("#record-seen")).toBe(area);
    expect(document.activeElement).toBe(area);
  });

  it("shows no list for a job without fromModel, hand entry, a photo, or a failure with a partial", async () => {
    const plain = setup(job(k2, false));
    await makeRecord(plain);
    expect(plain.root.querySelector("[data-record-missing]")).toBeNull();

    const hand = setup(job(k2, true));
    await hand.c.start();
    hand.root.querySelector<HTMLButtonElement>("#start-visit")!.click();
    hand.root.querySelector<HTMLButtonElement>("#start-by-hand")!.click();
    await tick();
    expect(hand.root.querySelector("[data-record-missing]")).toBeNull();

    const photo = setup(job(k2, true));
    await photo.c.start();
    photo.c.handlers.onPhoto!(new File([new Uint8Array([137, 80, 78, 71])], "page.png", { type: "image/png" }));
    await tick(); await tick();
    photo.root.querySelector<HTMLButtonElement>("#make-record")!.click();
    await tick(); await tick();
    expect(photo.c.state().record).not.toBeNull();
    expect(photo.root.querySelector("[data-record-missing]")).toBeNull();

    const failing: StructureJob = { mode: "ONLY_ON_DEVICE", run: async () => { throw new StructureFailure("notClean", "not clean", { visitDate: "12/11" }, "{}"); } };
    const fail = setup(failing);
    await makeRecord(fail);
    expect(fail.c.state().record).not.toBeNull();
    expect(fail.root.querySelector("[data-record-missing]")).toBeNull();
  });

  it("renders a hidden empty block, and no line, when the record misses nothing", async () => {
    const s = setup(job(k1, true));
    await makeRecord(s);
    const block = s.root.querySelector<HTMLElement>('[data-record-missing="0"]')!;
    expect(block).not.toBeNull();
    expect(block.hidden).toBe(true);
    expect(s.root.querySelector("[data-missed-line]")).toBeNull();
  });

  it("keeps the check across a reload: the same lines show, and Seen still holds the added sentence", async () => {
    const first = setup(job(k2, true));
    await makeRecord(first);
    first.root.querySelector<HTMLButtonElement>("#add-seen-2")!.click();
    await tick();
    await first.kept.flush();
    const again = setup(job(k2, true), first.backend);
    await again.c.start();
    await tick();
    again.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
    expect(lines(again.root)).toEqual(THREE.slice(0, 2));
    expect(again.c.state().record!.seen.at(-1)).toBe("DOB on form 3/3/87.");
  });

  it("uses the invented note, so the sentences come from the note as written", () => {
    for (const line of THREE) expect(inventedVisit.note).toContain(line);
  });
});
