// The two switches are read here and nowhere else (ruling 23, requirement R9).
//   device: the browser's report on the device model. Device jobs are real only
//           when it is "available", whether or not the cloud service is enabled.
//   cloud:  AI_SERVICE_ENABLED. While off, cloud jobs use the test double.
import { AI_SERVICE_ENABLED } from "../constants";
import { DeviceModelAbsentError } from "./deviceAbsentError";
import { draftDouble, rewriteDouble, secondReaderDouble } from "./doubles";
import type {
  DeviceModelState,
  DraftJob,
  ProposeMasksJob,
  RewriteJob,
  SecondReaderJob,
  StructureJob,
} from "./types";

export interface Switches {
  device: DeviceModelState;
  cloud: boolean;
}

/** The real jobs, built by the specs that own them. The SDK is touched only inside these. */
export interface RealJobs {
  structure: StructureJob;
  proposeMasks: ProposeMasksJob;
  draft: DraftJob;
  rewrite: RewriteJob;
  secondReader: SecondReaderJob;
}
export interface FirebaseDeps {
  real: RealJobs;
}

export { DeviceModelAbsentError };

export type Choice = "real" | "double" | "absent";

export interface InferenceKit {
  structure: StructureJob;
  proposeMasks: ProposeMasksJob;
  draft: DraftJob;
  rewrite: RewriteJob;
  secondReader: SecondReaderJob;
  /** What each job resolved to, for the status bar and for tests. */
  plan: {
    structure: Choice;
    proposeMasks: Choice;
    /** the PREFER_IN_CLOUD branch of the draft */
    draftOnline: Choice;
    /** the ONLY_ON_DEVICE branch of the draft */
    draftOffline: Choice;
    rewrite: Choice;
    secondReader: Choice;
  };
}

export function currentSwitches(device: DeviceModelState): Switches {
  return { device, cloud: AI_SERVICE_ENABLED };
}

export function makeKit(sw: Switches, deps: FirebaseDeps): InferenceKit {
  const deviceReady = sw.device === "available";
  const real = deps.real;

  const absentStructure: StructureJob = {
    mode: "ONLY_ON_DEVICE",
    async run() {
      throw new DeviceModelAbsentError();
    },
  };
  const absentPropose: ProposeMasksJob = {
    mode: "ONLY_ON_DEVICE",
    async run() {
      throw new DeviceModelAbsentError();
    },
  };

  const onlineDraft = sw.cloud ? real.draft : draftDouble;
  const draft: DraftJob = {
    async run(t, input, mode) {
      if (mode === "ONLY_ON_DEVICE") {
        if (!deviceReady) throw new DeviceModelAbsentError();
        return real.draft.run(t, input, mode);
      }
      return onlineDraft.run(t, input, mode);
    },
  };

  // Rewrite is PREFER_ON_DEVICE: real when the device can answer or the cloud is on.
  const rewriteChoice: Choice = deviceReady || sw.cloud ? "real" : "double";

  return {
    structure: deviceReady ? real.structure : absentStructure,
    proposeMasks: deviceReady ? real.proposeMasks : absentPropose,
    draft,
    rewrite: rewriteChoice === "real" ? real.rewrite : rewriteDouble,
    secondReader: sw.cloud ? real.secondReader : secondReaderDouble,
    plan: {
      structure: deviceReady ? "real" : "absent",
      proposeMasks: deviceReady ? "real" : "absent",
      draftOnline: sw.cloud ? "real" : "double",
      draftOffline: deviceReady ? "real" : "absent",
      rewrite: rewriteChoice,
      secondReader: sw.cloud ? "real" : "double",
    },
  };
}
