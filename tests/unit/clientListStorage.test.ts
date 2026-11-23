import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import type { KeyValueBackend } from "../../src/storage/backend";
import { makeClientListStore } from "../../src/storage/clientList";

/** A backend whose contents the test can list, to prove storage is empty. */
function inspectableBackend(): KeyValueBackend & { keys(): string[] } {
  const map = new Map<string, unknown>();
  return {
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : undefined; },
    async set(k, v) { map.set(k, structuredClone(v)); },
    async remove(k) { map.delete(k); },
    keys: () => [...map.keys()],
  };
}

describe("client list storage (masking task 2)", () => {
  const fetchSpy = vi.fn(() => { throw new Error("no network"); });
  beforeEach(() => { vi.stubGlobal("fetch", fetchSpy); });
  afterEach(() => { vi.unstubAllGlobals(); fetchSpy.mockClear(); });

  it("saves and reads back the invented list as pasted", async () => {
    const store = makeClientListStore(inspectableBackend());
    expect(await store.load()).toBe("");
    await store.save(inventedVisit.clientList);
    expect(await store.load()).toBe(inventedVisit.clientList);
  });

  it("edits replace the saved list", async () => {
    const store = makeClientListStore(inspectableBackend());
    await store.save("Priya Halloran; ; she/her");
    await store.save("Emeka Fairbairn; ; he/him");
    expect(await store.load()).toBe("Emeka Fairbairn; ; he/him");
  });

  it("removing the list leaves storage empty", async () => {
    const backend = inspectableBackend();
    const store = makeClientListStore(backend);
    await store.save(inventedVisit.clientList);
    expect(backend.keys().length).toBeGreaterThan(0);
    await store.remove();
    expect(backend.keys()).toEqual([]);
    expect(await store.load()).toBe("");
  });

  it("makes no network request", async () => {
    const store = makeClientListStore(inspectableBackend());
    await store.save(inventedVisit.clientList);
    await store.load();
    await store.remove();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores a stored value that is not text", async () => {
    const backend = inspectableBackend();
    await backend.set("clientList", { not: "text" });
    expect(await makeClientListStore(backend).load()).toBe("");
  });

  it("has a control named Remove the list", () => {
    expect(strings.masking.removeList).toBe("Remove the list");
  });
});
