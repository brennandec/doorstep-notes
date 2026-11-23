# Measurement: tasks

Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks say BUNDLED or DEVICE MODEL (browser document) and stay unticked unless a session is told to run them. Results files are written by scripts only. Invented people only.

- [x] 1. Results types and header writer; unit test: header holds date, browser, script and version. Serves R6.1, R6.2.
- [x] 2. Seeded set builder; unit tests: same seed gives the same set, identifier spans match the note text, about 200 notes, all names from the fixed invented list, near variants at edit distance 1, the dramatic-word scan passes. Serves R1.
- [x] 3. Scoring functions; unit tests: full cover caught, partial cover missed, false masks counted for every pass, per-kind totals, scoring on the first n notes only. Serves R3.2, R5, R10.2.
- [x] 4. Exact and near measure script in Node on each raw note separately, after masking tasks 4 and 5; writes those parts of `catch-rate.json` and `misses.json`. Serves R2, R3, R5.
- [x] 5. `figures.ts` reader; unit tests: missing or unreadable file gives "not measured", figures carry date and browser, device figures name n and N, H8 reads "on the author's computer". Serves R4.3, R6.3, R6.4, R8.3.
- [x] 6. Figures section and README writer; unit test with the shell number audit: every README number comes from a results file or is a named constant. Serves R7, R9.
- [x] 7. REAL BROWSER, DEVICE MODEL. Device measure script through the fixture on each raw note, stopped at 30 minutes, under its own 1900 second limit and outside `npm test`; writes n, throughput, device and merged scores and false masks, or "not measured" with the reason. Serves R2, R4. Ran 2026-11-13 in Google Chrome 157.0.8103.79 (results/catch-rate.json, results/misses.json): this session set a 15 minute limit and a 1200 second wrapper; all 200 of 200 notes were answered in 475 seconds, so the limit was not reached. Script: `npm run measure:device` (scores in `scripts/deviceScore.ts`, unit tests in `tests/unit/scripts/deviceScore.test.ts`).
- [x] 8. REAL BROWSER, DEVICE MODEL, H8. Cold start script; writes `cold-start.json` with seconds, date, browser and machine; over 60 seconds, or Chrome or the model absent, is a failure with its reason. Serves R8. Ran 2026-11-13 in Google Chrome 157.0.8103.79 (results/cold-start.json): pass. One run served capture-and-record task 18; script: npm run measure:cold-start.
- [x] 9. Run order check: set, exact, device, cold start; list which results files exist and which read "not measured". Serves R10.1.
- [x] 10. Final: tests, type check and build green; real-browser misses and failures recorded in `results/`. Serves H9. Done 2026-11-13: suite, type check and build green; H2 part B and the network-drop check written as misses by `npm run measure:misses` (results/h2-part-b.json, results/draft-network-drop.json); H2 part A (partial) and the rest were recorded by earlier sessions.

## Second review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Results files are written by scripts only. Invented people only.

Retired by the second review: the 30 minute time box and the 1900 second wrapper of task 7 (replaced by task 15, V7).

- [x] 11. Test first, then code: the screen figure lines. A function in `src/app/figureText.ts` builds line one and line two of R11.1 from a results lookup, with thousands separators, n and N for the device part, and the date and browser of each part. Unit tests with an invented results file, and with a lookup that has no `catch-rate` file, an unreadable one and one with a wrong field type: each part reads "not measured". Serves R11.1, R11.2 (U2, V2).
- [x] 12. Test first, then code: mount the two lines in the masks view in zone 1 with the invented-set caveat. Unit tests on the DOM for their place under the masking controls, the caveat, and the page showing the later device run when two exist. Serves R11.1, R11.4, R11.5 (U2).
- [x] 13. Test first, then code: README and page agree. Change `scripts/writeReadme.ts` to use the same function; a unit test reads the real `results/catch-rate.json`, the README block and the page text and asserts the numbers equal; then regenerate the block with `npm run measure:readme`. Serves R11.3 (U2, V2).
- [x] 14. Test first: with an injected lookup that lacks `catch-rate`, the rendered page says "not measured" in both lines and shows no digit from any figure. The real file is not moved. Serves R11.2 (V2).
- [x] 15. Test first, then code: the second-run changes to the device measurement. `DEVICE_MEASURE_LIMIT_MIN` becomes 15 with its source; the `measure:device` wrapper becomes `alarm 1200`; the script copies `catch-rate.json` and `misses.json` to the `-run-1` files and refuses to overwrite them; `deviceRuns` and `compareRuns` as in R12.4. Unit tests for each, including the refusal. Serves R12.1, R12.3, R12.4 (U9).
- [x] 16. REAL BROWSER, DEVICE MODEL, V7. After masking task 25: run `perl -e 'alarm 1200; exec @ARGV' npm run measure:device` in Google Chrome with the built-in model on the same 200 notes, time-boxed to 15 minutes; both runs are in the results file; regenerate the README block; the page shows the second run. A miss with its reason when Chrome or the model is absent. Serves R12.2, R12.5, R12.6 (V7). Ran 2026-11-13 in Google Chrome 157.0.8103.79 (results/catch-rate.json, catch-rate-run-1.json, misses.json, misses-run-1.json): 200 of 200 notes in 453 seconds, limit not reached. Second run caught 927 of 1,141 (first run 945) with 66 false masks (first run 97); merged 1,019 of 1,141 (first run 1,033). Fewer false masks, fewer identifiers caught: phrases 37 to 28, listed names 383 to 379, places 226 to 221. README block regenerated; the page reads the later run.


## Fourth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the fourth review: the wording of R11.5 and R12.5 that the page shows the second run (the third run replaces it once task 18 has run).

- [x] 17. Test first, then code: three runs kept. The copy of run 2 and its refusal to overwrite, `deviceRuns` with three entries, `compareRuns` for three runs, and the figure lines for the page and the README from the third run. Serves R13.2, R13.3, R13.5. Ran 2026-11-13 in session E03: `keepSecondRun`, `addThirdRun`, three-run `compareRuns`; unit tests in tests/unit/scripts/deviceRuns.test.ts and tests/unit/screenFigures.test.ts.
- [x] 18. REAL BROWSER, DEVICE MODEL, L6. After masking task 27: run `perl -e 'alarm 1200; exec @ARGV' npm run measure:device` in Google Chrome with the built-in model on the same 200 notes, time-boxed to 15 minutes; all three runs are in the results; then `npm run measure:readme`. Serves R13.1, R13.4. Ran 2026-11-13 in session E03 in Google Chrome 157.0.8103.79: 200 of 200 notes in 459 seconds, limit not reached. Third run caught 946 of 1,141 (second 927, first 945) with 61 false masks (second 66, first 97); merged 1,032 of 1,141 with 77 false masks. Runs 1 and 2 kept in results/catch-rate-run-1.json and catch-rate-run-2.json (and the misses files). README block regenerated.


## Fifth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-fifth-review-the-result-is-a-card.md`. Not built in the session that wrote them. Each test is written before or with its code. REAL BROWSER tasks stay unticked unless a session is told to run them.

- [x] 19. Test first, then code: the script that lists the not-needed suggestions of the third run by kind with counts into `results/`; a miss if the stored run lacks the strings. Serves R14.1 (N4).
- [ ] 20. REAL BROWSER, DEVICE MODEL, P4. Only if task 19 finds no strings: run `perl -e 'alarm 1200; exec @ARGV' npm run measure:device` once with the strings kept, keeping the earlier files. Serves R14.1 (P4).
- [x] 21. Test first, then code: the README sentence with the three largest kinds and their counts, and a test that reads the results and the README. Serves R14.2 (P4).
- [ ] 22. Test first, then code: at most one filter rule, only on the evidence of R14.3, with unit tests. Serves R14.3 (N4).
- [ ] 23. REAL BROWSER, DEVICE MODEL, P4. If a rule was added, one more measurement, and the fourth run kept beside the three. Serves R14.3 (P4).

Fifth review, task notes (session F02):
- 19 ticked: `npm run measure:notneeded` (scripts/listNotNeeded.ts, unit tests in tests/unit/scripts/listNotNeeded.test.ts) lists the 61 strings of the third run, which results/misses.json holds under falseMasks.device, into results/not-needed-kinds.json.
- 20 not run, as written: the stored run holds the strings, so no measurement was needed.
- 21 ticked: the README sentence is written between the notneeded markers from the results file; a test compares both.
- 22 and 23 left unticked: no rule was added. See .kiro/specs/OPEN-QUESTIONS.md.

## Sixth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md`. Not built in the session that wrote them. REAL BROWSER tasks stay unticked unless a session is told to run them.

- [x] 24. REAL BROWSER, DEVICE MODEL, S6. After masking task 28: the fourth measurement beside the three; the rule is kept or taken out by R15.2. Serves R15.1, R15.2 (S6). Ran 2026-11-13 in session G02 in Google Chrome 157.0.8103.79: 200 of 200 notes in 445 seconds, limit not reached, no request outside the page. Dates of birth found by the device pass: 131 in the third run, 130 in the fourth, so the rule was taken out again. Fourth run: 927 of 1,141 caught, 37 false masks; merged 1,015 of 1,141, 53 false masks. Kept: results/catch-rate-run-3.json, misses-run-3.json (state after run 3), catch-rate-run-4.json, misses-run-4.json (the try); runs 1 and 2 untouched. results/catch-rate.json holds four deviceRuns with the fourth marked stands false and the third run's device and merged parts.
- [x] 25. Test first, then code: the page and the README show the run that stands, and a test compares them with the results. Serves R15.3 (S6). Done in session G02: `stands` in the run entries, `standingRun` and the four-run `compareRuns` in src/app/figureText.ts, `addFourthRun` in scripts/deviceRuns.ts; tests in tests/unit/scripts/fourthRun.test.ts and tests/unit/scripts/writeReadme.test.ts.

## Session H11 (2026-11-14): README status from the results

- [x] 26. Test first, then code: the README status block is written from the three cloud results files (R16). Ran 2026-11-14 (session H11): `tests/unit/readmeStatus.test.ts` failed on the old code, passes after `scripts/writeReadme.ts` and `src/app/figureText.ts`; `npm run measure:readme` wrote the block. `tests/unit/readmeStatus.test.ts`, then `scripts/writeReadme.ts` and `src/app/figureText.ts`. Serves R16.

## Session H15 (2026-11-14): both halves in Chrome

- [x] 27. Test first, then code: the fixture takes the real config and the debug token from memory; the recorder takes an allow list. Tests: `tests/unit/deviceFixtureAllow.test.ts`. Serves R17.1, R17.4.
- [x] 28. Test first, then code: the newest dated `h2-part-b` record is read by the footer, the README test and the README status. Tests: `tests/unit/newestRecord.test.ts`. Serves R17.5.
- [x] 29. REAL BROWSER, DEVICE MODEL: `hybridRun.spec.ts` once. Serves R17.1, R17.2. Ran once in session H15 (Google Chrome 157.0.8103.79): fail at step 4, "Shorter" offline waits for Send and Send is disabled offline. Records: results/hybrid-run-2026-11-14.json, h2-part-b-2026-11-14.json, h4-2026-11-14.json. Ran 2026-11-14 once more in session H17 (Google Chrome 157.0.8103.79, real cloud): pass, results/hybrid-run-2026-11-14-h16.json, h2-part-b-2026-11-14-h16.json, h4-2026-11-14-h16.json.
- [x] 30. REAL BROWSER, DEVICE MODEL: `draftNetworkDrop.spec.ts` once. Serves R17.3. Ran 2026-11-14 in session H18 (Google Chrome 157.0.8103.79): pass, results/draft-network-drop-2026-11-14-h18.json (task 32). Earlier runs stay as failed records: results/draft-network-drop-2026-11-14.json (H15), results/draft-network-drop-2026-11-14-h16.json (H17). Ran once in session H15 (Google Chrome 157.0.8103.79): the SDK fallback wrote the note on this device and the card row read "no answer, drafted on this device"; fail because one raw-note line was in the cut request body. Record: results/draft-network-drop-2026-11-14.json. Left open: the check did not pass. See OPEN-QUESTIONS.md.
- H16 note on 29 and 30 (both stay open). Each ran once more in Google Chrome 157.0.8103.79 after the offline-Shorter change and the narrowed raw-line rule. 29: results/hybrid-run-2026-11-14-2.json, fail: steps 1 to 9 ran; Shorter offline ran on this device without Send but the device answer was not used ("The sentence could not be rewritten"); the device draft (step 5) and the cloud draft (step 8) each held a tag; the run stopped after step 9 on an invisible element. 30: results/draft-network-drop-2026-11-14-2.json, fail: the raw-line finding is gone (see OPEN-QUESTIONS.md, H16); the fallback draft held a tag. Screens 05 and 10 were not retaken from a passing run.
- H17 note on 29 and 30. 29 ticked: `hybridRun.spec.ts` ran once in Google Chrome 157.0.8103.79 with the real cloud and passed (`results/hybrid-run-2026-11-14-h16.json`, with `h2-part-b-2026-11-14-h16.json` and `h4-2026-11-14-h16.json`): 3 generateContent calls, 1 App Check exchange, steps 3 and 5 on this device, steps 6, 7 and 8 in the cloud, Bea proposed and masked, no token syntax, Copy enabled with no flag open. 30 stays open: `draftNetworkDrop.spec.ts` ran once and read fail (`results/draft-network-drop-2026-11-14-h16.json`): the check's own locator `sheet.or(p.error)` matched two elements once a flag held Copy (a `p.error` line), so it stopped with "no note". The locator is fixed in the spec (`p.error:not([data-copy-held])`); the check has not been run again, the order says once. See OPEN-QUESTIONS.md, session H17.

## Session H18 (2026-11-14): the cut mid-draft check names what it waits for

- [x] 31. Test first, then code: named waits for the cut-call spec, and the spec uses them. Tests: `tests/unit/namedElements.test.ts` (failed on the old code: no module). Code: `tests/e2e/device/named.ts`, `tests/e2e/device/draftNetworkDrop.spec.ts`. Cause of the H17 failure: the spec was wrong (its `sheet.or(p.error)` locator matched two elements). Serves R18.1 to R18.3, R18.5.
- [x] 32. REAL BROWSER, DEVICE MODEL: `draftNetworkDrop.spec.ts` once, suffix `h18`, at most 3 generateContent calls. Serves R18.4, R17.3. Ran 2026-11-14 in session H18 (Google Chrome 157.0.8103.79, real cloud): pass, results/draft-network-drop-2026-11-14-h18.json. The request row read "sent to firebasevertexai.googleapis.com · no answer, drafted on this device", the label "on this device", 1 cut attempt, 0 calls reached the service, 1 App Check exchange.
