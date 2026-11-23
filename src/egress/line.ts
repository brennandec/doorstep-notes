// The egress result as data for a card (egress-check R14, fifth review N1, look and layout).
// One verdict line and a short table of rows. Every count comes from the check result. No count is
// written here. The wording is in the string table (src/app/strings.ts).
import { MIN_NAME_PART_LENGTH } from "../constants";
import { fill, strings } from "../app/strings";
import type { InferenceSource } from "../inference/types";
import type { Answer, CheckResult } from "./check";

export type LineKind = "pass" | "onPurpose" | "fail" | "blocked" | "offlineDevice";

export interface EgressRow {
  label: string;
  value: string;
}

export interface EgressLines {
  kind: LineKind;
  /** crossed octagon on a failure or a block, check mark otherwise */
  icon: "check" | "crossedOctagon";
  /** true for fail and blocked: printed in the failure colour, with words */
  failure: boolean;
  /** the one line that says pass or fail */
  verdict: string;
  /** the table under it: label left, value right */
  rows: EgressRow[];
  /** always present */
  standing: string;
  /** true for a fail made by the seeded test path: the card says so (egress-check R16.2) */
  seeded?: boolean;
  /** a block only: the values found in the text that would leave, for the line beside Send (egress-check R15) */
  blocked?: { listed: string[]; masked: string[] };
}

export interface LineInput {
  result: CheckResult;
  /** false when a test double answered */
  connected: boolean;
  /** true for a draft made on the device: nothing was meant to go to the cloud */
  deviceOnly?: boolean;
  minPartLength?: number;
  /** the host the request went to, once connected */
  host?: string;
  /** how that request was answered (egress-check R17); absent when not known */
  status?: Answer;
  /** who wrote the result: ON_DEVICE after a request means the SDK fell back to the device */
  source?: InferenceSource;
  /** the leak was seeded by the test path */
  seeded?: boolean;
}

const names = (list: string[]) => list.join(", ");

function rows(input: LineInput): EgressRow[] {
  const e = strings.egress;
  const r = input.result;
  const min = input.minPartLength ?? MIN_NAME_PART_LENGTH;
  const masked =
    r.maskedFound.length > 0
      ? fill(e.valueMaskedFound, { n: r.maskedFound.length, k: r.maskedChecked, names: names(r.maskedFound) })
      : fill(e.valueMasked, { n: 0, k: r.maskedChecked });
  const parts =
    r.listedFound.length > 0 ? fill(e.partsFound, { n: r.listedFound.length, m: r.listedChecked }) : e.partsNone;
  const host = input.host && input.host !== "" ? input.host : e.requestUnknownHost;
  const onDevice = input.source === "ON_DEVICE";
  const sentTo = (): string => {
    if (input.status === undefined) return fill(e.requestHost, { host });
    if (input.status === "no answer") return fill(onDevice ? e.requestNoAnswerDevice : e.requestNoAnswer, { host });
    return fill(onDevice ? e.requestAnsweredDevice : e.requestAnswered, { host, status: input.status });
  };
  const request = input.deviceOnly ? e.requestDevice : input.connected ? sentTo() : e.requestDouble;
  const out: EgressRow[] = [
    { label: e.rowMasked, value: masked },
    { label: fill(e.rowParts, { min }), value: parts },
    { label: e.rowRequest, value: request },
  ];
  if (!r.passed) {
    out.push({ label: e.rowHappened, value: e.happenedFail });
    out.push({ label: e.rowNext, value: e.nextFail });
  }
  return out;
}

/** The card shown after a send, from the check on the captured bytes. */
export function buildLines(input: LineInput): EgressLines {
  const { result: r } = input;
  const e = strings.egress;
  const m = r.listedChecked;
  const k = r.maskedChecked;
  const base = { rows: rows(input), standing: e.standing };

  if (!r.passed) {
    const verdict =
      r.listedFound.length > 0
        ? fill(e.verdictFail, { n: r.listedFound.length, m, names: names(r.listedFound) })
        : fill(e.verdictFailMasked, { n: r.maskedFound.length, k, names: names(r.maskedFound) });
    return { kind: "fail", icon: "crossedOctagon", failure: true, verdict, ...base, ...(input.seeded ? { seeded: true } : {}) };
  }

  if (input.deviceOnly) {
    return { kind: "offlineDevice", icon: "check", failure: false, verdict: fill(e.verdictOffline, { n: r.onPurposeFound.length, m }), ...base };
  }

  if (r.onPurposeFound.length > 0) {
    return {
      kind: "onPurpose",
      icon: "check",
      failure: false,
      verdict: fill(e.verdictOnPurpose, { n: r.onPurposeFound.length, m, names: names(r.onPurposeFound) }),
      ...base,
    };
  }

  return { kind: "pass", icon: "check", failure: false, verdict: fill(e.verdictPass, { n: 0, m }), ...base };
}

/** The card shown before a send, when the preview check finds a value that is not on purpose. */
/**
 * One name for each person: names on the list that belong to one person (full name and other names) are
 * shown once, by the name that was found first in that person's group.
 */
export function onePerPerson(found: string[], groups: string[][] | undefined): string[] {
  if (!groups) return found;
  const seen = new Set<number>();
  const out: string[] = [];
  for (const name of found) {
    const g = groups.findIndex((grp) => grp.includes(name));
    if (g === -1) out.push(name);
    else if (!seen.has(g)) {
      seen.add(g);
      out.push(groups[g]!.find((n) => found.includes(n)) ?? name);
    }
  }
  return out;
}

export function buildBlockedLine(result: CheckResult, groups?: string[][]): EgressLines {
  const listed = onePerPerson(result.listedFound, groups);
  // A name found in both lists is named once.
  const found = [...new Set([...listed, ...result.maskedFound])];
  return {
    kind: "blocked",
    icon: "crossedOctagon",
    failure: true,
    verdict: fill(strings.egress.verdictBlocked, { names: names(found) }),
    rows: [{ label: strings.egress.rowNext, value: found.length > 1 ? strings.egress.nextBlockedMany : strings.egress.nextBlocked }],
    standing: strings.egress.standing,
    blocked: { listed, masked: [...result.maskedFound] },
  };
}
