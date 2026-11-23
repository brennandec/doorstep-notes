// Run order check (measurement task 9, R10.1).
// The order is: set, exact, device, cold start. This lists which results files
// exist and which read "not measured", and flags a result that exists while an
// earlier step has none. It writes nothing.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readResults } from "./results";

/** The files of measurement R6.1. */
export const RESULT_FILES = [
  "synthetic-set", "catch-rate", "misses", "device-model-check", "cold-start", "h1", "h2-part-a", "h2-part-b", "h4",
  "device-structured-output", "device-token-limit", "draft-network-drop",
] as const;

export type State = "present" | "not measured" | "missing" | "unreadable";

export interface FileState {
  file: string;
  state: State;
  detail?: string | undefined;
}

export interface StepState {
  step: "set" | "exact" | "device" | "cold start";
  state: State;
  detail?: string | undefined;
}

export interface RunOrder {
  files: FileState[];
  steps: StepState[];
  problems: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const reasonOf = (o: Obj | undefined) => (o && typeof o["reason"] === "string" ? o["reason"] : undefined);

function read(root: string, name: string): { exists: boolean; body?: Obj | undefined } {
  const exists = existsSync(join(resolve(root, "results"), `${name}.json`));
  return { exists, body: exists ? readResults(name, root) : undefined };
}

function fileState(root: string, name: string): FileState {
  const { exists, body } = read(root, name);
  if (!exists) return { file: name, state: "missing" };
  if (!body) return { file: name, state: "unreadable" };
  if (body["status"] === "miss") return { file: name, state: "not measured", detail: reasonOf(body) };
  if (name === "cold-start" && typeof body["seconds"] !== "number") return { file: name, state: "not measured", detail: reasonOf(body) };
  return { file: name, state: "present" };
}

export function checkRunOrder(root = process.cwd()): RunOrder {
  const files = RESULT_FILES.map((n) => fileState(root, n));
  const byName = (n: string) => files.find((f) => f.file === n)!;

  const set = byName("synthetic-set");
  const catchFile = read(root, "catch-rate");
  const cold = byName("cold-start");

  const exactOk = catchFile.body !== undefined && isObj(catchFile.body["exact"]);
  const exact: StepState = {
    step: "exact",
    state: !catchFile.exists ? "missing" : !catchFile.body ? "unreadable" : exactOk ? "present" : "missing",
  };

  let device: StepState;
  const part = catchFile.body?.["device"];
  if (!catchFile.exists || !catchFile.body) device = { step: "device", state: exact.state === "unreadable" ? "unreadable" : "missing" };
  else if (isObj(part) && part["status"] === "not measured") device = { step: "device", state: "not measured", detail: reasonOf(part) };
  else if (isObj(part) && typeof part["n"] === "number") device = { step: "device", state: "present" };
  else device = { step: "device", state: "missing" };

  const steps: StepState[] = [
    { step: "set", state: set.state, detail: set.detail },
    exact,
    device,
    { step: "cold start", state: cold.state, detail: cold.detail },
  ];

  const label = (s: StepState["step"]) => (s === "set" ? "synthetic set" : s);
  const problems: string[] = [];
  steps.forEach((later, i) => {
    if (later.state !== "present") return;
    for (const earlier of steps.slice(0, i)) {
      if (earlier.state === "missing") problems.push(`The ${label(later.step)} result exists but the ${label(earlier.step)} result does not.`);
    }
  });
  return { files, steps, problems };
}

export function formatRunOrder(r: RunOrder): string {
  const line = (name: string, s: State, detail?: string) => `  ${name}: ${s}${detail ? ` (${detail})` : ""}`;
  return [
    "Run order: set, exact, device, cold start.",
    ...r.steps.map((s) => line(s.step, s.state, s.detail)),
    "Results files:",
    ...r.files.map((f) => line(f.file, f.state, f.detail)),
    ...(r.problems.length ? ["Problems:", ...r.problems.map((p) => `  ${p}`)] : []),
  ].join("\n");
}

export function main(): void {
  console.log(formatRunOrder(checkRunOrder()));
}
