# Second review, after the first build (2026-11-13)

The product owner's review of the build as chain 2 left it (commit 2d6d0ab, 1,015 tests). Looked at: `docs/screens/03-outgoing-egress-pass.png`, `04-egress-fail-seeded.png` and `09-device-masks.png` at 1440 x 900; `results/catch-rate.json`, `h1.json`, `cold-start.json`, `device-token-limit.json`, `device-jobs-no-request.json`, `real-browser-2026-11-13.md`; the top of the README; a mechanism inventory made for the licence check.

## What is right

It reads as a product. The journey runs left to right and the line between this device and the cloud is on the screen. The failing egress line says what was found and what to do, in words, colour and an icon. In Google Chrome the device model makes the record with the network off in 10.4 s, proposes "Bea" and the date of birth, and no request leaves. The measured figures are strong and honest: matching the list alone finds 509 of 1,141 identifying details on 200 invented notes; with the device model, 1,033.

## What is wrong

| # | Seen | Problem |
|---|---|---|
| S1 | The device wrote the visit date as 2023-12-11. The note says "12/11" and names no year; the model chose one, and read day and month the other way round from the note's own "26/11" | A wrong date in a case note is worse than none. The model must never write a date |
| S2 | The measured figures are in a results file and nowhere on the screen | The strongest fact the product has is invisible |
| S3 | After the record is made, the record and its chips are below the fold; the note editor and the client list still fill the first screen | The step she is on is not the step she sees |
| S4 | "Send this name on purpose" is printed after every listed chip, three times in one screenshot | Noise, and it puts the dangerous action beside every name |
| S5 | Every ordinary word of the record is drawn as a separate underlined button | The record does not read as text |
| S6 | With no device model, "Bea" goes out unmasked and nothing points at her | The path most judges will be on looks careless |
| S7 | The real-browser check recorded a miss: no control calls the small rewrite, and "Save ledger" is not on the screen | The rewrite is the job that uses `PREFER_ON_DEVICE`; without it one of the four modes cannot be reached from the screen |
| S8 | "Make the record" looks switched off when a note is waiting | The first control must look like the first control |
| S9 | The device pass suggests weekdays ("Mon", "Fri"); 97 of its suggestions on 200 notes were not needed | Suggestions she has to wave away cost her time |
| S10 | The README says the check scans the request body; the code also scans the request's address, and matches a listed value of five letters or more inside another word | Words behind the code |

## Direction

| # | Item |
|---|---|
| U1 | **The model never writes a date.** The record keeps the note's own words for the date ("12/11"). The app, not the model, proposes a reading: day and month in the order of the browser's locale, the current year, shown as "read as 12 November 2026, assumed" with one press to correct or confirm. The structuring prompt forbids changing or completing dates, and the schema's date field is the words as written. The same for "26/11", "Mon", "Fri" in next steps: kept as written. |
| U2 | **The figures go on the screen,** read from `results/catch-rate.json`, never typed: under Masking, "On 200 invented notes her list alone found 509 of 1,141 identifying details. With the model on this device: 1,033. Measured on the author's computer, with its date and browser." and a second line with the suggestions that were not needed. Where the file is absent: "not measured". The README's status block states the same lines. |
| U3 | **She sees the step she is on.** A line of five steps at the top of zone 1: Note, Record, Masks, Send, Finished, with the current one marked in words and shape. Once a record exists, the note editor and the client list fold to one line each with an Edit control, and the masking view takes their place, so that at 1440 x 900 the chips, the outgoing text, the egress line and the finished note are all in view without scrolling. |
| U4 | **"Send this name on purpose" lives on the chip.** Pressing a listed chip opens a small panel on it with that one action and what it means. It is not printed beside chips. |
| U5 | **Text reads as text.** Ordinary words have no underline and no box. A word shows that it can be masked when the pointer is on it or it has keyboard focus. Chips keep their outlines and labels. |
| U6 | **Without a device model, point at likely names.** Capitalised words that are not on her list and do not start a sentence get a dotted underline, and one line says: "3 words look like names and are not on your list: ..." with one press to mask each. The line says it is a guess by capital letters. |
| U7 | **The two missing controls.** On a sentence of the outgoing text: "Shorter" and "Plainer", which call the rewrite job (`PREFER_ON_DEVICE`), show the source label, and put the result through the masker before it replaces the sentence. In zone 2 after a send: "Save ledger". |
| U8 | **The first control.** When a note exists and no record does, "Make the record" is the filled, enabled primary control. With no device model it reads "Enter the record by hand" and opens hand entry. |
| U9 | **Fewer needless suggestions.** The propose-masks prompt says: do not suggest a weekday, a time or a relative day on its own. Measure the device pass again on the same 200 notes and report both runs side by side; keep the first run's file. |
| U10 | **Words match the code.** README and the page say what the check scans: the address and the body of each request, each listed name whole, its other names, and its single parts of three letters or more; and that a listed value of five letters or more is also found inside a longer word. |
| U11 | Unchanged: the cloud half stays on the test double and says "not connected" until the product owner says billing exists. Honesty rules unchanged. No target is changed; a miss is recorded as a miss. |

## Acceptance

| # | Check |
|---|---|
| V1 | DEVICE MODEL, the invented visit: the record's date field holds the note's own words; the app's reading names the current year and says "assumed"; no year the note does not contain appears anywhere unless marked assumed. Unit tests for both day-month orders. |
| V2 | The figures on the page and in the README equal the numbers in `results/catch-rate.json` (a test reads both). With the file moved away in a test, the page says "not measured". |
| V3 | BUNDLED at 1440 x 900 after "Make the record" (hand entry path) and send: the five-step line, at least one chip, the outgoing text, the egress line and the first lines of the finished note are inside the viewport together. |
| V4 | BUNDLED: no "Send this name on purpose" text is in the document until a listed chip is pressed; after the press it is; Escape closes the panel. |
| V5 | BUNDLED: with no device model and the invented visit, the line about likely names lists "Bea", and one press masks her; the outgoing text then holds no "Bea". |
| V6 | BUNDLED: "Shorter" on a sentence calls the rewrite job (double), shows a source label and replaces the sentence only after the masker has run; "Save ledger" writes the ledger. DEVICE MODEL: the same press answers with the label "on this device" and no request leaves. |
| V7 | DEVICE MODEL: the second measurement of the device pass on the same 200 notes, time-boxed to 15 minutes; both runs in the results file; the page shows the second. |
| V8 | New screenshots, all nine names as before, plus `10-whole-journey-device.png`: Google Chrome with the device model, 1440 x 900, the invented visit after every step, nothing scrolled. Every earlier test passes. |
