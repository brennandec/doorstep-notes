// The tier notices, in one place. The paid wording comes from
// docs/decisions/2026-11-14-cloud-tier.md (terms read 2026-11-14). The no-cost
// wording is WORDING TO BE CONFIRMED by the product
// owner against the provider's current terms (OPEN-QUESTIONS 1). Shown wherever
// something is about to be sent.
import { NOTICE_RETENTION_DAYS, type CloudTier } from "../constants";
import { fill } from "./strings";

export const NO_COST_NOTICE =
  "On the no-cost tier, what is sent may be used by the provider to improve its products and may be read by reviewers. The provider says not to send sensitive or personal information on that tier. This demo uses invented people only.";

/** Template: {days} comes from NOTICE_RETENTION_DAYS in src/constants.ts, which holds its source. */
export const RETENTION_NOTICE =
  "The provider keeps what is sent and what it answers for {days} days to detect misuse.";

export const PAID_NOTICE =
  "This project runs on the paid tier of the Gemini Developer API, through Firebase AI Logic. Google says it does not use prompts or responses on the paid tier to improve its products. It keeps them for a limited period to detect misuse. This demo uses invented people only.";

/** Shown while the cloud flag is off: nothing is sent, a fixed sample answers. */
export const NOT_CONNECTED_NOTICE =
  "The cloud is off. Nothing is sent, a fixed sample answers. Invented people only.";

export function sendNotice(tier: CloudTier): string {
  return tier === "no-cost" ? NO_COST_NOTICE : PAID_NOTICE;
}

/** The notice for the zone 2 block: the not-connected line, or the tier notice with the retention point. */
export function noticeFor(cloud: boolean, tier: CloudTier): string {
  if (!cloud) return NOT_CONNECTED_NOTICE;
  // The paid tier's data-use section names no number of days (decision file, ruling 2), so none is stated.
  if (tier !== "no-cost") return PAID_NOTICE;
  return `${NO_COST_NOTICE} ${fill(RETENTION_NOTICE, { days: NOTICE_RETENTION_DAYS })}`;
}
