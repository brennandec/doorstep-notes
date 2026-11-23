# Capture and record: requirements

Source: BRIEF.md "What it does" steps 1 and 2, table row 1, acceptance H1, H6, H8. Owner documents of 2026-11-13: rulings 8, 9, 10, 19, 20, 23, the look and layout (the invented visit, chips), the browser on this computer (BUNDLED and DEVICE MODEL). Facts: sdk-facts 10 to 19, 21 to 23, 29, 30 and differences 2, 7, 8, 9.

Person: a caseworker at 9 pm, after a home visit with no signal. All examples use invented people. The invented visit in R10 is the one example the app ships with.

## Requirements

### R1. Type a rough note
- 1.1 She can type or paste a rough note into the note area in zone 1 (20 px type). With the network off the text is kept in the note area and in browser storage on this device. A unit test saves and reads back an invented note with a fetch that throws.
- 1.2 No network request is made while typing, pasting or saving the note. A BUNDLED real-browser test with the request recorder asserts zero requests carry any part of the note.
- 1.3 The note is stored only through `src/storage/`; an import-rule test covers this (shell R10 task).

### R2. Add a photo of a handwritten page
- 2.1 She can add one JPEG or PNG photo with the camera control. Any other type is refused before any call with: "Only JPEG or PNG photos can be read on this device. Convert it to JPEG or PNG first." A unit test feeds GIF, PDF and HEIC types and asserts the exact line.
- 2.2 The photo is held in browser storage on this device and never sent. The BUNDLED request-recorder test asserts no request body carries its base64 text.
- 2.3 The photo is passed to the model as an inline part, base64 with its mime type (sdk-facts 21), never as a URL. A unit test asserts the part shape.
- 2.4 Photo input is the last item in the cut order (scope section of the rulings).

### R3. Check the structured-output syntax first (ruling 10)
- 3.1 Before the structuring job is built, the Firebase structured-output page for web is read again from firebase.google.com and the result is written to docs/sdk-facts.md, read or not read.
- 3.2 A DEVICE MODEL real-browser check runs one prompt with a two-field schema through the SDK in `ONLY_ON_DEVICE` mode and writes to `results/device-structured-output.json`: the option names used, whether the reply parsed against the schema, the date and the browser. When Chrome or the model is absent it writes a miss with its reason.
- 3.3 The structuring job (R4) uses the option names recorded by R3.2 when it passed, or the names on the documentation page when R3.2 is a miss. In the second case the job's code comment and docs/sdk-facts.md say the syntax is not checked in a real browser.

### R4. Make a structured visit record on the device
- 4.1 When she presses "Make the record", the structure job runs in `ONLY_ON_DEVICE` mode. A unit test asserts the job's `mode` value.
- 4.2 The result has these fields: visit date, people present (tags), what was seen, what was agreed, risks, next steps. Missing items are empty lists or an empty date, not invented text. A unit test runs the schema check on good, partial and bad records.
- 4.3 A result that fails the schema check is shown as "The device could not make a clean record. You can edit it by hand." with the partial text kept.
- 4.4 Every result carries the source label from `inferenceSource`. If it is not `ON_DEVICE`, the record is discarded and a line says so (a guard; it must not happen in `ONLY_ON_DEVICE`). A unit test feeds `IN_CLOUD` and asserts the discard.
- 4.5 The create options declare image input only when a photo is attached (ruling 8). A unit test asserts `expectedInputs` is text only for a typed note and text plus image with a photo.
- 4.6 The create options state `en` for input and output and carry the system prompt as an `initialPrompts` entry with role system (sdk-facts 29, difference 9).
- 4.7 Device jobs call the SDK whenever the browser reports the model `available`, whether or not the cloud service is enabled (ruling 23). A unit test with `AI_SERVICE_ENABLED` off and the device state `available` asserts the real job is chosen.
- 4.8 With the device model `downloading`, pressing "Make the record" waits for the download and shows "waiting for the device model, N%". The wait is not shown as a failure (sdk-facts 12, difference 2).

### R5. Edit the record by hand
- 5.1 Every field can be edited by hand, and people present can be added or removed as tags shown as chips.
- 5.2 She can type the whole record without any model (the route for no device model, H6). A unit test builds a full record from hand entry only.
- 5.3 Edits are kept on this device.

### R6. Device model states
- 6.1 `initializeDeviceModel()` is called only from a press and before the first prompt. A unit test asserts the call order with a fake.
- 6.2 States map to screen text as shell-and-offline R2.2 and R8 define: "ready", "downloading, N%", "not on this computer". `downloadable` shows the "Get the device model" control.
- 6.3 With the model absent, one line in zone 1 says what the device model would add and that it is not on this computer. It names no Chrome version, flag or hardware figure until a DEVICE MODEL check has passed on this computer (ruling 19). Hand entry, exact masking and cloud drafting still work (H6).
- 6.4 Availability is read with `LanguageModel.availability()` with the same options as the prompt (sdk-facts 13), in `src/inference/deviceModel.ts` only. The SDK pages read do not document an availability call of their own; this direct read is intentional and covered by a unit test with a fake `LanguageModel`.

### R7. Length guard (ruling 9)
- 7.1 The device model's error is the real check: a `QuotaExceededError`, or any error the R7.3 check shows is raised for length, is shown as "This note is too long for the device model. Split it into two parts." A unit test maps the error to the line.
- 7.2 A best-effort guard before the call adds the characters of the note, the schema text and the system prompt, plus a fixed amount for a photo, and compares the sum with a bound. The bound and the photo amount come from `results/device-token-limit.json`. Until that file exists, the guard is off and the app relies on R7.1. A unit test covers the guard with and without the file.
- 7.3 A DEVICE MODEL real-browser check finds the largest invented note that is accepted with the schema and system prompt, with and without an invented photo, and writes the bound, the photo amount, the date and the browser to `results/device-token-limit.json`. When Chrome or the model is absent it writes a miss with its reason.
- 7.4 Token counting is not used (sdk-facts 18).

### R8. Language line
- 8.1 The device model reads en, es, ja, de, fr (sdk-facts 8). The create options state `en`. A note that a simple check finds is not in English gets: "The device model may not read this language well." A unit test with an invented Welsh sentence asserts the line.

### R9. Acceptance H1 and H8 (ruling 20)
- 9.1 H1: in Google Chrome with the built-in model, with the network off, the invented note becomes a record and masks, and every result is labelled "on this device". This is a DEVICE MODEL check. When Chrome or the model is absent, H1 is recorded as a failure with its reason in `results/h1.json`; never as a pass and never as skipped without a reason.
- 9.2 H8: from a cold start with the model already downloaded, the first record appears in at most 60 seconds on the author's computer. The time, date, browser and a description of the machine are written to `results/cold-start.json`. When the model is absent, H8 is recorded as a failure with its reason.
- 9.3 The page shows the H8 figure only as a figure about the author's computer, with its date and browser. It never presents it as the speed of the computer in use; for that it reads "not measured".

### R10. The invented visit (look and layout)
- 10.1 `src/app/example/inventedVisit.ts` holds one invented rough note, an invented client list of exactly 12 names, and a prepared invented record for use when the device model is absent. A unit test asserts 12 entries, that each line parses with the masking spec's parser, and that the note contains at least one listed name, one other name from the list, one near variant and one unlisted name.
- 10.2 The note, a plain housing visit, with no injuries and no court language:

  ```
  12/11 home visit 14:00, flat 3, 14 Alder Court. Maria O-R in, sister Bea there too.
  Mould in back bedroom again, worse by the window. Landlord not replied to 2 emails.
  Maria missed the benefits form deadline last wk, letter on the table. DOB on form 3/3/87.
  Agreed: I ring landlord Mon. Maria posts form Fri. Tomas Brandvald (neighbour, also on
  my list) offered to help with the form.
  Risk: rent arrears if form is late.
  Next: revisit 26/11.
  ```

- 10.3 The client list, one line per client in the format `full name; other names; pronouns`:

  ```
  Maria Okonkwo-Reyes; Maria O-R, Mari; she/her
  Tomas Brandvold; Tom; he/him
  Priya Halloran; ; she/her
  Joel Ashworth-Nkemelu; Joe; he/him
  Sunniva Teodorescu; ; she/her
  Kwabena Lindqvist; Kobby; he/him
  Rosalind Achterberg; Ros; they/them
  Emeka Fairbairn; ; he/him
  Halina Quarshie; ; she/her
  Dmitri Oyelaran; Dima; he/him
  Wren Castellano-Hughes; ; they/them
  Agnieszka Mbatha; Aga; she/her
  ```

  In the note, "Maria O-R" and "Maria" are found by exact match, "Brandvald" is a near variant of "Brandvold" (edit distance 1, 9 letters), "Tomas" is found by exact match on the first-name part, and "Bea" is an unlisted name for the device pass to propose.
- 10.4 Both the note and the list carry the mark "invented example" until she removes them. The prepared record is marked the same way.
- 10.5 The worker in examples is Dana Whitfield, an invented person. She is not on the client list.

### R11. Not connected and doubles
- 11.1 The structure job has a test double for unit tests. In the built app the double is never chosen (ruling 23); with the model absent the job is not called and the R6.3 line shows.
- 11.2 The double never makes a network request. A unit test runs it with a fetch that throws.

## Acceptance map

| Brief or owner item | Covered by |
|---|---|
| H1 | R1, R4, R9.1 (DEVICE MODEL) |
| H6 | R5.2, R6.3 |
| H8 | R9.2, R9.3 (DEVICE MODEL) |
| H9 | unit tests and type check |
| Ruling 8 | R4.5 |
| Ruling 9 | R7 |
| Ruling 10 | R3 |
| Ruling 19 | R6.3 |
| Ruling 20 | R9 |
| Ruling 23 | R4.7, R11.1 |
| Look and layout, invented visit | R10 |

## Second review (2026-11-13): requirements R12 and R13

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md` (direction U1 and U8, seen problems S1 and S8, acceptance V1). The owner's second review is later than every other owner document and wins over this spec where they differ. Each requirement below says what it wins over.

### R12. The model never writes a date (U1, S1, V1)
Wins over: R4.2, where the visit date is a date field. From now on the date field holds the note's own words.
- 12.1 The record's date field holds the date as the note wrote it, for example "12/11". It is empty when the note has no date. The schema's description for the field says: copy the date words exactly as written; never convert, complete or add a year or a month name. A unit test asserts the description text and that the field is a string.
- 12.2 The structuring prompt forbids changing, converting or completing any date, weekday or relative day in every field ("12/11", "26/11", "Mon", "Fri", "tomorrow" stay as written), and states the exact output wanted (browser document, fact 5). A unit test asserts the prompt holds these instructions.
- 12.3 The app does not trust the prompt. A date-like token in any record field must also occur in the rough note, compared with case folding. Date-like means: day and month with `/`, `-` or `.`, with or without a year; an ISO date; a four-digit year; a month name; a weekday name or its short form; today, tomorrow, yesterday. A unit test table covers each kind. When the date field holds a token the note does not contain, the field is replaced by the first date-like words found in the note (or left empty) and a line says: "The device wrote a date that is not in your note. The words from your note are shown instead." In any other field such a token is marked "not in your note" in the record view and is left out of the outgoing text while it is marked.
- 12.4 The app, not the model, proposes a reading of the date words. `readNoteDate(words, { locale, now })` in `src/record/noteDate.ts` returns day, month, year and whether the year was assumed. The order of day and month comes from the browser's locale (`Intl.DateTimeFormat(locale).formatToParts`). The year is the year in the words if there is one, and then it is not assumed; otherwise it is the year of `now`, assumed. If one part is greater than 12 only one order is possible and that order is used. Words that cannot be read as a date ("Mon", "next week") give no reading. Unit tests with an injected clock set to 2026-11-13: "12/11" in `en-GB` reads as 12 November 2026; the same words in `en-US` read as 11 December 2026; "26/11" reads as 26 November 2026 in both; "12/11/2025" has no assumed year; "Mon" has no reading.
- 12.5 The record view shows the words and, beside them, the reading in this form: "read as 12 November 2026, assumed". Two controls, "Confirm" and "Correct", each at least 44 px. "Confirm" changes the line to "read as 12 November 2026, confirmed by you". "Correct" opens a date input; her date changes the line to "set by you: 12 November 2026". The words are never overwritten. Unit tests on the DOM for the three states.
- 12.6 No year that the rough note does not contain appears anywhere unless the same line says "assumed", "confirmed by you" or "set by you". The scan covers the record view and the outgoing text. The outgoing text carries the words as written and the reading only with its mark. A unit test runs the invented visit through a double that answers with the date "2023-12-11" and asserts that no unmarked year appears in either place, for `en-GB` and `en-US`.
- 12.7 DEVICE MODEL check (V1): in Google Chrome with the built-in model, the invented visit gives a record whose date field is the note's words, a reading that names the current year and says "assumed", and no unmarked year anywhere. The result is written to `results/date-check.json` with the date and browser, or a miss with its reason when Chrome or the model is absent.

### R13. The first control (U8, S8)
Wins over: shell-and-offline R8.3, where with no device model the prepared invented record is filled by the first press. The first control now opens hand entry.
- 13.1 When a note exists and no record does, and the device model is `available` or `downloading`, "Make the record" is the filled primary control: accent fill, enabled, no `disabled` attribute, no `aria-disabled`, opacity 1. A unit test on the DOM and a BUNDLED computed-style test.
- 13.2 In that state it is the only filled control in zone 1. Every other control in zone 1 is outlined. A unit test counts filled controls.
- 13.3 When the device model is `unavailable` or `downloadable`, the same control reads "Enter the record by hand", is filled and enabled, and opens hand entry with the cursor in the first field. When the invented example is loaded, hand entry opens with the prepared invented record filled in and marked "invented example", so every step still takes one press. When the state is `downloadable`, "Get the device model" stays as a second, outlined control (shell R8.6).
- 13.4 When no note exists the control is outlined, disabled, and says why in words: "Add a note first."
- 13.5 BUNDLED check: at 1440 x 900 the computed background of the control is the accent, its opacity is 1, and it is not disabled; with the bundled browser's model state it reads "Enter the record by hand" and the press opens hand entry.

## Second review: acceptance map

| Item | Covered by |
|---|---|
| U1, S1 | R12.1 to R12.6 |
| V1 | R12.7 (DEVICE MODEL), R12.4 and R12.6 (unit tests, both day-month orders) |
| U8, S8 | R13 |

## Third review (2026-11-13): requirement R14

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md` (direction X4, seen problem W4, acceptance Y3). The third review is the latest owner document and wins over this spec where they differ.

### R14. Day and month are read from the note's own dates (X4, W4, Y3)
Wins over: R12.4, where the order of day and month always comes from the browser's locale. Retired task: none; the tests of R12.4 for both orders stay valid for a note with no such evidence.
- 14.1 If any numeric date in the rough note has a first number above 12 and a second number from 1 to 12 (for example "26/11"), every numeric date in that note is read day first. Otherwise the browser's locale decides, as in R12.4.
- 14.2 The reading still says "assumed" until she confirms or sets it. A reading whose order came from the note's other dates carries the mark, because it is an inference.
- 14.3 The evidence is read from the rough note, not from the date field alone. With a photo and no typed note there is no evidence, and the locale decides.
- 14.4 Unit tests (Y3): "12/11" with "26/11" in the same note reads as 12 November in a month-first locale and in a day-first locale; "12/11" alone follows the locale (11 December in `en-US`, 12 November in `en-GB`); a time such as "14.30" is not evidence.

## Third review: acceptance map

| Item | Covered by |
|---|---|
| X4, W4 | R14.1 to R14.3 |
| Y3 | R14.4 (unit) |

### R15. The record says what it left out (H24)
After Make the record on the device from a typed note, the page lists each note sentence the word check finds missing from the record, as written, under the masking controls, each with one control that adds it to Seen. The app never adds a sentence by itself. The check compares words, not meaning. It does not list the visit header sentence (the record has no field for time or place) or a word lost inside a sentence that keeps two thirds of its words.

## Session H35a (2026-11-15): requirement R16

Source: orders H35-DRAFT.md as amended by H35-ISSUE.md (A2, A6), after the cold read without the built-in model (picture 03).

### R16. Ready means a session was made; a failure carries its own name
- 16.1 The status bar reads "ready" only after a model session has been made in this browser. The browser's `availability()` answer alone is not ready. The four states in words: unavailable "not on this computer"; downloadable, or available before a session has been made, "can be downloaded"; downloading "downloading, {percent}%" with the integer percent; a session made "ready".
- 16.2 When the browser answers "available" and no session has been made, `state()` makes one under the time limit, destroys it, and from then on answers "available". With no `create`, or a `create` that throws or times out, it answers "downloadable" and "Get the device model" shows. A session is made at page load only when the browser reports the model as available, so a page load never starts a download (A6).
- 16.3 After "Get the device model" the press makes a session before the model counts as ready. When none can be made the press fails, the state stays "downloadable", and Zone 1 shows "The device model could not be started ({name})." with an inline "Fill in by hand".
- 16.4 The character pre-check (`checkLength`) stays where it is, with its message (A2). A failure thrown by the model is called too long only by the model's own measure: a `QuotaExceededError` with numeric `requested` above numeric `contextWindow` (above zero), or the session's `measureInputUsage(input)` above `inputQuota`. Any other failure of "Make the record" shows "The device model could not make the record ({name})." with an inline "Fill in by hand" (`data-error-hand-entry`).
- 16.5 Tests: `tests/unit/h35aHonestyAndGate.test.ts` (a) and `tests/e2e/bundled/h35aFlow.spec.ts` (D3, BUNDLED).

## Session H36c (2026-11-15): requirement R17

Source: `H36c.md`, after Chromium reported `available` or `downloadable` with an empty `LanguageModel.create()` session carrying neither `inputQuota` nor `measureInputUsage`.

### R17. Ready means the device model answered one probe prompt
- 17.1 A device-model session counts as made only after one short prompt (`"ok"`) returns a non-empty string within an 8 second (`8000` ms) timeout; a thrown error, non-string or empty/whitespace-only reply, missing `.prompt`, or timeout means the session was not made. The probe always destroys any session it creates in a `finally` block.
- 17.2 Page load runs the probe only when the browser's `availability()` returns `"available"`, so page load never starts a model download.
- 17.3 After a failed probe at load (when `availability()` was `"available"`) or a failed `#get-model` / `#make-record` press, the header reads `"did not start"`, Zone 1 renders `[role="alert"]` naming the failure with a single `"Fill in by hand"` control, `#make-record` offers the by-hand path (`"Use the example's record"` when the example is loaded and no record exists), and `#get-model` stays visible to try again.
- 17.4 The header reads `"ready"` only after the probe prompt has returned text, and `"can be downloaded"` only when `availability()` is `"downloadable"` or `"available"` before any failed probe or press.
- 17.5 Tests: `tests/unit/h36cProbePrompt.test.ts`, `tests/unit/statusBar.test.ts`, `tests/e2e/bundled/h36aPageHonesty.spec.ts`, and `tests/e2e/bundled/h35aFlow.spec.ts`.

## Session H36d (2026-11-15): requirement R18

Source: `H36d.md` (`H36C-N0-RECHECK.md`), after open-source Chromium `158` shipped `EchoAILanguageModel`, whose `.prompt(...)` echoes any unconstrained prompt instead of throwing when no weights are installed.

### R18. Constrained JSON probe rejects echoed prose
- 18.1 The session probe (`src/inference/deviceModel.ts`) passes `{ responseConstraint: PROBE_SCHEMA }` (object with one required boolean property `ok` and `additionalProperties: false`) alongside a non-JSON prompt (`'Return {"ok":true}'`), matching how `structure.real.ts` and `structure.schema.ts` pass constraints to the Prompt API.
- 18.2 `verifySession` accepts the session as made only when `JSON.parse(reply.trim())` returns a plain object with single key `"ok"` strictly `=== true` within the `8000` ms timeout; echoed Chromium prose, malformed JSON, `{"ok":false}`, non-boolean `"ok"`, thrown errors, missing `.prompt`, or timeout all mark the session not made (`did not start`) while destroying the probe session in `finally`.
- 18.3 Tests: `tests/unit/h36dEchoAndStarting.test.ts` and `tests/e2e/bundled/h36aPageHonesty.spec.ts` (Chromium `EchoAILanguageModel` at load and `#get-model` press).

## Chain R17, session A (2026-11-19): requirements R19 and R20

Source: the product owner's order for chain R17, session A, items 1 and 2. Retires nothing.

### R19. The "Get the device model" press has a bound (item 1)
- 19.1 `initializeDeviceModelFromPress` (`src/firebase/deviceInit.ts`) waits for `initializeDeviceModel` at most `DEVICE_INITIALIZE_TIMEOUT_MS` (120000 ms, `src/constants.ts`, with a line in `CONSTANT_SOURCES`). The value is 120000 and not the 15000 of the availability check because the press downloads the model (about 4.0 GB in the copy this house measured); the constant is the dial.
- 19.2 When the bound passes, the call rejects with `DeviceModelAbsentError` (`src/inference/deviceAbsentError.ts`). The timer is cleared when the call settles either way, so no timer is left on the queue.
- 19.3 The rejection reaches the existing catch in `onGetModel` (`src/app/controller.ts`): the device state is `downloadable` with `didNotStart` set, and `errorHand` is true. No new state field is added.
- 19.4 Tests: `tests/unit/deviceInitBound.test.ts` (never-settling mock rejects at the bound with name `DeviceModelAbsentError`; a mock that settles resolves and leaves no timer; the rejection lands on the `didNotStart` path through the controller).

### R20. A hanging first device check leaves the first control usable (item 2)
- 20.1 FIRST_DEVICE_CHECK_LIMIT_MS (35000) and the `noAnswer` field are not changed. Added tests, in `tests/unit/h51eFirstCheckBound.test.ts` after the existing cases: with a hanging availability check, the first control is usable after the bound, and pressing it opens the no-model path (hand entry with the record shown, no device call).
