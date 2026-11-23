# Second reader: design

Refined by rulings 1 to 4, 14, 15, 23 and the scope section.

## Modules

- `src/inference/secondReader/` interface, real, double.
- `src/secondReader/redact.ts` replaces listed names and surface forms in the reply by their tags.
- `src/secondReader/evidence.ts` keeps quotes found in the masked text.
- `src/app/zones/readerPanel.ts` control, notice, results, tappable quotes, standing sentence.
- Uses `src/egress/send.ts`, `src/app/sendNotice.ts`, `src/masking/apply.ts`, `src/masking/fold.ts`.

## Data shapes

```ts
interface SecondReaderInput { text: string }   // masked outgoing text plus fixed instructions, as shown

interface Guess {
  who: string;                 // for example "a tenant in a ground-floor flat"
  evidence: string[];          // quotes from the masked text
}

interface SecondReaderOutput { guesses: Guess[] }

interface SecondReaderJob {
  readonly mode: "ONLY_IN_CLOUD";
  run(t: EgressTicket, input: SecondReaderInput): Promise<JobResult<SecondReaderOutput>>;
}

interface RedactedReply { guesses: Guess[]; replaced: number }
```

## Inference mode

`ONLY_IN_CLOUD`. The cloud model name is set explicitly from Remote Config with a default in code (sdk-facts 27, 28). Structured output for the guess list; the cloud schema syntax is checked when the AI service is enabled, as part of the H2 part B run.

## Flow

1. She presses "Ask a second reader".
2. Zone 2 shows the outgoing text and the notice; the preview check runs; she presses Send.
3. `send.ts` captures the body, calls the job, checks the captured body, appends the ledger entry with job `secondReader`.
4. `redact` replaces any listed name or surface form in `who` and `evidence` by its tag, case-folded (ruling 14). If `replaced > 0`, the panel shows the R3.2 line.
5. `evidence` keeps quotes found in the masked text. If none is left, the panel shows the R2.2 line.
6. The result shows its source label or "not connected". Quotes are chips she can tap.

## Stored where

| Item | Where |
|---|---|
| Outgoing text | memory |
| Raw reply | memory only, dropped after redaction |
| Redacted guesses | memory for the session only |
| Ledger entry | this device; counts and hashes only |

## States

| Case | Behaviour |
|---|---|
| Online, service enabled | real call |
| Online, service not enabled | double answers, "not connected" |
| Offline | control disabled, line shown |
| Cloud error | line shown, text kept |
| Device model absent or downloading | no effect |

## Test double

For the invented masked text, one guess: who "a tenant in a ground-floor flat", evidence quotes taken from the text. Source `IN_CLOUD`, `connected: false`. A second fixture reply, for unit tests only, contains an invented listed name in capitals and a near variant, to exercise the redaction.

## Session H14 (2026-11-14): what a guess says

- `Guess` gains `description`, `why` and `kind` next to `who` and `evidence`. They are optional in the type so the double and older replies still fit. `parseReply` fills description and why with empty text when the reply lacks them, and leaves `kind` out when it is not one of the six.
- `SECOND_READER_SCHEMA` lists all five fields as required, `kind` as an enum, `additionalProperties` false.
- `redactReply` runs `redact` on `who`, `description`, `why` and each quote. `kind` is a fixed word and is not redacted.
- The panel hides a guess when it has at least one quote and every quote has no maskable words (`hasMaskableWords`). It counts them and prints one line. A guess with no quote at all is still shown, as before. `keepEvidence` is not touched.
- `READER_CLOUD_MODEL` is passed by `src/app/main.ts` as the reader job's `cloudModel`. A Remote Config value is not read for this job.
- The loop spec `tests/e2e/bundled/secondReaderLoop.spec.ts` runs against the real service and counts its own calls to the model.
