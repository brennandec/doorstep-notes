# Drafting: requirements

Source: BRIEF.md steps 4 and 5, table rows 3 and 4, Rule 10, acceptance H2, H4, H6, H9. Owner documents of 2026-11-13: rulings 2, 3, 5, 12, 13, 15, 23, the look and layout (zone 3, source label), the browser on this computer. Facts: sdk-facts 12, 17, 24 to 29 and difference 1.

Examples use the invented visit: Maria Okonkwo-Reyes, Tomas Brandvold, worker Dana Whitfield.

## Requirements

### R1. Draft the formal note
- 1.1 The draft job takes the outgoing text built from the masked record only (R2.1). It never receives the raw note, the photo, the client list, the mask map or the surface forms. A unit test asserts the job's input type and that the builder takes only a masked record.
- 1.2 Online, the draft job is called with `PREFER_IN_CLOUD`. The cloud model name is set explicitly from Remote Config with a default in code (sdk-facts difference 1). A unit test asserts the mode and that the model name is never empty.
- 1.3 Offline is decided by the app, not left to a fallback (ruling 12). If the browser reports offline, or the probe of shell-and-offline R11.1 fails, the draft job is called with `ONLY_ON_DEVICE` and the result is labelled as a device draft. A unit test with a fake probe asserts the mode chosen in each case.
- 1.4 Each draft shows the source label from `inferenceSource`. A device draft also shows "Shorter draft made on this device." (H4) A unit test for both labels.
- 1.5 While the cloud service is not enabled, the cloud draft comes from the double and shows "not connected". The offline device draft calls the SDK whenever the model is `available` (ruling 23).
- 1.6 A real-browser task records what the SDK itself does when the network drops in the middle of a `PREFER_IN_CLOUD` call, and writes it to `results/draft-network-drop.json` (ruling 12). The app does not depend on that behaviour.

### R2. The outgoing text (rulings 3, 5)
- 2.1 `buildOutgoing(maskedRecord)` returns one string: the masked record in fixed labelled lines, then the fixed instructions for the job. Zone 2 shows that whole string in the monospace block before any cloud call, and waits for Send.
- 2.2 The string shown is the string given to the job. A unit test compares the displayed text with the job's `text` argument, character for character.
- 2.3 The preview check of egress-check R2.2 runs on that string. A listed name not sent on purpose blocks Send (ruling 5).
- 2.4 Next to the text is the no-cost tier notice (R3).

### R3. No-cost tier notice (Rule 10, ruling 15)
- 3.1 Wherever something is about to be sent to the cloud model, the page says in plain words: on the no-cost tier, what is sent may be used by the provider to improve its products and may be read by reviewers, and the provider says not to send sensitive or personal information on that tier.
- 3.2 The notice says this demo uses invented people only. Until the cloud service is enabled, the notice says "not connected" and nothing is sent. When it is enabled, the notice states the tier from `CLOUD_TIER`.
- 3.3 The notice text is in one file, `src/app/sendNotice.ts`, and marked for the product owner to check against the provider terms (OPEN-QUESTIONS 1).
- 3.4 Send cannot be pressed until the notice is on screen. A unit test asserts Send is disabled while the notice is absent.

### R4. Offline path
- 4.1 Offline with the device model `available`: pressing "Draft" makes the device draft at once, with no wait for a network timeout beyond the probe limit. A unit test with a fake clock.
- 4.2 Offline with no device model: "No draft can be made right now. Your masked record is kept." She can copy the masked record. A unit test.
- 4.3 Offline with the model downloading: the same line as 4.2 with the progress.

### R5. Device model states
- 5.1 Absent: online cloud drafting still works (H6).
- 5.2 Downloading, online: `PREFER_IN_CLOUD` does not wait and uses the cloud (sdk-facts 12).

### R6. Restore names on this device (ruling 13)
- 6.1 After a draft returns, tags are replaced from the mask map on this device. A unit test.
- 6.2 Pronouns are restored only in the tokens the draft was asked to use (`{he:Person 1}` and its forms), from the client list entry. Free text is not re-parsed. A unit test.
- 6.3 If the draft contains no pronoun tokens, a line says "The draft used no pronoun tokens, so no pronouns were changed." and nothing is rewritten. A unit test.
- 6.4 A client with no pronouns on the list gets they/them in the tokens and a visible note.
- 6.5 A tag in the draft with no map entry is left visible and flagged: "Tag not matched: [Person 3]". A tag that was sent and is missing or changed in the draft is reported the same way. A unit test.
- 6.6 Restoring never makes a network request. A unit test with a fetch that throws.
- 6.7 Zone 3 shows the restored note as a document sheet in the serif face with the source label and Copy (look and layout).

### R7. Rewrite one sentence
- 7.1 She can select one masked sentence and ask for "shorter" or "plainer". The mode is `PREFER_ON_DEVICE`.
- 7.2 The input is that one masked sentence only, plus fixed instructions.
- 7.3 Every rewrite goes through `send.ts`. Whenever the cloud service is enabled, the cloud may answer, so zone 2 first shows the exact sentence and instructions with the notice and waits for Send, and the preview check applies. A unit test with the cloud switch on asserts Send waits; with it off asserts no wait and "not connected" if the double answers.
- 7.4 The result carries its source label.
- 7.5 Tags in the sentence must survive the rewrite; otherwise the rewrite is refused with "The rewrite changed a tag, so it was not used." A unit test.

### R8. One path out
- 8.1 Each cloud send passes through the egress module, so the body sent is captured, hashed and checked (egress-check R3).
- 8.2 Cloud jobs take an `EgressTicket` argument that only `send.ts` can create, so a call from elsewhere fails the type check. A unit test with `// @ts-expect-error` asserts it.

### R9. Network proof
- 9.1 The H2 runs of egress-check R8 include one draft and one rewrite. No request carries a listed name, the original of a masked value or the raw note (ruling 1). Part A and part B are both required (ruling 2).

## Acceptance map

| Brief or owner item | Covered by |
|---|---|
| H2 | R1.1, R8, R9 |
| H4 | R1.3, R1.4, R4.1 |
| H6 | R5.1 |
| H9 | unit tests for R1 to R8 |
| Ruling 3 | R2 |
| Ruling 5 | R2.3 |
| Ruling 12 | R1.3, R1.6 |
| Ruling 13 | R6.2, R6.3 |
| Ruling 15 | R3.2 |
| Ruling 23 | R1.5 |

## Second review (2026-11-13): requirement R10

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md` (direction U7, seen problem S7, acceptance V6). The second review wins over this spec where they differ.

### R10. "Shorter" and "Plainer" on the screen (U7, S7, V6)
Makes R7.1 concrete. Without these controls the `PREFER_ON_DEVICE` mode could not be reached from the screen.
- 10.1 Each sentence of the masked record part of the outgoing text can be selected with the pointer or the keyboard. The selected sentence shows two controls, "Shorter" and "Plainer", each at least 44 px high. Only one sentence shows them at a time. The fixed labels and the fixed instructions of the outgoing text have no such controls. The wrapping around sentences does not change the text: a unit test asserts the text of the outgoing block, without the controls, equals the string given to the job, character for character (R2.2).
- 10.2 A press calls the rewrite job with that one masked sentence and the fixed instructions only (R7.2), mode `PREFER_ON_DEVICE`, through `send.ts` (R7.3). The result shows its source label from `inferenceSource` ("on this device" or "in the cloud"), and "not connected" while a double answers.
- 10.3 The result goes through the masker (ruling 24, task 17) before it replaces the sentence. The sentence is replaced only after the masker has run. A listed name in the result becomes its tag; a name the model added is marked "added by the model". A result that changes a tag is refused with the line of R7.5, and the sentence stays. A result that is a list of options is refused (task 18).
- 10.4 After the replacement the outgoing text is the new string; the preview check, the string shown and the string given to the next send agree (R2.2, R2.3).
- 10.5 When the cloud service is enabled and may answer, R7.3 still applies: the exact sentence and the notice are shown and the press waits for Send.
- 10.5a (H16) "May answer" means the cloud switch is on and the app finds the network on. With the network off, "Shorter" and "Plainer" take the on-device path and do not wait for Send, whatever the cloud switch says; the ledger mode is `ONLY_ON_DEVICE`. With the cloud switch on and the network on, they keep the Send step.
- 10.6 On the device path no request leaves the browser. A unit test with a fetch that throws, and the DEVICE MODEL check below with the request recorder on the host of browser fact 3.
- 10.7 BUNDLED check (V6): "Shorter" on a sentence calls the rewrite job (double), shows a source label and "not connected", and the sentence is replaced only after the masker ran; a double that returns a listed invented name is masked before it shows. DEVICE MODEL check (V6): the same press answers with the label "on this device" and no request leaves.

## Second review: acceptance map

| Item | Covered by |
|---|---|
| U7 (Shorter, Plainer), S7 | R10.1 to R10.6 |
| V6 (rewrite part) | R10.7 (BUNDLED and DEVICE MODEL) |

## Third review (2026-11-13): requirements R11 and R12

Source: `docs/decisions/2026-11-13-third-review-the-finished-note.md` (direction X1 and X3, seen problems W1 and W3, acceptance Y1 and Y2). The third review is the latest owner document and wins over this spec where they differ.

### R11. What the device knows, it puts back (X1, W1, Y1)
Wins over: ruling 24 and task 17 as built, where every value the screening of a returned draft found that was not in the sent mask map became a tag "added by the model" and stayed as a tag. Retired: that part of task 17. Task 17 otherwise stands.
- 11.1 In the finished note every tag whose original is in the mask map is restored on this device: listed names, near matches, words she pressed, and suggestions she accepted.
- 11.2 A value that the screening of a returned draft finds, and that is not in the mask map, is known when each of its words and numbers stands in the rough note or on the client list. A known value is restored to its original in the finished note. It is not marked "added by the model" and is not listed as "not put back".
- 11.3 "Added by the model" is kept only for a name that appears in a model's output (the record, the draft or a rewrite) and is in none of: the rough note, the client list, the mask map. Only those stay as tags, with the press to put one back.
- 11.4 A rewrite that brings a new tag of any kind is still refused (R10.3); a known value is not made a new tag inside the outgoing text.
- 11.5 Unit tests (Y1): the invented visit with every suggestion accepted gives a finished note with no square-bracket tag except for names a model added, and its present line reads "Present: Maria Okonkwo-Reyes, Bea."; the same note with no suggestion accepted, and the device look at the draft finding "Bea", "3/3/87" and "14 Alder Court", gives the same restored text; a surname that is in neither the note nor the list stays a tag and is marked.
- 11.6 DEVICE MODEL check (Y1): the same in Google Chrome with the built-in model. The result is written to `results/`.

### R12. One text (X3, W3, Y2)
- 12.1 The outgoing box renders the very string that Send gives the job. One value holds it; the box and Send both read that value.
- 12.2 The string is built again after every accepted suggestion and every press (mask, unmask, send on purpose, a replaced sentence), also after Draft has been pressed and before Send.
- 12.3 If at the moment of Send the string held for sending differs from the box, nothing is sent and the box is drawn again.
- 12.4 Unit test (Y2): the text in the box, the string given to the job and the text in the body the send path built are equal, character for character, after an accepted suggestion that comes after Draft.

## Third review: acceptance map

| Item | Covered by |
|---|---|
| X1, W1 | R11.1 to R11.4 |
| Y1 | R11.5 (unit), R11.6 (DEVICE MODEL) |
| X3, W3 | R12.1 to R12.3 |
| Y2 (box equals sent string) | R12.4 |

## Sixth review (2026-11-13): requirement R13

Source: `docs/decisions/2026-11-13-sixth-review-the-block-is-the-product.md` (direction R5, seen problem Q5, acceptance S5). The sixth review is the latest owner document and wins over this spec where they differ.

### R13. One mark (R5, Q5, S5)
Wins over: the source label with a second "not connected" mark beside it on a finished note, in the look and layout document and in R1.
- 13.1 While the cloud is not connected the finished note carries exactly one mark: "test double: cloud not connected". There is no "in the cloud" pill beside it.
- 13.2 Once connected the note carries the source mark as now: "on this device" or "in the cloud" from `inferenceSource`. A draft from the device keeps the one mark "on this device", whether or not the cloud is connected, because the cloud did not answer it.
- 13.3 The other results that carry a source label (record, rewrite, second reader) are not changed by this requirement.
- 13.4 Unit tests: one mark with the words on a double draft; no `data-source` pill on that note; the connected case unchanged; a device draft unchanged; the word is in the string table and passes the audits. BUNDLED (S5): not connected, the finished note holds exactly one mark with the words.

## Sixth review: acceptance map

| Item | Covered by |
|---|---|
| R5, Q5 | R13.1 to R13.3 |
| S5 | R13.4 (BUNDLED) |

## Session H11 (2026-11-14): requirement R14

Source: the product owner's instruction for chain H11, item 1. The finished note of the first real cloud draft showed "[him:Person 1]". It wins over this spec where they differ.

### R14. No redaction token in a finished note
- 14.1 The forms the redaction step can emit, and the forms a model can write back, are listed in one place (`src/masking/tokenForms.ts`): the tag `[Person 1]` and its kinds Person, Place, Date and Detail; the pronoun token with a role prefix `{him:Person 1}`; and the same prefix inside square or round brackets or with the tag in its own brackets, for example `[him:Person 1]`, `{him:[Person 1]}`, `[him:[Person 1]]`, `(him:Person 1)`. The role prefixes are he, she, they, him, her, them, his, hers, their, in any letter case, with or without a space after the colon.
- 14.2 The restore step turns each form back into the original name, or into the pronoun from the client list entry for a role prefix. The text kept for the finished note holds none of these forms when its tag is in the mask map.
- 14.3 A tag that is not in the mask map, and a name the model added, stay visible and flagged as before (drafting R6, R11). This requirement does not change them.
- 14.4 Tests: one fixture per form (`tests/unit/tokenForms.test.ts`) fails when any text of the shape "[" ... "Person" N "]" in any form is left in a finished note whose tags are mapped, and a property test over generated invented names, tag numbers, kinds and forms holds. The failing test is written before the code and shown failing on the old code once, in the session log.

## Session H11: acceptance map

| Item | Covered by |
|---|---|
| H11 item 1 | R14.1 to R14.4 |

## Session H12 (2026-11-14): requirement R15

Source: the product owner's instruction for chain H12. The first real cloud draft showed "**Date of Visit:**", "assist [him:Person 1]" and "window.; Letter" on the page (`results/cloud-draft-2026-11-14.json`, kept as it was). It wins over this spec where they differ.

### R15. The finished note is plain text she can paste
- 15.1 One contract. The text on the sheet and the text Copy puts on the clipboard are the same string, made once when the finished note is made. Nothing between the sheet and the clipboard changes it.
- 15.2 The visible instructions in the outgoing text ask for plain sentences, no Markdown (no asterisks, no # headings, no lists), tags kept as written, and a pronoun for a tagged person written as a token in curly braces. The instructions are part of the text zone 2 shows and are the bytes sent. No system instruction is added for the cloud.
- 15.3 Token forms. Before restore, a pronoun token in any bracket, any letter case and any spacing is read as `{role:Kind N}`, for the kinds Person, Place, Date and Detail. The role word is kept as written. A bare tag in odd case or spacing is read as `[Kind N]`. The pronoun word comes from the client list entry, as before (R14).
- 15.4 Leftovers. After restore, any bracket or brace form that still names a tag is flagged with the existing line "Tag not matched: {tag}", in the failure colour with the crossed octagon and words, and Copy is disabled with a reason from the string table. A tag standing for a name the model added (ruling 24) keeps its put-back button and does not hold Copy.
- 15.5 Markdown marks. A pair of double asterisks is removed, keeping the words between them, and a line-start run of one to six # followed by a space is removed. This is done once, when the finished note is made, so the sheet and Copy read one string.
- 15.6 No doubled punctuation in what leaves. Where items of a record field are joined, one trailing full stop of an item is dropped when another item follows, so the outgoing text holds no ".;". The record editor's own join is unchanged.
- 15.7 Tests. Unit tests are written before the code and shown failing on the starting commit once: the recorded draft text of `results/cloud-draft-2026-11-14.json` with the invented list gives a finished note with "assist her with the completion", no "**", no line starting with "#", and no tag or token in any form; the Copy text equals the sheet text; the held Copy and its flag; the instructions; the join. One real cloud draft (REAL BROWSER, BUNDLED) writes a new dated file and its finished note passes the same checks.

## Session H12: acceptance map

| Item | Covered by |
|---|---|
| H12 items 1, 5 | R15.1, R15.5 |
| H12 item 2 | R15.2 |
| H12 items 3, 4 | R15.3, R15.4 |
| H12 item 6 | R15.6 |
| H12 items 9, 10 | R15.7 |

## Session H17 (2026-11-14): requirement R16

Source: the product owner's instruction for chain H17, after `results/hybrid-run-2026-11-14-2.json` and `results/draft-network-drop-2026-11-14-2.json` (both fail, both kept as they were) and a retaken screen 05. It wins over R15.4 where they differ: R15.4 let a name the model added stay in the note as a tag and left Copy enabled.

### R16. No token reaches her eyes or her clipboard
- 16.1 No token syntax in any text she sees or copies. This covers the finished note, every draft, every button, flag and line about a draft. Token syntax is any bracket or brace form of a tag or a pronoun token: `[Person 1]`, `{him:Person 1}`, `(Place 2)`, `[him:Person 1]` and the other forms of R14.1 and R15.3. The words "Person 1" without a bracket may name what a flag is about.
- 16.2 A token the restore cannot map is shown in the note as a plain phrase and in the list "About this draft" as a plain-language flag that names what it stands for when that is known. A pronoun token reads "a pronoun for Person 1". A tag reads "a name (Person 4)", "a place (Place 2)", "a date (Date 1)" or "a detail (Detail 1)". The phrase in the note is in round brackets with words only: "(name not put back)", "(place not put back)", "(date not put back)", "(detail not put back)", "(pronoun not put back)". This holds when the model renames a token, for example a pronoun token written back as `[Detail 1]`.
- 16.3 Something the model added (R11.3: a name, place or date that is in neither the rough note nor the client list) is shown in the note as a phrase in round brackets, flagged in plain words ("Added by the model: a name, place or date that is not in your note or your list."), and has a button "Put back what the model added: {value}". The button text holds the value, never a tag. Pressing it puts the value into the note.
- 16.4 Copy is held while any flag is open: disabled, with one line of reason from the string table, the same string as the visible reason. Copy is enabled when no flag is open. This replaces the last sentence of R15.4: a name the model added is an open flag and holds Copy until she presses to put it back.
- 16.5 Screening a draft (ruling 24) never turns token syntax into a name or a detail. A suggestion from the device model that holds a bracket or brace, or the words of a tag such as "Person 1", is dropped before it is masked. The pronoun token the cloud writes for a person is restored to the pronoun of the list entry.
- 16.6 The hidden text that restore works on keeps the tags, so a later press can put a name back. The text she sees and the text Copy puts on the clipboard are the same string (R15.1) and hold no token syntax.
- 16.7 Offline "Shorter" and "Plainer" run on this device. The call mode the job uses is read from the same facts as the ledger: with the network off and the device model available, the SDK is asked with ONLY_ON_DEVICE, whatever the cloud switch says, so no config load and no App Check start is tried. The result is labelled "on this device".
- 16.8 A sentence of the outgoing text can be selected only before a finished note exists. A check that presses "Shorter" a second time online does it between Draft and Send, when the outgoing text is on the page and no finished note stands. (This is the cause of the failed "Save ledger" step of H16: the next step looked for a sentence on a page that held a finished note.)
- 16.9 Tests are written before the code and shown failing on the starting commit once. Fixtures: the cloud writes `{him:Person 1}` and the device model proposes it as a name; a model renames a token to `[Detail 1]`; a pronoun token for an unmapped person; an unmapped tag of each kind; every form of R14.1 for an unmapped tag; a name the model added; Copy held and enabled; the offline rewrite job mode and label.
- 16.10 (H34b, after `results/cloud-draft-forms-2026-11-15.json`) A token or tag wrapped twice, or in mixed brackets, is read as the token: `{{she:Person 1}}`, `[[her:Person 1]]`, `{[she:Person 1]}`, `{{Person 1}}`. `tokenForms()` lists them, so the form tests of R14.1 cover them.
- 16.11 A mark the app cannot read never shows, after the steps of R16.2. A mark is a `{...}` or `[...]` group on one line with at most 60 characters between its brackets that names no tag, or a lone `{`, `}`, `[` or `]`. A group whose inner text is one of he, she, they, him, her, them, his, hers, their shows "(pronoun not put back)". Any other group shows its inner words without the brackets. An empty group shows nothing. A lone bracket character is dropped. The working text is not changed by this step, so R16.6 holds. A group of the form `{word:words}` that names no tag is read by its first word: it, its or itself shows that word alone, capitalised by the rule of R18.1, and adds no line, because the app read it (`{it:Mould} was seen` shows "It was seen"; `saw {it:Mould}` shows "saw it"); one of the nine role words shows "(pronoun not put back)" and adds the line of R16.12; any other first word shows the inner words and adds the line.
- 16.12 When R16.11 changed anything other than a thing word, one plain line stands under the note: "The model left a mark the app could not read. Read the note before you copy." It is a line, not a flag: it has no button, it does not start with "Not put back", and Copy is not held by it (R16.4 is unchanged).
- 16.13 Copy's title, the put-back buttons and the held notes show none of `[ ] { }` for any reply (R16.1). The test is a seeded property test over 500 generated replies (`tests/property/draftForms.property.test.ts`, run from `tests/unit/restoreDraftForms.test.ts` because the unit suite includes `tests/unit` only), and one bundled browser case in `tests/e2e/bundled/flow.spec.ts` with a double reply holding `{she}`, `{{they:Person 1}}` and `{it:Mould}`.
- 16.14 Struck by `H34b-AMEND-1`: a line that names a gendered word "the model wrote", and one more instruction sentence in the draft instruction. The BEFORE record found 0 gendered words outside a group in 10 replies, and the line would also have fired on a word the worker's own record holds. The instruction text and what "What leaves" shows do not change.

## Session H17: acceptance map

| Item | Covered by |
|---|---|
| H17 items 1, (a), (b) | R16.1 to R16.3, R16.5, R16.6 |
| H17 item 2 | R16.4 |
| H17 item 4, (d) | R16.7 |
| H17 item 5 | R16.8 |

## Session H18 (2026-11-14): requirement R18

Source: the product owner's instruction for chain H18, after screen 05 read "...by the worker. she agreed that she posts the form on Friday".

### R18. A restored pronoun that starts a sentence starts with a capital
- 18.1 A pronoun put back from a token is capitalised when it stands at the start of the text, at a line start (after a newline and any spaces or tabs), or after ". ", "! " or "? " (the stop may be followed by a closing quote or bracket before the space). In the middle of a sentence, after a comma, colon or semicolon, or after a stop with no space, it keeps the case of the list entry. A token written with a capital keeps its capital.
- 18.2 The rule is in `restoreAll`, so the finished note, a put-back press and the offline draft all get it.
- 18.3 Tests are written before the code and shown failing on the starting commit (9876181) once. Fixtures: after a full stop, after ! and ?, at the start of the text, at a line start, after a closing quote, in the middle of a sentence, after a comma, colon and semicolon, after a stop with no space, and the `restoreDraft` path of the page. Test: `tests/unit/pronounCapital.test.ts`.

## Session H25 (2026-11-14): requirement R19

Source: the product owner's instruction for chain H25, after the finished note in the film's walk (`results/film-run-2026-11-14-h22d.json`, step 5) read "and she or she will post the form on Friday".

### R19. Two tokens that hedge one slot for one person are one pronoun
- 19.1 Two pronoun tokens for the same tag, joined by "or", "/" or "and/or" in any letter case with any spaces or tabs around the joiner, are put back as one pronoun from the client list entry when they are a hedge: two different token words for one slot. Slots: he, she and they are subject; him and them are object; his, hers and their are possessive; her is object or possessive. The pronoun takes the first token's word and capital; when the first token is "her" and the other is possessive, the pronoun is possessive. A run of three or more such tokens becomes one.
- 19.2 A pair of "her" and an object word (him, them) is merged only when the pair ends the text or is followed by a line break, stop, comma, colon, semicolon, quote or bracket, because a word after the pair may make "her" possessive ("him or her son").
- 19.3 Left as written: two identical token words ("{her:Person 1} or {her:Person 1} son"), tokens for different slots ("{she:Person 1} or {her:Person 1} daughter", "{him:Person 1} or {his:Person 1} carer"), tokens for two different tags, tokens joined by any other word or by a comma, and pronouns written in free text. R6.2 holds with one narrow reading added: the restore reads the joiner between two tokens for one tag and the one character after them, and no other free text.
- 19.4 The rule is in `restoreAll`, after the token forms are read (R15.3) and before any token is filled, so the finished note, a put-back press and the offline draft all get it. A pair for a tag with no map entry is held and shown as before (R16.2).
- 19.5 Tests are written before the code and shown failing on the starting commit (94bd7d0) once. Test: `tests/unit/pronounPair.test.ts`.

## Session H35a (2026-11-15): requirements R20 and R21

Source: orders H35-DRAFT.md as amended by H35-ISSUE.md, items D2 and D8 (picture 05 of the cold read).

### R20. What leaves stays empty until Draft is pressed
- 20.1 On every path (hand record, example record, device record, reload, record edit, mask press or mask change before Draft) the outgoing text is empty and What leaves shows "Nothing to send yet." until Draft or Ask a second reader is pressed. A text kept only as a preview is not brought back at load.
- 20.2 Pressing Draft builds the outgoing text and shows it in What leaves, so the line "The finished note appears here. Press Draft to see what leaves, then press Send." is true on every path. Once Draft has prepared text waiting for Send, a mask change or a sentence rewrite rebuilds that text in place (one text, X3).

### R21. A word that looks like an unlisted name does not leave without her press
- 21.1 When Draft is pressed with no masks yet, the exact and near passes make the masks first. On every press, Draft looks at the capitalised words the guess by capital letters finds (`likelyNames` over the record text and its masks), less the words she chose to keep.
- 21.2 While one or more such words remain, Draft stops before building What leaves. The masking view shows the likely-names line ("1 word looks like a name and is not on your list: Bea. This is a guess by capital letters." or the plural), each word as a mask button (`data-likely-word`) with a secondary button keep control "Keep {word}" (`data-keep-likely`, at least 44 px high, label "Keep {word} unmasked"), and the line "Mask or keep each word above, then Draft continues." Focus moves to the first mask button. What leaves stays "Nothing to send yet." and nothing is sent.
- 21.3 When her press masks or keeps the last word, Draft goes on by itself and fills What leaves; a second press on Draft does the same. The kept words belong to the masks: an edit to the record clears them, and Draft asks again.
- 21.4 Tests: `tests/unit/h35aHonestyAndGate.test.ts` (c) and (d), and `tests/e2e/bundled/h35aFlow.spec.ts` (BUNDLED). 0 unlisted name-like words leave without her press.

## Session H36a (2026-11-15): requirement R22

### R22. Object-form pronoun warning line under the finished note (A5 · W)
- 22.1 When the returned draft holds a token whose role is `him` or `them` (any letter case) and whose tag equals the nearest tag before it in the same sentence, with no other tag between, one plain line stands under the note: `Check this sentence: a pronoun may point at the wrong person.` followed by that sentence as it is shown.
- 22.2 It is a plain line, not a flag: Copy is not held, and the note's words are not changed. A subject or possessive token that names the previous tag adds no line.
- 22.3 `tests/e2e/device/cloudDraftForms.spec.ts` counts `draftsWithPronounWrongPersonLine` in its totals. Unit tests stand in `tests/unit/h36aPageHonesty.test.ts`.
