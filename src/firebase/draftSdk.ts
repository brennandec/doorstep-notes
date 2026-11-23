// Wires the draft job to the Firebase AI SDK. Loaded on first use.
//
// ONLY_ON_DEVICE makes no call to the Firebase project: the device model answers in
// the browser, through the device-only app. PREFER_IN_CLOUD may reach the cloud model, so
// it goes through cloudService(), which starts App Check first (sdk-facts 32 to 36).
// The cloud branch was run once against the real service on 2026-11-14: HTTP 200,
// source IN_CLOUD (results/cloud-draft-2026-11-14.json).
import { cloudService } from "./cloudService";
import { deviceOnlyService } from "./deviceApp";
import { assertDeviceUsable } from "./deviceGuard";
import type { DraftCall, DraftSdk } from "../inference/draft/draft.real";

export const draftSdk: DraftSdk = {
  async generate(call: DraftCall) {
    // A device draft makes no call to the project: it uses the device-only app and works offline.
    if (call.mode === "ONLY_ON_DEVICE") {
      await assertDeviceUsable(call.createOptions);
      const { ai, service } = await deviceOnlyService();
      const model = ai.getGenerativeModel(service, {
        mode: ai.InferenceMode.ONLY_ON_DEVICE,
        onDeviceParams: { createOptions: call.createOptions as never },
      });
      const response = (await model.generateContent(call.text)).response;
      return { text: response.text(), inferenceSource: String(response.inferenceSource) };
    }

    return cloudService().generate(
      (ai) => ({
        mode: ai.InferenceMode["PREFER_IN_CLOUD"],
        onDeviceParams: { createOptions: call.createOptions },
        inCloudParams: { model: call.inCloudModel, generationConfig: { temperature: 0 } },
      }),
      call.text,
    );
  },
};
