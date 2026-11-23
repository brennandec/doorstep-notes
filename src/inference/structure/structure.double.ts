// Test double for unit tests only. The built app never chooses it (ruling 23):
// with the device model absent the job is not called and the R6.3 line shows.
// It makes no request.
import { inventedVisit } from "../../app/example/inventedVisit";
import type { StructureJob } from "../types";

export const structureDouble: StructureJob = {
  mode: "ONLY_ON_DEVICE",
  async run() {
    return { value: structuredClone(inventedVisit.preparedRecord), inferenceSource: "ON_DEVICE", connected: false };
  },
};
