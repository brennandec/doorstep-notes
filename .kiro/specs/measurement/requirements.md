# Measurement: requirements

Source: BRIEF.md "Measured, not asserted", Rule 8, acceptance H5, H8, H9. Owner documents of 2026-11-13: rulings 6, 7, 9, 20, 22, the browser on this computer. Everything shown comes from a file in `results/`. No file means "not measured".

All people in the set are invented.

## Requirements

### R1. Synthetic set
- 1.1 A script builds about 200 rough notes (`SYNTHETIC_SET_SIZE` in the constants file) about plain home visits: a housing visit, a missed appointment, a benefits form. Each note has known identifiers with their positions: listed names, other names, places, dates of birth, describing phrases.
- 1.2 Names come from a fixed list of invented first names and surnames; the script has a fixed seed so the set is the same each run. A unit test builds twice and compares.
- 1.3 Each note has its own invented client list. Some notes include identifiers not on the list, and some include near variants at edit distance 1.
- 1.4 Notes vary: typed shorthand, nicknames, misspelled names, hyphenated surnames, names split across a line.
- 1.5 Fixtures live in `scripts/` or `tests/`; none in `src/`. The dramatic-word scan of shell R6.4 covers them.
- 1.6 The set is written to `results/synthetic-set.json` with its seed and count.

### R2. Same input for every pass (rulings 6, 7)
- 2.1 The exact pass, the near pass and the device pass each run on the raw synthetic note, never on text already masked by another pass.
- 2.2 Results are reported for each pass separately on the same notes, then for the merge of all passes as the app does it (masking R4.2).

### R3. Exact and near catch rate
- 3.1 A Node script runs the exact pass and the near pass on every note and counts known identifiers caught, by kind.
- 3.2 False masks (masked spans covering no known identifier) are counted and listed for the exact pass and the near pass as well as for the device pass.

### R4. Device-pass catch rate (ruling 7, browser document)
- 4.1 In a DEVICE MODEL browser, through the one fixture, the script runs the propose-masks job on each raw note and scores it.
- 4.2 The run is time-boxed: it stops at 30 minutes (`DEVICE_MEASURE_LIMIT_MIN` in the constants file). It reports how many notes were processed (n), the total in the set, the throughput in notes per minute, and the catch rate on the n processed notes only.
- 4.3 Every figure shown from this run names its n, in the form "on n of N invented notes", with n and N filled from the file. A unit test of the figure text with an invented results file.
- 4.4 It reports the browser version, the date, and the model name or version if Chrome gives one.
- 4.5 If the fixture reports Chrome or the model absent, the file says "not measured" for the device pass and gives the reason. No number is filled in. The double is never used for a reported figure.
- 4.6 The device run is not part of `npm test`. It has its own command with its own time limit, `perl -e 'alarm 1900; exec @ARGV' npm run measure:device`, so the 300 second test limit is not exceeded.

### R5. Misses listed
- 5.1 Every missed identifier is listed with note id, kind and text, for exact alone, near alone, device alone, and the merge.
- 5.2 Every false mask is listed with note id and text for each pass.

### R6. Results files
- 6.1 Files: `results/synthetic-set.json`, `results/catch-rate.json`, `results/misses.json`, `results/device-model-check.json`, `results/cold-start.json`, `results/h1.json`, `results/h2-part-a.json`, `results/h2-part-b.json`, `results/h4.json`, `results/device-structured-output.json`, `results/device-token-limit.json`, `results/draft-network-drop.json`. Each has the date, the browser name and version, the script name and version.
- 6.2 Files are written by scripts only, never by hand.
- 6.3 The app reads figures from these files. A missing or unreadable file shows "not measured". A unit test removes a file and checks the text.
- 6.4 The page shows each figure with its date and browser.

### R7. Number audit (ruling 22)
- 7.1 The README figures come from the same files, written by a small script so they cannot drift.
- 7.2 The audit covers measured figures. Fixed numbers (targets, limits quoted from documentation, layout sizes, set size, time box) live in `src/constants.ts` with their source and are exempt by name (shell R16).

### R8. Cold start (H8, ruling 20)
- 8.1 A DEVICE MODEL script measures time from page load to the first structured record with the model already downloaded, on the author's computer. The time, date, browser and a description of the machine are written to `results/cold-start.json`.
- 8.2 H8 passes at 60 seconds or less. A longer time is a failure with the number. Chrome or the model absent is a failure with its reason, never a pass.
- 8.3 The page shows the figure only as being about the author's computer; for the computer in use it reads "not measured".

### R9. Honest limits
- 9.1 The page and README say the figures describe an invented set and do not describe real notes.
- 9.2 No claim is made that a catch rate predicts real use.

### R10. Acceptance (H5, H9)
- 10.1 H5 passes when figures for exact alone and with the device pass exist, each with misses listed, or the device figure is marked "not measured" with a reason.
- 10.2 Scripts have unit tests for the set builder (same seed, same set; identifier positions match the text) and for the scoring functions.

## Acceptance map

| Brief or owner item | Covered by |
|---|---|
| H5 | R1 to R5, R10.1 |
| H8 | R8 |
| H9 | R10.2 |
| Ruling 6, 7 | R2, R4 |
| Ruling 20 | R8 |
| Ruling 22 | R7 |

## Second review (2026-11-13): requirements R11 and R12

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md` (direction U2 and U9; seen problems S2 and S9; acceptance V2 and V7). The second review wins over this spec where they differ.

### R11. The figures go on the screen (U2, S2, V2)
- 11.1 In the masks view in zone 1, under the masking controls, the page shows two lines built from `results/catch-rate.json` and never typed:
  - Line one: "On 200 invented notes her list alone found 509 of 1,141 identifying details. With the model on this device: 1,033." followed by the date and browser of each part, and "Measured on the author's computer." The 200, 509, 1,141 and 1,033 shown here are the values of 2026-11-13; the page takes every number from the file. "Her list alone" is the exact and near passes together. "With the model on this device" is the merge of all passes. Numbers of a thousand or more carry a thousands separator.
  - Line two: "The model on this device also suggested 97 things that were not needed." The 97 is the device pass's false masks from the file.
  - Each line names n and N for the device part, in the form "on n of N invented notes" (R4.3), and carries the date and browser of its own run. The exact and near part is run in Node and says so ("Node v22.23.2, no browser") as the file does.
- 11.2 When `catch-rate.json` is absent, unreadable, or a field is missing or of the wrong type, the part reads "not measured". A unit test passes a lookup without the file and asserts both lines read "not measured". The test does not move the real file.
- 11.3 The page and the README status block use the same functions in `src/app/figureText.ts`, so they cannot differ. The README block is written by `npm run measure:readme` and states the same two lines. A unit test reads `results/catch-rate.json`, the README block and the page text built from the same file and asserts the numbers are equal (V2).
- 11.4 Near the lines the page says the figures describe a set of invented notes and do not describe real notes (R9.1).
- 11.5 When the file holds two device runs (R12), the page shows the later one.

### R12. A second device measurement, both kept (U9, S9, V7)
Wins over: R4.2 and R4.6, which set the time box at 30 minutes and the wrapper at 1900 seconds. The time box is now 15 minutes.
- 12.1 `DEVICE_MEASURE_LIMIT_MIN` in `src/constants.ts` is 15, with its source changed to the second review (V7). The `measure:device` wrapper becomes `alarm 1200`. A unit test asserts both.
- 12.2 The run is made after masking R16 is in the code, on the same 200 notes from `results/synthetic-set.json`, in a DEVICE MODEL browser.
- 12.3 The first run is kept. Before the second run writes anything, the script copies `results/catch-rate.json` to `results/catch-rate-run-1.json` and `results/misses.json` to `results/misses-run-1.json`, and refuses to overwrite either if it exists. A unit test of the copy and the refusal.
- 12.4 `results/catch-rate.json` then holds `deviceRuns`, an array of two entries, each with a label ("first run, before the prompt change" and "second run, after the prompt change"), n, N, date, browser, caught, total, false masks, throughput and the merged score. A function `compareRuns` returns a line for both runs side by side, for example "False masks: first run 97, second run X. Identifiers caught: first run 945, second run Y." Unit tests with invented run entries.
- 12.5 The README status block shows both runs side by side. The page shows the second (R11.5).
- 12.6 The result is reported as it is. A rise in missed identifiers or no fall in false masks is written down as such; no target is changed (U11). The run is outside `npm test`.

## Second review: acceptance map

| Item | Covered by |
|---|---|
| U2, S2 | R11 |
| V2 | R11.2, R11.3 |
| U9 (measure again), S9 | R12 |
| V7 | R12 (DEVICE MODEL) with R11.5 |

## Fourth review (2026-11-13): requirement R13

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md` (J3, K4, L6). The fourth review wins over this spec where they differ.

### R13. A third device measurement, all three kept (K4, J3, L6)
Wins over: R11.5 and R12.5, where the page shows the second run. The page and the README now show the third. Nothing else in R11 or R12 is retired.
- 13.1 The run is made after masking R18 is in the code, on the same 200 notes from `results/synthetic-set.json`, in a DEVICE MODEL browser, time-boxed to 15 minutes with the `alarm 1200` wrapper (R12.1).
- 13.2 Both earlier files are kept. Before the third run writes anything, the script copies the current `results/catch-rate.json` and `results/misses.json` to `results/catch-rate-run-2.json` and `results/misses-run-2.json` and refuses to overwrite either if it exists. `results/catch-rate-run-1.json` and `results/misses-run-1.json` are untouched.
- 13.3 `results/catch-rate.json` then holds `deviceRuns` with three entries, each with a label, n, N, date, browser, caught, total, false masks, throughput and the merged score. `compareRuns` returns a line for the three runs side by side. Unit tests with invented run entries.
- 13.4 The result is reported as it is. No target is set; a lower found count is recorded as lower.
- 13.5 The page and the README figure lines come from the same function (`src/app/figureText.ts`) and show the third run, with its own date and browser.

## Fourth review: acceptance map

| Item | Covered by |
|---|---|
| K4, J3 | masking R18 and R13 here |
| L6 | R13 (DEVICE MODEL) |

## Fifth review (2026-11-13): requirement R14

Source: `docs/decisions/2026-11-13-fifth-review-the-result-is-a-card.md` (direction N4, seen problem M4, acceptance P4). Not built in the session that wrote it; the tasks wait.

### R14. Say what the 61 are (N4, M4, P4)
- 14.1 A script lists the not-needed suggestions of the third run by kind: a common word, a first name that is nobody in the note, a place word, a number, a date word, other. It writes the kinds with counts into `results/`. If the stored run does not hold the suggested strings, the measurement is run once more with the strings kept, time-boxed to `DEVICE_MEASURE_LIMIT_MIN` (15) minutes, and the earlier files are kept.
- 14.2 The README gains one sentence with the three largest kinds and their counts. A test reads the results file and the README and fails when they differ.
- 14.3 At most one rule is added to the filter in `src/masking/notNeeded.ts`, and only if on the stored run it removes at least ten not-needed suggestions and no true one. Then the measurement is run once more and the fourth run is kept beside the three. Otherwise nothing changes. The unit tests cover the rule.
- 14.4 No target changes. A miss is recorded as a miss.

## Fifth review: acceptance map

| Item | Covered by |
|---|---|
| N4, M4, P4 | R14 |

## Sixth review (2026-11-13): requirement R15

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md` (direction R6, acceptance S6). Not built in the session that wrote it; the tasks wait.

### R15. A fourth device measurement (R6, S6)
Wins over: R14.3 where one rule needs evidence from the stored run first.
- 15.1 After masking R19 is in the code, the device pass is measured a fourth time on the same 200 notes, in a DEVICE MODEL browser, time-boxed to 15 minutes with the `alarm 1200` wrapper. The three earlier files are kept: the script copies `results/catch-rate.json` and `results/misses.json` to `-run-3` names first and refuses to overwrite.
- 15.2 If the found count for dates of birth drops below the third run's, the rule is taken out again, the page and README show the run that stands, and the fourth file is kept as the record of the try.
- 15.3 The page and the README show the run that stands, from the same function. A miss is recorded as a miss. No target changes.

## Session H11 (2026-11-14): requirement R16

Source: the product owner's instruction for chain H11, item 5.

### R16. The README status says what the results files say
- 16.1 The status lines about the cloud half in `README.md` are written by `npm run measure:readme` from `results/cloud-draft-2026-11-14.json`, `results/rewrite-real-service.json` and `results/second-reader-real-service.json`, between the markers `<!-- status:start -->` and `<!-- status:end -->`. Each line carries the date and browser of its file.
- 16.2 "Not yet checked against the real service" appears only for what the files show no run of (H2 part B, the full run with every request recorded; the network drop). It does not appear beside a line that says a cloud call answered.
- 16.3 Test (`tests/unit/readmeStatus.test.ts`): the README block equals the generated block; with a results file missing, the line says "not measured"; with all three present, no line says the cloud draft is not checked.

## Session H15 (2026-11-14): requirement R17

Source: the product owner's instruction for chain H15.

### R17. H2 part B, H4 and the network drop are recorded in Google Chrome with the model and the real cloud
- 17.1 One run in Google Chrome with the built-in model and the real cloud (`tests/e2e/device/hybridRun.spec.ts`) writes `results/hybrid-run-<date>.json`, `results/h2-part-b-<date>.json` and `results/h4-<date>.json`. The record, masks, offline draft and "Shorter" answer on this device; the second reader and the online draft answer in the cloud. Each step holds mode, inferenceSource, label, presses and seconds.
- 17.2 `h2-part-b-<date>.json` reads pass only when every assertion held: no listed name, other name, surface form, masked original, raw-note line or photo byte in any address or body; no outside request while offline; every outside host on the allow list; no Markdown mark, tag or token in either draft.
- 17.3 One run with the model call cut (`tests/e2e/device/draftNetworkDrop.spec.ts`, a simulated drop by `route.abort`) writes `results/draft-network-drop-<date>.json`.
- 17.4 Each record holds the date, browser, machine, build commit and, for each request, the host, method, path without the query (project and app ids replaced), body bytes, sha256 and status. No full URL, no HAR.
- 17.5 Old records are never edited. The footer and the README read the newest dated `h2-part-b` record, falling back to `h2-part-b.json`.

## Session H18 (2026-11-14): requirement R18

Source: the product owner's instruction for chain H18, after `results/draft-network-drop-2026-11-14-h16.json` stopped on "expect(locator).toBeVisible() failed" and named no element.

### R18. A check that waits names what it waits for
- 18.1 Every wait for something to show or to become enabled in `tests/e2e/device/draftNetworkDrop.spec.ts` goes through `tests/e2e/device/named.ts`. A failure reads "<element> was not visible within N s", "<element> was not enabled within N s", or "none of: <names>, was visible within N s". The name says what the element is and gives its selector.
- 18.2 A wait for one of two elements does not fail when both show; it returns the first named. (The cause of the H17 record: the spec waited on `sheet.or(p.error)`; the held-Copy line is also a `p.error`, so the locator matched two elements. The spec was wrong. The product was right: a fallback draft with an open flag holds Copy.)
- 18.3 A run that stops records the first three lines of the error, so the locator is kept.
- 18.4 `draftNetworkDrop.spec.ts` runs once in Google Chrome with the built-in model and the real cloud, at most 3 generateContent calls counted (the cut call counts as one), and writes a new record with the suffix `h18`. Older records stay.
- 18.5 Tests are written before the code. Test: `tests/unit/namedElements.test.ts`.
