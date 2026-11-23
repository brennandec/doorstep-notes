import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hostedAddress } from "../e2e/device/hostedAddress";

const FIRST = "hosted address refused: the page is not on an https origin";
const SECOND = "hosted address refused: the path must start with /";

describe("hostedAddress", () => {
  it("joins the origin of a page address with a path, dropping path, query and fragment", () => {
    expect(hostedAddress("https://example.test/some/page?x=1#top", "/sw.js")).toBe("https://example.test/sw.js");
  });

  it("refuses about:blank", () => {
    expect(() => hostedAddress("about:blank", "/sw.js")).toThrow(FIRST);
  });

  it("refuses an http address", () => {
    expect(() => hostedAddress("http://example.test/", "/sw.js")).toThrow(FIRST);
  });

  it("refuses a path without a leading slash", () => {
    expect(() => hostedAddress("https://example.test/", "sw.js")).toThrow(SECOND);
  });

  it("leaves no request.get( in hostedSupport.ts whose argument does not start with hostedAddress(", () => {
    const source = readFileSync("tests/e2e/device/hostedSupport.ts", "utf8");
    const calls = [...source.matchAll(/request\.get\(\s*([^)]{0,20})/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call[1]?.startsWith("hostedAddress(")).toBe(true);
  });
});
