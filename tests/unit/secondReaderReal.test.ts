// Second reader task 4 (R1): the real job through the SDK behind the interface, with a fake SDK.
import { describe, expect, it } from "vitest";
import { strings } from "../../src/app/strings";
import { DEFAULT_CLOUD_MODEL } from "../../src/constants";
import { secondReaderText } from "../../src/inference/secondReader/instructions";
import {
  SECOND_READER_SCHEMA,
  SecondReaderFailure,
  makeSecondReaderJob,
  parseReply,
  type SecondReaderCall,
  type SecondReaderSdk,
} from "../../src/inference/secondReader/secondReader.real";

const ticket = {} as never;
const text = secondReaderText("Visit date: 2026-11-12\nPresent: [Person 1], worker\nSeen: Mould in the back bedroom.");
const GOOD = JSON.stringify({ guesses: [{ who: "a tenant in a ground-floor flat", evidence: ["Mould in the back bedroom"] }] });

function sdkReturning(reply: { text: string; inferenceSource: string } | Error) {
  const calls: SecondReaderCall[] = [];
  const sdk: SecondReaderSdk = {
    async generate(call) {
      calls.push(call);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { sdk, calls };
}

describe("the real job", () => {
  it("has mode ONLY_IN_CLOUD", () => {
    expect(makeSecondReaderJob({ sdk: sdkReturning(new Error("x")).sdk }).mode).toBe("ONLY_IN_CLOUD");
  });

  it("calls the SDK once with ONLY_IN_CLOUD and the text it was given, unchanged", async () => {
    const { sdk, calls } = sdkReturning({ text: GOOD, inferenceSource: "in_cloud" });
    await makeSecondReaderJob({ sdk }).run(ticket, { text });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.mode).toBe("ONLY_IN_CLOUD");
    expect(calls[0]!.text).toBe(text);
  });

  it("returns the guesses with source IN_CLOUD and connected true", async () => {
    const { sdk } = sdkReturning({ text: GOOD, inferenceSource: "in_cloud" });
    const r = await makeSecondReaderJob({ sdk }).run(ticket, { text });
    expect(r.inferenceSource).toBe("IN_CLOUD");
    expect(r.connected).toBe(true);
    expect(r.value.guesses).toEqual([{ who: "a tenant in a ground-floor flat", description: "", why: "", evidence: ["Mould in the back bedroom"] }]);
  });

  it("sets the cloud model name explicitly: the default, or the given name", async () => {
    const a = sdkReturning({ text: GOOD, inferenceSource: "in_cloud" });
    await makeSecondReaderJob({ sdk: a.sdk }).run(ticket, { text });
    expect(a.calls[0]!.inCloudModel).toBe(DEFAULT_CLOUD_MODEL);
    const b = sdkReturning({ text: GOOD, inferenceSource: "in_cloud" });
    await makeSecondReaderJob({ sdk: b.sdk, cloudModel: () => "model-given" }).run(ticket, { text });
    expect(b.calls[0]!.inCloudModel).toBe("model-given");
    const c = sdkReturning({ text: GOOD, inferenceSource: "in_cloud" });
    await makeSecondReaderJob({ sdk: c.sdk, cloudModel: () => "  " }).run(ticket, { text });
    expect(c.calls[0]!.inCloudModel).toBe(DEFAULT_CLOUD_MODEL);
  });

  it("passes the JSON schema for the guess list", async () => {
    const { sdk, calls } = sdkReturning({ text: GOOD, inferenceSource: "in_cloud" });
    await makeSecondReaderJob({ sdk }).run(ticket, { text });
    expect(calls[0]!.schema).toBe(SECOND_READER_SCHEMA);
    expect(SECOND_READER_SCHEMA.required).toEqual(["guesses"]);
    expect(SECOND_READER_SCHEMA.properties.guesses.items.required).toEqual(["who", "description", "why", "kind", "evidence"]);
  });

  it("discards an answer that says it came from the device", async () => {
    const { sdk } = sdkReturning({ text: GOOD, inferenceSource: "on_device" });
    await expect(makeSecondReaderJob({ sdk }).run(ticket, { text })).rejects.toMatchObject({ kind: "notInCloud" });
  });

  it("discards an answer with an unknown source", async () => {
    const { sdk } = sdkReturning({ text: GOOD, inferenceSource: "somewhere" });
    await expect(makeSecondReaderJob({ sdk }).run(ticket, { text })).rejects.toBeInstanceOf(SecondReaderFailure);
  });

  it("fails with the connection line when the SDK throws", async () => {
    const { sdk } = sdkReturning(new Error("network"));
    const err = await makeSecondReaderJob({ sdk }).run(ticket, { text }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SecondReaderFailure);
    expect((err as SecondReaderFailure).kind).toBe("unreachable");
    expect((err as SecondReaderFailure).line).toBe(strings.secondReader.needsConnection);
  });

  it("fails with a plain line when the reply is not the shape asked for", async () => {
    const { sdk } = sdkReturning({ text: "I think it is a tenant.", inferenceSource: "in_cloud" });
    const err = await makeSecondReaderJob({ sdk }).run(ticket, { text }).catch((e: unknown) => e);
    expect((err as SecondReaderFailure).kind).toBe("badReply");
    expect((err as SecondReaderFailure).line).toBe(strings.secondReader.failed);
  });
});

describe("parseReply", () => {
  it("reads the guess list", () => {
    expect(parseReply(GOOD)?.guesses[0]!.who).toBe("a tenant in a ground-floor flat");
  });

  it("reads a reply wrapped in a code fence", () => {
    expect(parseReply("```json\n" + GOOD + "\n```")?.guesses).toHaveLength(1);
  });

  it("accepts an empty list", () => {
    expect(parseReply('{"guesses":[]}')).toEqual({ guesses: [] });
  });

  it("refuses text that is not JSON", () => {
    expect(parseReply("no")).toBeNull();
  });

  it("refuses a wrong shape", () => {
    expect(parseReply('{"guesses":"a tenant"}')).toBeNull();
    expect(parseReply('{"guesses":[{"who":1,"evidence":[]}]}')).toBeNull();
    expect(parseReply('{"guesses":[{"who":"a","evidence":"b"}]}')).toBeNull();
    expect(parseReply('{"guesses":[{"who":"a","evidence":[1]}]}')).toBeNull();
    expect(parseReply("[]")).toBeNull();
    expect(parseReply("null")).toBeNull();
  });

  it("keeps only the fields it asked for", () => {
    const r = parseReply('{"guesses":[{"who":"a","evidence":["b"],"name":"extra"}],"note":"x"}');
    expect(r).toEqual({ guesses: [{ who: "a", description: "", why: "", evidence: ["b"] }] });
  });
});
