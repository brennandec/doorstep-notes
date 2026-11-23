// Test double for unit tests only. The built app never chooses it (ruling 23):
// with the device model absent the job is not called and the device-absent line
// shows. It makes no request. Candidates fit the invented note.
import type { ProposeMasksJob } from "../types";

export const proposeMasksDouble: ProposeMasksJob = {
  mode: "ONLY_ON_DEVICE",
  async run() {
    return {
      value: [
        { text: "Bea", kind: "name" },
        { text: "14 Alder Court", kind: "place" },
        { text: "3/3/87", kind: "dob" },
      ],
      inferenceSource: "ON_DEVICE",
      connected: false,
    };
  },
};
