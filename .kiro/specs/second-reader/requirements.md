# Second reader: requirements

Source: BRIEF.md step 7, table row 5, Rule 10. Owner documents of 2026-11-13: rulings 1, 2, 3, 4, 14, 15, 23, the scope section, the look and layout. Facts: sdk-facts 12, 24, 27, 28.

Examples use invented people. The masked text reads like: "[Person 1] was not at home for the 10:00 visit. [Person 1] agreed to post the benefits form by Friday."

## Requirements

### R1. Ask for a guess
- 1.1 A control "Ask a second reader" builds the outgoing text: the same masked outgoing text she already sees in zone 2, plus fixed instructions asking who the text is about and which words point there.
- 1.2 The mode is `ONLY_IN_CLOUD`. There is no device fallback; the point is an outside reader. A unit test asserts the mode.
- 1.3 The call goes through `src/egress/send.ts`: preview check, capture of the body actually sent, check, ledger entry with job `secondReader` (rulings 3, 4).
- 1.4 The no-cost tier notice and the exact outgoing text are shown before sending (drafting R2, R3). Send cannot be pressed without them on screen. A unit test.
- 1.5 While the cloud service is not enabled, the double answers and the panel and the control's help text say "not connected" (rulings 15, 23).

### R2. Show what it can infer
- 2.1 The result lists each guess with the words in the masked text that led to it, as quoted spans. Quotes not found in the masked text are dropped. A unit test.
- 2.2 If every quote of every guess was dropped, a line says: "The reader gave no words from your text, so there is nothing to tap." A unit test.
- 2.3 Each kept quote can be tapped or chosen with Enter to mask it, using the masking spec's tap-to-mask. Evidence taps are third in the cut order.
- 2.4 The result carries the source label from `inferenceSource`, or "not connected" while a double answers.
- 2.5 The panel says: "A guess is not a measure. The reader may be wrong or may miss things."
- 2.6 After new masks she can ask again. Each ask is a separate send with its own ledger entry.

### R3. Redact the reply before it is shown (ruling 14)
- 3.1 Before the reply is shown, every listed name and every recorded surface form in it is replaced by its tag, comparing case-folded. A unit test with an invented reply that contains "MARIA OKONKWO-REYES" and "Brandvald" asserts both are shown as their tags.
- 3.2 When anything was replaced, a line says: "The reader produced a name from your list. It is shown as its tag." A unit test.
- 3.3 The reply is not stored beyond the session, except the quotes she chose to mask. The unredacted reply is never written to storage or to the ledger. A unit test with a fake store.

### R4. Offline and device states
- 4.1 Offline (shell-and-offline R11.1): the control is disabled with "The second reader needs a connection."
- 4.2 Device model absent or downloading: no effect; this job does not use it.
- 4.3 Cloud failure: the same line as 4.1, and the text is kept.

### R5. Network proof
- 5.1 The H2 runs of egress-check R8 include one second-reader call. No request carries a listed name, the original of a masked value or the raw note (ruling 1). Part A and part B are both required (ruling 2).

## Acceptance map

| Brief or owner item | Covered by |
|---|---|
| H2 | R1.3, R5 |
| H9 | unit tests for R1 to R4 |
| Ruling 14 | R3 |
| Ruling 15, 23 | R1.5 |
| Scope cut order | R2.3 |

## Fourth review (2026-11-13): requirement R6

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md` (J5, K6, L8). The fourth review wins over this spec where they differ.

### R6. The explanation folds (K6, J5, L8)
Wins over: the always-visible explanation of the second reader in R2.5 where it is printed at all times.
- 6.1 Under "Second reader" the explanation of what a second reader is stands behind one `details` control, "What a second reader is", closed by default.
- 6.2 The text of R2.5 stays, inside the fold. The reader's results, the redaction line of R3.2 and the offline line of R4.1 never fold.
- 6.3 Whether the fold is open is kept (shell-and-offline R27.1).
- 6.4 The unit tests are shell-and-offline task 59; the real-browser check is task 60.

## Session H11 (2026-11-14): requirements R7 and R8

Source: the product owner's instruction for chain H11, items 3 and 4.

### R7. Two byte counts, each with its own words
- 7.1 The pass line on the page gives two counts and says what each counts: "Sent to the model: N bytes in M request(s)" (the call to the cloud model only) and "Including the App Check exchange: N bytes in M requests" (every captured request that had an address and a body).
- 7.2 `results/second-reader-real-service.json` carries both counts, `bytesToModel`, `requestsToModel`, `bytesIncludingAppCheck` and `requestsIncludingAppCheck`, from the bytes the browser sent. `bytesLeft` is the model call's count.
- 7.3 Tests (`tests/unit/secondReaderCounts.test.ts`): the pass is read with both counts; the screen shows both lines with their own words; and the pass line recorded in the results file equals the line built from the counts recorded in the same file. A pass line that gives one count under the words of the other fails.

### R8. A test that does not depend on the clock or on a hash
- 8.1 `tests/unit/secondReaderOffline.test.ts` has a found cause for its one failure, recorded in `.kiro/specs/OPEN-QUESTIONS.md`, and the cause is removed. The file passes 50 times alone and the whole suite passes three times in a row after the fix.

## Session H14 (2026-11-14): requirement R9

Source: the product owner's instruction for chain H14. It wins over R1.1 and R2.1 where they differ on the fields of a guess and the model of this job.

### R9. A guess says what the reader inferred
- 9.1 Each guess carries `who`, `evidence`, `description` (a short description of the person), `why` (why the reader thinks so) and `kind` (one of place, relation, date, role, name, other). The reply schema requires all five and allows no other field. A reply that has only `who` and `evidence` is still read; its description and why are empty.
- 9.2 Redaction (R3, ruling 14) runs on `description` and `why` exactly as on `who`.
- 9.3 The panel shows "Guess: <description>", labelled as the reader's guess (the description, or `who` when the description is empty), then the why line and the kind. Each quote with words she can mask is a press-to-mask chip.
- 9.4 A guess whose quotes are all tags is not shown. One line says how many guesses were hidden, from the string table. The evidence rule (`keepEvidence`) is unchanged.
- 9.5 The fixed instructions ask for a description, why, the kind of clue, and quotes of exact words that would identify the person to someone local, not tags.
- 9.6 The mode stays `ONLY_IN_CLOUD` with no device fallback (R1.2). The job's cloud model is `READER_CLOUD_MODEL` (sdk-facts 31). Drafting stays on `DEFAULT_CLOUD_MODEL`.
- 9.7 One loop is recorded on the real service: ask, send, press a chip of a guess, ask again, send. The record is `results/second-reader-loop-<date>.json`. A guess whose words she masked does not quote them in the second pass, and the card counts them among the masked values.

## Session H35a (2026-11-15): requirement R10

Source: orders H35-DRAFT.md as amended by H35-ISSUE.md, item D6 (picture 08 of the cold read).

### R10. Asking says what happened and where to press next
- 10.1 While the reader's request waits for Send (`reader.pending` and not `reader.asking`), the panel shows, with `role="status"`, "Request prepared. It is shown under What leaves. Press Send." (`data-reader-prepared`).
- 10.2 While it waits, the Send control keeps `id="send"`, reads "Send to the second reader", and is the one filled primary control (the next step is Send). It reads "Send" again once the request is sent, answered, replaced by Draft, or reset.
- 10.3 The press on "Ask a second reader" moves focus to Send.
- 10.4 Tests: `tests/unit/h35aHonestyAndGate.test.ts` (e), `tests/unit/steps.test.ts` and `tests/e2e/bundled/h35aFlow.spec.ts` (BUNDLED).
