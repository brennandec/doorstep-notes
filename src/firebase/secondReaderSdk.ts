// Wires the second reader job to the Firebase AI SDK. Loaded on first use.
//
// ONLY_IN_CLOUD always reaches the cloud model, so it goes through cloudService(), which starts
// App Check first (required, sdk-facts 32 to 36). The kit calls this wrapper only when the cloud
// is configured and the switch is on; until then the second reader double answers and no request
// is made. Run once against the real service on 2026-11-14 (results/second-reader-real-service.json).
import { cloudService } from "./cloudService";
import type { SecondReaderCall, SecondReaderSdk } from "../inference/secondReader/secondReader.real";

export const secondReaderSdk: SecondReaderSdk = {
  async generate(call: SecondReaderCall) {
    return cloudService().generate(
      (ai) => ({
        mode: ai.InferenceMode["ONLY_IN_CLOUD"],
        inCloudParams: {
          model: call.inCloudModel,
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: call.schema },
        },
      }),
      call.text,
    );
  },
};
