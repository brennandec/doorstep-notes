import { describe, expect, it } from "vitest";
import { KEPT_KEY, KEPT_VERSION } from "../../src/constants";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { keptBackend, unavailableBackend } from "../../src/storage/backend";
import { makeKeptStore } from "../../src/storage/kept";
import { fullData } from "../support/keptSample";
import { browserStoreStandIn } from "../support/browserStoreStandIn";

const LEGACY_KEYS = ["note", "photo", "record", "clientList", "maskState"];

const emptyOpened = { note: false, list: false, scans: false, reader: false, ledger: false, measured: false, date: false, present: false, seen: false, agreed: false, risks: false, nextSteps: false };

describe("the kept store", () => {
  it("reads empty when nothing was saved", async () => {
    expect(await makeKeptStore(browserStoreStandIn()).load()).toEqual({ status: "empty" });
  });

  it("saves and loads the same data, under one key, with the version", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    await store.save(fullData());
    expect(backend.keys()).toEqual([KEPT_KEY]);
    expect((backend.dump()[KEPT_KEY] as { version: number }).version).toBe(KEPT_VERSION);
    expect(await makeKeptStore(backend).load()).toEqual({ status: "ok", data: fullData() });
  });

  it("does not read a version it does not know, and says why", async () => {
    const backend = browserStoreStandIn();
    await backend.set(KEPT_KEY, { version: KEPT_VERSION + 1, data: fullData() });
    expect(await makeKeptStore(backend).load()).toEqual({ status: "unreadable", reason: "version" });
    await backend.set(KEPT_KEY, { data: fullData() });
    expect(await makeKeptStore(backend).load()).toEqual({ status: "unreadable", reason: "version" });
  });

  it("does not read data of the wrong shape", async () => {
    const backend = browserStoreStandIn();
    for (const bad of ["text", 5, [], { version: KEPT_VERSION }, { version: KEPT_VERSION, data: { clientList: 3 } }]) {
      await backend.set(KEPT_KEY, bad);
      const r = await makeKeptStore(backend).load();
      expect(r.status, JSON.stringify(bad)).toBe("unreadable");
    }
    const broken = fullData();
    (broken.visit.record as unknown as { present: string }).present = "not a list";
    await backend.set(KEPT_KEY, { version: KEPT_VERSION, data: broken });
    expect((await makeKeptStore(backend).load()).status).toBe("unreadable");
  });

  it("reports a store that will not open as failed, and does not throw", async () => {
    const backend = browserStoreStandIn();
    backend.failToOpen();
    expect(await makeKeptStore(backend).load()).toEqual({ status: "failed" });
  });

  it("reports a browser with no store as failed, so the page says nothing is kept", async () => {
    expect(await makeKeptStore(unavailableBackend()).load()).toEqual({ status: "failed" });
    await expect(makeKeptStore(unavailableBackend()).save(fullData())).rejects.toThrow();
    // Node has no IndexedDB, as a browser without one.
    expect(typeof indexedDB).toBe("undefined");
    expect(await makeKeptStore(keptBackend()).load()).toEqual({ status: "failed" });
  });

  it("writes in order and the last save wins", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    const a = fullData();
    const b = fullData();
    b.clientList = "Only one line";
    const c = fullData();
    c.clientList = "The last one";
    void store.save(a);
    void store.save(b);
    await store.save(c);
    await store.flush();
    const r = await makeKeptStore(backend).load();
    expect(r.status === "ok" && r.data.clientList).toBe("The last one");
  });

  it("removes the key instead of writing a blank document", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    await store.save(fullData());
    const blank = fullData();
    blank.example = false;
    blank.clientList = "";
    blank.opened = emptyOpened;
    blank.visit = { noteText: "", photo: null, record: null, recordSource: null, mask: null, outgoingText: "", previewOnly: false, rewrites: [], dateChoice: null, dateFlags: [], dateLine: null, finished: null, step: "note" };
    await store.save(blank);
    expect(backend.isEmpty()).toBe(true);
  });

  it("rejects a save when the store will not write", async () => {
    const backend = browserStoreStandIn();
    backend.failToWrite();
    await expect(makeKeptStore(backend).save(fullData())).rejects.toThrow();
  });
});

describe("the three clears", () => {
  it("'Clear this visit' removes the visit and keeps the list and the opened parts", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    await store.save(fullData());
    await store.clearVisit();
    const r = await makeKeptStore(backend).load();
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.clientList).toBe(inventedVisit.clientList);
    expect(r.data.example).toBe(true);
    expect(r.data.visit).toEqual({ noteText: "", photo: null, record: null, recordSource: null, mask: null, outgoingText: "", previewOnly: false, rewrites: [], dateChoice: null, dateFlags: [], dateLine: null, finished: null, step: "note" });
  });

  it("'Clear this visit' with no list leaves the store empty", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    const data = fullData();
    data.clientList = "";
    data.example = false;
    data.opened = emptyOpened;
    await store.save(data);
    await store.clearVisit();
    expect(backend.isEmpty()).toBe(true);
  });

  it("'Clear my list' removes the list and keeps the visit", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    await store.save(fullData());
    await store.clearList();
    const r = await makeKeptStore(backend).load();
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.data.clientList).toBe("");
    expect(r.data.visit).toEqual(fullData().visit);
  });

  it("'Clear everything this page keeps' leaves the store empty, with the ledger and the earlier keys", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    await store.save(fullData());
    await backend.set("ledger", { version: KEPT_VERSION, entries: [] });
    for (const k of LEGACY_KEYS) await backend.set(k, "old");
    await store.clearAll();
    expect(backend.isEmpty()).toBe(true);
  });

  it("does the clears in order after a queued save", async () => {
    const backend = browserStoreStandIn();
    const store = makeKeptStore(backend);
    void store.save(fullData());
    await store.clearAll();
    expect(backend.isEmpty()).toBe(true);
  });
});

describe("the kept store and recordChecked (H24)", () => {
  it("loads a saved visit that has no recordChecked", async () => {
    const backend = browserStoreStandIn();
    await makeKeptStore(backend).save(fullData());
    const r = await makeKeptStore(backend).load();
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.data.visit.recordChecked).toBeUndefined();
  });
  it("loads recordChecked true and keeps it", async () => {
    const backend = browserStoreStandIn();
    const data = fullData();
    data.visit.recordChecked = true;
    await makeKeptStore(backend).save(data);
    const r = await makeKeptStore(backend).load();
    expect(r.status === "ok" && r.data.visit.recordChecked).toBe(true);
  });
  it("refuses any other value of recordChecked", async () => {
    for (const bad of ["yes", false, 1, null]) {
      const backend = browserStoreStandIn();
      const data = { ...fullData(), visit: { ...fullData().visit, recordChecked: bad } };
      await backend.set(KEPT_KEY, { version: KEPT_VERSION, data });
      expect(await makeKeptStore(backend).load(), String(bad)).toEqual({ status: "unreadable", reason: "shape" });
    }
  });
});
