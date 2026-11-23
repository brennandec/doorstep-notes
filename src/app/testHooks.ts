// Test-only hooks. They exist only in a build made with mode "e2e" (npm run build:e2e,
// into dist-e2e/, which git ignores). main.ts reads them behind a check of the build
// mode, so the production build drops this code.
import type { RewriteJob, SecondReaderJob } from "../inference/types";

/** The Vite mode of the test build. */
export const E2E_MODE = "e2e";

/**
 * The stand-in switch (shell-and-offline R41.2). A real-browser spec that tests the test doubles sets
 * window.__cloudStandIn to true before the page starts. The cloud switch is then off for that page, so
 * the draft, the rewrite and the second reader use their doubles and say "not connected". It can only
 * turn the cloud off, never on. Any build but e2e ignores it.
 */
export function cloudSwitchFrom(mode: string, win: { __cloudStandIn?: unknown }, configured: boolean): boolean {
  if (mode !== E2E_MODE) return configured;
  return win.__cloudStandIn === true ? false : configured;
}

/**
 * The seeded leak (egress-check R6.2). A real-browser test sets window.__seedLeak to an
 * invented listed name. The send path appends it to the body after the preview and
 * before the egress check, to prove the check can fail. Nothing in any other mode.
 */
export function seedLeakFrom(mode: string, win: { __seedLeak?: unknown }): ((body: Uint8Array) => Uint8Array) | undefined {
  if (mode !== E2E_MODE) return undefined;
  const name = win.__seedLeak;
  if (typeof name !== "string" || name === "") return undefined;
  return (body) => {
    const extra = new TextEncoder().encode(` ${name}`);
    const out = new Uint8Array(body.length + extra.length);
    out.set(body, 0);
    out.set(extra, body.length);
    return out;
  };
}

/**
 * The second reader fixture reply (second-reader task 8). A real-browser test sets
 * window.__readerWho to a sentence that names an invented listed client, to see the
 * redaction line. The wrapper changes only the words of the first guess. Any build
 * but e2e gets the job back unchanged.
 */
export function withReaderFixture(mode: string, win: { __readerWho?: unknown }, job: SecondReaderJob): SecondReaderJob {
  if (mode !== E2E_MODE) return job;
  return {
    mode: job.mode,
    async run(ticket, input) {
      const out = await job.run(ticket, input);
      const who = win.__readerWho;
      if (typeof who !== "string" || who === "" || out.value.guesses.length === 0) return out;
      const [first, ...rest] = out.value.guesses;
      return { ...out, value: { ...out.value, guesses: [{ ...first!, who }, ...rest] } };
    },
  };
}

/**
 * The rewrite fixture reply (drafting R10.7, V6). A real-browser test sets window.__rewriteTo to
 * the words the job answers with, for example a sentence that names an invented listed client,
 * to see the answer go through the masker before it replaces the sentence. Any build but e2e
 * gets the job back unchanged.
 */
export function withRewriteFixture(mode: string, win: { __rewriteTo?: unknown }, job: RewriteJob): RewriteJob {
  if (mode !== E2E_MODE) return job;
  return {
    mode: job.mode,
    async run(ticket, input) {
      const out = await job.run(ticket, input);
      const to = win.__rewriteTo;
      return typeof to === "string" && to !== "" ? { ...out, value: to } : out;
    },
  };
}
