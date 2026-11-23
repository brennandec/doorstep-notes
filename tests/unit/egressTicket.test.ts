// Drafting task 3 (R8.2): a cloud job cannot be called without a ticket, and only
// src/egress/send.ts makes one. The `@ts-expect-error` lines are checked by the type check.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeLedger } from "../../src/egress/ledger";
import { makePreview, send } from "../../src/egress/send";
import { draftDouble, rewriteDouble, secondReaderDouble } from "../../src/inference/doubles";
import type { DraftJob } from "../../src/inference/types";

const walk = (p: string): string[] =>
  statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => walk(join(p, n))) : [p];

describe("EgressTicket", () => {
  it("is required to call a cloud job (type check)", async () => {
    const job: DraftJob = draftDouble;
    // @ts-expect-error a draft job cannot be called without a ticket
    const missing = job.run({ text: "x" }, "PREFER_IN_CLOUD");
    // @ts-expect-error a plain object is not a ticket
    const fake = job.run({}, { text: "x" }, "PREFER_IN_CLOUD");
    // @ts-expect-error a rewrite cannot be called without a ticket
    const rewrite = rewriteDouble.run({ text: "x", tags: [] });
    // @ts-expect-error the second reader cannot be called without a ticket
    const reader = secondReaderDouble.run({ text: "x" });
    await Promise.allSettled([missing, fake, rewrite, reader]);
    expect(true).toBe(true);
  });

  it("is made inside send.ts and nowhere else in src", () => {
    const makers = walk("src")
      .filter((f) => /\.ts$/.test(f))
      .filter((f) => /\bas\s+EgressTicket\b|issueTicket/.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")));
    expect(makers).toEqual(["src/egress/send.ts"]);
  });

  it("is handed to the job by send(), and only by it", async () => {
    const preview = makePreview("[Person 1] was seen.", { listedNames: [], surfaceForms: [], sentOnPurpose: [] });
    let got: unknown;
    await send(
      {
        preview,
        job: "draft",
        mode: "PREFER_IN_CLOUD",
        run: async (ticket, text) => {
          got = ticket;
          return draftDouble.run(ticket, { text }, "PREFER_IN_CLOUD");
        },
      },
      { listedNames: [], surfaceForms: [], sentOnPurpose: [], ledger: makeLedger() },
    );
    expect(got).toBeDefined();
  });
});
