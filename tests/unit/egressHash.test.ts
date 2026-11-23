import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/egress/hash";

// Vectors made with the system tool `shasum -a 256` on the same UTF-8 bytes.
describe("sha256Hex", () => {
  it("hashes a short string", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("hashes the empty string", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("hashes text with accents as UTF-8", async () => {
    expect(await sha256Hex("caf\u00e9 Z\u00fcrich")).toBe("9499c84300a0f5f1afc672a3383d07450897d8bc5c6c5ffaad319c0193a86786");
  });
  it("gives the same hash for a string and its UTF-8 bytes", async () => {
    const text = "caf\u00e9 Z\u00fcrich";
    expect(await sha256Hex(new TextEncoder().encode(text))).toBe(await sha256Hex(text));
  });
  it("returns 64 lower case hex characters", async () => {
    expect(await sha256Hex("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});
