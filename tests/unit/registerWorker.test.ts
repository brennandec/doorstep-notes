import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { registerWorker } from "../../src/app/registerWorker";

type Reg = (url: string) => Promise<unknown>;

function env(over: { prod?: boolean; readyState?: DocumentReadyState; register?: Reg | null } = {}) {
  const listeners: { type: string; fn: () => void }[] = [];
  const notes: string[] = [];
  const register = vi.fn<Reg>(over.register ?? (() => Promise.resolve({})));
  const e = {
    prod: over.prod ?? true,
    doc: { readyState: over.readyState ?? "complete" } as Pick<Document, "readyState">,
    win: { addEventListener: (type: string, fn: () => void) => void listeners.push({ type, fn }) } as unknown as Pick<Window, "addEventListener">,
    nav: over.register === null ? {} : { serviceWorker: { register } },
    note: (s: string) => void notes.push(s),
  };
  return { e, listeners, notes, register };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("registerWorker", () => {
  it("registers at once when the page has already loaded", async () => {
    const t = env({ readyState: "complete" });
    expect(registerWorker(t.e)).toBe("now");
    expect(t.register).toHaveBeenCalledTimes(1);
    expect(t.register).toHaveBeenCalledWith("/sw.js");
    expect(t.listeners).toHaveLength(0);
    await flush();
    expect(t.notes).toEqual(["registered"]);
  });

  it("waits for load when the page is still loading", async () => {
    const t = env({ readyState: "loading" });
    expect(registerWorker(t.e)).toBe("on-load");
    expect(t.register).not.toHaveBeenCalled();
    expect(t.listeners.map((l) => l.type)).toEqual(["load"]);
    t.listeners[0]!.fn();
    expect(t.register).toHaveBeenCalledTimes(1);
    expect(t.register).toHaveBeenCalledWith("/sw.js");
    await flush();
    expect(t.notes).toEqual(["registered"]);
  });

  it("does nothing outside a production build", () => {
    const t = env({ prod: false });
    expect(registerWorker(t.e)).toBe("off");
    expect(t.register).toHaveBeenCalledTimes(0);
    expect(t.listeners).toHaveLength(0);
    expect(t.notes).toEqual(["off"]);
  });

  it("does nothing when the browser has no service worker", () => {
    const t = env({ register: null });
    expect(registerWorker(t.e)).toBe("off");
    expect(t.listeners).toHaveLength(0);
    expect(t.notes).toEqual(["off"]);
  });

  it("a register that rejects does not throw, leaves no unhandled rejection, and notes the error name only", async () => {
    const unhandled: unknown[] = [];
    const on = (r: unknown) => void unhandled.push(r);
    process.on("unhandledRejection", on);
    try {
      const err = new Error("secret message text");
      err.name = "SecurityError";
      const t = env({ register: () => Promise.reject(err) });
      expect(() => registerWorker(t.e)).not.toThrow();
      await flush();
      await flush();
      expect(unhandled).toEqual([]);
      expect(t.notes).toEqual(["failed: SecurityError"]);
      expect(t.notes.join(" ")).not.toContain("secret message text");
    } finally {
      process.off("unhandledRejection", on);
    }
  });

  it("notes once per attempt", async () => {
    const t = env({ readyState: "loading" });
    registerWorker(t.e);
    expect(t.notes).toEqual([]);
    t.listeners[0]!.fn();
    await flush();
    expect(t.notes).toHaveLength(1);
  });

  it("main.ts calls registerWorker once and holds no load listener for the worker", () => {
    const src = readFileSync(new URL("../../src/app/main.ts", import.meta.url), "utf8");
    expect(src.split("registerWorker(").length - 1).toBe(1);
    expect(src).not.toContain('addEventListener("load"');
  });
});
