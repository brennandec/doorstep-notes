// The rewrite double: answers while the cloud service is off and the device
// cannot. It returns the sentence unchanged, makes no request, and says
// connected: false, which the screen shows as "not connected".
import { sentenceOf } from "./instructions";
import type { RewriteJob } from "../types";

export const rewriteDouble: RewriteJob = {
  mode: "PREFER_ON_DEVICE",
  async run(_t, input) {
    return { value: sentenceOf(input.text) || input.text, inferenceSource: "IN_CLOUD", connected: false };
  },
};
