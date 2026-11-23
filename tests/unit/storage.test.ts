import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { memoryBackend } from "../../src/storage/backend";
import { makeNoteStore } from "../../src/storage/notes";
import { makeRecordStore } from "../../src/storage/records";

// A 1 by 1 PNG, written out as base64. It stands in for an invented photo.
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("storage with the network off", () => {
  const fetchSpy = vi.fn(() => { throw new Error("no network"); });
  beforeEach(() => { vi.stubGlobal("fetch", fetchSpy); });
  afterEach(() => { vi.unstubAllGlobals(); fetchSpy.mockClear(); });

  it("saves and reads back the invented note and a small invented photo", async () => {
    const store = makeNoteStore(memoryBackend());
    await store.saveNote(inventedVisit.note);
    await store.savePhoto({ mimeType: "image/png", base64: TINY_PNG });
    expect(await store.loadNote()).toBe(inventedVisit.note);
    expect(await store.loadPhoto()).toEqual({ mimeType: "image/png", base64: TINY_PNG });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("reads empty when nothing was saved, and clears", async () => {
    const store = makeNoteStore(memoryBackend());
    expect(await store.loadNote()).toBe("");
    expect(await store.loadPhoto()).toBeNull();
    await store.saveNote("x");
    await store.savePhoto({ mimeType: "image/jpeg", base64: "AAAA" });
    await store.clear();
    expect(await store.loadNote()).toBe("");
    expect(await store.loadPhoto()).toBeNull();
  });
  it("saves and reads back the record, and edits to it", async () => {
    const store = makeRecordStore(memoryBackend());
    expect(await store.load()).toBeNull();
    await store.save(inventedVisit.preparedRecord);
    expect(await store.load()).toEqual(inventedVisit.preparedRecord);
    const edited = { ...inventedVisit.preparedRecord, risks: [] };
    await store.save(edited);
    expect(await store.load()).toEqual(edited);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("ignores stored values that are not a record", async () => {
    const backend = memoryBackend();
    await backend.set("record", { visitDate: 7 });
    expect(await makeRecordStore(backend).load()).toBeNull();
  });
  it("keeps note and record in separate stores that do not touch each other", async () => {
    const backend = memoryBackend();
    await makeNoteStore(backend).saveNote("n");
    expect(await makeRecordStore(backend).load()).toBeNull();
  });
});
