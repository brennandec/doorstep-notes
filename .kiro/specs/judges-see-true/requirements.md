# What judges see is true: requirements (session H20b, 2026-11-14)

Source: the three-judge pass at ba8a9ff (external desk review record, "LAST FIXES" and "READY"). Base 35e85f3 (H19). The owner's rulings, the device-first order, the egress checks and H19's production App Check do not change. This is the rerun of H20 after the driver's protected-file guard stopped it; the stopped work was read for reference and redone.

## R1. A mask pressed in the second reader reaches the next text that is built

1. `onDraft`, `onRewrite` and `builtNow` in `src/app/controller.ts` pass `extraMasked` to `prepareDraft`, as `onAskReader` already does to `buildOutgoing`.
2. A quote she pressed in the reader is masked in the next draft's outgoing text, in the preview before Draft, in the text Draft holds for Send, and in the base a "Shorter" or "Plainer" press builds from.
3. One run of `tests/e2e/device/hybridRun.spec.ts` in Google Chrome with the model and the real cloud, on the e2e build, in a new results file with the suffix `h20b`. The step after the reader's mask records the pressed value and fails when the text sent for the draft still holds it. The run makes at most 4 `generateContent` requests; the session cap is 5.

## R2. No "Save ledger" in the submission build

1. `src/app/main.ts` does not make a ledger sync or a ledger store double. The controller is given no `ledgerSync`.
2. The ledger fold ("Egress ledger (N entries)") and the egress ledger stay. With no `ledgerSync` the fold shows the entries, a line that says they are kept on this device, and no Save button, no "not connected" line and no "test double" words.
3. With a `ledgerSync` given (the unit tests of the sync), the controller and the panel behave as before.
4. The README line about "Save ledger" is replaced by a line about the ledger fold.

## R3. Offline, the cloud state reads unreachable

1. While the network is offline, the status bar's cloud state reads "unreachable" when the cloud is configured. It never reads "connected" offline. "not configured" and "not connected" stay as they are.
2. The word is in the string table. The state returns to its derived words when the network is back.

## R4. One closed "How this was measured" disclosure

1. The figure paragraphs under masking and the cold-start line on the first screen are inside one closed `details` element headed "How this was measured". Nothing else holds them.
2. The element is closed on first render and after a reload. Her press opens it and the page keeps it open like the other folds.
3. The figure and cold-start text are unchanged, from the same functions.

## R5. The README agrees with itself

1. The lines that say H2 part B and the network drop "have not run" say what the records say (`results/h2-part-b-2026-11-14-h16.json`, `results/draft-network-drop-2026-11-14-h18.json`).
2. The repeated sentence in "What it does" item 7 appears once. The "working title" line is gone.
3. Screen 14 (the block) is the first picture under "Pictures". Screens 05 and 17 are retaken from the H20b hybrid run.
4. Screen 10 and every other file under `docs/screens` stay as they are.

## R6. The device structure prompt follows the record's date rule

1. `src/inference/structure/createOptions.ts` no longer asks for "YYYY-MM-DD". It tells the model to copy the date words as the note wrote them, and never to convert or complete a date, as the schema and the structure prompt do.

## R7. The runs

1. The hybrid run goes first, once. The real-service specs H19 left unrun (`cloudDraft`, `shorterReal`, `secondReaderReal`, `secondReaderLoop`) run only while the session's count of `generateContent` calls stays at or under 5. A spec that would pass 5 is not started and is named as not run.
2. The non-cloud bundled specs already passed on this tree and are not run again. A failing check is recorded as failed.

## R8. Recorded results stay as they were

1. A spec that writes a results file writes a new dated file (`results/<name>-<date>[-<suffix>].json`, never an existing one). This covers the H2 part A spec and every other bundled and device spec that wrote a fixed name.
2. Readers (the README writer, the figures, the tests) take the newest record of each kind through `newestResult` and `newestResultName`.
3. `results/h2-part-a.json` stays byte for byte as committed. Nothing restores a file with git; the overwrite is prevented.

## R9. Screens

1. A retaken screen is written only through `holdScreen` in `tests/e2e/fixtures/screens.ts`, and only screens 05 and 17. No other spec writes a file under `docs/screens`.
2. `results/screens.json` may gain the name `17-second-reader-real-service`. It is the only results file edited.

## R9a. Screens retaken in H23

1. Screens 08, 09, 16 and 18 are written only through `holdScreen`, only when `RETAKE_SCREENS` names them, and only after every check of their spec passed.
2. The two shell pictures were removed, and `screens.spec.ts` writes none.
3. R9.1 and R9.2 are superseded for these four names only.

## R10. What a judge sees first (session H35b)

1. The example's record is hand-written in `src/app/example/inventedVisit.ts`. With no device model the control that opens it reads "Use the example's record", and one line says it "was made by hand for the example, not by the device model". It never reads as a device result.
2. A computer without the model shows what the device half did on the author's computer: the newest passing hosted or hybrid device step and the newest passing offline-press record, each with its results file. Numbers and file names come from `results/`; a missing record reads "not measured".
3. The panel is not drawn when the model is available on that computer. The README and `docs/submission/**` are not edited by this session.
