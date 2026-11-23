import { AI_SERVICE_ENABLED, CLOUD_TIER, type CloudTier } from "../constants";
import { bundledResults, newestResult, type ResultsLookup } from "./figures";
import { fill, strings } from "./strings";

export interface StandingInput {
  results: ResultsLookup;
  aiServiceEnabled: boolean;
  tier: CloudTier;
}

export interface Standing {
  writingAid: string;
  /** Present until H2 part B has a passing results file (ruling 2). */
  h2Line: string | null;
  /** "not connected" while the service is off, otherwise the tier line (ruling 15). */
  cloudLines: string[];
}

export function standingStatements(input: StandingInput): Standing {
  const s = strings.standing;
  const cloudLines = input.aiServiceEnabled
    ? [fill(s.tierLine, { tier: s.tierNames[input.tier] }), ...(input.tier === "no-cost" ? [s.tierNoCostWarning] : [])]
    : [s.cloudNotConnected, ...(input.tier === "no-cost" ? [s.tierNoCostWarning] : [])];
  return {
    writingAid: s.writingAid,
    h2Line: newestResult(input.results, "h2-part-b")?.status === "pass" ? null : s.h2NotChecked,
    cloudLines,
  };
}

export function currentStanding(): Standing {
  return standingStatements({ results: bundledResults, aiServiceEnabled: AI_SERVICE_ENABLED, tier: CLOUD_TIER });
}
