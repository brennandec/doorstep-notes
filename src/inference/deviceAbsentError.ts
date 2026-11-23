// The one error for "the device cannot answer". Thrown by the kit's absent jobs and by the
// ONLY_ON_DEVICE guard (src/firebase/deviceGuard.ts); the real jobs turn it into their "absent" failure.
export class DeviceModelAbsentError extends Error {
  constructor() {
    super("The device model is not available.");
    this.name = "DeviceModelAbsentError";
  }
}
