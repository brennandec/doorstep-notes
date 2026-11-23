# Drafting: tasks

Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks say BUNDLED or DEVICE MODEL (browser document) and stay unticked unless a session is told to run them. Invented people only.

- [x] 1. Notice text file and part; unit tests: the three Rule 10 points, invented people only, "not connected" while the cloud flag is off, the tier from `CLOUD_TIER` when on, Send disabled until the notice is shown. Serves R3.
- [x] 2. Outgoing string builder; unit tests: built only from a masked record, fixed labelled lines and instructions, no worker name, the shown string equals the job's `text` argument. Serves R1.1, R2.1, R2.2.
- [x] 3. `EgressTicket` type made only in `send.ts`; unit test with `// @ts-expect-error` that a cloud job cannot be called without it. Serves R8.2.
- [x] 4. Model names config with in-code defaults; unit test: the cloud model name is always set. Serves R1.2.
- [x] 5. Mode choice from online state, probe and device state; unit tests for every row of the design table. Serves R1.3, R4.
- [x] 6. Draft interface and double; unit tests: `PREFER_IN_CLOUD` online, `ONLY_ON_DEVICE` offline, double gives `IN_CLOUD` with `connected: false` and "not connected", device draft labelled "Shorter draft made on this device.". Serves R1.4, R1.5.
- [x] 7. Draft real implementation through the SDK: the `ONLY_ON_DEVICE` call real whenever the model is `available`, the cloud call on the double until the service is enabled; unit tests with a fake SDK. Serves R1.2, R1.3, R1.5.
- [x] 8. Restore with pronoun tokens only, the no-tokens line, they/them with a note, unmatched and changed tags flagged; unit tests with a fetch that throws. Serves R6.1 to R6.6.
- [x] 9. Send path wiring for the draft through `send.ts`; unit test: preview check blocks a listed name not on purpose, capture runs, ledger entry has job `draft`. Serves R2.3, R8.1.
- [x] 10. Offline behaviour; unit tests with the double and a fake clock: device draft at once, no-model line and Copy, downloading line with progress. Serves R4, R5.
- [x] 11. Rewrite interface, double and real; unit tests: mode `PREFER_ON_DEVICE`, always through `send.ts`, waits for Send with the notice when the cloud flag is on, changed tag refused with the exact line. Serves R7.
- [x] 12. Zone 2 and zone 3 parts: outgoing text block, notice, Send, finished note sheet in the serif face with source label and Copy; unit tests on the DOM. Serves R2.1, R3.4, R6.7.
- [x] 13. REAL BROWSER, BUNDLED, H4 online part. Online draft of the invented visit through the double, labelled "in the cloud" and "not connected"; write the result to `results/h4.json`. Serves R1.2, R1.4, R1.5. Ran 2026-11-13; `results/h4.json` holds the online part only. The offline part is task 15.
- [x] 14. REAL BROWSER, BUNDLED, H6. Model unavailable in the bundled browser: the online draft works and the offline case shows the no-model line. Serves R4.2, R5.1. Ran 2026-11-13 (results/real-browser-2026-11-13.json).
- [x] 15. REAL BROWSER, DEVICE MODEL, H4 offline part. Network off, model present: the app chooses `ONLY_ON_DEVICE` and the draft is labelled "Shorter draft made on this device."; add the result to `results/h4.json`, or a miss with its reason. Serves R1.3, R1.4, R4.1. Ran 2026-11-13 in Google Chrome 157.0.8103.79, network off (results/h4.json, offline part): pass.
- [ ] 16. REAL BROWSER, DEVICE MODEL. Network drop in the middle of a `PREFER_IN_CLOUD` call, with the AI service enabled; write what the SDK did to `results/draft-network-drop.json`, or a miss with its reason. Serves R1.6.
- [x] 17. Ruling 24. The draft and every rewrite pass through the masker before they are shown in the outgoing zone or used again; a name the model added is marked and is not restored without a press. Test first with a double that adds a name.
- [x] 18. Browser fact 5. The small-rewrite job asks for exactly one rewritten sentence and nothing else, and the app refuses a reply that is a list of options. Test with the reply recorded in `results/device-model-probe-2026-11-13-firebase-sdk.json`.

## Second review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the second review: none. Task 11 built the rewrite job; tasks 19 to 22 give it a way in from the screen. Egress-check task 13 (H2 part A) waits for task 20 here and egress-check task 20.

- [x] 19. Test first, then code: sentence selection in the outgoing block. Unit tests: only sentences of the masked record part can be selected; the selected sentence shows "Shorter" and "Plainer" at least 44 px high; only one sentence shows them; the text of the block without the controls equals the string given to the job. Serves R10.1 (U7).
- [x] 20. Test first, then code: the press flow. Unit tests with the double: the job gets exactly the one sentence and the fixed instructions; mode `PREFER_ON_DEVICE`; the source label and "not connected" show; the masker runs before the sentence is replaced (a double returning an invented listed name shows its tag); a changed tag is refused with the exact line; a list of options is refused; with the cloud switch on the press waits for Send with the notice; with a fetch that throws the device path makes no request. Serves R10.2 to R10.6 (U7).
- [x] 21. REAL BROWSER, BUNDLED, V6 (rewrite part). In the invented visit, "Shorter" on a sentence: the double is called, a source label and "not connected" show, the sentence is replaced after the masker ran, and a listed invented name returned by the double shows as its tag. Serves R10.7 (V6). Ran 2026-11-13 in session C05 (results/real-browser-2026-11-13-c05.json): pass, in the e2e build, whose test hook `window.__rewriteTo` (`withRewriteFixture`, unit test `tests/unit/rewriteFixture.test.ts`) makes the double answer with an invented listed name. Check: `tests/e2e/bundled/secondReviewHooked.spec.ts`.
- [x] 22. REAL BROWSER, DEVICE MODEL, V6. In Google Chrome with the built-in model, "Shorter" on a sentence answers with the label "on this device", the sentence is replaced after the masker ran, and the request recorder sees no request. Write `results/rewrite-device.json`, or a miss with its reason. Serves R10.7 (V6). Ran 2026-11-13 in Google Chrome 157.0.8103.79 (results/rewrite-device.json): pass. Label "on this device", no listed word in the text after the press, no request. Seen: the sentence grew from 74 to 86 characters. Check: `tests/e2e/device/rewriteDevice.spec.ts`.

## Third review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the third review: the part of task 17 that marks every value the screening finds, and that is not in the mask map, as "added by the model" (replaced by task 23).

- [x] 23. Test first, then code: what the device knows, it puts back. Unit tests (Y1) for R11.1 to R11.5: known values found in the returned draft are restored and not marked; unknown names stay tags and are marked; every suggestion accepted leaves no tag in the finished note except for names a model added; a rewrite that brings a new tag is still refused. Serves R11.1 to R11.5 (X1).
- [x] 24. Test first, then code: one text. The outgoing string is held in one place and rebuilt after every mask change, also after Draft and before Send; Send refuses and redraws the box when the two differ. Unit tests (Y2) for R12.1 to R12.4. Serves R12.1 to R12.4 (X3).
- [x] 25. REAL BROWSER, DEVICE MODEL, Y1. In Google Chrome with the built-in model, the invented visit with every suggestion accepted: the finished note holds no square-bracket tag except for names a model added, and reads "Present: Maria Okonkwo-Reyes, Bea." Write the result, or the miss with its reason, to `results/`. Serves R11.6 (Y1). Ran 2026-11-13 in session D02 in Google Chrome 157.0.8103.79 (results/third-review-device.json, key y1): pass. One suggestion was accepted in that run (the device model proposes different things from run to run); no tag in the finished note; it read "Present: Maria Okonkwo-Reyes, Bea." Check: `tests/e2e/device/thirdReview.spec.ts`.

## Sixth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md`. Each test is written before or with its code. REAL BROWSER tasks stay unticked unless a session is told to run them.

Retired by the sixth review: the two marks side by side on a finished note from a double (task 26 replaces them; the tests that assert them are rewritten there).

- [x] 26. Test first, then code: one mark on the finished note. Serves R13.1 to R13.4 (R5).
- [x] 27. REAL BROWSER, BUNDLED, S5. Not connected: the finished note holds exactly one mark, with the words of R13.1. Serves R13.4 (S5). Ran 2026-11-13 in session G03 (results/real-browser-2026-11-13-g03.json): pass. One mark, "test double: cloud not connected"; no "in the cloud" label. Check: `sixthReview.spec.ts` (S5).
- [x] 28. Test first, then code: the one mark on the finished note also says the names were put back on this device. New words: "names put back on this device; draft text is a test double: cloud not connected" (`strings.source.testDouble`). The restored name stays in the note. Serves R13.1 and R13.4. Check: `tests/unit/oneMark.test.ts` and the two browser specs that read the mark. Session H02 (2026-11-14).

## Session H04 (2026-11-14): Shorter must be shorter

Source: the product owner's instruction of this session. `results/rewrite-device.json` (74 to 86 characters) is kept as it was.

- [x] 29. Test first, then code: Shorter returns fewer characters than the sentence sent. Unit tests in `tests/unit/rewrite.test.ts` (a shorter real answer is used; a longer or equal one is refused with "The rewrite was not shorter, so it was not used. The sentence is unchanged."; Plainer is not held to it; the fixed instruction asks for fewer characters) and a changed stand-in answer in `tests/unit/rewriteScreen.test.ts`. The double, which returns the sentence unchanged and says "not connected", is not held to the rule. Code: `src/drafting/rewriteFlow.ts`, `src/inference/rewrite/instructions.ts`, `src/app/strings.ts`. Whole suite run after the change. Serves R10.5 and R10.7 (V6).
- [x] 30. REAL BROWSER, DEVICE MODEL, failure test for Shorter. With the model already on this computer, the sentence shown after "Shorter" has fewer characters than the sentence sent, and is on the screen. Written to a new file, `results/rewrite-device-shorter.json`. Ran 2026-11-13 (local time; the file carries the UTC date 2026-11-14) in Google Chrome 157.0.8103.79, headless, no download, one run (results/rewrite-device-shorter.json): pass, 74 characters sent, 57 shown, label "on this device", no request. Serves R10.7 (V6). Check: `tests/e2e/device/rewriteDevice.spec.ts`, which writes nothing when the model is absent.
- [x] 31. REAL BROWSER, BUNDLED, failure test for Shorter against the real service (judge table fix 2). Written first in `tests/e2e/bundled/shorterReal.spec.ts`. The bundled browser has no device model, so the cloud answers. The test fails when the answer is the test double, when the call is not HTTP 200, when the label is not "in the cloud", or when the sentence shown does not have fewer characters than the sentence sent. It writes a new file, `results/rewrite-real-service.json`, and the screen `docs/screens/16-shorter-real-service.png`. `src/firebase/rewriteSdk.ts` and the device files are unchanged. Ran 2026-11-13 (local time; the file carries the UTC date 2026-11-14) in Playwright's bundled Chromium, headless, results in `results/rewrite-real-service.json`: HTTP 200, `gemini-3.5-flash-lite`, "in the cloud", 41 characters sent, 38 shown (session H02, commit 75f02d8). That file was overwritten in session H11 (commit e092d82) by a run dated 2026-11-14 with 41 characters sent and 29 shown. Picture 16 was taken again in H23 (`results/rewrite-real-service-2026-11-14-h23.json`). One run on one invented sentence; the model's answers vary between runs. Serves R10.

## Session H11 (2026-11-14): tokens in a finished note

Source: the product owner's instruction for chain H11, item 1. Each test is written before its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`.

- [x] 32. Test first, then code: no redaction token in a finished note. Ran 2026-11-14 (session H11): `tests/unit/tokenForms.test.ts` failed 15 of 24 on the old restore code (the cloud's `[him:Person 1]` form among them), then passed 25 of 25 after `src/masking/tokenForms.ts`, `src/masking/pronouns.ts` and `src/drafting/restoreDraft.ts` changed; the two e2e failure checks (`cloudDraft.spec.ts`, `flow.spec.ts`) now look for the token in any bracket form. `tests/unit/tokenForms.test.ts`: one fixture per form listed in R14.1, a property test over generated invented names and forms, and a check that a text holding no mapped token is unchanged. It is shown failing on the old restore code once, then the code is changed in `src/masking/tokenForms.ts`, `src/masking/pronouns.ts` and `src/drafting/restoreDraft.ts`. Serves R14.1 to R14.4.

## Session H12 (2026-11-14): a finished note she can paste

Source: the product owner's instruction for chain H12. Each test is written before its code and shown failing on the starting commit once. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`.

- [x] 33. Test first, then code: the finished note from the recorded cloud draft is plain text, and Copy equals the sheet. Test: `tests/unit/finishedPlain.test.ts`. Serves R15.1, R15.5, R15.7.
- [x] 34. Test first, then code: the instructions of the outgoing text (plain sentences, no Markdown, tokens in curly braces). Test: `tests/unit/finishedPlain.test.ts`. Serves R15.2.
- [x] 35. Test first, then code: token forms read before restore. Test: `tests/unit/finishedPlain.test.ts`. Serves R15.3.
- [x] 36. Test first, then code: leftovers flagged in the failure colour with Copy held, and added names keep their put-back buttons. Test: `tests/unit/finishedHeld.test.ts`. Serves R15.4.
- [x] 37. Test first, then code: Markdown marks stripped once. Test: `tests/unit/finishedPlain.test.ts`. Serves R15.5.
- [x] 38. Test first, then code: no doubled punctuation where items are joined. Tests: `tests/unit/joinPunctuation.test.ts`, `tests/unit/likelyNames.test.ts`. Serves R15.6.
- [x] 39. REAL BROWSER, BUNDLED. Ran 2026-11-14 (session H12): `cloudDraft.spec.ts` once, one generateContent call, HTTP 200, `gemini-3.5-flash-lite`, "in the cloud", written to `results/cloud-draft-2026-11-14-2.json`; the finished note holds no "**", no heading line and no tag or token; `docs/screens/05-finished-note.png` retaken. Serves R15.7.
- [x] 40. Test first, then code (H16): offline Shorter and Plainer run on this device without Send, whatever the cloud switch says; online with the cloud switch on they keep the Send step. Tests: `tests/unit/rewriteOffline.test.ts` (3 of 7 failed on the old code). Serves R10.5.
- [x] 41. Test first, then code (H16): the raw-line rule of the device checks flags a raw note line in a request only when that line still carries a listed name, another name, a name part, a masked original or a surface form. The remainder of a masked line is not a leak; every name check is unchanged. Tests: `tests/unit/leakRule.test.ts` (failed on the old code: no module). Code: `tests/e2e/device/leakRule.ts`, `tests/e2e/device/hybridSupport.ts`. Serves R10.5.

## Session H17 (2026-11-14): no token on the page or the clipboard

Source: the product owner's instruction for chain H17. Each test is written before its code and shown failing on the starting commit (0d3495b) once. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`.

- [x] 42. Test first, then code: no token syntax in any text she sees or copies. An unmapped tag or pronoun token becomes a plain phrase in the note and a plain-language flag; a model that renames a token is covered; screening never turns token syntax into a name. Tests: `tests/unit/noTokenShown.test.ts`. Serves R16.1, R16.2, R16.3, R16.5, R16.6.
- [x] 43. Test first, then code: Copy is held while any flag is open and enabled when none is, with one line of reason. Tests: `tests/unit/noTokenShown.test.ts`, `tests/unit/finishedHeld.test.ts` (rewritten for R16.4). Serves R16.4.
- [x] 44. Test first, then code: offline Shorter and Plainer ask the SDK for ONLY_ON_DEVICE and show "on this device". Tests: `tests/unit/rewriteOffline.test.ts`. Serves R16.7.
- [x] 45. Test first, then code: the cause of the failed step after "Save ledger" is written down and tested: a sentence cannot be selected once a finished note exists, and can between Draft and Send. The hybrid check does its second "Shorter" there. Tests: `tests/unit/rewriteOffline.test.ts`. Serves R16.8.

## Session H18 (2026-11-14): a restored pronoun starts a sentence with a capital

Source: the product owner's instruction for chain H18. Each test is written before its code and shown failing on the starting commit (9876181) once. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`.

- [x] 46. Test first, then code: a restored pronoun at the start of the text, a line start, or after ". ", "! " or "? " is capitalised; elsewhere it keeps the case of the list entry. Tests: `tests/unit/pronounCapital.test.ts` (6 of 9 failed on the old code); five older expectations in `tests/unit/pronouns.test.ts` and `tests/unit/tokenForms.test.ts` that held the lower-case defect were changed. Code: `src/masking/pronouns.ts`. Serves R18.

## Session H25 (2026-11-14): two tokens that hedge one slot for one person are one pronoun

Source: the product owner's instruction for chain H25. Each test is written before its code and shown failing on the starting commit (94bd7d0) once. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`.

- [x] 47. Test first, then code: two pronoun tokens for the same tag that hedge one slot, joined by "or", "/" or "and/or", are put back as one pronoun; two identical words, different slots ("she or her daughter"), "her" with an object word before another word, two different tags, "and" and free text are left alone. Tests: `tests/unit/pronounPair.test.ts` (11 of 20 failed on the old code). Code: `src/masking/pronouns.ts`. Serves R19.
