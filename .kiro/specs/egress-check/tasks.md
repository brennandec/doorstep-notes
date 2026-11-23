# Egress check: tasks

Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks say BUNDLED or DEVICE MODEL (browser document) and stay unticked unless a session is told to run them. Invented people only.

- [x] 1. Hash; unit tests with known SHA-256 vectors for a short string and for text with accents. Serves R7.1.
- [x] 2. Check function with case folding over text and JSON string values; unit tests: found, not found, all capitals, mixed case, "ß" against "SS", a name inside a JSON escape, empty values skipped, duplicates counted once, on-purpose values reported apart. Serves R4.
- [x] 3. Line builder; unit tests: pass, on purpose, fail with "Egress check failed" and "Found", preview blocked, double with "not connected", offline device draft, the standing sentence, counts computed and never literal, no banned word. Serves R5, R2.2.
- [x] 4. Ledger interface; unit tests: `append` and `all` only; entries hold no text or names; no link between entries. Serves R7.1 to R7.3.
- [x] 5. Ledger storage with a fake IndexedDB. Serves R7.4.
- [x] 6. Capture wrapper around `fetch` for one call; unit tests: records URL and body bytes, restores `fetch` afterwards, refuses a second send while one runs. Serves R3.1.
- [x] 7. Send path; unit tests: preview text equals the string given to the job; a listed name or surface form not on purpose blocks Send; the check runs on captured bodies; with a double the check runs on the built body and `connected` is false; a seeded leak in the captured body gives the fail line. Serves R2, R3.2, R3.3, R6.1.
- [x] 8. Import scan test: only `send.ts` calls cloud jobs; `ONLY_ON_DEVICE` jobs do not import it. Serves R1.2, R1.3.
- [x] 9. Egress line part: large sentence, check or crossed octagon icon, failure colour only on fail, pinned to the bottom of zone 2; unit tests on the DOM. Serves R5.1, R5.5.
- [x] 10. Ledger sync: the entries shown as text before "Save ledger", anonymous sign-in, store write of counts, hashes and times only; unit tests with a fake store. Cut order: first to cut. Serves R7.4, R7.5.
- [x] 11. Shared `assertNoLeak` helper with case folding, raw note whole and by line; unit test with a seeded leak that the helper fails. Serves R8.1, R8.5.
- [x] 12. REAL BROWSER, BUNDLED, H3. Seeded leak through the test-only hook: the line shows "Egress check failed" and "Found", the crossed octagon icon, and computed colour `#B3261E` on the line's text. Serves R6.2. Ran 2026-11-13 (results/real-browser-2026-11-13.json).
- [ ] 13. REAL BROWSER, BUNDLED, H2 part A. Full invented-visit run against the doubles with the request recorder across page and service worker, including draft, rewrite, second reader and ledger save: no request carries a listed name, a surface form or the raw note; write `results/h2-part-a.json`. Serves R8.1 to R8.3. Status 2026-11-13: left unticked. Draft and second reader ran with the recorder and passed (`results/h2-part-a.json`, partial). Rewrite and ledger save could not be run: no control on the screen.
- [ ] 14. REAL BROWSER, BUNDLED, H2 part B. Prerequisite: the product owner has enabled the AI service and set `AI_SERVICE_ENABLED`. The same run against the real cloud service with invented people only; also assert the page's captured body equals Playwright's recorded body byte for byte; write `results/h2-part-b.json`. Until it passes, the page and README keep "not yet checked against the real service". Serves R3.4, R8.3, R8.4.
- [x] 15. Ruling 24, one road out. The outgoing text is assembled only from text that went through the masker, including every field of the record and every model output. Test first: a record field holding a listed surname that is not in the rough note comes out masked in the outgoing text.
- [x] 16. Ruling 24, what the check scans. The egress check scans for each listed full name, each listed other name and each single part of a listed name of three letters or more, ignoring case. Test first with a surname-only leak and a first-name-only leak; the line says what was checked.
- [x] 17. Browser fact 3. The request recorder watches the host `firebasevertexai.googleapis.com`; a unit test asserts that the device jobs produce no request at all, and the DEVICE MODEL run asserts the same in Chrome and writes `results/device-jobs-no-request.json`. Status: the unit part is done and passing (`src/egress/watch.ts`, `tests/unit/deviceJobsNoRequest.test.ts`). The DEVICE MODEL run ran 2026-11-13 in Google Chrome 157.0.8103.79 (results/device-jobs-no-request.json): pass.

## Second review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the second review: the cut order note "Ledger sync: first to cut" in task 10, for the control and the entries text only (replaced by task 20, U7). Task 13 stays unticked: the two controls it missed now have tasks 20 here and drafting 20, and it is run after them.

- [x] 18. Test first: characterise the scan. Unit tests against the code as it is for every case of R9.2 (URL query, body, three-letter part as a whole word, the same letters inside "Tomorrow", five or more letters inside a longer word, surname only, first name only). If one fails, change R9.1 to the code's behaviour and write the difference to OPEN-QUESTIONS. Serves R9.1, R9.2 (U10, S10).
- [x] 19. Test first, then code: the "Scanned:" line under the egress line, built from the string table with the two numbers from the constants, and the README section from the same strings. Unit tests that the R5 sentences are unchanged and that the key phrases are on the page string and in the README. Serves R9.3, R9.4 (U10).
- [x] 20. Test first, then code: the "Save ledger" control. Unit tests: absent before a send; present after one, at least 44 px high, with the entries as text beside it; one press calls `syncLedger` once with a store double; the line "Written to the test double. Not connected." while not connected and a computed count when connected; the written object has no text field and none of the 12 names; a second press with nothing new writes nothing. Serves R10.1 to R10.4 (U7).
- [x] 21. REAL BROWSER, BUNDLED, V6 (ledger part). After a send in the invented visit: "Save ledger" is present, its entries are shown as text before the press, the press calls the store double once, and the line says "not connected". Serves R10.5 (V6). Ran 2026-11-13 in session C05 (results/real-browser-2026-11-13-c05.json): pass. "Calls the store double once" is seen as the message "Written to the test double. Not connected." and no request outside the page. Check: `tests/e2e/bundled/secondReview.spec.ts`.

## Third review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. Invented people only.

Retired by the third review: the unit of the masked count in R4.2 (distinct surface forms), replaced by R11; no task is retired.

- [x] 22. Test first, then code: one count. The mask result lists its entries (tag, original, recorded forms); the preview and the send count the entries applied to the masked record part of the text; the line and the ledger use that number. Unit tests (Y2) for R11.1 to R11.4, and the older line and ledger tests rewritten where they counted forms. Serves R11.1 to R11.4 (X2).


## Fourth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the fourth review: task 13 (partial H2 part A), replaced by task 23.

- [x] 23. REAL BROWSER, BUNDLED, H2 part A in full (K3, L5). One run against the test doubles: the invented visit, masks, "Shorter" on one sentence, draft, second reader, "Save ledger". The request record lists every request across page and service worker; none leaves the page; no request carries a listed name, a surface form or the raw note. Write `results/h2-part-a.json` with pass, or what was seen, and the steps that ran. Serves R12. Ran 2026-11-13 in session E03 (results/h2-part-a.json, results/real-browser-2026-11-13-e03.json): pass. Steps: invented visit, masks, "Shorter", draft, send, "Save ledger", second reader; no request outside the page, none with a body, no leak. Check: `tests/e2e/bundled/egress.spec.ts`.
- [ ] 24. Test first, then code: the scan words fold behind "What this check scans". The unit tests are shell-and-offline task 59 and the check in the browser is shell-and-offline task 60. Serves R13.

## Fifth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-fifth-review-the-result-is-a-card.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the fifth review: the paragraph form of the egress line in R5.2 to R5.5 and the tests that assert it (rewritten by task 25); the "Scanned" fold without the near-variants sentence (task 26). Shell-and-offline task 60 (L8) is replaced by task 28 here.

- [x] 25. Test first, then code: the card data. `buildLines` gives a verdict line and rows (R14.1 to R14.3); the older line, send, ledger and draft tests that read `headline`, `masked`, `checked` and `notConnected` are rewritten to read the verdict and the rows. Serves R14.1 to R14.3, R14.7 (N1).
- [x] 26. Test first, then code: the card on the page. The egress line part draws the verdict with its icon and a table of rows, with no paragraph inside the card; the failure class and the crossed octagon on a fail; the near-variants sentence moves into the fold "What this check scans"; styles for the card. Serves R14.2 to R14.6 (N1).
- [x] 27. Test first: the strings. The pass, on purpose, fail and block verdicts and the row labels are in the string table; at most ten words on a pass; no banned word, no digit. The R5 string test of the scan words is rewritten. Serves R14.7 (N1).
- [x] 28. REAL BROWSER, BUNDLED, P1. At 1440 x 900 after a send: the verdict line is one line, the table has three rows, the card holds no paragraph; the seeded leak names the count in the failure colour with the crossed octagon and in words; L8 passes with the folds closed. Serves R14.8 (P1). Ran 2026-11-13 in session F03 (results/real-browser-2026-11-13-f03.json): pass. Checks: `tests/e2e/bundled/egress.spec.ts` (P1 and the seeded leak, picture 13).

## Sixth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the sixth review: the fail row "Mask them, then send again." (task 33). The tests that assert it are rewritten by that task.

- [x] 29. Test first, then code: the block line. The words in the string table; the line beside Send names the count and shows each listed name as a chip; Send is unavailable; pressing the chip masks it again and the line goes. Serves R15.1, R15.2, R15.7 (R2).
- [x] 30. Test first, then code: the step line shows Send as stopped, in words and in shape. Serves R15.3 (R2).
- [x] 31. Test first, then code: "Try to send a listed name" under the outgoing text, only on the invented visit, one press unmasks one listed name. Serves R15.4 (R2).
- [x] 32. Test first: nothing is sent while the block holds, and a name typed into the outgoing text blocks. Unit tests with a spy on `fetch` and `XMLHttpRequest`, and over the preview. Serves R15.5, R15.6 (S2).
- [x] 33. Test first, then code: the failed check says the text has left: the two rows, "Seeded for a test." only on the seeded path. Older fail tests are rewritten. Serves R16.1 to R16.4 (R3).
- [x] 34. REAL BROWSER, BUNDLED, S2. On the invented visit: the block line with the name as a chip, Send unavailable, step line stopped, no request in the record, the chip press restores Send. Serves R15.8 (S2). Ran 2026-11-13 in session G03 (results/real-browser-2026-11-13-g03.json): pass. Block line "Not sent: 1 listed name is in this text:" with the name as a chip, Send disabled, the step shown as stopped on one row, no request after the press, and the chip press brought Send back. Check: `sixthReview.spec.ts` (S2).
- [x] 35. REAL BROWSER, BUNDLED, S3, seeded path. The fail card holds the two rows and "Seeded for a test." Serves R16.4 (S3). Ran 2026-11-13 in session G03 (results/real-browser-2026-11-13-g03.json): pass. The seeded fail card holds "What happened", "What to do" and "Seeded for a test.", and no "Mask them, then send again". Check: `sixthReviewSeeded.spec.ts` (S3).

## Session H15 (2026-11-14): status per request

- [x] 36. Test first, then code: the capture records each request's status or "no answer"; the card's request row reads "answered <status>" or "no answer", with "drafted on this device" when the source is ON_DEVICE; the words are in the string table. Tests: `tests/unit/egressStatusRow.test.ts`. Serves R17.1 to R17.4. Session H15: 9 of the 10 tests failed on the starting commit, all pass after `src/egress/{capture,check,line,send}.ts` and `src/app/strings.ts`.
- [x] 37. Test first: `tests/unit/noSecretsInResults.test.ts`. Serves R17.5. Session H15: passes with the local files present, after the new records were written.
