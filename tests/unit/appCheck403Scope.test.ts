// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { watchAppCheck403 } from "../../src/inference/refusal";
function mockFetch(host: string, status: number) {
  globalThis.fetch = vi.fn(async () => new Response("", { status })) as unknown as typeof fetch;
  return host;
}
describe("the 403 watcher is scoped to the App Check exchange", () => {
  it("a 403 from the MODEL endpoint does not count", async () => {
    mockFetch("firebasevertexai.googleapis.com", 403);
    const r = await watchAppCheck403(async () => {
      await fetch("https://firebasevertexai.googleapis.com/v1beta/projects/x/models/y:generateContent");
      return 1;
    });
    expect(r.saw403).toBe(false);
  });
  it("a 403 from the App Check exchange does count", async () => {
    const r = await watchAppCheck403(async () => {
      await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/x/apps/y:exchangeRecaptchaEnterpriseToken");
      return 1;
    });
    expect(r.saw403).toBe(true);
  });
});
