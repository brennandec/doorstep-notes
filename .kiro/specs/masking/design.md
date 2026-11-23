# Masking: design

Refined by rulings 1, 4, 5, 6, 11, 13, 23 and the look and layout.

## Modules

- `src/masking/clientList.ts` parse the pasted list into entries.
- `src/masking/fold.ts` case folding: `s.normalize("NFC").toUpperCase().toLowerCase()`. JavaScript has no built-in full case fold; this upper-then-lower form maps "ß" and "SS" alike. Its limits are written in OPEN-QUESTIONS.
- `src/masking/exact.ts` exact pass, whole words, case-folded.
- `src/masking/near.ts` near pass: Levenshtein distance exactly 1 for listed names and parts of 5 letters or more.
- `src/masking/merge.ts` merge exact, near and device results on the raw text.
- `src/masking/apply.ts` build the masked text, the mask map and the surface forms.
- `src/masking/restore.ts` put values back; pronoun tokens.
- `src/masking/policy.ts` defaults and the Remote Config overlay.
- `src/inference/proposeMasks/` interface, real, double (unit tests only).
- `src/storage/clientList.ts`, `src/storage/maskState.ts` at rest in this browser only.
- `src/app/parts/chip.ts` chips; `src/app/zones/note.ts` uses them in the record.

No model is imported anywhere under `src/masking/`.

## Data shapes

```ts
interface ClientEntry {
  id: string;
  fullName: string;
  otherNames: string[];
  pronouns: "he/him" | "she/her" | "they/them" | "";
}

type MaskKind = "listed" | "near" | "proposed" | "manual";
type TagKind = "Person" | "Place" | "Date" | "Detail";

interface MaskSpan {
  start: number; end: number;
  surfaceForm: string;          // exact text found at [start, end)
  tag: string;                  // "[Person 1]"
  kind: MaskKind;
  clientId?: string;
  accepted: boolean;            // proposed spans start false
  sentOnPurpose: boolean;       // ruling 5, listed values only
}

interface MaskMap { [tag: string]: string }    // "[Person 1]" -> "Maria Okonkwo-Reyes"

interface MaskResult {
  maskedText: string;
  spans: MaskSpan[];
  map: MaskMap;
  surfaceForms: string[];       // de-duplicated, for the egress check and the reader redaction
  listedNames: string[];        // every full name and other name on the list
  sentOnPurpose: string[];      // listed values she chose to send
}

interface MaskPolicy { nearMatch: boolean; minPartLength: number; proposalsStartAccepted: boolean; source: "default" | "remote" }

interface ProposeMasksJob {
  readonly mode: "ONLY_ON_DEVICE";
  run(rawText: string): Promise<JobResult<Candidate[]>>;
}
interface Candidate { text: string; kind: "name" | "place" | "dob" | "phrase" }
```

## Flow (ruling 6)

1. Parse the list.
2. On the raw record text, run the exact pass and the near pass.
3. If the device model is `available`, run the propose job on the same raw text, on this device.
4. `merge` drops candidates that overlap an exact or near span and candidates not found in the text.
5. She taps or presses Enter on chips and words.
6. `apply` builds `MaskResult`: every accepted span replaced by its tag; every occurrence's surface form recorded.
7. The masked text feeds drafting and the second reader; `surfaceForms`, `listedNames` and `sentOnPurpose` feed the egress check.

The raw text never leaves; on the device there is nothing to protect it from, so the device pass reads it unmasked.

## Inference mode

Propose masks: `ONLY_ON_DEVICE`, real whenever the device state is `available` (ruling 23). Exact and near passes use no model.

## Near match rule (ruling 11)

Fold both sides. For each listed name and part of 5 letters or more, a whole word in the text whose Levenshtein distance to it is exactly 1 is a near match. No accent stripping, no punctuation stripping, no letter swaps: a swap is distance 2 and is not matched. These are the constructs ruling 11 names: exact match, case folding, edit distance 1 for names of five letters or more.

## Chips (look and layout)

| Kind | Outline | Fill | Words for assistive technology |
|---|---|---|---|
| listed, near | solid | light accent | "Masked, on your list: Person 1" |
| proposed, not accepted | dashed | none | "Suggested: Bea. Press to mask." |
| proposed, accepted | solid | none | "Masked: Person 2" |
| manual | solid | none | "Masked: Detail 1" |
| sent on purpose | solid ink, eye icon | none | "Will be sent by name: Maria Okonkwo-Reyes" |

A chip is a button. Tap or Enter toggles it. The live region announces the change.

## Send on purpose (ruling 5)

Pressing a listed chip opens a small menu with "Unmask" and "Send this name on purpose". "Unmask" alone leaves the name in the text, and the preview check then blocks Send with a line naming it. "Send this name on purpose" asks the named question; on confirm the span is unmasked and `sentOnPurpose` is set.

## Pronouns (ruling 13)

Restore replaces only the tokens `{he}`, `{him}`, `{his}` and their she and they forms that the draft was asked to use, each tied to a tag, for example `{he:Person 1}`. Free text is not re-parsed. When the draft has no tokens, a line says "The draft used no pronoun tokens, so no pronouns were changed." and nothing is rewritten (drafting R6).

## Stored where

| Item | Where |
|---|---|
| Client list | IndexedDB via `src/storage/`, this browser only |
| Mask map, spans, surface forms | memory and IndexedDB, this browser only |
| Masked text | memory; not synced (ruling 18) |
| Policy | Remote Config value cached on this device; defaults in code |

## Device model states

| State | Behaviour |
|---|---|
| unavailable, downloadable | Exact, near and tap masking work. Line: device pass not on this computer, with what it would add. |
| downloading | Exact and near work. Device pass queued, progress shown. |
| available | Device pass runs on the raw text; candidates shown as dashed chips. |
| network off | Nothing changes. |

## Test double

`proposeMasks.double.ts`, for unit tests only, returns for the invented note: name "Bea", place "14 Alder Court", date of birth "3/3/87", source `ON_DEVICE`, `connected: false`.
