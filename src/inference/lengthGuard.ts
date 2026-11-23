// BEST EFFORT. A check before the call so a very long note is stopped early.
// It is not the real check: the device model's own error is (ruling 9, R7.1).
// It counts characters, not tokens, because token counting is not supported
// for hybrid (sdk-facts 18). It is off until results/device-token-limit.json
// holds a passing check made in a real browser (capture-and-record task 16).
import { newestResult, type ResultsLookup } from "../app/figures";
import { strings } from "../app/strings";
import { SYSTEM_PROMPT } from "./structure/createOptions";
import { VISIT_RECORD_SCHEMA } from "./structure/structure.schema";

export const TOO_LONG_LINE = strings.record.tooLong;

const SCHEMA_TEXT = JSON.stringify(VISIT_RECORD_SCHEMA);

export function checkLength(input: { note: string; hasPhoto: boolean; results: ResultsLookup }): "ok" | "tooLong" {
  const file = newestResult(input.results, "device-token-limit");
  if (!file || file.status !== "pass") return "ok";
  const bound = file.bound;
  if (typeof bound !== "number") return "ok";
  const photoAmount = typeof file.photoAmount === "number" ? file.photoAmount : 0;
  const total = input.note.length + SCHEMA_TEXT.length + SYSTEM_PROMPT.length + (input.hasPhoto ? photoAmount : 0);
  return total > bound ? "tooLong" : "ok";
}
