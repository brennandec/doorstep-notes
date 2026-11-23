import { describe, expect, it, vi } from "vitest";
import { browserStoreStandIn } from "../support/browserStoreStandIn";

describe("the stand-in for the browser store", () => {
  it("returns what it was given, as a copy", async () => {
    const s = browserStoreStandIn();
    const value = { list: ["Bea"] };
    await s.set("k", value);
    value.list.push("changed after the write");
    expect(await s.get("k")).toEqual({ list: ["Bea"] });
    const read = (await s.get("k")) as { list: string[] };
    read.list.push("changed after the read");
    expect(await s.get("k")).toEqual({ list: ["Bea"] });
  });

  it("reads nothing for a key that was never written, and removes a key", async () => {
    const s = browserStoreStandIn();
    expect(await s.get("none")).toBeUndefined();
    await s.set("a", 1);
    await s.remove("a");
    expect(await s.get("a")).toBeUndefined();
    expect(s.isEmpty()).toBe(true);
  });

  it("lets a test read what is held", async () => {
    const s = browserStoreStandIn();
    await s.set("one", "x");
    await s.set("two", { n: 2 });
    expect(s.keys()).toEqual(["one", "two"]);
    expect(s.dump()).toEqual({ one: "x", two: { n: 2 } });
    expect(s.isEmpty()).toBe(false);
    expect(s.writes()).toBe(2);
  });

  it("fails every call when told it cannot open", async () => {
    const s = browserStoreStandIn();
    s.failToOpen();
    await expect(s.get("k")).rejects.toThrow();
    await expect(s.set("k", 1)).rejects.toThrow();
    await expect(s.remove("k")).rejects.toThrow();
    s.failToOpen(false);
    await expect(s.set("k", 1)).resolves.toBeUndefined();
  });

  it("fails writes and removes but still reads when told the disk is full", async () => {
    const s = browserStoreStandIn();
    await s.set("k", "kept");
    s.failToWrite();
    await expect(s.set("k", "new")).rejects.toThrow();
    await expect(s.remove("k")).rejects.toThrow();
    expect(await s.get("k")).toBe("kept");
    expect(s.writes()).toBe(1);
  });

  it("opens no connection", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const s = browserStoreStandIn();
      await s.set("k", 1);
      await s.get("k");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
