# Masking: requirements

Source: BRIEF.md steps 3 and 5, Rule 1, acceptance H1, H2, H5, H6, H7. Owner documents of 2026-11-13: rulings 1, 4, 5, 6, 11, 13, 23, the look and layout (chips), the browser on this computer. Facts: sdk-facts 16, 19, 29.

Examples use the invented visit (capture-and-record R10): client Maria Okonkwo-Reyes (she/her), client Tomas Brandvold (he/him), worker Dana Whitfield.

Words used here: a "masked value" is the original text that was masked, never the tag that replaced it (ruling 1). A "surface form" is the exact text of one masked occurrence as it was found in the record, for example "Maria O-R" or "Brandvald" (ruling 4).

## Requirements

### R1. Client list
- 1.1 She can paste a client list once. Each line is one client: `full name; other names separated by commas; pronouns`. Other names and pronouns may be empty. Pronouns are he/him, she/her or they/them. A unit test parses the 12-line invented list.
- 1.2 The list is kept only in this browser, through `src/storage/`. The BUNDLED H2 part A run shows no request carrying any listed name.
- 1.3 She can edit the list or remove it. Removing deletes it from storage. The control reads "Remove the list". A unit test asserts storage is empty after removal.
- 1.4 A line that cannot be read is shown with a plain line naming its line number; the rest of the list loads. A unit test with one bad line.

### R2. Exact masking, no model (Rule 1, ruling 11)
- 2.1 Every full name, other name and name part on the list found in the record text is masked. Matching is exact string matching with Unicode case folding, on whole words only. A unit test covers "MARIA", "maria", "Maria O-R" and a word that only contains a name inside it, which is not masked.
- 2.2 Parts of a full name (each space- or hyphen-separated part, first name, surname) are matched when at least `MIN_NAME_PART_LENGTH` letters long (3 by default, from the policy). Exact-pass false masks are counted in the measurement spec.
- 2.3 Each masked value is replaced by a tag such as `[Person 1]`. The same person always gets the same tag in one record. Places, dates and describing phrases get `[Place 1]`, `[Date 1]` and `[Detail 1]`.
- 2.4 No model is used. Exact masking works with the device model absent and with the network off (H6, H7). A unit test asserts `src/masking/` imports no inference module.

### R3. Near match, no model (Rule 1, ruling 11)
- 3.1 A word in the text is a near match for a listed name or name part when, after case folding, the edit distance between them is exactly 1 (one letter added, dropped or changed) and the listed name or part has 5 letters or more. No other near rule is used. A unit test covers "Brandvald" for "Brandvold", "Okonkwo" against "Okonkow" (two edits, not matched), and a 4-letter name that is never near-matched.
- 3.2 Near matches are masked with the same tag as the listed person and marked kind `near`, shown as a chip with a solid outline like a listed name, so she can undo a wrong one with one press.
- 3.3 The near rule can be switched off in the policy. It is on by default.

### R4. Device proposals on the raw record (ruling 6)
- 4.1 The propose-masks job runs in `ONLY_ON_DEVICE` mode on the raw record text, with nothing masked, on this device. It returns candidates: other names, places, dates of birth and describing phrases such as "her twin brother". Each has a kind and the exact text span.
- 4.2 The exact and near passes also read the raw text. The three results are merged: a candidate that overlaps a listed or near mask is dropped; the rest are shown as proposed chips with a dashed outline and are not masked until she accepts them (L&L).
- 4.3 Every proposal list carries the source label from `inferenceSource`.
- 4.4 Candidates whose text is not found in the record are dropped. A unit test.
- 4.5 Device jobs call the SDK when the browser reports the model `available`, whether or not the cloud service is enabled (ruling 23).

### R5. Chips and tap to mask (look and layout)
- 5.1 A masked value is a chip showing its tag. A listed name or near match has a solid outline and a light accent fill. A value proposed by the device model has a dashed outline until she accepts it. A manual mask has a solid outline and no fill.
- 5.2 Any word or phrase in the record can be masked or unmasked with a tap or the Enter key. Every target is at least 44 px. The change is announced to assistive technology through a polite live region in words, for example "Masked: Person 1" or "Unmasked: Bea". A unit test asserts the live region text.
- 5.3 A manual mask is kind `manual`. All occurrences of the same text, by case-folded exact match, are masked together. There is no option to mask one occurrence only, because the egress check would then find the other.
- 5.4 States are shown in words as well as outline style, never by colour alone.

### R6. Surface forms (ruling 4)
- 6.1 For every masked occurrence the exact surface form found in the text is recorded on this device, with its tag and kind.
- 6.2 The list of surface forms is passed to the egress check and to the second reader's redaction. It is never part of any outgoing text. A unit test asserts that the outgoing text builder has no access to it.
- 6.3 Surface forms are kept in IndexedDB with the mask map and removed with them.

### R7. Unmasking a listed name on purpose (ruling 5)
- 7.1 A listed name in the outgoing text blocks sending. There is no general override.
- 7.2 She can unmask one listed value on purpose, by name: pressing a listed chip and choosing "Send this name on purpose" asks "Send Maria Okonkwo-Reyes by name in the text that leaves?" with the name written out. Confirming marks that value `sentOnPurpose`. A unit test asserts the question names the value.
- 7.3 A value marked `sentOnPurpose` does not block sending; the egress line reports it as sent on purpose (egress-check R5).
- 7.4 The mark applies to that one value only and is removed when she masks it again or loads a new record.

### R8. Tags and pronouns
- 8.1 People tags in the record use their mask tags after masking.
- 8.2 Pronouns in the masked text stay as written. On restoring, pronoun tokens are replaced from the client list entry, and only those tokens (ruling 13; drafting R6).
- 8.3 A client with no pronouns on the list gets they/them in the restored text and a visible note.

### R9. Masking policy
- 9.1 A policy object sets: near match on or off, minimum name-part length, whether device proposals start accepted. Defaults are in code; Remote Config may replace them.
- 9.2 With Remote Config unreachable or cut, the defaults are used and the page says "policy: default".

### R10. Device model states
- 10.1 Absent: exact, near and tap masking work. One line says the device pass is not on this computer and what it would add.
- 10.2 Downloading: exact and near masking work now. The device pass shows progress and runs when ready; she is not blocked.
- 10.3 Network off: all of masking works if the model is present; no masking step needs the network.

### R11. Mask map and restore
- 11.1 Masking produces a mask map (tag to listed full name or first surface form) held in memory and on this device only. It is never part of any outgoing text.
- 11.2 Restore replaces tags with values from the map. A property test with generated invented lists asserts that restoring the masked text returns the text with each surface form replaced by its map value.

### R12. Measurement hook (H5, ruling 7)
- 12.1 The exact and near passes can run headless on the synthetic set, and the device pass can run in a DEVICE MODEL browser, each on the same raw note (measurement spec).

## Acceptance map

| Brief or owner item | Covered by |
|---|---|
| H1 | R4.3, R10.3 (DEVICE MODEL) |
| H2 | R1.2, R6.2, R11.1 |
| H5 | R12 with the measurement spec |
| H6 | R2.4, R10.1 |
| H7 | R10.3 |
| H9 | unit tests for R1 to R3, R5 to R8, R11 |
| Ruling 1 | words section, R6 |
| Ruling 4 | R6 |
| Ruling 5 | R7 |
| Ruling 6 | R4.1, R4.2 |
| Ruling 11 | R2.1, R3.1 |
| Ruling 13 | R8.2 |
| Ruling 23 | R4.5 |
| Look and layout, chips | R5 |

## Second review (2026-11-13): requirements R13 to R16

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md` (direction U4, U5, U6, U9; seen problems S4, S5, S6, S9; acceptance V4, V5). The second review is later than every other owner document and wins over this spec where they differ. Each requirement says what it wins over.

### R13. "Send this name on purpose" lives on the chip (U4, S4, V4)
Wins over: R7.2 as built (the control printed after every listed chip) and the chip tests that expect it.
- 13.1 The text "Send this name on purpose" is not in the document until a listed chip is pressed. A unit test and a BUNDLED test count its occurrences on a page with three listed chips: zero.
- 13.2 Pressing a listed chip (click or Enter) opens a small panel on that chip. The panel holds that one action, "Send this name on purpose", and one plain line saying what it means: the name will be in the text that leaves, and the egress check will report it as sent on purpose. The named question of R7.2 is still asked after the action is chosen.
- 13.3 Escape closes the panel and returns focus to the chip. A press outside closes it. Opening and closing are announced in the polite live region. Focus moves into the panel when it opens.
- 13.4 A near-match chip also opens the panel, and the panel also offers "Unmask", so a wrong near match is still undone with two presses (R3.2). A listed chip has no "Unmask": a listed name in the text that leaves is blocked or sent on purpose (ruling 5). Proposed and manual chips keep the tap-or-Enter toggle of R5.2.
- 13.5 The panel's controls are at least 44 px high. The panel introduces no new colour.
- 13.6 BUNDLED check (V4): no "Send this name on purpose" text in the document until a listed chip is pressed; after the press it is there; Escape closes the panel and focus is back on the chip.

### R14. Text reads as text (U5, S5)
Wins over: R5.2 where every word in the record is a tap target of at least 44 px (and the matching shell-and-offline R5.2 test for words).
- 14.1 Ordinary words in the record text have no underline, no box, no border and no background at rest. A BUNDLED computed-style test.
- 14.2 A word shows that it can be masked when the pointer is on it or it has keyboard focus: an underline in the ink colour appears, with the focus ring on focus. No new colour (shell R3.2).
- 14.3 The record text is one tab stop. Arrow keys move from word to word inside it, and Enter masks or unmasks the word under focus, as in R5.2. The change is still announced in the live region. A unit test of the key handling.
- 14.4 Chips keep their outlines, labels and 44 px targets (R5.1, R5.2).
- 14.5 A word in running text is exempt from the 44 px rule of shell-and-offline R5.2. Its target is at least the height of the text line. The exemption is written in OPEN-QUESTIONS and the interface test skips ordinary words by name.

### R15. Without a device model, point at likely names (U6, S6, V5)
- 15.1 `likelyNames(text, knownSpans)` in `src/masking/likelyNames.ts` returns the capitalised words that are not on her list. A word counts when it starts with a capital letter, is not the first word of a sentence or line (the text before it, trimmed, is not empty and does not end in `.`, `!`, `?` or `:`), is not already masked, is not matched by the exact or near pass or by a name part, is not written wholly in capitals, and is not a weekday or month name or short form. The module imports no inference code (R2.4). Unit tests on the invented note: "Bea" is returned; "Maria", "Tomas", "Brandvald", "Mon", "Fri", "DOB" and the words that start sentences are not. "Alder" and "Court" are returned.
- 15.2 When the device model is not `available`, each likely name gets a dotted underline in the ink colour in the record text, and one line in the masks view says: "3 words look like names and are not on your list: Alder, Court, Bea. This is a guess by capital letters." The count and the words are computed; with one word it reads "1 word looks like a name and is not on your list: Bea." With none, the line is not shown. Once the device pass has run, the line and underlines are replaced by its proposals.
- 15.3 One press on a word in the line masks it as a manual mask with all its occurrences (R5.3), removes it from the line, and is announced in the live region. Each word in the line is a control of at least 44 px.
- 15.4 After "Bea" is masked in the invented visit, the outgoing text holds no "Bea", compared with case folding. A unit test with the exact and near passes and the press.
- 15.5 BUNDLED check (V5): with no device model and the invented visit, the line lists "Bea", one press masks her, and the outgoing text has no "Bea".

### R16. Fewer needless suggestions (U9, S9)
- 16.1 The propose-masks prompt says: do not suggest a weekday, a time or a relative day on its own. A unit test asserts the instruction text.
- 16.2 The app does not trust the prompt. Before the merge of R4.2, a candidate whose whole text is a weekday name or short form, a clock time, or a relative-day word (today, tomorrow, yesterday, tonight) is dropped, compared with case folding. A date such as "3/3/87" is kept. Unit tests: "Mon", "Fri", "14:00" and "tomorrow" are dropped; "3/3/87", "Bea" and "her twin brother" are kept. This backstop goes beyond U9's wording and is noted in OPEN-QUESTIONS.
- 16.3 The effect on the false masks is measured in measurement R12, on the same 200 notes, with both runs kept.

## Second review: acceptance map

| Item | Covered by |
|---|---|
| U4, S4 | R13 |
| V4 | R13.6 (BUNDLED) |
| U5, S5 | R14 |
| U6, S6 | R15.1 to R15.4 |
| V5 | R15.5 (BUNDLED) |
| U9, S9 | R16, with measurement R12 |

## Third review (2026-11-13): requirement R17

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md` (direction X5, seen problem W5, acceptance Y4). The third review is the latest owner document and wins over this spec where they differ.

### R17. Kinds (X5, W5, Y4)
Adds to: R16. R16.2 dropped a weekday, a time or a relative day only in the merge on the record; the screening of a returned draft let them through.
- 17.1 A weekday, a time or a relative day is not suggested. The prompt says so (R16.1). If the model suggests one anyway, the app drops it at every place a suggestion enters: the merge on the record and the screening of a returned draft.
- 17.2 A suggestion with no kind from the model (missing or empty) is kept as a describing phrase and tagged [Detail n], never [Place n]. The reply is not refused for it. A kind that is present and is not one of the four is still refused.
- 17.3 Unit tests (Y4): a suggested "Mon" is dropped in the merge and in the screening of a draft; "Fri", "14:00" and "tomorrow" likewise; a suggestion without a kind becomes [Detail 1]; "Bea" as a name and "14 Alder Court" as a place keep their kinds.

## Third review: acceptance map

| Item | Covered by |
|---|---|
| X5, W5 | R17.1, R17.2 |
| Y4 | R17.3 (unit) |

## Fourth review (2026-11-13): requirement R18

Source: `docs/decisions/2026-11-13-fourth-review-what-two-readers-marked-down.md` (J3, K4, L6). The fourth review wins over this spec where they differ.

### R18. Fewer needless suggestions, in code (K4, J3, L6)
Extends: R16.2, which already drops a weekday, a clock time and a relative day. Nothing in R16 is retired.
- 18.1 A suggestion from the device pass is dropped before it is shown when it is one lower-case word from a short list of role and relation words (neighbour, landlord, sister, brother, son, daughter, mother, father, partner, friend, doctor, nurse, teacher and the like), or a weekday, a month, a time of day or a relative day. The comparison uses case folding.
- 18.2 A role word followed by a capitalised word ("neighbour Bea") is kept as a suggestion for the capitalised word only. A role word with a capital letter that starts a name ("Doctor Aldous") is not a lower-case word and is kept.
- 18.2 (amended 2026-11-19, R22): a role word that is the whole candidate is dropped in any case; "Landlord" alone is dropped, "Doctor Aldous" stays.
- 18.3 The lists live in one file, `src/masking/notNeeded.ts`, which the README names. The filter runs in the merge and in the screening of a returned draft, as R16.2 does.
- 18.4 Unit tests (L6): each kind of dropped word (role, relation, weekday, month, time of day, relative day); the role word followed by a name; a capitalised role word kept; a date such as "3/3/87" kept.
- 18.4 (amended 2026-11-19, R22): a lone capitalised role word is dropped, so the case that kept "Doctor", "Nurse" and "Landlord" now expects them dropped; the kept forms are the phrase forms.
- 18.5 The third measurement is in measurement R13.

## Fourth review: acceptance map

| Item | Covered by |
|---|---|
| K4, J3 | R18 and measurement R13 |
| L6 | R18.4 (unit) and measurement R13 (DEVICE MODEL) |

## Sixth review (2026-11-13): requirement R19

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md` (direction R6, seen problem Q6). Not built in the session that wrote it; the tasks wait. The sixth review wins over this spec where they differ.

### R19. Date words (R6, Q6)
- 19.1 A date suggestion from the device pass is dropped when it has no year and no word of birth (born, birth, DOB, date of birth, age, aged) within three words of it. The rule sits in `src/masking/notNeeded.ts` beside the others.
- 19.2 Unit tests for both sides: a bare day and month with no birth word is dropped; the same with a birth word within three words is kept; a date with a year is kept; a birth word four words away does not keep it.
- 19.3 The fourth measurement is in measurement R15. If the found count for dates of birth drops below the third run's, the rule is taken out again.

## Sixth review: acceptance map

| Item | Covered by |
|---|---|
| R6, Q6 | R19.1, R19.2 and measurement R15 |
| S6 | measurement R15 (DEVICE MODEL) |

## Session H12 (2026-11-14): requirement R20

Source: the product owner's instruction for chain H12, item 7. Screen 10 showed "Mon." and "Fri." as chips.

### R20. Trailing punctuation does not hide a not-needed word
- 20.1 Before the lookup in `isNotNeeded`, one or more trailing ".", "," or ";" are removed from the candidate, so "Mon.", "Fri." and "Thurs." are weekdays as "Mon", "Fri" and "Thurs" are. A date such as "3/3/87" and a clock time are not changed by this.
- 20.2 A unit test counts how many strings in the device false masks of `results/misses.json` the rule now drops. The number is reported. No results file is rewritten.

## Session H17 (2026-11-14): requirement R21

Source: the product owner's instruction for chain H17, item 3. In the failing hybrid run the text that left held "Present: [Person 1], Bea": the device model did not propose "Bea" in that run (it does in others: `results/token-source-2026-11-14-h17.json`), so a name in the note that is not on her list left the device.

### R21. A person present who is not on her list is proposed on the device
- 21.1 The device pass, besides what the model proposes, proposes each name on a "Present:" line of the record text that is not on her list, not already masked, begins with a capital letter and is not "I" or the word "worker". The kind is name. This does not depend on the model, so the proposal is there in every run.
- 21.2 The proposal is a suggestion like any other: she can accept it, and accepting it masks every place the name stands in the outgoing text. It is not accepted for her.
- 21.3 The rule is in the browser entry point of the device pass (`runDevicePass`), switched on by the page. The measurement path and its figures are unchanged.
- 21.4 Unit tests: the invented record block with a model that proposes nothing proposes "Bea"; a listed name on the line is not proposed twice; a lower-case item, "I" and "worker" are not proposed; after acceptance the outgoing text of the invented visit holds no "Bea". In the hybrid run the proposal is accepted and "What leaves" is read for "Bea".

## Chain R17, session A (2026-11-19): requirement R22 and the amended 18.2 and 18.4

### R22. A lone capitalised role word is dropped (H51f)
- 22.1 `isNotNeeded` also drops a candidate that is one role or relation word in any case, with or without trailing ".", "," or ";" ("Landlord", "Landlord,", "Landlord.", "Neighbour", "Landlady"). Reason: `fold` folds both sides, so a kept "Landlord" masks every lower-case "landlord" in the note. The test is on the folded text and requires no whitespace in the candidate, so a describing phrase or a name with a title ("Doctor Aldous", "Landlord called", "her twin brother") stays maskable.
- 22.2 18.2 is amended: a role word with a capital letter that is the whole candidate is dropped. A capitalised role word that starts a name ("Doctor Aldous") is kept, because the candidate holds more than the one word.
- 22.3 18.4 is amended: the unit test that kept a lone "Doctor", "Nurse" or "Landlord" now expects them dropped (`tests/unit/notNeeded.test.ts`); the kept forms are the phrase forms.
- 22.4 Merge test: `mergeProposals` over "Landlord came by. The landlord says the boiler is fixed." with one candidate `{text: "Landlord", kind: "phrase"}` returns `added` as an empty list.
