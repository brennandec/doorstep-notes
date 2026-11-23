# Masking: tasks

Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks say BUNDLED or DEVICE MODEL (browser document) and stay unticked unless a session is told to run them. Invented people only.

- [x] 1. Client list parser for `full name; other names; pronouns`; unit tests with the 12-line invented list and one bad line named by its line number. Serves R1.1, R1.4.
- [x] 2. Client list storage with "Remove the list"; unit tests: save, read, remove leaves storage empty, a fetch that throws proves no network. Serves R1.2, R1.3.
- [x] 3. Case folding helper; unit tests for "MARIA", "maria", "ß" against "SS", and accented letters kept as written. Serves R2.1.
- [x] 4. Exact pass on whole words with case folding and name parts of at least the policy length; unit tests: full name, other name "Maria O-R", hyphenated surname parts, first name alone, a name inside a longer word not masked, two clients, same tag reused. Serves R2.1 to R2.4.
- [x] 5. Near pass with Levenshtein distance exactly 1 for names and parts of 5 letters or more; unit tests: "Brandvald" matched, a swap not matched, two edits not matched, 4-letter names never matched, switched off by policy. Serves R3.
- [x] 6. Apply, mask map and surface forms; unit tests: every occurrence recorded with its exact surface form, tags `[Person 1]`, `[Place 1]`, `[Date 1]`, `[Detail 1]`, and a property test that restoring returns the text with each surface form replaced by its map value. Serves R2.3, R6.1, R6.3, R11.
- [x] 7. Propose-masks interface and double; unit tests: `mode` is `ONLY_ON_DEVICE`, input is the raw text, candidates not in the text are dropped, source label kept, the double is never chosen by `makeKit`. Serves R4.1, R4.3, R4.4.
- [x] 8. Merge of exact, near and device results on the raw text; unit tests: overlaps with exact or near spans dropped, the rest proposed and not accepted by default. Serves R4.2.
- [x] 9. Propose-masks real implementation calling the SDK when the device state is `available`, regardless of `AI_SERVICE_ENABLED`; unit tests with a fake SDK. Serves R4.1, R4.5.
- [x] 10. Send on purpose: the named question, the `sentOnPurpose` mark on one value, removed on re-mask or new record; unit tests. Serves R7.
- [x] 11. Pronoun tokens and restore, only the tokens the draft was asked to use, and the no-tokens line; unit tests for he, she, they, no pronouns on the list, and a draft with no tokens. Serves R8.
- [x] 12. Policy defaults and overlay; unit test: Remote Config unreachable gives "policy: default". Serves R9.
- [x] 13. Chips: solid listed and near with light accent fill, dashed proposed, manual, sent on purpose; tap and Enter toggle; polite live region announcements; unit tests on the DOM and the announced text. Serves R5.
- [x] 14. Device-state behaviour for absent, downloading, available and network off; unit tests with fakes. Serves R10.
- [x] 15. Headless entry point for the measurement spec running exact and near on a raw note, and a browser entry point for the device pass on the same raw note. Serves R12.
- [x] 16. REAL BROWSER, BUNDLED, H7 and H6. Network off after first load, with the bundled browser reporting no model: exact, near and tap masking of the invented visit work, the one line is shown, Enter toggles a chip and the announcement is read from the live region. Serves R5.2, R10.1, R10.3. Ran 2026-11-13 (results/real-browser-2026-11-13.json).
- [x] 17. REAL BROWSER, DEVICE MODEL, H1. Device proposals for the invented note appear as dashed chips labelled "on this device" with the network off; with Chrome or the model absent, record a failure with its reason. Serves R4.3, R10.3. Ran 2026-11-13 in Google Chrome 157.0.8103.79, network off (results/h1.json): 5 dashed chips labelled on this device.

## Second review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the second review: the part of task 10 and task 13 that prints "send on purpose" beside each listed chip (replaced by task 18, U4); the part of task 13 that makes every word a tap target of 44 px (replaced by task 20, U5).

- [x] 18. Test first, then code: the chip panel. Rewrite the expectations in `tests/unit/chips.test.ts` that print "send on purpose" beside chips. Unit tests: zero occurrences of "Send this name on purpose" before a press; a press on a listed chip opens the panel with that one action and the one line; Escape closes it and focus returns to the chip; a press outside closes it; focus moves in on open; open and close are announced; a near chip's panel also offers "Unmask" and a listed chip's does not; panel controls are at least 44 px. Serves R13.1 to R13.5 (U4).
- [x] 19. REAL BROWSER, BUNDLED, V4. Three listed chips on the page: no "Send this name on purpose" text until one is pressed; after the press it is present; Escape closes the panel and focus is back on the chip. Serves R13.6 (V4). Ran 2026-11-13 in session C05 (results/real-browser-2026-11-13-c05.json): pass. Check: `tests/e2e/bundled/secondReview.spec.ts`. In the invented visit two listed chips and one near chip open the panel.
- [x] 20. Test first, then code: words read as text. Unit tests: no underline, box or background rule for ordinary words at rest; the hover and focus rule; one tab stop for the record text, arrow keys move word to word, Enter toggles and is announced. Change the shell interface test so ordinary words are exempt from the 44 px rule by name (R14.5). Serves R14.1 to R14.5 (U5).
- [ ] 21. REAL BROWSER, BUNDLED, U5. Computed styles: ordinary words have no underline, border or background at rest; a word on pointer hover and a word with keyboard focus show the underline; chips keep their outline. Serves R14.1, R14.2 (U5).
- [x] 22. Test first, then code: `likelyNames` in `src/masking/likelyNames.ts`. Unit tests on the invented note for the returned and not-returned words of R15.1, a sentence start after a full stop and after a line break, an all-capitals word, weekday and month names, and a word already masked. Serves R15.1 (U6).
- [x] 23. Test first, then code: the likely-names line and dotted underline, shown only when the device model is not `available`, with the exact wording of R15.2 for 3, 1 and 0 words, one press to mask each word, the announcement, and the outgoing text holding no "Bea" afterwards. Serves R15.2 to R15.4 (U6).
- [x] 24. REAL BROWSER, BUNDLED, V5. No device model and the invented visit: the line lists "Bea", one press masks her, the outgoing text has no "Bea". Serves R15.5 (V5). Ran 2026-11-13 in session C05 (results/real-browser-2026-11-13-c05.json): pass. Check: `tests/e2e/bundled/secondReview.spec.ts`.
- [x] 25. Test first, then code: the propose-masks prompt and the backstop. Unit tests: the prompt holds the instruction of R16.1; "Mon", "Fri", "14:00" and "tomorrow" are dropped before the merge; "3/3/87", "Bea" and "her twin brother" are kept. Serves R16.1, R16.2 (U9).

## Third review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. Invented people only.

Retired by the third review: none.

- [x] 26. Test first, then code: kinds. Unit tests (Y4): "Mon", "Fri", "14:00" and "tomorrow" are dropped in the merge and in the screening of a returned draft; a suggestion without a kind becomes [Detail 1] and the reply is accepted; a wrong kind is still refused; "Bea" and "14 Alder Court" keep their kinds. Serves R17.1 to R17.3 (X5).


## Fourth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md`. Each test is written before or with its code. Run the whole suite after each task with `perl -e 'alarm 300; exec @ARGV' npm test`, then the type check and the build. REAL BROWSER tasks stay unticked unless a session is told to run them. Invented people only.

Retired by the fourth review: none.

- [x] 27. Test first, then code: the role and relation filter. Unit tests (L6) for R18.4: each kind of dropped word, the role word followed by a name, a capitalised role word kept, a date kept; the lists are in `src/masking/notNeeded.ts` and the README names that file. Serves R18.1 to R18.3 (K4).

## Sixth review (2026-11-13): new tasks

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md`. Not built in the session that wrote them. Each test is written before or with its code.

Retired by the sixth review: the conclusion of the fifth review that no date rule is added (masking R18.4 and measurement R14.3), where this rule's evidence is the fourth run.

- [x] 28. Test first, then code: the date-word rule of R19.1 with unit tests for both sides. Serves R19.1, R19.2 (R6). Done in session G02: `isDateWordWithoutBirth` and `hasYear` in `src/masking/notNeeded.ts`, called per place in `src/masking/merge.ts`; tests in tests/unit/dateWords.test.ts. The rule applies to suggestions the model labels as dates of birth; the birth words are looked for three words before, three after and inside the text.

## Photo path confusions (session H02)

- [x] 29. Test first, then code: the exact pass treats I and l, and O and 0, as one letter, so a listed name read from a photo as "lone" for "Ione" or "0dalys" for "Odalys" is still masked; a word not on the list stays unmasked. Tests in tests/unit/photoConfusions.test.ts (two failed before the change). Code: `foldConfusable` in `src/masking/fold.ts`, used by `src/masking/exact.ts`. No handwriting fixture added. Serves R2.1.

## Session H12 (2026-11-14): trailing punctuation

- [x] 30. Test first, then code: `isNotNeeded` strips trailing ".", "," and ";" before the lookup. Tests in `tests/unit/joinPunctuation.test.ts` for "Mon.", "Fri." and "Thurs.", and a count of the strings in `results/misses.json` falseMasks.device that the rule now drops. Serves R20.1, R20.2.

## Session H17 (2026-11-14): a person present who is not on her list

- [x] 31. Test first, then code: the device pass proposes a name on the "Present:" line that is not on her list, whatever the model returns; accepting it masks it in the outgoing text. Tests: `tests/unit/devicePassPresent.test.ts`. Serves R21.1 to R21.4.

## Chain R17, session A (2026-11-19)

- [x] 32. Test first, then code: the lone capitalised role word (H51f). Tests in `tests/unit/notNeeded.test.ts` (including the changed Doctor, Nurse and Landlord case) and `tests/unit/merge.test.ts` (empty `added` list); code in `isNotNeeded`, `src/masking/notNeeded.ts`. Serves R22, amended 18.2 and 18.4.
