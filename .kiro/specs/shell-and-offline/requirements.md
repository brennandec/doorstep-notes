# Shell and offline: requirements

Source: BRIEF.md "What it must be", Rules 5 to 10, acceptance H2, H6, H7, H8, H9. Owner documents of 2026-11-13: rulings 2, 15 to 23 and the scope section (`docs/decisions/2026-11-13-rulings-on-spec-review.md`), the look and layout (`docs/decisions/2026-11-13-look-and-layout.md`, "L&L" below), the browser on this computer (`docs/decisions/2026-11-13-browser-on-this-computer.md`, "browser document" below). Facts: sdk-facts 1, 9, 10, 25, 32 to 36 and differences 1, 3, 4, 10.

Where these differ, the owner documents win over this spec and over the brief, and sdk-facts wins over the brief.

Examples use invented people only. The invented visit is defined in the capture-and-record spec, R10.

## Requirements

### R1. One screen, three zones (L&L)
- 1.1 The page opens on the tool. There is no hero, no marketing header and no illustration. A BUNDLED real-browser test asserts that the first element after the status bar is zone 1.
- 1.2 Three zones run left to right in this order, with these titles: zone 1 "Your note" (left, widest), zone 2 "What leaves" (middle, narrow), zone 3 "Finished note" (right). A BUNDLED test at a 1440 px wide window asserts the order by x position and that zone 1 is wider than zone 3 and zone 3 is wider than zone 2.
- 1.3 Under the zone 1 title one short line says everything in this zone stays on this device. A unit test asserts the line exists in the string table.
- 1.4 Between zone 1 and zone 2 a vertical rule is drawn, labelled "this device" on its left and "the cloud" on its right, at the top. A BUNDLED test asserts both labels are visible and on the correct side of the rule.
- 1.5 Below 1200 px window width the zones stack in the same order and the boundary becomes a horizontal labelled rule with the same two labels. A BUNDLED test at 1000 px asserts the stacking order by y position and the labels.
- 1.6 Zone 2 shows the outgoing text in a monospace face on the darker paper `#F1EEE6` with a dashed border, then the send notice, the Send control, and the egress check line fixed at the bottom of the zone. A BUNDLED test asserts the computed border style is dashed, the background colour, and that the egress line is the last child of the zone.
- 1.7 Zone 3 shows the finished note as a document sheet: serif face, soft shadow, names restored, the source label and a Copy control. A BUNDLED test asserts the computed font family is the serif stack and that Copy is present.

### R2. Status bar (L&L, ruling 23)
- 2.1 Left side: the name (working title from one constant) and the line "A writing aid with an egress check."
- 2.2 Right side: three states, each an icon and words, never colour alone:
  - Network: "online" or "offline".
  - Device model: "ready", "downloading, N%" or "not on this computer".
  - Cloud: "connected" or "not connected".
- 2.3 The device model state and the cloud state are separate and are driven by separate switches (R9). A unit test sets every combination of the two switches and asserts the two texts change independently.
- 2.4 A unit test asserts that each state renders words and an icon, and that no state differs from another only by colour.

### R3. Paper, ink, one accent (L&L)
- 3.1 Colours are defined once as constants: paper `#FAF8F3`, darker paper `#F1EEE6`, ink `#1C1B19`, second ink `#5E5A52`, hairline `#D9D4C7`, accent `#1E6B52`, failure `#B3261E`.
- 3.2 The accent is used only for the primary control, the focus ring and listed-name chips. A BUNDLED test collects the computed colours of every visible element and asserts that the only non-neutral colours are the accent and, where an error or failing egress line is shown, the failure colour (ruling 21).
- 3.3 The failure colour appears only on a failing egress line and on errors, always with words and an icon. A BUNDLED test asserts no element has the failure colour on a page with no error.
- 3.4 A unit test computes the contrast ratio of every text and background pair in use and asserts each is at least 4.5 to 1.
- 3.5 No gradients and no dark theme. A unit test scans the style files for `gradient(` and for a `prefers-color-scheme: dark` block and fails on either.

### R4. Type (L&L, ruling 21)
- 4.1 System faces only; no font files are bundled. A sans stack for the interface, a serif stack for the finished note, a monospace stack for the outgoing text. A unit test asserts no font file is in `public/` or the build output and no `@font-face` rule exists.
- 4.2 Base size 18 px, note text 20 px, line height 1.5. No text under 16 px. A BUNDLED test walks every visible text node and asserts the computed size is at least 16 px, the body size is 18 px and the note text area is 20 px.

### R5. Controls, icons, source label, motion (L&L, ruling 21)
- 5.1 Controls are drawn buttons 48 px high with a 1.5 px ink border and a 10 px radius. The primary control is filled with the accent. A BUNDLED test asserts these computed values on every button.
- 5.2 Every target is at least 44 px by 44 px. A BUNDLED test measures the bounding box of every interactive element.
- 5.3 The focus ring is 3 px in the accent colour, 2 px away from the control. A BUNDLED test tabs through every control and asserts the computed outline width, colour and offset.
- 5.4 Icons are a small set of drawn inline SVGs with one stroke weight: laptop, cloud, arrow crossing a line, check, crossed octagon, pencil, camera, eye. There is no padlock and no shield. A unit test lists the icon set and asserts exactly these names and one stroke width.
- 5.5 Source label, top right of every result: "on this device" is an outlined pill with a laptop outline; "in the cloud" is a filled pill with a cloud outline. The shapes differ, not only the fill. The label text comes from `inferenceSource`. A double result also shows "not connected". A unit test asserts both variants have different icons and different text.
- 5.6 Motion is fades of at most 120 ms, and none when reduced motion is asked for. A BUNDLED test with `reducedMotion: "reduce"` asserts every computed transition duration is 0; a unit test asserts no duration above 120 ms in the style files.

### R6. Words (Rules 4, 6, 8; L&L "Never")
- 6.1 No emoji anywhere. A unit test scans `src/`, `public/`, `README.md`, the demo script `docs/demo-script.md` and, when it exists, the build output `dist/` for emoji code point ranges.
- 6.2 A banned-word test scans the UI string table, `public/`, `README.md` and the demo script for: safe, private by design, anonymised, guaranteed, cleared. These may appear only inside the quoted banned list in the test itself.
- 6.3 The page and README make no claim of compliance with any law or standard. The banned-word test also fails on the words "compliant" and "compliance".
- 6.4 Demo content stays plain: a content test scans the invented visit, every fixture under `tests/` and `scripts/`, and the demo script for a short list of dramatic words (injury, injured, court, police, arrest, abuse, blood) and fails on any.
- 6.5 Colour is never the only signal; every state is also in words (checked by R2.4, R3.3).

### R7. Standing statements (Rules 6, 10; rulings 2, 15)
- 7.1 The page states: "A writing aid with an egress check on listed names. Unlisted details can still identify a person."
- 7.2 Until H2 part B has run and its results file exists, the page and README say "not yet checked against the real service". A unit test removes the results file and asserts the line; another adds a passing file and asserts the line is gone.
- 7.3 Until the AI service is enabled, the page says "not connected" for the cloud and the README says "not hosted". When it is enabled, the tier is written in one constant (`CLOUD_TIER` in `src/constants.ts`) and shown on the page and in the README. A unit test covers both cases.
- 7.4 The page says the no-cost tier is not for real client data and that this demo uses invented people only.

### R8. First run and the invented visit (L&L, ruling 19)
- 8.1 The empty state of zone 1 has one secondary control, "Try an invented visit". A unit test asserts it is the only secondary control in the empty state.
- 8.2 Pressing it fills the invented rough note and the invented client list of 12 names defined in capture-and-record R10, and marks both "invented example" until she removes them. A unit test asserts the 12 names load and the mark is shown.
- 8.3 From there every step works with one press each: make the record (or, with no device model, the prepared invented record is filled), mask, send, finished note. A BUNDLED test performs the path with one press per step and asserts the finished note appears.
- 8.4 With no device model, one line in zone 1 says what the device model would add (the record from rough notes, more things to mask, an offline draft) and that it is not on this computer. Hand entry of the record, exact matching, cloud drafting and the egress check all still work (H6).
- 8.5 First-run instructions name no Chrome version and print no steps until a DEVICE MODEL check has passed on this computer and its results file exists (ruling 19). A unit test asserts that with no such results file the line contains no version number, no `chrome://` address and no hardware figure.
- 8.6 A "Get the device model" control appears only when the browser reports `downloadable`, and starts the download from that press (sdk-facts 10, 14). Progress is shown as "downloading, N%".

### R9. Two switches (ruling 23)
- 9.1 The device switch is on whenever the browser reports the device model `available`. Device jobs (structure, propose masks, the offline draft, the device side of rewrite) then call the SDK, whether or not the cloud service is enabled.
- 9.2 The cloud switch is one flag, `AI_SERVICE_ENABLED` in `src/constants.ts`, set by the product owner. While it is off, every cloud job uses its test double and every such result says "not connected".
- 9.3 The two switches are read in one place, `src/inference/index.ts`, and shown separately in the status bar (R2.3). A unit test asserts that turning the cloud flag on does not change which device jobs are real, and the reverse.

### R10. Installable (H7, ruling 21)
- 10.1 A web app manifest has name and short name from the working-title constant, icons at 192 and 512 px, `start_url`, `display: standalone`, theme and background colours from R3. A service worker with a fetch handler is registered.
- 10.2 The install criteria checked are those Chrome reports itself: a BUNDLED test serves the built app from a local static server on localhost, calls the DevTools method `Page.getInstallabilityErrors` and asserts the list is empty, and calls `Page.getAppManifest` and asserts no manifest errors. No hosting takes place (Rule 9).
- 10.3 After the first load, the page reloads with the network off and the shell appears; capture and exact masking work (BUNDLED).

### R11. Offline (ruling 17)
- 11.1 Offline is detected from the browser's online state plus one failed probe. The probe is a GET of `/probe.txt` on the same origin with `cache: "no-store"`, a time limit from `PROBE_TIMEOUT_MS` in the constants file, and no body. The service worker does not answer the probe. A unit test asserts the probe carries no body and no query other than a time stamp.
- 11.2 Offline, the page shows in words: "You are offline. Your note, the record, masking and the short draft still work on this device." Cloud actions are disabled with that reason.
- 11.3 The service worker caches only the files on an allowed list written into `public/sw.js` at build time: the built HTML, JS, CSS, manifest and icons. A unit test reads the list and fails on any other entry. A BUNDLED test opens the cache after a full invented-visit run and asserts every cached URL is on the allowed list.
- 11.4 The service worker never reads or writes IndexedDB and never caches a request to a Firebase or Google domain.

### R12. Configuration (Rule 7, ruling 16)
- 12.1 In development and tests the loader reads `firebase.config.local.json` from the project root at run time. It never prints, logs or copies its values. A unit test with an invented config asserts no `console` call receives any value.
- 12.2 A hosting build injects the same values at build time into the built files in `dist/`. `dist/` is ignored by git and never committed. A build session does not make a hosting build.
- 12.3 A unit test asserts that no file tracked by git contains any value of the local config. It loads the local file at run time if it exists, compares values in memory, and on failure names only the file and the key, never the value. It also scans tracked files for the shape of a Firebase web API key and fails on a match. When the local file is absent, the first part is skipped with a written reason; the shape scan always runs.
- 12.4 `firebase.config.example.json` holds placeholders and is committed. `.gitignore` lists the local file and `.browser-profile/`. A unit test reads `.gitignore` and asserts both entries.

### R13. Firebase parts (rulings 15, 18)
- 13.1 App Check uses the debug provider for local work (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before `initializeAppCheck`). The debug token is never written to any file. The hosted provider is an open task (OPEN-QUESTIONS 4).
- 13.2 Anonymous sign-in is used only for ledger sync. The cloud store holds egress ledgers only (counts, hashes, times), written after an explicit "Save ledger" press. Masked records are not synced in this version (ruling 18). A unit test asserts the store interface has one write method, for ledger entries, and that its input type has no text field.
- 13.3 Remote Config supplies the masking policy and model names, with defaults in code. Unreachable gives the defaults and the page says "policy: default".
- 13.4 The Firebase JS SDK is 13.0.0 or later, pinned exactly (sdk-facts difference 1). Only `src/firebase/` and `src/inference/` import `firebase/ai`; a unit test scans imports.

### R14. Where model calls run
- 14.1 The Prompt API is called from the main thread only (sdk-facts 9). A unit test asserts no inference import in worker code.
- 14.2 `initializeDeviceModel()` runs only from a user action and before the first prompt (sdk-facts 10).

### R15. README (Rules 8, 10; rulings 2, 15)
- 15.1 The README holds a table of all five jobs (structure, propose masks, draft, rewrite, second reader), each with its mode and what leaves the device. A unit test asserts the table has these five rows and matches the table in the design.
- 15.2 The README says the app is a writing aid with an egress check, that real use needs the paid tier and what changes with it, the tier line of R7.3, and the H2 line of R7.2.
- 15.3 Nothing in the README claims compliance or uses a banned word (R6).

### R16. Number audit (Rule 8, ruling 22)
- 16.1 Every measured figure on the page or in the README comes from a file in `results/`, shown with its date and browser; with no file it reads "not measured".
- 16.2 Fixed numbers (targets, limits quoted from documentation, layout sizes) live in one constants file, `src/constants.ts`, each with its source. The audit test exempts them by name.
- 16.3 A unit test finds every number in the README and in the UI string table and asserts that each is either filled from a results file or is a named constant from `src/constants.ts`.

### R17. Real-browser checks (browser document, H9)
- 17.1 Every real-browser task is marked BUNDLED or DEVICE MODEL.
- 17.2 BUNDLED checks run in Playwright 1.65.0's bundled Chromium, headless, with nothing fetched.
- 17.3 DEVICE MODEL checks run through one fixture: Playwright with `channel: 'chrome'`, persistent profile `.browser-profile/`, Playwright's `--disable-component-update` switch removed for that launch, `--use-mock-keychain` added, headless unless `DEVICE_MODEL_HEADED=1`. Its first step reads `LanguageModel.availability()` under a 15 second limit and writes what it got to the results file. It calls `create()` only from a click and only when the state is `available`; it never starts a download.
- 17.4 A DEVICE MODEL miss, with its reason, is written to `results/`. It never turns the suite red and is never reported as a pass.
- 17.5 No browser window opens on the screen during a build session. A unit test asserts the Playwright config sets `headless: true` for every project and that the fixture reads `DEVICE_MODEL_HEADED` only.
- 17.6 Every real-browser run has a time limit and stops its server and browser at the end.

### R18. Build checks (H9)
- 18.1 `npm test`, the type check and the build pass. Real-browser checks pass, or each miss is recorded as a miss in `results/`.
- 18.2 Versions are pinned exactly. Any runtime dependency beyond the Firebase JS SDK has a note in `docs/decisions/`. The interface is plain TypeScript and DOM; no UI framework is added.

### R19. Scope for the first submission (rulings, scope section)
- 19.1 Kept: capture (typed and photo), record, masking with tap-to-mask, egress check, drafting online and offline, second reader, measurement, installable offline shell, Remote Config, anonymous sign-in with ledger sync.
- 19.2 If time runs short, cut in this order: ledger sync, Remote Config, the second reader's evidence taps, photo input. Typed capture, masking, the egress check and drafting are never cut. Each cuttable task says so in its text.

## Acceptance map

| Brief or owner item | Covered by |
|---|---|
| H2 wording on the page | R7.2 |
| H6 | R8.4, R9 |
| H7 | R10, R11 |
| H9 | R6, R16, R17, R18 |
| Ruling 15 | R7.3 |
| Ruling 16 | R12 |
| Ruling 17 | R11 |
| Ruling 18 | R13.2 |
| Ruling 19 | R8.5 |
| Ruling 20 | R7, R16.1 with capture-and-record R9 |
| Ruling 21 | R3.2, R4.2, R5.2, R5.3, R10.2 |
| Ruling 22 | R16 |
| Ruling 23 | R2.3, R9 |
| Look and layout | R1 to R8 |
| Browser document | R17 |

## Second review (2026-11-13): requirements R20 to R23

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md` (direction U3, U10, U11; seen problems S3 and S10; acceptance V3 and V8). The second review is the latest owner document. Where it differs from the other owner documents, from the brief or from this spec, it wins; where the documentation facts in `docs/sdk-facts.md` differ, those win over the brief. Each requirement says what it wins over. The other requirements of this review sit in the specs they belong to:

| Item | Spec and requirement |
|---|---|
| U1, V1 | capture-and-record R12 |
| U2, V2 | measurement R11 |
| U3, V3 | here, R20 |
| U4, V4 | masking R13 |
| U5 | masking R14 |
| U6, V5 | masking R15 |
| U7, V6 | drafting R10 (Shorter, Plainer), egress-check R10 (Save ledger) |
| U8 | capture-and-record R13 |
| U9, V7 | masking R16, measurement R12 |
| U10 | egress-check R9 and here, R21 |
| U11 | here, R22 |
| V8 | here, R23 |

### R20. She sees the step she is on (U3, S3, V3)
Wins over: the look and layout document where zone 1 shows the note, then the record, in full; once a record exists the note and the list fold.
- 20.1 A line of five steps stands at the top of zone 1: Note, Record, Masks, Send, Finished. It is an ordered list with an accessible name. The current step is marked in words ("Step 2 of 5: Record" as text, `aria-current="step"`) and in shape (a filled marker, where the other steps have an outlined one; finished steps show the check icon). It is drawn in the ink colour; it adds no colour (R3.2). A unit test on the DOM for every step.
- 20.2 `currentStep(state)` returns: Note when there is no note text; Record when a note exists and no record does; Masks when a record exists and no draft has been asked for; Send from the moment a draft is asked for until the finished note exists; Finished when the restored finished note exists. A unit test table covers every row and the way back when she edits.
- 20.3 Once a record exists, the note editor and the client list each fold to one line with an Edit control of at least 44 px: "Note: N lines. Edit" and "Client list: M names. Edit" (with "invented example" when it is the invented one). N and M are computed. The masking view takes their place. Edit unfolds the editor or list; nothing about the data changes. The fold uses a button with `aria-expanded`.
- 20.4 At 1440 x 900, after "Make the record" by the hand entry path and a send with the double, these are inside the viewport together, without scrolling: the five-step line, at least one chip, the outgoing text, the egress line and the first lines of the finished note (V3). A BUNDLED test measures each element's box against the viewport.
- 20.5 To keep the egress line in view, the outgoing text block in zone 2 has a maximum height and scrolls inside itself. The whole text stays in the block and equals the string given to the job (drafting R2.2). The egress line stays the last child of zone 2 (R1.6).
- 20.6 The look and layout rule that zone 2 stays narrow and the egress line sits at its bottom is unchanged.

### R21. Words on the page and in the README match the code (U10, S10)
- 21.1 The README section "What the egress check shows, and what it does not" and the page say what the check scans, in the words of egress-check R9.1 and R9.3, filled from one string table and the constants `MIN_NAME_PART_LENGTH` and `NEAR_MATCH_MIN_LETTERS`. The README no longer says only that it scans the request body: a unit test fails if the section lacks "address" or the two numbers from the constants.
- 21.2 The number audit (R16) treats those two numbers as named constants.
- 21.3 The README states that the ledger save is on the screen once task 20 of egress-check is done, and says "not connected" while the store is a double. Until then the sentence stays as it is.
- 21.4 The README status block is regenerated by `npm run measure:readme` after measurement tasks 13 and 16.

### R22. The cloud half is unchanged (U11)
- 22.1 `AI_SERVICE_ENABLED` stays `false`. Every cloud result says "not connected". A unit test fails if the constant is `true` and `docs/decisions/` has no file with "billing" in its name.
- 22.2 No target changes. A unit test asserts that `COLD_START_LIMIT_S` (60), `DEVICE_TOKEN_LIMIT` (9216), `SYNTHETIC_SET_SIZE` (200) and `INVENTED_LIST_SIZE` (12) keep their values. The only target this review changes is the device measurement time box, by the owner's own words in V7 (measurement R12.1). A miss is recorded as a miss.
- 22.3 The honesty rules are unchanged. The word, emoji and number audits (R6, R16) cover every new string in this review; the new strings are in the string table.
- 22.4 H2 part B and the network-drop check stay unticked, waiting on billing, with the reason in `results/`.

### R23. Screenshots and nothing broken (V8)
- 23.1 Nine screenshots are taken again under their names: `01-first-run`, `02-note-record-masks`, `03-outgoing-egress-pass`, `04-egress-fail-seeded`, `05-finished-note`, `06-offline`, `07-stacked-1024` (at 1024 x 768), `08-device-record`, `09-device-masks`. All are at 1440 x 900 unless named, with the invented visit, headless.
- 23.2 One more, `10-whole-journey-device.png`: Google Chrome with the built-in model, 1440 x 900, the invented visit after every step (note, record, masks, send, finished) in one frame, nothing scrolled. The test asserts the page's vertical scroll position is 0 and writes it to `results/screens.json` with the date, browser and viewport.
- 23.3 A unit test lists the ten names and fails when a file is missing. `docs/screens/` holds invented people only.
- 23.4 Every earlier test passes. A test that asserted behaviour this review replaced is rewritten, not deleted, and is named in the task that rewrote it. The suite count is reported before and after (1,015 passed and 1 skipped before this review).

## Second review: acceptance map

| Item | Covered by |
|---|---|
| U3, S3 | R20.1 to R20.3, R20.5 |
| V3 | R20.4 (BUNDLED) |
| U10, S10 | R21 with egress-check R9 |
| U11 | R22 |
| V8 | R23 (BUNDLED for 01 to 07, DEVICE MODEL for 08 to 10) |

## Third review (2026-11-13): requirements R24 to R26

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md` (direction X6 and X7, seen problem W6, acceptance Y5 and Y6). The third review is the latest owner document and wins over this spec where they differ. Each requirement says what it wins over.

### R24. Masks in view (X6, W6, Y5)
Wins over: R20.3 as built, where only the note and the client list fold and the record editor stays open, and R20.4 with task 35 (V3), which failed. Task 35 is retired and replaced by task 43.
- 24.1 With a record present, each record field that holds text folds to one line with an Edit control, as the note and the client list do: the visit date, who was present, what was seen, what was agreed, risks and next steps. The line reads the field's label and its text on one line, cut with an ellipsis by the style when it is long. A field with no text stays open so she can type into it.
- 24.2 Edit unfolds the field with `aria-expanded`; the control then reads "Fold" and folds it again. Edit controls are at least 44 px high. A field she has typed into stays open until she folds it, so a redraw never closes it under her cursor.
- 24.3 The reading of the date words, with its mark and its Confirm and Correct controls, stays in view next to the folded date line.
- 24.4 Hand entry with the prepared invented record moves focus to the date line's Edit control; with an empty record, to the date field (R13.3 of capture-and-record).
- 24.5 At 1440 x 900 with a record present, the first chip is inside the viewport (Y5). A BUNDLED test measures it.
- 24.6 Folding the fields was not enough. A throwaway headless measurement in the bundled browser (not a recorded run) put the first chip at 1879 px with the six fields folded: the controls that make the record, the device model lines and the cold start line, and the measured figures all stood above the chips. So, with a record present, zone 1 reads in this order: the five steps, the folded note and client list, the record's title, the masking view, the six folded fields, the controls that made the record, the device model lines and the cold start line. The measured figures stand under the masking view. Without a record the first-run order is unchanged. The same throwaway measurement then put the first chip at 811 to 855 px. The difference from the owner's X6 wording is written in OPEN-QUESTIONS.

### R25. Honesty rules unchanged (X7)
- 25.1 The cloud half stays on the test double and says "not connected". `AI_SERVICE_ENABLED` stays `false` (R22).
- 25.2 The new strings of this review are in the string table, so the word, emoji and number audits cover them.
- 25.3 No target changes; a miss is recorded as a miss.

### R26. Screenshots again (Y6)
- 26.1 `10-whole-journey-device.png` is taken again: Google Chrome with the built-in model, 1440 x 900, the invented visit after every step, nothing scrolled.
- 26.2 One more, `11-whole-journey-all-accepted.png`: Google Chrome with the built-in model, every suggestion accepted, the finished note in view with names restored. The test writes its scroll position and browser to `results/screens.json`.
- 26.3 Every earlier test passes. A test that asserted behaviour this review replaced is rewritten, not deleted, and is named in the task that rewrote it. The suite count is reported before and after (1,359 passed and 1 skipped before this review).

## Third review: acceptance map

| Item | Covered by |
|---|---|
| X6, W6 | R24.1 to R24.4 |
| Y5 | R24.5 (BUNDLED) |
| X7 | R25 |
| Y6 | R26 (DEVICE MODEL) |

## Fourth review (2026-11-13): requirements R27 to R32

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md` (seen problems J1, J4 and J5; direction K1, K2, K5, K6 and K7; acceptance L1 to L4, L7 to L9). The fourth review is the latest owner document and wins over this spec where they differ. Each requirement says what it wins over.

### R27. Kept on this device (K1, J1, L1 to L4)
Wins over: the README limit "The client list is not kept across a reload", the separate stores of masking R1 and capture-and-record (`notes`, `records`, `clientList`, `maskState`, each under its own key), which are replaced by one versioned document, and the ledger store's unversioned list.
- 27.1 These are saved in the browser's own store (IndexedDB) as she works, and restored when the page loads, with the network off as well as on: the client list, the note in progress (and its photo), the record, the masks with their kinds (spans, tags, accepted, sent on purpose, where the proposals came from), the outgoing text with whether it is still a preview, the sentences she replaced with a rewrite, the date answer, the finished note with the details that let a name be put back, the step she is on, which parts she opened, and the local ledger entries. The step is stored as the word `currentStep` gives, and the step shown after a restore equals it.
- 27.2 One module, `src/storage/kept.ts`, opens the store through `src/storage/backend.ts`. Nothing else in `src/` reads or writes these at rest (R13.4, R14.1). Saves are written in order, the last one wins, and the page does not wait for them.
- 27.3 One line under the title of zone 1 says: "Kept in this browser only." It is in the string table.
- 27.4 Two controls in zone 1, each asking once before it acts: "Clear this visit" removes the note, the photo, the record, the masks, the outgoing text, the finished note, the rewrites, the date answer, the second reader's result and the step, and keeps the client list; "Clear my list" removes the list and nothing else. One control in the footer, "Clear everything this page keeps", removes all of it, the ledger entries and the opened parts too, and leaves the store empty. The asking is a small panel beside the control with a button to go ahead and a button to keep; Escape closes it and does nothing else; focus goes to the keep button when it opens and back to the control when it closes. A press while a panel is open for another control replaces that panel.
- 27.5 The stored document carries a version number (`KEPT_VERSION` in `src/constants.ts`, with its source). A document of a version the code does not know, or one that is not shaped as expected, is not read: the page starts empty and one line says "Saved data from another version of this page was not read. Starting empty." The next save replaces it. The ledger entries carry the same version.
- 27.6 If the store cannot be opened or a save fails, the page works for this session and one line says "This browser would not keep your work. Nothing is kept after you close this page." No error is thrown to the person and nothing else changes.
- 27.7 Nothing that is kept may enter a request by any road other than the outgoing text she sees. The egress check is unchanged (egress-check R2 to R6). A unit test of the import rules asserts that `src/storage/kept.ts` is imported only by `src/app/controller.ts` and `src/app/main.ts` and by nothing in `src/egress/`, `src/inference/`, `src/firebase/`, `src/drafting/` or `src/secondReader/`. The BUNDLED check L4 records every request across the whole journey with data kept.
- 27.8 The invented example is kept as the example (the "invented example" mark returns after a reload) and the mark goes with "Remove example" and with "Clear this visit" only when the list is also gone.
- 27.9 Unit tests use a stand-in for the browser store that lives in `tests/support/`, with an inspector that lists what is held and switches that make opening or writing fail. No unit test opens a network connection. The tests cover: save, restore, each of the three clears, a version the code does not know, a document of the wrong shape, a store that cannot be opened, a store that fails on write, the step after a restore, a restore with the network off.

### R28. Say how it is kept (K2)
- 28.1 The footer carries one line, from the string table: "Kept in this browser's own store on this device. This page does not encrypt it. It relies on the lock of this device. The three clear controls remove it." No stronger word than that.
- 28.2 The README says the same in the same words, in one short section, and its limit about the client list is rewritten. A unit test fails if the README section and the footer string differ. The README does not claim a reload works in a real browser until the BUNDLED check L1 has passed.
- 28.3 The words audit (R6) covers both: none of safe, private by design, anonymised, guaranteed, cleared, compliant, compliance, and no digit in the string table.

### R29. The first screen says what is real (K5, J4, L7)
- 29.1 The README's first paragraph after the title states the two halves in one sentence each: the device half runs in Google Chrome's built-in model; the cloud half is "not connected: answered by a test double in this build", or names the connected service once it is.
- 29.2 The status area of the page states the same two halves in the same words, read from `AI_SERVICE_ENABLED` and from `results/cloud-probe-2026-11-13.json`, never typed. When the flag is on, the service is named once from the probe file.
- 29.3 A unit test reads the README's first paragraph and the page's status area and finds the cloud half's state equal to the build flag and the probe file (L7).

### R30. Small print folds (K6, J5, L8)
Wins over: egress-check R9.2 and second-reader R2 where they print their explanation at all times.
- 30.1 Under "What leaves", the explanation of what the check scans folds behind one control, "What this check scans", closed by default. The native `details` and `summary` elements are used, so keyboard and screen readers work without extra code.
- 30.2 Under "Second reader", the explanation folds behind "What a second reader is", the same way.
- 30.3 Two sentences never fold: the egress line itself, and "This checks listed names and masked values only. Other details in the text can still identify a person."
- 30.4 Whether a fold is open is kept (R27.1).
- 30.5 At 1440 x 900 after a send, folds closed: zones 2 and 3 show no paragraph longer than two lines, both sentences of 30.3 are visible, and each fold opens and closes from the keyboard (L8, BUNDLED).

### R31. Pictures (L9)
- 31.1 `10-whole-journey-device.png` and `11-whole-journey-all-accepted.png` are taken again (DEVICE MODEL), and `12-after-reload-offline.png` is new (BUNDLED, after a reload with the network off). All three are in `results/screens.json` with date, browser, viewport and scroll position.
- 31.2 Every earlier test passes. A test that asserted behaviour this review replaced is rewritten, not deleted, and is named in the task that rewrote it. The suite count is reported before and after (1,493 passed and 1 skipped before this review).

### R32. Honesty rules unchanged (K7)
- 32.1 The cloud half stays on the test double and says "not connected". `AI_SERVICE_ENABLED` stays `false` (R22).
- 32.2 Every new string is in the string table, so the word, emoji and number audits cover it.
- 32.3 No target changes. A miss is recorded as a miss, and a lower found count in the third measurement is recorded as lower.

## Fourth review: acceptance map

| Item | Covered by |
|---|---|
| K1, J1 | R27 |
| K2 | R28 |
| K5, J4 | R29 |
| K6, J5 | R30, egress-check R13, second-reader R6 |
| K7 | R32 |
| L1 | R27.1 (BUNDLED) |
| L2 | R27.4 (BUNDLED) |
| L3 | R27.9 (unit) |
| L4 | R27.7 (BUNDLED) |
| L7 | R29.3 (unit) |
| L8 | R30.5 (BUNDLED) |
| L9 | R31 (BUNDLED and DEVICE MODEL) |

## Fifth review (2026-11-13): requirements R33 to R37

Source: `docs/decisions/2026-11-13-fifth-review-the-result-is-a-card.md` (direction N2, N3, N5, N6; seen problems M2, M3, M5; acceptance P2, P3, P5, P6). The fifth review is the latest owner document and wins over this spec where they differ. Each requirement says what it wins over. N1 is egress-check R14. N4 is measurement R14.

### R33. Zone 2 gets room (N2, M2, P2)
Wins over: R1.2 where zone 2 is the narrowest and zone 3 is wider than zone 2, and R1.5 and the look and layout sentence that the zones stack below 1200 px.
- 33.1 At 1440 px the three zones share the width 5 : 4 : 4, each within 3 per cent. While the zones sit side by side zone 2 is never narrower than 400 px. The number is `ZONE_LEAVES_MIN_PX` in `src/constants.ts`, with its source.
- 33.2 Under 1100 px (`STACK_WIDTH_PX`, now 1100) the zones stack in the order of the journey: Your note, What leaves, Finished note. The drawn line between this device and the cloud stays where the device ends: vertical between zone 1 and zone 2 when side by side, horizontal between the stacked zones.
- 33.3 Unit tests read the style sheet: the grid columns, the 400 px minimum, the breakpoint, and that `STACK_WIDTH_PX` equals the media query. BUNDLED (P2): at 1440 px zone 2 is at least 400 px and the widths are within 3 per cent of 5 : 4 : 4; at 1000 px the zones are stacked in order.

### R34. Nothing is cut (N3, M3, P3)
- 34.1 The offline notice under Draft and Send reads in full: "Not available while you are offline." Its box does not shrink below its text and its padding does not narrow it.
- 34.2 No child of a zone shrinks below its content: the zones' children keep their height.
- 34.3 A check walks every text box in the three zones, online and offline, at 1440 x 900 and 1280 x 800, and fails when a box hides part of its own text (the content is taller or wider than the box and the box clips or covers it). The walk is a function in `tests/e2e/fixtures/cutText.ts`; its logic has a unit test with stand-in boxes. Boxes that scroll on purpose (the outgoing text, the ledger text) and the text of a folded `details` are not hidden text and are named in the function.
- 34.4 BUNDLED (P3): the check passes online and offline at both sizes, and the offline notice holds its last word.

### R35. Say it once (N5, M5, P5)
Wins over: R1.3 (the line under the zone 1 title), R27.3 (the line "Kept in this browser only.") and R20.3 where "invented example" stands on the folded list line, and the mark on the record title.
- 35.1 Under the zone 1 title one line reads "Everything here stays in this browser, on this device." It replaces the two older lines.
- 35.2 The mark "invented example" appears once in zone 1, beside the note (on the note's fold line once a record exists). It is not on the list line and not on the record title.
- 35.3 The step line fits on one line at 1440 px. The words "Step N of 5:" before the current step stay in the page for assistive technology and are drawn hidden; the current step is still marked in shape (a filled marker) and in weight.
- 35.4 Unit tests: the single line and its text; the old two lines are not in the string table; exactly one `invented example` in zone 1 with and without a record; the step line has `flex-wrap: nowrap` and the hidden text is still in the list item. BUNDLED (P5): the same on the page, with the step line one line high at 1440 px.

### R36. Honesty rules unchanged (N6)
- 36.1 The cloud half stays on the test double and says "not connected". `AI_SERVICE_ENABLED` stays `false` (R22). No target changes; a miss is recorded as a miss.
- 36.2 Every new string is in the string table, so the word, emoji and number audits cover it.

### R37. Pictures and nothing broken (P6)
- 37.1 `10-whole-journey-device.png`, `11-whole-journey-all-accepted.png` and `12-after-reload-offline.png` are taken again, and `13-egress-fail-card.png` is new: the seeded leak at 1440 x 900. All are in `results/screens.json`.
- 37.2 Every earlier test passes. A test that asserted behaviour this review replaced is rewritten, not deleted, and named in the task that rewrote it. The suite count is reported before and after (1,655 passed before this review).

## Fifth review: acceptance map

| Item | Covered by |
|---|---|
| N1, M1, P1 | egress-check R14 |
| N2, M2, P2 | R33 |
| N3, M3, P3 | R34 |
| N4, M4, P4 | measurement R14 |
| N5, M5, P5 | R35 |
| N6 | R36 |
| P6 | R37 |

## Sixth review (2026-11-13): requirements R38 to R40

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md` (direction R1, R4; seen problems Q1, Q4; acceptance S1, S4, S7). The sixth review is the latest owner document and wins over this spec where they differ. Each requirement says what it wins over. R2 and R3 are egress-check R15 and R16. R5 is drafting R13. R6 is masking R19 and measurement R15.

### R38. Notices (R1, Q1, S1)
- 38.1 `npm run notices` writes `THIRD-PARTY-NOTICES.txt` in the project root from `package-lock.json`: every production package (not marked `dev` in the lock, not the root) with its name, version, licence and source address; the full text of each distinct licence once; and the content of every NOTICE file a package carries. Licence and NOTICE texts are read from the installed packages in `node_modules/`. The script fetches nothing from the network and adds or removes no package.
- 38.2 The file is committed, copied into the built site (`dist/` and `dist-e2e/`) by the build, and linked from the page footer with the words "Third-party notices". The service worker cache list names it, so the cache test of R17 still names every allowed file.
- 38.3 A unit test fails when a production package of the lock is missing from the file. The count of packages in the file equals the count of production packages in the lock. A package whose licence text cannot be found on disk is listed with the licence name and a line saying the text was not found, and the gap is written to `.kiro/specs/OPEN-QUESTIONS.md`; it is never skipped.
- 38.4 The README's licence section names `THIRD-PARTY-NOTICES.txt`. The licence of the project (MIT) is not changed.
- 38.5 BUNDLED (S1): the built site holds the file, and the footer link opens it.

### R39. The verdict first (R4, Q4, S4)
Wins over: the order of zone 2 in the look and layout document and in R1 where the ledger panel sits above the egress line, and egress-check R14 where the standing sentence and the fold sit under the card in a different order.
- 39.1 In zone 2 the order is: outgoing text, the connection line, Draft and Send, the verdict card, the sentence that never folds, then two folds: "What this check scans" and "Egress ledger (N entries)", where N is the count of entries.
- 39.2 The ledger fold is closed by default and its open state is kept like the other folds. Inside it each entry is a small table with the rows time, job, mode, source, outcome, bytes and hash; there is no line with pipe characters. "Save ledger" stays inside the fold, with the explanation and the not-connected line.
- 39.3 No pipe character is in zone 2 after a send, open folds included.
- 39.4 Unit tests: the order of the children of zone 2; the fold label with N; closed by default; one table per entry with the seven labels; no pipe in the zone; "Save ledger" inside the fold and still writing to the double with the same message (honesty rule 16). BUNDLED (S4): at 1440 x 900 after a send the top edge of the verdict card is above the ledger fold, the fold is closed and opens to a table, and no pipe is in zone 2.

### R40. Pictures and nothing broken (S7)
- 40.1 `10-whole-journey-device.png`, `11-whole-journey-all-accepted.png` and `13-egress-fail-card.png` are taken again, and `14-send-blocked.png` is new: the block line with Send unavailable, at 1440 x 900. All are in `results/screens.json`.
- 40.2 Every earlier test passes. A test that asserted behaviour this review replaced is rewritten, not deleted, and named in the task that rewrote it. The suite count is reported before and after (1,736 passed and 1 skipped before this review).

## Sixth review: acceptance map

| Item | Covered by |
|---|---|
| R1, Q1, S1 | R38 |
| R4, Q4, S4 | R39 |
| S7 | R40 |
| R2, Q2, S2; R3, Q3, S3 | egress-check R15, R16 |
| R5, Q5, S5 | drafting R13 |
| R6, Q6, S6 | masking R19, measurement R15 |
| R7 | unchanged: R22, R36 |

## Session H11 (2026-11-14): requirement R41

Source: the product owner's instruction for chain H11, item 2.

### R41. Bundled specs run with the cloud switch on
- 41.1 `AI_SERVICE_ENABLED` is true. Every bundled real-browser spec passes with it on.
- 41.2 A spec that tests the stand-in sets the stand-in explicitly (`window.__cloudStandIn` or the e2e build's equivalent hook). A spec that tests the cloud path counts its calls to the cloud model. A spec that does neither makes no call to the cloud model.
- 41.3 The number of real cloud calls the session made, and the specs that made them, are in `results/e2e-cloud-on-2026-11-14.json`. A session stops when the count would pass 40.
- 41.4 Unit test (`tests/unit/e2eCloudOn.test.ts`): every file in `tests/e2e/bundled/` is named in the results file with its outcome and its count of cloud calls, and a spec outside the cloud-path list has a count of zero.

## Session H12 (2026-11-14): requirement R42

Source: the product owner's instruction for chain H12, item 8. After Shorter the sticky egress line covered Draft and Send (screen 16).

### R42. No control hidden under the egress line
- 42.1 After Shorter has run, `document.elementFromPoint` at the centre of `#draft` and of `#send` returns that button, at 1440 x 900 and at 1280 x 800.
- 42.2 The egress line stays the last child of zone 2 and never folds (egress-check R13.2, R20.5 above).
- 42.3 Shorter is run in the check through the test hook of the e2e build, so the check makes no call to the cloud model.

## Session H35b (2026-11-15): requirements R43 to R46

Source: H35-DRAFT.md part H35b with H35-ISSUE.md amendment A4 (which wins). What a judge sees first.

### R43. The first fold at 390 x 844 (D1)
- 43.1 On a cold open with an empty note, `#try-example` ("Try an invented visit") stands in its own row under the five steps and above `#note`. It is the one enabled button inside the first 844 px; `#make-record` lies below it.
- 43.2 Below 640 px the five steps wrap with a tighter gap, and each word stays whole: `[data-steps]` has `scrollWidth <= clientWidth` and every step ends at or before x = 390. From 640 px they stay on one row.

### R44. The cold-open control and the example's record (D4)
- 44.1 On a cold open `#try-example` is the one filled, enabled button; `#make-record` is outlined and disabled.
- 44.2 With the example loaded, no record yet and no device model, `#make-record` is filled, enabled and reads "Use the example's record". One line under the controls (`[data-example-record-origin]`) reads "This record was made by hand for the example, not by the device model."
- 44.3 With her own note and no device model the control still reads "Enter the record by hand" and no origin line shows.

### R45. The result card overlaps nothing (D7)
- 45.1 `.egress-line` flows after the controls in every state (no sticky position). At 1440 x 900, 1024 x 768 and 390 x 844, before and after Send, `[data-egress-line]` and `[data-egress-card]` share no area with `#draft`, `#send`, `#try-listed`, `[data-send-notice]` or `pre.outgoing`, and a point at the centre of each button hits that button.
- 45.2 The date reading and its Confirm control are 8 px apart, and Confirm and Correct are 8 px apart (`.date-block`).

### R46. The device half for a judge without the model
- 46.1 `newestResultName` reads a session-plus-run suffix (`-h29-3`): `h<session>-<run>` ranks above `h<session>`, above plain numbers, and below a later session or date.
- 46.2 When the device model is not `available`, zone 1 shows `aside[data-author-device-panel]` headed "What the device half did on the author's computer", with two lines built from digit-free templates in `src/app/strings.ts`. Every number and file name comes from `state.results`.
- 46.3 The device step is the newest hosted or hybrid run whose whole status is pass and whose step has `mode` ONLY_ON_DEVICE, `inferenceSource` ON_DEVICE, numeric `seconds` and `outsideRequests`, and no problem starting with that step's number. A device step inside a failed run is not shown. With none, the line reads "Device step: not measured."
- 46.4 The offline line reads the newest offline-press record when it passed and holds its counts; else "Offline presses answered by the device model: not measured."
- 46.5 With the model available on this computer the panel is not drawn.
- 46.6 No test names a record file or a number of today. The rule is tested on synthetic lookups; for the committed folder the test picks the expected file by its own short rule.

## Session H36c (2026-11-15): requirement R47

Source: `H36c.md`.

### R47. Status word for a failed device start and hosted load-to-ready timing
- 47.1 When the device model is not `"available"` and `didNotStart` is set after a failed load probe or failed start/record press, `statusBar` displays `"did not start"` (digit-free string in `src/app/strings.ts`).
- 47.2 `tests/e2e/device/hostedRun.spec.ts`, `filmRehearsal.spec.ts`, and `filmRun.spec.ts` continue waiting for `"ready"`; `hostedRun.spec.ts` records `navigationToReadyS` (seconds from navigation start until the device state word becomes `"ready"`).

## Session H36d (2026-11-15): requirement R48

Source: `H36d.md` (`H36C-N0-RECHECK.md`), after Chrome `157` showed `"not on this computer"` for `8` s during the load probe and Chromium `158` flashed `"not on this computer"` / `"can be downloaded"` / `"downloading, 100%"` on load and `#get-model`.

### R48. Header says `"starting"` while the device model is tried
- 48.1 `statusBar` displays `"starting"` (`strings.status.deviceStarting`, digit-free) whenever `device.starting` is `true` and `device.state` is neither `"available"` nor `"downloading"` (`"downloading, {percent}%"` continues showing while `0 <= fraction < 1`).
- 48.2 `controller.start()` begins `deps.device.state()` before awaiting storage restore and sets `device.starting = true` until `deps.device.state()` resolves so first paint never shows `"not on this computer"` while load availability or probe checks run.
- 48.3 `onGetModel()` sets `device.starting = true` at press time and switches back from `"downloading"` to `{ state: "downloadable", starting: true }` once `fraction >= 1` and after `initialize()` before `deps.device.state()` resolves, so post-download session verification shows `"starting"` rather than `"downloading, 100%"` or `"can be downloaded"`. Zone 1 `.model-progress` (`downloading, {percent}%`) renders only when `state.device.state === "downloading"`.
- 48.4 `tests/e2e/device/hostedRun.spec.ts` records ordered deduplicated header states seen on `[data-state="device"] .state-words` from reload through `"ready"` in `deviceHeaderWordsSeen`.
- 48.5 Tests: `tests/unit/h36dEchoAndStarting.test.ts`, `tests/unit/statusBar.test.ts`, and `tests/e2e/bundled/h36aPageHonesty.spec.ts`.
