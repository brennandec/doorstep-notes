// The Firebase app for device-only calls. ONLY_ON_DEVICE makes no call to the project
// (browser document, ruling 23: observed with a placeholder config), so these calls need
// no config from the project. That matters offline: the project config is fetched from the
// network, and with the network off that fetch fails, which would stop every device job.
// The values below are placeholders, not keys. The app has its own name, so a cloud call
// that needs the real config never picks it up.
import type { FirebaseApp } from "firebase/app";

export const DEVICE_APP_NAME = "device-only";

export const DEVICE_ONLY_CONFIG = {
  apiKey: "device-only",
  projectId: "device-only",
  appId: "1:0:web:device-only",
} as const;

let modules: Promise<[typeof import("firebase/app"), typeof import("firebase/ai")]> | undefined;

/** Starts the import of the two modules the device path needs, once. A failed import is not kept, so the next call tries again. Makes no call and makes no app. */
export function preloadDeviceModules() {
  modules ??= Promise.all([import("firebase/app"), import("firebase/ai")]).catch((e: unknown) => {
    modules = undefined;
    throw e;
  });
  return modules;
}

export async function deviceOnlyService() {
  const [{ initializeApp, getApps }, ai] = await preloadDeviceModules();
  const app: FirebaseApp = getApps().find((a) => a.name === DEVICE_APP_NAME) ?? initializeApp({ ...DEVICE_ONLY_CONFIG }, DEVICE_APP_NAME);
  return { ai, service: ai.getAI(app, { backend: new ai.GoogleAIBackend() }) };
}
