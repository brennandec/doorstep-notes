// Wires the structure job to the Firebase AI SDK. ONLY_ON_DEVICE: the SDK makes no
// cloud call for this job and no call to the Firebase project, so it uses the
// device-only app and works with the network off (deviceApp.ts).
import { deviceOnlyService } from "./deviceApp";
import { assertDeviceUsable } from "./deviceGuard";
import type { StructureCall, StructureSdk } from "../inference/structure/structure.real";

export const structureSdk: StructureSdk = {
  async generate(call: StructureCall) {
    await assertDeviceUsable(call.createOptions);
    const { ai, service } = await deviceOnlyService();
    const model = ai.getGenerativeModel(service, {
      mode: ai.InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: call.createOptions as never,
        promptOptions: call.promptOptions as never,
      },
    });
    const parts = call.parts.map((p) => ("text" in p ? p : { inlineData: p.inlineData }));
    const response = (await model.generateContent(parts as never)).response;
    return { text: response.text(), inferenceSource: String(response.inferenceSource) };
  },
  measure: measureStructureInput,
};

interface MeasurableSession {
  destroy?(): void;
  measureInputUsage?(input: unknown): Promise<number>;
  inputQuota?: number;
}

/**
 * H35a D3: the model session's own measure of the note: measureInputUsage over the text parts against
 * inputQuota. Called only after the model's call failed with a QuotaExceededError that carried no numbers.
 * It makes a session from the same create options; it starts no download, because the call that failed had one.
 * Declared after the object so the line of the model call above stays where the README names it.
 */
async function measureStructureInput(call: StructureCall): Promise<{ usage: number; quota: number } | null> {
  const lm = (globalThis as { LanguageModel?: { create?(o?: unknown): Promise<MeasurableSession> } }).LanguageModel;
  if (!lm || typeof lm.create !== "function") return null;
  let session: MeasurableSession | undefined;
  try {
    session = await lm.create(call.createOptions);
    if (typeof session.measureInputUsage !== "function" || typeof session.inputQuota !== "number") return null;
    const text = call.parts.map((p) => ("text" in p ? p.text : "")).join("");
    const usage = await session.measureInputUsage(text);
    return typeof usage === "number" ? { usage, quota: session.inputQuota } : null;
  } catch {
    return null;
  } finally {
    session?.destroy?.();
  }
}
