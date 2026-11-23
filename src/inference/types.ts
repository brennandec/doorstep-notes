// Smallest versions of the job interfaces the shell needs, copied from the
// capture-and-record, masking, drafting and second-reader designs.
import type { EgressTicket } from "../egress/ticket";

export type InferenceSource = "ON_DEVICE" | "IN_CLOUD";

export interface JobResult<T> {
  value: T;
  inferenceSource: InferenceSource;
  /** false when a test double answered */
  connected: boolean;
}

export interface PersonTag {
  label: string;
  role: "client" | "worker" | "other";
}

export interface VisitRecord {
  visitDate: string;
  present: PersonTag[];
  /** Why the visit happened. Absent on a record the structure job made before this field existed. */
  purpose?: string[];
  seen: string[];
  agreed: string[];
  risks: string[];
  nextSteps: string[];
}

export interface StructureInput {
  noteText: string;
  photo?: { mimeType: "image/jpeg" | "image/png"; base64: string };
}
export interface StructureJob {
  readonly mode: "ONLY_ON_DEVICE";
  run(input: StructureInput): Promise<JobResult<VisitRecord> & { fromModel?: true }>;
}

export interface Candidate {
  text: string;
  kind: "name" | "place" | "dob" | "phrase";
}
export interface ProposeMasksJob {
  readonly mode: "ONLY_ON_DEVICE";
  run(rawText: string): Promise<JobResult<Candidate[]>>;
}

export interface DraftInput {
  text: string;
}
export interface DraftOutput {
  text: string;
  /** true for a device draft */
  short: boolean;
}
export type DraftMode = "PREFER_IN_CLOUD" | "ONLY_ON_DEVICE";
export interface DraftJob {
  run(t: EgressTicket, input: DraftInput, mode: DraftMode): Promise<JobResult<DraftOutput>>;
}

export interface RewriteInput {
  text: string;
  tags: string[];
  /** the page says nothing can leave (network off, or the cloud switch off): ask the SDK for ONLY_ON_DEVICE (drafting R16.7) */
  deviceOnly?: boolean;
}
export interface RewriteJob {
  readonly mode: "PREFER_ON_DEVICE";
  run(t: EgressTicket, input: RewriteInput): Promise<JobResult<string>>;
}

export const GUESS_KINDS = ["place", "relation", "date", "role", "name", "other"] as const;
export type GuessKind = (typeof GUESS_KINDS)[number];

export interface Guess {
  who: string;
  evidence: string[];
  /** a short description of the person the reader has in mind; empty or absent in an older reply */
  description?: string;
  /** why the reader thinks so */
  why?: string;
  /** the kind of clue; absent when the reply gave none of the six words */
  kind?: GuessKind;
}
export interface SecondReaderInput {
  text: string;
}
export interface SecondReaderOutput {
  guesses: Guess[];
}
export interface SecondReaderJob {
  readonly mode: "ONLY_IN_CLOUD";
  run(t: EgressTicket, input: SecondReaderInput): Promise<JobResult<SecondReaderOutput>>;
}

export type DeviceModelState = "unavailable" | "downloadable" | "downloading" | "available";
