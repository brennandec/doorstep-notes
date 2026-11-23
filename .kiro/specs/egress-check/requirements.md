# Egress check: requirements

Source: BRIEF.md step 6, Rules 1, 5, 6, acceptance H2, H3, H9. Owner documents of 2026-11-13: rulings 1 to 5, 18, 21, 22, the look and layout (the egress check line), the browser on this computer. Constructs allowed (Rule 1, ruling 11): SHA-256 of the outgoing text, a plain append-only list, exact string matching with case folding. Nothing else.

Examples use the invented visit: 12 listed clients including Maria Okonkwo-Reyes and Tomas Brandvold.

Words used here: a "masked value" is the original text that was masked, never its tag (ruling 1). A "surface form" is the exact text of one masked occurrence as found in the record (ruling 4). The "body" is the request body the browser actually sends (ruling 3).

## Requirements

### R1. One path out
- 1.1 Every call that carries text to a cloud model goes through `src/egress/send.ts`: draft, rewrite when the cloud may answer, and second reader. Ledger sync goes through `src/egress/syncLedger.ts`, which shows what will be sent before the press.
- 1.2 A unit test scans `src/` and fails if a cloud job's `run` is called from any module other than `send.ts`.
- 1.3 The `ONLY_ON_DEVICE` jobs (structure, propose masks) do not import `send.ts`; a unit test asserts it.

### R2. Preview before sending (rulings 3, 5)
- 2.1 Before any cloud call, zone 2 shows the exact outgoing text that the app gives to the SDK, and waits for Send.
- 2.2 The preview check scans that text for every listed name and every recorded surface form, case-folded. If any is found and is not marked sent on purpose, Send is blocked and a line in the failure colour, with the crossed octagon icon, says: "Found in the text that would leave: Maria Okonkwo-Reyes. Mask it, or choose to send this name on purpose." There is no general override (ruling 5). A unit test asserts Send is disabled and the line names the value.
- 2.3 A unit test asserts the string shown in the preview equals, character for character, the string the send path gives to the job.

### R3. The body actually sent (ruling 3)
- 3.1 During one cloud call, `src/egress/capture.ts` wraps `fetch` and records the URL and body bytes of every request the page makes until the call returns. Only one send runs at a time.
- 3.2 The check after sending runs on the captured bodies and URLs, not on the preview text.
- 3.3 When a cloud double answers, no request is made; the check runs on the body bytes the send path built for the double, and the line adds "not connected". This is written in the ledger as `connected: false`.
- 3.4 In the H2 part B run, a BUNDLED real-browser test asserts that the body captured in the page equals, byte for byte, the body Playwright's request recorder saw for the same request.

### R4. The check (rulings 1, 4)
- 4.1 The check scans each captured body and URL for every listed name (full names and other names on the list) and for every recorded surface form. Comparison is case-insensitive with Unicode case folding (masking `fold.ts`). The body is scanned as UTF-8 text and, when it parses as JSON, also as the concatenation of its string values, so an escaped character does not hide a name.
- 4.2 Empty values are skipped and not counted. Values are de-duplicated after folding, so the counts are stable.
- 4.3 Unit tests: found, not found, "MARIA OKONKWO-REYES", "Maria okonkwo-reyes", "ß" against "SS", a name inside a JSON escape, an empty value, duplicates counted once.

### R5. The line (look and layout, rulings 4, 5)
- 5.1 After sending, zone 2 shows one large sentence with an icon, at the bottom of the zone.
- 5.2 Pass, with the check mark icon: "0 of M listed names in the text sent. Checked on the bytes. Near variants that were not masked are not checked." M is the number of listed names checked.
- 5.3 A second line: "0 of K masked values in the text sent." K is the number of surface forms checked.
- 5.4 A value sent on purpose is not a failure. The line then reads: "1 of M listed names in the text sent, on purpose: Maria Okonkwo-Reyes. Checked on the bytes. Near variants that were not masked are not checked."
- 5.5 Fail, with the crossed octagon icon, in the failure colour `#B3261E` and in words: "Egress check failed. Found N of M listed names in the text sent: <names>. Mask them before you send again." The masked-value line reads the same way with "masked values". The words carry the meaning without the colour.
- 5.6 Under the line, always: "This checks listed names and masked values only. Other details in the text can still identify a person."
- 5.7 Counts come from the run, never from a fixed example. A unit test asserts no line contains a literal count that was not computed.
- 5.8 The lines never use a banned word (shell R6.2) and never say that nothing private left. A unit test.

### R6. Seeded leak (H3, ruling 21)
- 6.1 A unit test puts an invented listed name into the captured body after the preview and asserts the fail line.
- 6.2 A BUNDLED real-browser test does the same through a test-only hook on the cloud double, and asserts the fail line is shown with the words "Egress check failed" and "Found", the crossed octagon icon, and the computed colour `#B3261E` on the line's text.

### R7. Ledger (Rule 1, ruling 18)
- 7.1 Each send appends one entry to a plain append-only list: time, the SHA-256 hex of each captured body, byte lengths, listed names checked and found, masked values checked and found, sent-on-purpose count, job name, inference mode, `inferenceSource`, `connected`. It never stores the text, the names or the values.
- 7.2 The list's interface has `append` and `all` only. A unit test asserts it.
- 7.3 No receipt, chain, signature or link between entries (Rule 1).
- 7.4 The ledger is kept on this device. It is synced to the cloud store only after an explicit "Save ledger" press, with anonymous sign-in, and the store holds counts, hashes and times only. Masked records are never synced in this version (ruling 18). Ledger sync is first in the cut order.
- 7.5 Before "Save ledger" is pressed, zone 2 shows the entries that will be sent, as text.

### R8. Network proof (H2, Rule 5, rulings 1, 2)
- 8.1 A real-browser run records every network request from the page and its service worker: URL, headers and body. The test asserts that none carries a listed name, the original of any masked value (every recorded surface form) or the raw note (the whole note and each of its lines of 20 characters or more), compared case-folded.
- 8.2 The run uses the invented visit and the whole flow: load the visit, make or load the record, mask, preview, send the draft, rewrite one sentence, ask the second reader, restore, save the ledger.
- 8.3 Part A runs against the test doubles (BUNDLED). Part B runs against the real cloud service with invented people only, after the product owner enables the AI service (BUNDLED, prerequisite). Both are required before any claim about what leaves (ruling 2).
- 8.4 Until part B has run and written `results/h2-part-b.json` with a pass, the page and README say "not yet checked against the real service" (shell R7.2). "Not run" is not an end state for a submission.
- 8.5 A seeded-leak variant proves the assertion can fail. The shared helper `assertNoLeak` is used by unit and real-browser tests.

## Acceptance map

| Brief or owner item | Covered by |
|---|---|
| H2 | R1, R8 |
| H3 | R3, R4, R5.5, R6 |
| H9 | unit tests for R1 to R7 |
| Ruling 1 | words section, R8.1 |
| Ruling 2 | R8.3, R8.4 |
| Ruling 3 | R2.1, R3 |
| Ruling 4 | R4.1, R5.2 |
| Ruling 5 | R2.2, R5.4 |
| Ruling 18 | R7.4 |
| Ruling 21 (H3) | R6.2 |
| Look and layout, egress line | R5 |

## Second review (2026-11-13): requirements R9 and R10

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md` (direction U7 and U10; seen problems S7 and S10; acceptance V6). The second review wins over this spec where they differ.

### R9. The words say what the check scans (U10, S10)
Adds to: R4.1 and ruling 24 (task 16). The words follow the code (S10): if a test below shows the code does something other than R9.1 says, R9.1 is changed to say what the code does, the difference goes to OPEN-QUESTIONS, and the README and page follow R9.1.
- 9.1 The check scans the address (the URL with its query) and the body of each request the browser sent, for: each listed full name whole; each other name on the list; each single part of a listed name of `MIN_NAME_PART_LENGTH` letters or more (3); and each recorded surface form. A scanned value of `NEAR_MATCH_MIN_LETTERS` letters or more (5) is also found inside a longer word. Both constants already exist in `src/constants.ts` with their sources; the code in `src/egress/check.ts` (`containsValue`) was read for this requirement and does this. A value shorter than that must be a whole word. Comparison ignores case with Unicode case folding.
- 9.2 Characterisation tests, written first against the code as it is: a name in the URL query is found; a name in the body is found; a name part of three letters in a whole word is found; the same three letters inside "Tomorrow" are not; a listed value of five letters or more inside a longer word ("Brandvold" in "Brandvoldsen") is found; a surname-only leak is found; a first-name-only leak is found.
- 9.3 Under the egress line, and apart from the sentences of R5, zone 2 shows one line of what was scanned: "Scanned: the address and the body of each request, each listed name whole, its other names, and its single parts of 3 letters or more. A listed value of 5 letters or more is also found inside a longer word." The two numbers come from the constants. The sentences of R5.2, R5.4, R5.5 and R5.6 are unchanged.
- 9.4 The README section "What the egress check shows, and what it does not" says the same, from the same string table (shell-and-offline R21). A unit test asserts the key phrases appear on the page string and in the README.

### R10. "Save ledger" on the screen (U7, S7, V6)
Wins over: the note in task 10 and R7.4 that ledger sync is first in the cut order, for the control only. The control and the text of the entries are required. The write to the cloud store stays first in the cut order.
- 10.1 After a send, zone 2 shows a "Save ledger" control, at least 44 px high, with the entries that will be saved shown as text beside it (R7.5). Before any send there are no entries and the control is absent.
- 10.2 One press calls `syncLedger` once, with anonymous sign-in and the ledger store. While the project's store is not connected, the store is a test double, the press writes to the double only, and the line after it says "Written to the test double. Not connected." and never "saved". When the store is connected the line says how many entries were saved, a computed count.
- 10.3 What is written holds counts, hashes and times only (R7.1). A unit test with a store double asserts the written object has no text field and none of the 12 invented names.
- 10.4 A second press with no new entry writes nothing and says there is nothing new to save.
- 10.5 BUNDLED check (V6): after a send, the control is present; the entries are shown as text before the press; the press calls the store double once; the line says "not connected".

## Second review: acceptance map

| Item | Covered by |
|---|---|
| U10, S10 | R9 with shell-and-offline R21 |
| U7 (Save ledger), S7 | R10 |
| V6 (ledger part) | R10.5 (BUNDLED) |

## Third review (2026-11-13): requirement R11

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md` (direction X2, seen problem W2, acceptance Y2). The third review is the latest owner document and wins over this spec where they differ.

### R11. One count of masked values (X2, W2, Y2)
Wins over: R4.2 and R5 where the number of masked values is the number of distinct surface forms. The listed-names count is unchanged.
- 11.1 The "masked values" number in the egress line is the number of mask-map entries applied to the outgoing text. An entry is applied when its tag stands in the masked record part of the text; the example tag in the fixed instructions does not count.
- 11.2 An entry is found when its original, or any surface form recorded for its tag, is in the bytes sent. The number found counts entries, not forms. A found entry that she chose to send on purpose is reported as on purpose.
- 11.3 The ledger's `maskedChecked` and `maskedFound` use the same counts.
- 11.4 Unit tests (Y2): the number in the line equals the number of distinct tags with a map entry in the masked record; two forms of one person ("Maria O-R" and "Maria Okonkwo-Reyes") count once; a tag that a replaced sentence removed does not count; a seeded leak of one form is found and counts one.

## Third review: acceptance map

| Item | Covered by |
|---|---|
| X2, W2 | R11.1 to R11.3 |
| Y2 (count) | R11.4 |

## Fourth review (2026-11-13): requirements R12 and R13

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md` (J2, K3, K6, L5, L8). The fourth review wins over this spec where they differ.

### R12. H2 part A in full (K3, J2, L5)
Wins over: task 13 and its partial `results/h2-part-a.json`, which ran draft and second reader only. Task 13 is retired and replaced by task 23.
- 12.1 BUNDLED, against the test doubles, one run: the invented visit, masks, "Shorter" on one sentence, draft, second reader, and "Save ledger" (the store's double). The request record lists every request across the page and the service worker; none leaves the page.
- 12.2 No recorded request carries a listed name, the original of a masked value or the raw note (R8.1). The helper `assertNoLeak` is used.
- 12.3 `results/h2-part-a.json` says pass, or says what was seen, with the date, the browser and the list of steps that ran. A step that could not run is named with its reason and the file does not say pass.
- 12.4 Part B (R8.3, task 14) is unchanged: it waits for billing. Until it passes the page and README say "not yet checked against the real service".

### R13. The scan words fold (K6, J5, L8)
Wins over: R9.2 where it prints the scan words under the egress line at all times.
- 13.1 The scan words (R9.1, R9.3) stand behind one `details` control, "What this check scans", closed by default. The text inside is unchanged and still comes from the one string table. The README check of R9 still passes.
- 13.2 The egress line, and "This checks listed names and masked values only. Other details in the text can still identify a person.", never fold. The egress line stays the last child of zone 2 (shell-and-offline R20.5).
- 13.3 The unit tests are in shell-and-offline task 59; the real-browser check is task 60 there.

## Fourth review: acceptance map

| Item | Covered by |
|---|---|
| K3, J2, L5 | R12 (BUNDLED) |
| K6, J5, L8 | R13 with shell-and-offline R30 |

## Fifth review (2026-11-13): requirement R14

Source: `docs/decisions/2026-11-13-fifth-review-the-result-is-a-card.md` (direction N1, seen problem M1, acceptance P1). The fifth review is the latest owner document and wins over this spec where they differ.

### R14. The egress result is a card (N1, M1, P1)
Wins over: R5.2 to R5.5 where the result is a paragraph of several sentences, R9.3 where the scan words stand with the near-variants sentence in the line, and R13.2 where the sentences that never fold include the whole of the old line. The two sentences that never fold are unchanged: the verdict line (it takes the place of the egress line's large sentence) and "This checks listed names and masked values only. Other details in the text can still identify a person."
- 14.1 After a send the egress line holds a card. At the top of the card is one verdict line with its icon. On a pass it reads "No listed name left this device: N of M." where N is the count found (0) and M the number of listed names checked, at most ten words. On a pass with a name sent on purpose it names the count and the name. When a double answered a device draft it says nothing went to the cloud.
- 14.2 On a fail the verdict line holds the words "Egress check failed", "Found", the count and the names found. It is in the failure colour `#B3261E` with the crossed octagon, as before. The words carry the meaning without the colour.
- 14.3 Under the verdict line the card holds a table of three rows, label left and value right: "Masked values in the text sent" ("0 of 4"); "Single name parts of 3 letters or more" ("checked, none found"; on a fail it says in how many listed names a part was found), where the number comes from `MIN_NAME_PART_LENGTH`; "The request" ("none made, answered by a test double: not connected", or "none made, draft made on this device", or "sent to" and the host once connected). A fail adds a fourth row, "What to do", with the instruction that used to end the paragraph. A blocked preview (nothing sent yet) shows the verdict and that one row.
- 14.4 The card holds no paragraph element. Every count is computed from the check; none is typed (R5.7).
- 14.5 The sentence "Near variants that were not masked are not checked." moves into the fold "What this check scans", after the scan words. The standing sentence stays outside every fold (R13.2).
- 14.6 The verdict line is one line at 1440 px on a pass (P1). It is 18 px, weight 600, so that it fits the width zone 2 has (OPEN-QUESTIONS, fifth review).
- 14.7 Unit tests cover: the verdict text for every kind; at most ten words on a pass; the three rows and their values; the fourth row on a fail; no `p` inside the card; the failure class on the card only on a fail or a block; the near-variants sentence inside the fold; no banned word, no digit in the string table.
- 14.8 BUNDLED (P1): at 1440 x 900 after a send, the verdict line is one line, the table has three rows and the card holds no paragraph; with the seeded leak the verdict line names the count in the failure colour with the crossed octagon and in words; the check L8 of the fourth review passes with the folds closed.

## Fifth review: acceptance map

| Item | Covered by |
|---|---|
| N1, M1 | R14.1 to R14.7 |
| P1 | R14.8 (BUNDLED) |

## Sixth review (2026-11-13): requirements R15 and R16

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md` (direction R2, R3; seen problems Q2, Q3; acceptance S2, S3). The sixth review is the latest owner document and wins over this spec where they differ.

### R15. The block is seen (R2, Q2, S2)
Wins over: the honesty rule that "Send this name on purpose" is never printed beside chips, for this one line only (the words are the owner's; the control itself stays in the panel of a pressed listed chip). The card of a blocked preview (R14.3) is unchanged and stays under the connection line; the line beside Send is new.
- 15.1 When the outgoing text holds a listed name (she unmasked one on purpose, or typed one in), Send is not available and one line beside it says why: "Not sent: 1 listed name is in this text: " then the name as a chip, then " Mask it, or press Send this name on purpose." The count and the plural come from the check. With more than one name the line says "N listed names" and shows one chip each.
- 15.2 The chip in the line is a chip like the others. Pressing it masks the name again; the line goes and Send is available again.
- 15.3 The step line shows Send as stopped while the block holds, in words ("stopped") and in shape (the crossed octagon in place of the marker), not colour alone.
- 15.4 The invented visit gains a small control under the outgoing text, "Try to send a listed name". It is there only while the invented example is loaded and a record and an outgoing text exist. One press unmasks one listed name, so a first-time reader meets the block in one press.
- 15.5 Nothing is sent while the block holds. A test with a request recorder proves that no request is made, and that a press on Send does nothing.
- 15.6 A name typed into the outgoing text has the same effect: a unit test over the preview with a typed listed name.
- 15.7 All new words are in the string table. The line is drawn in ink with the crossed octagon; the failure colour stays on the failing egress line and on errors only (the style test). When one person has more than one name on the list (full name and other names), the line shows that person once.
- 15.8 BUNDLED (S2): on the invented visit, "Try to send a listed name" makes the block line appear with the name as a chip, Send unavailable and the step line stopped; the request record shows no request; pressing the chip restores Send.

### R16. A failed check says the text has left (R3, Q3, S3)
Wins over: R14.3 where the fourth row of a fail is "What to do" with "Mask them, then send again."
- 16.1 The fail card's verdict line stays. Its last row becomes two rows. "What happened": "this text has left this device. The block before sending should have stopped it." and "What to do": "report it to whoever runs this page; mask the name before the next send."
- 16.2 The fail state stays reachable only through the seeded test path. When it is, the card says "Seeded for a test." The words are shown only for a seeded leak; the test hook tells the card.
- 16.3 The block card (nothing sent yet) keeps its one row; its words follow R15.
- 16.4 Unit tests: the two rows on a fail and their words; "Seeded for a test." with the seed and not without; the old "Mask them, then send again." is not in the string table. BUNDLED (S3, seeded path): the fail card holds the two rows and the words.

## Sixth review: acceptance map

| Item | Covered by |
|---|---|
| R2, Q2 | R15.1 to R15.7 |
| S2 | R15.8 (BUNDLED), R15.6 (unit) |
| R3, Q3 | R16.1 to R16.3 |
| S3 | R16.4 (BUNDLED) |

## Session H15 (2026-11-14): requirement R17

Source: the product owner's instruction for chain H15, items 2 and 3.

### R17. Each request row says how it was answered
- 17.1 The capture wrapper records, for each request, the HTTP status of the answer, or "no answer" when `fetch` throws. The status is not a ledger field: `LEDGER_KEYS` do not change.
- 17.2 The card's request row reads "sent to <host> · answered <status>", or "sent to <host> · no answer" when the request got none. When the source is ON_DEVICE (the SDK's own fallback wrote the draft on this device after a cut or an HTTP error), the row ends "drafted on this device": "· no answer, drafted on this device", or "· answered <status>, drafted on this device".
- 17.3 With no request made, the rows keep their words: a test double, or a device draft.
- 17.4 The words are in the string table. One unit test for each line; each failed once on the starting commit.
- 17.5 No result file or page text holds a debug token, the API key or the app id of the local config (`tests/unit/noSecretsInResults.test.ts`, skipped with its reason when the local files are absent).

## Session H35a (2026-11-15): requirement R18

Source: orders H35-DRAFT.md as amended by H35-ISSUE.md, item D5 (pictures 06 and 07 of the cold read).

### R18. The words before a send say what the check does, and offer no control that is not there
- 18.1 The waiting headline reads "The egress check runs before anything is sent. It covers listed names only."
- 18.2 The refusal line in `[data-block-line]` reads "Not sent: 1 listed name is in the text. Mask it, then send." (plural "Not sent: {n} listed names are in the text. Mask them, then send."; for masked values "Not sent: 1 masked value is in the text. Mask it, then send." and "Not sent: {n} masked values are in the text. Mask them, then send."), followed by one press-to-mask `[data-block-chip]` chip per name. Pressing a chip masks the name again (R15.2).
- 18.3 The blocked card row reads "Mask it, then send." (plural "Mask them, then send."). The reason on the disabled Send reads "Send is blocked until the names in the check line are masked." No override control is added in Zone 2, and no line in Zone 2 tells her to press "Send this name on purpose".
- 18.4 Templates hold no digit; the counts come from code through `fill()`. Tests: `tests/unit/h35aHonestyAndGate.test.ts` (b), `tests/unit/blockSeen.test.ts`, `tests/e2e/bundled/sixthReview.spec.ts` S2 and `tests/e2e/bundled/h35aFlow.spec.ts` (BUNDLED).
