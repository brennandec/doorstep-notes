// Wires the propose-masks job to the Firebase AI SDK. ONLY_ON_DEVICE: the SDK
// makes no cloud call for this job and no call to the Firebase project, so it uses
// the device-only app and works with the network off (deviceApp.ts).
import { deviceOnlyService } from "./deviceApp";
import { assertDeviceUsable } from "./deviceGuard";
import type { ProposeCall, ProposeSdk } from "../inference/proposeMasks/proposeMasks.real";

export const proposeSdk: ProposeSdk = {
  async generate(call: ProposeCall) {
    await assertDeviceUsable(call.createOptions);
    const { ai, service } = await deviceOnlyService();
    const model = ai.getGenerativeModel(service, {
      mode: ai.InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: call.createOptions as never,
        promptOptions: call.promptOptions as never,
      },
    });
    const response = (await model.generateContent(call.parts as never)).response;
    return { text: response.text(), inferenceSource: String(response.inferenceSource) };
  },
};
