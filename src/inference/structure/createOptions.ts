// Builds onDeviceParams.createOptions for the structure job (sdk-facts 29, 30).
// Image input is declared only when a photo is attached (ruling 8).

export const SYSTEM_PROMPT =
  "You turn a caseworker's rough visit note into a visit record. " +
  "Reply with JSON only. Fields: visitDate (the date words exactly as the note writes them, for example 12/11, never converted or completed, with no year or month name added; empty text if the note gives no date), " +
  "present (people at the visit, each with a label and a role of client, worker or other), " +
  "seen (what was seen), agreed (what was agreed), risks, nextSteps. " +
  "Use the words of the note. If something is not in the note, leave it out and use an empty list. " +
  "Do not add anything that is not in the note.";

export interface InputKind { hasPhoto: boolean }

type ExpectedInput = { type: "text"; languages: string[] } | { type: "image" };

export interface DeviceCreateOptions {
  expectedInputs: ExpectedInput[];
  expectedOutputs: { type: "text"; languages: string[] }[];
  initialPrompts: { role: "system"; content: { type: "text"; value: string }[] }[];
}

export function buildAvailabilityOptions(kind: InputKind): Pick<DeviceCreateOptions, "expectedInputs" | "expectedOutputs"> {
  const expectedInputs: ExpectedInput[] = [{ type: "text", languages: ["en"] }];
  if (kind.hasPhoto) expectedInputs.push({ type: "image" });
  return { expectedInputs, expectedOutputs: [{ type: "text", languages: ["en"] }] };
}

export function buildCreateOptions(kind: InputKind): DeviceCreateOptions {
  return {
    ...buildAvailabilityOptions(kind),
    initialPrompts: [{ role: "system", content: [{ type: "text", value: SYSTEM_PROMPT }] }],
  };
}
