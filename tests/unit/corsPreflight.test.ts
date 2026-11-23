import { describe, expect, it } from "vitest";
import { needsCorsPreflight } from "../../src/egress/corsPreflight";

const call = (method: string, headers: Record<string, string> = {}, body?: BodyInit | null, mode?: string) =>
  needsCorsPreflight({ method, headers: new Headers(headers), body, mode });

describe("needsCorsPreflight", () => {
  it("treats a POST string body with no caller header as safelisted", () => {
    expect(call("POST", {}, "{\"a\":1}")).toBe(false);
    expect(call("GET")).toBe(false);
    expect(call("HEAD")).toBe(false);
    expect(call("POST", { "content-type": "text/plain;charset=UTF-8" }, "x")).toBe(false);
    expect(call("POST", {}, new URLSearchParams("a=1"))).toBe(false);
  });

  it("counts application/json, a custom header, and a method outside GET HEAD POST", () => {
    expect(call("POST", { "content-type": "application/json" }, "{}")).toBe(true);
    expect(call("POST", { "x-goog-api-key": "not-a-key" }, "x")).toBe(true);
    expect(call("PUT", {}, "x")).toBe(true);
    expect(call("DELETE")).toBe(true);
  });

  it("does not count no-cors or same-origin, and does not return the header value", () => {
    expect(call("POST", { "content-type": "application/json" }, "{}", "no-cors")).toBe(false);
    expect(call("POST", { "x-goog-api-key": "not-a-key" }, "x", "same-origin")).toBe(false);
    const value = call("POST", { "x-goog-api-key": "not-a-key" }, "x");
    expect(value).toBe(true);
    expect(JSON.stringify(value)).not.toContain("not-a-key");
  });

  it("counts a Range that is not one byte range, and an unsafe byte in a safelisted value", () => {
    expect(call("GET", { range: "bytes=0-10" })).toBe(false);
    expect(call("GET", { range: "bytes=0-10,20-30" })).toBe(true);
    expect(call("POST", { "content-type": "text/plain;charset=\"utf-8\"" }, "x")).toBe(true);
  });
});
