# Drafting: design

Refined by rulings 2, 3, 5, 12, 13, 15, 23 and the look and layout.

## Modules

- `src/inference/draft/` interface, real, double.
- `src/inference/rewrite/` interface, real, double.
- `src/inference/config.ts` model names from Remote Config with defaults in code.
- `src/drafting/buildOutgoing.ts` the outgoing string from the masked record.
- `src/drafting/chooseMode.ts` online or offline decision (ruling 12).
- `src/app/zones/leaves.ts` outgoing text, notice, Send.
- `src/app/zones/finished.ts` the finished note sheet.
- `src/app/sendNotice.ts` the notice text, one place, marked for owner check.
- `src/masking/restore.ts` restore names and pronoun tokens (masking spec).
- `src/egress/send.ts` the single path out.

## Data shapes

```ts
declare const ticket: unique symbol;
type EgressTicket = { readonly [ticket]: true };     // created only in egress/send.ts

interface DraftInput { text: string }                 // exactly the string shown in zone 2

interface DraftJob {
  run(t: EgressTicket, input: DraftInput, mode: "PREFER_IN_CLOUD" | "ONLY_ON_DEVICE"): Promise<JobResult<DraftOutput>>;
}
interface DraftOutput { text: string; short: boolean }   // short true for a device draft

interface RewriteInput { text: string; tags: string[] }  // one masked sentence plus fixed instructions
interface RewriteJob {
  readonly mode: "PREFER_ON_DEVICE";
  run(t: EgressTicket, input: RewriteInput): Promise<JobResult<string>>;
}
```

## The outgoing string

```
Visit date: 2026-11-12
Present: [Person 1], [Person 3], worker
Seen: Mould in the back bedroom, worse by the window. ...
Agreed: ...
Risks: ...
Next steps: ...

Instructions: Write a formal case note from the record above. Keep every tag such as [Person 1] exactly as written. Use {he:Person 1}, {him:Person 1}, {his:Person 1} or the she and they forms for pronouns. Plain formal prose.
```

The whole string, instructions included, is shown in zone 2. The worker's name is not put in the record lines; "worker" is used.

## Mode choice (ruling 12)

`chooseMode()`:

| Browser online state | Probe | Device model | Call |
|---|---|---|---|
| online | passes | any | `PREFER_IN_CLOUD` |
| offline | not run | available | `ONLY_ON_DEVICE`, short prompt, labelled device draft |
| online | fails | available | `ONLY_ON_DEVICE`, short prompt, labelled device draft |
| offline or probe fails | | not available | no call; the 4.2 line and Copy |

The device prompt asks for five to eight sentences. The cloud model name comes from Remote Config with an explicit default (sdk-facts 27, 28, difference 1). SDK 13.0.0 or later.

## Flow

1. `buildOutgoing(maskedRecord)` gives the string; zone 2 shows it with the notice.
2. Preview check (egress-check R2.2). Send enabled when it passes and the notice is shown.
3. Press Send. `send.ts` makes the ticket, captures, calls the job with the mode from `chooseMode()`, checks the captured body, appends the ledger.
4. The draft returns with `inferenceSource`. Tags and pronoun tokens are restored on this device. Zone 3 shows the sheet with its source label and Copy.

For the offline device draft nothing leaves; `send.ts` still runs `capture` so any request would be caught, and the line reads "Nothing was sent to the cloud for this draft."

## Rewrite

`PREFER_ON_DEVICE`. Every rewrite goes through `send.ts`. With `AI_SERVICE_ENABLED` on, the cloud may answer, so zone 2 shows the sentence and instructions with the notice and waits for Send. Tags in the sentence are listed before the call and checked after; a missing or changed tag refuses the result.

## Stored where

| Item | Where |
|---|---|
| Outgoing string | memory |
| Draft with tags | memory |
| Restored note with real names | memory and IndexedDB, this browser only; never sent |
| Notice text | in code |

Masked records are not synced (ruling 18).

## Network and device states

| Case | Result |
|---|---|
| Online, model absent | cloud draft (double until enabled), "in the cloud" (H6) |
| Online, model downloading | cloud draft, no wait |
| Online, model available | cloud draft |
| Offline, model available | device draft, `ONLY_ON_DEVICE`, "Shorter draft made on this device." |
| Offline, model absent | 4.2 line, masked record kept, Copy |
| Offline, model downloading | 4.2 line with progress |

## Not connected

While `AI_SERVICE_ENABLED` is off, `draft.double.ts` answers the `PREFER_IN_CLOUD` call with a fixed note for the invented masked record, `inferenceSource: "IN_CLOUD"`, `connected: false`, and the screen shows "not connected". The `ONLY_ON_DEVICE` call is real whenever the device model is `available` (ruling 23).

## Real-browser record of a network drop (ruling 12)

DEVICE MODEL check with the AI service enabled: start a `PREFER_IN_CLOUD` draft, set the context offline after the request starts, and record what the SDK returns (error, device answer, or hang until the time limit) in `results/draft-network-drop.json`. Without Chrome, the model or the enabled service, write a miss with its reason.
