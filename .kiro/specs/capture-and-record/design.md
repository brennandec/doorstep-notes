# Capture and record: design

Refined by rulings 8, 9, 10, 19, 20, 23, the look and layout and the browser on this computer.

## Modules

- `src/app/zones/note.ts` zone 1: note area, camera control, "Make the record", record editor with chips, device model line, "Try an invented visit".
- `src/app/example/inventedVisit.ts` the invented note, the 12-name client list and the prepared record (requirements R10).
- `src/inference/structure/` `StructureJob` interface, `structure.real.ts`, `structure.double.ts` (unit tests only), `structure.schema.ts`, `createOptions.ts`.
- `src/inference/deviceModel.ts` availability, `initializeDeviceModel()` wrapper, progress events.
- `src/inference/lengthGuard.ts` best-effort guard; reads `results/device-token-limit.json` through `src/app/figures.ts`.
- `src/storage/notes.ts` raw note and photo at rest, this browser only (IndexedDB).
- `src/storage/records.ts` the visit record at rest, this browser only.
- `tests/e2e/device/structuredOutput.spec.ts`, `tokenLimit.spec.ts`, `h1.spec.ts`, `coldStart.spec.ts` DEVICE MODEL checks through the one fixture.
- `tests/e2e/bundled/captureRecorder.spec.ts`, `h6.spec.ts` BUNDLED checks.

## Data shapes

```ts
type InferenceSource = "ON_DEVICE" | "IN_CLOUD";

interface JobResult<T> {
  value: T;
  inferenceSource: InferenceSource;
  connected: boolean;   // false when a test double answered
}

interface VisitRecord {
  visitDate: string;            // "2026-11-12" or "" when not found
  present: PersonTag[];
  seen: string[];
  agreed: string[];
  risks: string[];
  nextSteps: string[];
}
interface PersonTag { label: string; role: "client" | "worker" | "other" }

interface StructureInput { noteText: string; photo?: { mimeType: "image/jpeg" | "image/png"; base64: string } }

interface StructureJob {
  readonly mode: "ONLY_ON_DEVICE";
  run(input: StructureInput): Promise<JobResult<VisitRecord>>;
}

type DeviceModelState = "unavailable" | "downloadable" | "downloading" | "available";
interface DeviceModel {
  state(): Promise<DeviceModelState>;
  initialize(onProgress: (fraction: number) => void): Promise<void>;   // from a press only
}

interface InventedVisit { note: string; clientList: string; preparedRecord: VisitRecord; mark: "invented example" }
```

## Order of work (ruling 10)

1. Read the structured-output page again; write the result into docs/sdk-facts.md.
2. DEVICE MODEL check of the syntax with a two-field schema; write `results/device-structured-output.json`.
3. Then build the structure job, using the option names the check recorded, or the documented names marked "not checked in a real browser" when the check is a miss.

## Inference mode

Structure: `ONLY_ON_DEVICE`. The raw note and photo never leave.

`createOptions.ts` builds `onDeviceParams.createOptions`:

- `expectedInputs`: `[{ type: "text", languages: ["en"] }]`, plus `{ type: "image" }` only when a photo is attached (ruling 8).
- `expectedOutputs`: `[{ type: "text", languages: ["en"] }]` (sdk-facts 30).
- `initialPrompts`: one entry with role system and the system prompt as text (sdk-facts 29).

The same options are passed to `LanguageModel.availability()` (sdk-facts 13), so a typed note asks about text only.

The structure job is real whenever the device state is `available` (ruling 23). It does not depend on `AI_SERVICE_ENABLED`.

## Length guard (ruling 9)

`lengthGuard.check(note, photo?)` returns `ok` or `tooLong`. With no `results/device-token-limit.json` it always returns `ok`. With the file, it compares `note.length + schemaText.length + systemPrompt.length + (photo ? photoAmount : 0)` with the recorded bound. It is labelled best-effort in its code comment. The model's own error is always caught and mapped to "This note is too long for the device model. Split it into two parts."

## The invented visit

`inventedVisit.ts` exports the note and list in requirements R10.2 and R10.3 and this prepared record, used only when the device model is absent:

```ts
{
  visitDate: "2026-11-12",
  present: [{ label: "Maria Okonkwo-Reyes", role: "client" }, { label: "Bea", role: "other" }, { label: "Dana Whitfield", role: "worker" }],
  seen: ["Mould in the back bedroom, worse by the window.", "Letter about the benefits form on the table."],
  agreed: ["Worker rings the landlord on Monday.", "Maria posts the form on Friday.", "Tomas Brandvald offered to help with the form."],
  risks: ["Rent arrears if the form is late."],
  nextSteps: ["Revisit on 26/11."]
}
```

The prepared record keeps the near variant "Brandvald" and the unlisted name "Bea" on purpose, so exact match, near match, tap-to-mask and the egress check each have something to do.

## What is stored where

| Item | Where | Leaves the device |
|---|---|---|
| Raw note, photo | IndexedDB via `src/storage/` | never |
| Visit record | IndexedDB via `src/storage/` | never by itself; only the outgoing text built from the masked record |
| Invented visit | in code | never |
| Device model state | memory | no |

## Behaviour by device model state

| State | Screen | What still works |
|---|---|---|
| unavailable | One line: what the device model would add, and that it is not on this computer. No version or steps (ruling 19). No error colour. | Hand entry, the prepared invented record, exact masking, cloud drafting, egress check (H6) |
| downloadable | Same line plus "Get the device model"; the press calls `initialize()` | same |
| downloading | "downloading, N%"; "Make the record" waits and shows "waiting for the device model, N%" | typing, hand entry |
| available | "Make the record" runs on the device | everything |

## Network off

Capture, structuring, hand editing and storage need no network once the model is downloaded (sdk-facts 6). A unit test fails if `src/inference/structure/` imports a cloud-only path.

## Errors

- Schema check failure: show partial text, allow hand edit.
- Length error from the model: the length line.
- Wrong photo type: refuse before any call, with the convert line.
- `inferenceSource` not `ON_DEVICE`: discard, show a guard line.
- Device job called with the model not `available`: typed error, shown as the R6.3 line.

## Test double

`structure.double.ts` returns the prepared invented record with `inferenceSource: "ON_DEVICE"` and `connected: false`. It is used in unit tests only; `makeKit` never picks it in the built app.

## Acceptance recording (ruling 20)

`results/h1.json` and `results/cold-start.json` each hold `{ date, browser, machine, status: "pass" | "fail", reason?, seconds? }`. With Chrome or the model absent, status is `fail` with the reason. The page reads `cold-start.json` and shows "on the author's computer (date, browser)" with the figure, or "not measured".
