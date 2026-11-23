// The second reader fixture reply (second-reader task 8). In the e2e build only, a test
// can set window.__readerWho to a sentence that names an invented listed client, so the
// real-browser run can see the redaction line. Any other build gives the job unchanged.
import { describe, expect, it } from "vitest";
import { E2E_MODE, withReaderFixture } from "../../src/app/testHooks";
import { secondReaderDouble } from "../../src/inference/secondReader/secondReader.double";

const ticket = {} as never;
const input = { text: "Seen: Mould in the back bedroom.\nAgreed: Worker rings the landlord on Monday." };

describe("withReaderFixture", () => {
  it("returns the same job in every mode but e2e", async () => {
    for (const mode of ["production", "development", "test"]) {
      expect(withReaderFixture(mode, { __readerWho: "Priya Halloran" }, secondReaderDouble), mode).toBe(secondReaderDouble);
    }
  });

  it("changes nothing in the e2e build until the property is set", async () => {
    const job = withReaderFixture(E2E_MODE, {}, secondReaderDouble);
    const plain = await secondReaderDouble.run(ticket, input);
    expect(await job.run(ticket, input)).toEqual(plain);
  });

  it("names the invented client in the first guess and keeps the quotes and the source", async () => {
    const win: { __readerWho?: unknown } = {};
    const job = withReaderFixture(E2E_MODE, win, secondReaderDouble);
    win.__readerWho = "Priya Halloran, a tenant";
    const out = await job.run(ticket, input);
    expect(out.value.guesses[0]!.who).toBe("Priya Halloran, a tenant");
    expect(out.value.guesses[0]!.evidence.length).toBeGreaterThan(0);
    expect(out.inferenceSource).toBe("IN_CLOUD");
    expect(out.connected).toBe(false);
    expect(job.mode).toBe("ONLY_IN_CLOUD");
  });
});
