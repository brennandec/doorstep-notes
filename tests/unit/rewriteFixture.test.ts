// drafting task 21 (V6, bundled half). In the e2e build only, a real-browser test can set
// window.__rewriteTo to the words the rewrite job answers with, so the run can see an invented
// listed name come back and be replaced by its tag. Any other build gives the job unchanged.
import { describe, expect, it } from "vitest";
import { E2E_MODE, withRewriteFixture } from "../../src/app/testHooks";
import { rewriteDouble } from "../../src/inference/rewrite/rewrite.double";

const ticket = {} as never;
const input = { text: "Rewrite this sentence: Mould in the back bedroom." } as never;

describe("withRewriteFixture", () => {
  it("returns the same job in every mode but e2e", () => {
    for (const mode of ["production", "development", "test"]) {
      expect(withRewriteFixture(mode, { __rewriteTo: "Priya Halloran" }, rewriteDouble), mode).toBe(rewriteDouble);
    }
  });

  it("changes nothing in the e2e build until the property is set", async () => {
    const job = withRewriteFixture(E2E_MODE, {}, rewriteDouble);
    expect(await job.run(ticket, input)).toEqual(await rewriteDouble.run(ticket, input));
  });

  it("answers with the given words and keeps the source and the not-connected flag", async () => {
    const win: { __rewriteTo?: unknown } = {};
    const job = withRewriteFixture(E2E_MODE, win, rewriteDouble);
    win.__rewriteTo = "Priya Halloran saw mould.";
    const out = await job.run(ticket, input);
    expect(out.value).toBe("Priya Halloran saw mould.");
    expect(out.inferenceSource).toBe("IN_CLOUD");
    expect(out.connected).toBe(false);
    expect(job.mode).toBe("PREFER_ON_DEVICE");
  });
});
