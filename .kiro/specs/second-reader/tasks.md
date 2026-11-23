# Second reader: tasks

Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks say BUNDLED or DEVICE MODEL (browser document) and stay unticked unless a session is told to run them. Invented people only.

- [x] 1. Types and evidence check; unit tests: quotes not in the masked text are dropped, and the all-dropped line is shown. Serves R2.1, R2.2.
- [x] 2. Redaction of the reply; unit tests: a listed name in capitals and a recorded surface form are replaced by their tags, the line is shown when anything was replaced, the raw reply is never written to storage. Serves R3.
- [x] 3. Interface and double; unit tests: mode `ONLY_IN_CLOUD`, double gives `IN_CLOUD` with `connected: false` and "not connected". Serves R1.2, R1.5.
- [x] 4. Real implementation through the SDK behind the interface, on the double until the service is enabled; unit tests with a fake SDK. Serves R1.
- [x] 5. Send through the egress module; unit tests: the shown text equals the job's `text`, the preview check applies, ledger entry has job `secondReader`. Serves R1.3, R1.4.
- [x] 6. Offline and error behaviour; unit tests with a fake probe and a throwing fake. Serves R4.
- [x] 7. Panel part: notice before Send, results with source label, tappable quote chips wired to tap-to-mask, ask again, the standing sentence, "not connected"; unit tests on the DOM. Evidence taps are third in the cut order. Serves R1.4, R2.3 to R2.6.
- [x] 8. REAL BROWSER, BUNDLED. Click-through with the double: mask through a quote, ask again, two ledger entries, and the redaction line shown for the fixture reply that names an invented listed client. Serves R2.3, R2.6, R3.1, R3.2. Ran 2026-11-13 (results/real-browser-2026-11-13.json).
- [x] 9. REAL BROWSER, BUNDLED, H2. The second-reader call is part of the egress-check H2 part A run, and of part B once the product owner has enabled the AI service. Serves R5. Ran 2026-11-13 as part of the part A run (draft and second reader); part B has not run.


## Fourth review (2026-11-13): new tasks

Retired by the fourth review: none. Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md`.

- [ ] 10. Test first, then code: the explanation folds behind "What a second reader is". The unit tests are shell-and-offline task 59 and the check in the browser is shell-and-offline task 60 (L8). Serves R6.

## Judge table fix 5 (2026-11-14): one pass on the real service

- [x] 11. Test first, then code: the pass is read from the bytes the send path captured (`readPass` in `src/secondReader/flow.ts`) and shown under the guesses (`data-reader-pass`). Failure tests: a double gives "no bytes left", and a job that says IN_CLOUD but made no request is not a pass that left. Unit tests in `tests/unit/secondReaderPass.test.ts`. Serves R5.
- [x] 12. REAL BROWSER, BUNDLED, against the real service, told to run by this session. `tests/e2e/bundled/secondReaderReal.spec.ts` fails if no cloud request was recorded, if the status is not 200, if the label is not "in the cloud", or if the pass line disagrees with the recorded request. Wrote `results/second-reader-real-service.json` and `docs/screens/17-second-reader-real-service.png`. Serves R5. Ran 2026-11-14 (results/second-reader-real-service.json).

## Session H11 (2026-11-14): two counts and a flaky test

- [x] 13. Test first, then code: two byte counts. Ran 2026-11-14 (session H11): `tests/unit/secondReaderCounts.test.ts` failed 11 of 11 on the old pass line, then passed after the change; the results file `results/second-reader-real-service.json` now holds both counts from a run of `secondReaderReal.spec.ts` (1,012 bytes in one request to the model; 1,066 bytes in 2 requests with the App Check exchange). `tests/unit/secondReaderCounts.test.ts` (R7.1 to R7.3). Code: `src/secondReader/flow.ts`, `src/app/zones/readerPanel.ts`, `src/app/strings.ts`, and the results written by `tests/e2e/bundled/secondReaderReal.spec.ts`. Serves R7.
- [x] 14. Find and fix the cause of the `secondReaderOffline` failure. Ran 2026-11-14 (session H11): 1 failure in 50 runs alone before the change; the cause is in `.kiro/specs/OPEN-QUESTIONS.md`; after the change 50 of 50 alone and three full-suite runs passed. Run the file 50 times alone and the whole suite three times before the change, keep the output, change the test or code, then show 50 passes alone and three full-suite passes. Serves R8.1.

## Session H14 (2026-11-14): the second reader says what it infers

- [x] 15. Test first, then code: schema, `parseReply`, instructions and `READER_CLOUD_MODEL`. `tests/unit/secondReaderInfers.test.ts`. Ran 2026-11-14 (session H14): 16 of its 22 tests failed on the starting code (the other 6 are guards that held before too), all 22 pass after. Serves R9.
- [x] 16. Test first, then code: `redactReply` on `description` and `why`. `tests/unit/secondReaderInfers.test.ts`, passes. Serves R9.
- [x] 17. Test first, then code: the panel shows "Guess: <description>", the why line and the kind, chips for quotes with maskable words, and hides and counts tag-only guesses; the flow carries the fields past `keepEvidence`. `tests/unit/secondReaderInfers.test.ts`; `keepEvidence` unchanged (`tests/unit/secondReaderEvidence.test.ts`). Serves R9.
- [x] 18. REAL BROWSER, BUNDLED, against the real service, told to run by this session: `tests/e2e/bundled/secondReaderLoop.spec.ts`, writes `results/second-reader-loop-<date>.json`, and since H23 `docs/screens/18-second-reader-ask-again.png` only when RETAKE_SCREENS names it; `docs/screens/17-second-reader-real-service.png` is from the hybrid run (`results/hybrid-run-2026-11-14-h20.json`). Ran 2026-11-14 (results/second-reader-loop-2026-11-14.json): two calls, both 200. Serves R9.7.
- [x] 19. Test first, then the README: the lines about the second reader are written from the new record and a test checks them against `results/second-reader-loop-2026-11-14.json` (`tests/unit/readmeSecondReaderLoop.test.ts`). Serves R9.
