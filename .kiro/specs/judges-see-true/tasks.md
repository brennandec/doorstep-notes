# What judges see is true: tasks (session H20b)

Each test is written before the code it covers and is shown once failing on the old code.

- [x] 1. Reader masks reach the draft. Test: `tests/unit/readerMaskReachesDraft.test.ts` (3 of 3 failed on the old code, pass after). Serves R1.1, R1.2.
- [x] 2. No Save ledger in the build. Test: `tests/unit/ledgerNoSave.test.ts` (3 of 5 failed on the old code; the other two are guards). Serves R2.
- [x] 3. Offline, the cloud state reads "unreachable". Test: `tests/unit/cloudUnreachable.test.ts` (3 of 4 failed on the old code). Serves R3.
- [x] 4. One closed "How this was measured" disclosure. Test: `tests/unit/howMeasured.test.ts` (6 of 7 failed on the old code). `figuresScreen.test.ts` and `folds.test.ts` follow the new place. Serves R4.
- [x] 5. The structure prompt names no "YYYY-MM-DD". Test: `tests/unit/structureDatePrompt.test.ts` (2 of 3 failed on the old code). Serves R6.
- [x] 6. No spec writes a fixed results file or a screen it was not given; readers take the newest record. Test: `tests/unit/specsWriteNewRecords.test.ts` (17 of 49 failed on the old code). `results/h2-part-a.json` is byte for byte as committed. Serves R8, R9.
- [x] 7. README lines and picture order. Test: `tests/unit/readmeH20.test.ts` (checked against the old README text: working title 1, "Save ledger" 2, repeated sentence 2, "has not run" 3). Serves R5.
- [x] 8. REAL BROWSER, DEVICE MODEL, real cloud: `hybridRun.spec.ts` once, headless Google Chrome, e2e build: `results/hybrid-run-2026-11-14-h20.json` reads pass, 3 `generateContent` calls, the reader's quote absent from the second pass, the draft text and the draft request. Screens 05 and 17 retaken through `holdScreen`.
- [x] 9. Real-service specs within the cap of 5: `cloudDraft` (1 call) and `shorterReal` (1 call) ran and passed; total 5. `secondReaderReal` and `secondReaderLoop` were not started (they would pass 5).

## Session H21 (2026-11-14): the Devpost text

- [x] 1. Structure test written first: `tests/unit/storyDevpost.test.ts`. Run on the old STORY.md: 7 of 12 failed (draft header and README tags, opening, jobs table, second reader, figures, number map, Try it). Serves fix 3 of the independent pass.
- [x] 2. `docs/submission/STORY.md` rewritten for the form: Dana and the employer rule, the OVIC quote from docs/sources.md, the jobs table, the second reader with the recorded loop and what it does not prove, the figures with limits, Try it, What's next from Limits. 848 words or fewer; every number is in a results file (the test checks it).
- [x] 3. Whole suite and typecheck, with the time limit (see the log).
