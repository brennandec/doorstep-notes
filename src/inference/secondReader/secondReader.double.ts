// The second reader double: answers while the cloud flag is off. It makes no
// request, and every result says connected: false, which the screen shows as
// "not connected". For the masked invented record it gives one guess, "a tenant in
// a ground-floor flat", with quotes taken from the text it was given.
import type { Guess, SecondReaderJob } from "../types";
import { recordOf } from "./instructions";

const WHO = "a tenant in a ground-floor flat";

/** The first item of a labelled line of the record, without its closing full stop. */
function firstItem(record: string, label: string): string | undefined {
  const m = new RegExp(`^${label}: (.*)$`, "m").exec(record);
  const first = m?.[1]?.split(";")[0]?.trim().replace(/[.]$/, "");
  return first === undefined || first === "" || first === "none" ? undefined : first;
}

export const secondReaderDouble: SecondReaderJob = {
  mode: "ONLY_IN_CLOUD",
  async run(_ticket, input) {
    const record = recordOf(input.text);
    const evidence = ["Seen", "Agreed"].map((l) => firstItem(record, l)).filter((q): q is string => q !== undefined);
    const guess: Guess = { who: WHO, evidence };
    return { value: { guesses: [guess] }, inferenceSource: "IN_CLOUD", connected: false };
  },
};
