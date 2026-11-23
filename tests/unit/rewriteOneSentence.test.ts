// Drafting task 18 (browser document, fact 5): the rewrite job asks for exactly one
// rewritten sentence and nothing else, and refuses a reply that is a list of options.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strings } from "../../src/app/strings";
import { REWRITE_INSTRUCTIONS, rewriteText } from "../../src/inference/rewrite/instructions";
import {
  REWRITE_SYSTEM_PROMPT,
  RewriteFailure,
  makeRewriteJob,
  singleSentence,
  type RewriteCall,
} from "../../src/inference/rewrite/rewrite.real";

const probe = JSON.parse(readFileSync("results/device-model-probe-2026-11-13-firebase-sdk.json", "utf8")) as {
  result: { steps: Record<string, { text?: string; source?: string }> };
};
/** The reply the built-in model gave to a bare "rewrite in plainer words" prompt on 2026-11-13. */
const RECORDED = probe.result.steps["PREFER_ON_DEVICE text"]!.text!;

const ticket = {} as never;
const jobWith = (reply: string, calls: RewriteCall[] = []) =>
  makeRewriteJob({
    cloudEnabled: false,
    state: async () => "available",
    sdk: {
      async generate(call) {
        calls.push(call);
        return { text: reply, inferenceSource: "on_device" };
      },
    },
  });

describe("the recorded reply is the case this check exists for", () => {
  it("is a list of options with a recommendation, as the browser document says", () => {
    expect(RECORDED).toMatch(/Here are a few options/);
    expect(RECORDED.split("\n").length).toBeGreaterThan(3);
  });

  it("is refused as not one sentence", () => {
    expect(singleSentence(RECORDED)).toBeNull();
  });

  it("is refused by the job with the plain line, and nothing from it is returned", async () => {
    const err = await jobWith(RECORDED).run(ticket, { text: "x", tags: [] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RewriteFailure);
    expect((err as RewriteFailure).kind).toBe("notOneSentence");
    expect((err as RewriteFailure).line).toBe("The rewrite was not one sentence, so it was not used.");
    expect(strings.drafting.rewriteNotOneSentence).toBe("The rewrite was not one sentence, so it was not used.");
  });

  it("is refused even if its first line alone would look like a sentence", () => {
    const firstLineOnly = RECORDED.split("\n")[0]!;
    expect(singleSentence(`${firstLineOnly}\n\nMore text.`)).toBeNull();
  });
});

describe("the check keeps a real one-sentence answer", () => {
  it("accepts one sentence, with or without surrounding quotation marks", () => {
    expect(singleSentence("The tenant has had no hot water since Friday.")).toBe("The tenant has had no hot water since Friday.");
    expect(singleSentence('"The tenant has had no hot water since Friday."')).toBe("The tenant has had no hot water since Friday.");
    expect(singleSentence("  [Person 1] posts the form on Friday and [Person 2] helps.\n")).toBe(
      "[Person 1] posts the form on Friday and [Person 2] helps.",
    );
  });

  it("accepts a sentence that holds a tag, a comma and a semicolon", () => {
    expect(singleSentence("[Person 1] will post the form; [Person 2] will help, if asked.")).not.toBeNull();
  });

  it("refuses a bullet, a numbered line, bold text, two sentences and an empty reply", () => {
    for (const bad of [
      "* The tenant has had no hot water since Friday.",
      "- The tenant has had no hot water since Friday.",
      "1. The tenant has had no hot water since Friday.",
      "**The tenant has had no hot water since Friday.**",
      "The tenant has had no hot water. It stopped on Friday.",
      "The tenant has had no hot water. [Person 1] rang the landlord.",
      "Is there hot water? No.",
      "",
      "   ",
    ]) {
      expect(singleSentence(bad), bad).toBeNull();
    }
  });
});

describe("the job asks for exactly one sentence", () => {
  it("says so in both fixed instructions and in the system prompt", () => {
    for (const text of [REWRITE_INSTRUCTIONS.shorter, REWRITE_INSTRUCTIONS.plainer, REWRITE_SYSTEM_PROMPT]) {
      expect(text).toMatch(/exactly one rewritten sentence and nothing else/);
      expect(text).toMatch(/No list, no options/);
    }
  });

  it("sends the instructions and the one sentence to the model, nothing more", async () => {
    const calls: RewriteCall[] = [];
    const sentence = "[Person 1] posts the form on Friday.";
    const text = rewriteText("plainer", sentence);
    await jobWith("[Person 1] will post the form on Friday.", calls).run(ticket, { text, tags: ["[Person 1]"] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.text).toBe(`${REWRITE_INSTRUCTIONS.plainer}\n\nSentence: ${sentence}`);
    expect(calls[0]!.createOptions.initialPrompts[0]!.content[0]!.value).toBe(REWRITE_SYSTEM_PROMPT);
  });
});
