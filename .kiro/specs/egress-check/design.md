# Egress check: design

Refined by rulings 1 to 5, 18, 21 and the look and layout.

## Modules

- `src/egress/send.ts` the single path out: build, preview check, capture, call, check, line, append.
- `src/egress/capture.ts` wraps `fetch` for one call and records URL and body bytes.
- `src/egress/hash.ts` SHA-256 hex by `crypto.subtle.digest`.
- `src/egress/check.ts` case-folded scan of text and of JSON string values.
- `src/egress/ledger.ts` plain append-only list.
- `src/egress/line.ts` builds the printed lines.
- `src/egress/syncLedger.ts` shows the entries, then sends them on "Save ledger".
- `src/egress/assertNoLeak.ts` shared by unit and real-browser tests.
- `src/storage/ledger.ts` writes the list to IndexedDB.
- `src/app/parts/egressLine.ts` the line, icon and colour.

## Data shapes

```ts
interface Outgoing { text: string; bytes: Uint8Array }          // UTF-8 of text, made once, given to the job

interface Captured { url: string; body: Uint8Array }

interface CheckInput {
  captured: Captured[];          // or the double's body when connected is false
  listedNames: string[];         // full names and other names on the list
  surfaceForms: string[];        // every masked occurrence as found
  sentOnPurpose: string[];
}

interface CheckResult {
  listedChecked: number; listedFound: string[];
  maskedChecked: number; maskedFound: string[];
  onPurposeFound: string[];
  passed: boolean;               // false if any found value is not on purpose
}

interface LedgerEntry {
  at: string;
  sha256: string[];              // one per captured body
  byteLengths: number[];
  listedChecked: number; listedFound: number;
  maskedChecked: number; maskedFound: number;
  onPurpose: number;
  job: "draft" | "rewrite" | "secondReader";
  mode: "PREFER_IN_CLOUD" | "PREFER_ON_DEVICE" | "ONLY_ON_DEVICE" | "ONLY_IN_CLOUD";
  inferenceSource: "ON_DEVICE" | "IN_CLOUD";
  connected: boolean;
}

interface Ledger { append(e: LedgerEntry): void; all(): readonly LedgerEntry[] }
```

Names found are shown from memory only and never stored.

## Check method

For each text to scan (each URL, each body as UTF-8 text, and when the body parses as JSON the string values joined by a newline): fold it, then for each folded value test `includes`. Values are folded and de-duplicated first; empty values skipped. No other matching.

## Flow

1. `buildOutgoing(maskedRecord)` gives `Outgoing`. Zone 2 shows `text`.
2. Preview check on `text` with the listed names and surface forms. A found value not on purpose disables Send and shows the blocking line.
3. Press Send. `send.ts` starts `capture`, calls the job with `text`, stops `capture` when the call settles.
4. If `connected` is false, the captured list is the double's body. Otherwise it is what `capture` recorded.
5. Run the check on the captured list, build the lines, hash each body, append the ledger entry.

## The line (look and layout)

| Case | Icon | Colour | Words |
|---|---|---|---|
| pass | check | ink | "0 of M listed names in the text sent. Checked on the bytes. Near variants that were not masked are not checked." and "0 of K masked values in the text sent." |
| on purpose | check | ink | "1 of M listed names in the text sent, on purpose: <name>. Checked on the bytes. Near variants that were not masked are not checked." |
| fail | crossed octagon | `#B3261E` | "Egress check failed. Found N of M listed names in the text sent: <names>. Mask them before you send again." |
| preview blocked | crossed octagon | `#B3261E` | "Found in the text that would leave: <names>. Mask it, or choose to send this name on purpose." |
| double | as above | as above | the line plus "not connected" |
| offline device draft | check | ink | "Nothing was sent to the cloud for this draft. 0 of M listed names in the text checked." |

Always under it: "This checks listed names and masked values only. Other details in the text can still identify a person."

The example "0 of 28" in the brief is a format only (OPEN-QUESTIONS 8).

## Inference modes

The egress module does not choose a mode. It records the mode of the job it wraps.

## Stored where

| Item | Where |
|---|---|
| Ledger | IndexedDB; cloud store only after "Save ledger" |
| Names found | memory only |
| Captured bodies | memory only, dropped after the check |

## Network recorder (real browser)

Playwright `context.on("request")` records URL, method, headers and post data for page and service worker requests. `assertNoLeak(requests, { listedNames, surfaceForms, rawNote })` folds both sides and checks the raw note whole and line by line (lines of 20 characters or more). The seeded-leak variant uses a test-only hook `window.__seedLeak` that exists only in test builds and appends an invented listed name to the double's body after the preview.

In part B the test also reads the page's captured body through a test-only hook and compares it byte for byte with Playwright's `request.postDataBuffer()`.

## Test double

The cloud doubles receive the bytes `send.ts` built and return fixed text. The line, ledger and failure path run on real code. `connected` is false and the screen says "not connected".
