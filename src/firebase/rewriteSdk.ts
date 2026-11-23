// Wires the rewrite job to the Firebase AI SDK. Loaded on first use.
//
// With the cloud service off the job asks for ONLY_ON_DEVICE, which makes no call to
// the Firebase project. With it on, PREFER_ON_DEVICE may reach the cloud model, so it goes
// through cloudService(), which starts App Check first. Run once against the real service
// (results/rewrite-real-service.json).
import { cloudService } from "./cloudService";
import { deviceOnlyService } from "./deviceApp";
import { assertDeviceUsable } from "./deviceGuard";
import type { RewriteCall, RewriteSdk } from "../inference/rewrite/rewrite.real";

export const rewriteSdk: RewriteSdk = {
  async generate(call: RewriteCall) {
    // ONLY_ON_DEVICE makes no call to the project: the device-only app, which works offline.
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
        mode: ai.InferenceMode["PREFER_ON_DEVICE"],
        onDeviceParams: { createOptions: call.createOptions },
        inCloudParams: { model: call.inCloudModel },
      }),
      call.text,
    );
  },
};
