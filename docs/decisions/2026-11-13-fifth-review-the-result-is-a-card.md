# Fifth review: the result is a card, not a paragraph (2026-11-13)

The product owner's review of the build as chain 5 left it (commit 2b2f790, 1,655 tests). Looked at: `docs/screens/11-whole-journey-all-accepted.png` and `12-after-reload-offline.png` at 1440 x 900; `results/real-browser-2026-11-13-e03.md` (8 passed, 1 failed of 9); the three runs in `results/catch-rate*.json`.

## What is right

Her work survives a reload with the network off: the step, the list, the masks and the outgoing text are back. The first line under the title says what is real. H2 part A ran in full and no request left the page. The folds work. The third measurement is honest: 946 found, 61 not needed.

## What is wrong

| # | Seen | Problem |
|---|---|---|
| M1 | The egress result is a bold paragraph five lines tall in a column about 300 px wide, followed by three more paragraphs. Check L8 failed for this reason | The one line that says pass or fail is the product. It reads as a wall of text |
| M2 | Zone 2 is half as wide as zone 1. Every sentence in it wraps to three to five lines | The middle of the journey, what leaves, has the least room |
| M3 | Offline, under Draft and Send, the notice reads "Not available while you are" and stops | A sentence cut in half on the first screen she sees in a car park |
| M4 | The not-needed suggestions went from 97 to 66 to 61. The word filter of the fourth review removed five | Nobody knows what the 61 are, so nobody can say whether they matter |
| M5 | "Everything here stays on this device." and "Kept in this browser only." sit on two lines and say one thing. "invented example" appears three times in zone 1. The step line wraps | Said twice is noise |

## Direction

| # | Item |
|---|---|
| N1 | **The egress result is a card.** One verdict line of at most ten words with its icon: on a pass "No listed name left this device: 0 of 20." and on a fail the count and the names found, in the failure colour, with the crossed octagon, as now. Under it a table of three rows, label left and value right: masked values in the text sent (0 of 4); single name parts of three letters or more (checked, none found); the request (none made, answered by a test double; or the host it went to, once connected). No paragraph inside the card. The sentence about near variants that were not masked moves into the fold "What this check scans". The two sentences that never fold stay as they are. |
| N2 | **Zone 2 gets room.** At 1440 px the three zones share the width 5 : 4 : 4, and zone 2 is never narrower than 400 px while the zones sit side by side. Under 1100 px the zones stack in the order of the journey. The drawn line between this device and the cloud stays where the device ends. |
| N3 | **Nothing is cut.** The offline notice reads in full: "Not available while you are offline." A check walks every text box in the three zones, online and offline, at 1440 x 900 and 1280 x 800, and fails when a box hides part of its own text. |
| N4 | **Say what the 61 are.** A script lists the not-needed suggestions of the third run by kind (a common word, a first name that is nobody in the note, a place word, a number, a date word, other) with counts, into the results. If the stored run does not hold the suggested strings, run the measurement once more with the strings kept, time-boxed to 15 minutes, and keep the earlier files. The README gains one sentence with the three largest kinds and their counts. Add at most one rule to the filter, and only if on the stored run it removes at least ten not-needed suggestions and no true one; then measure once more. Otherwise change nothing. |
| N5 | **Say it once.** One line under the zone title: "Everything here stays in this browser, on this device." The mark "invented example" appears once in zone 1, beside the note. The step line fits on one line at 1440 px. |
| N6 | Unchanged: the cloud half stays on the test double and says "not connected" until the product owner says billing exists. Honesty rules unchanged. No target is changed; a miss is recorded as a miss. |

## Acceptance

| # | Check |
|---|---|
| P1 | BUNDLED at 1440 x 900 after a send: the card's verdict line is one line; the table has three rows; the card holds no paragraph element. The seeded leak: the verdict line names the count in the failure colour with the crossed octagon and in words. L8 passes with the folds closed. |
| P2 | BUNDLED: at 1440 px zone 2 is at least 400 px wide and the widths are within 3 per cent of 5 : 4 : 4; at 1000 px the zones are stacked in order. |
| P3 | BUNDLED: the check of N3 passes online and offline at both sizes; the offline notice holds its last word. |
| P4 | The kinds and counts of N4 are in the results and the README sentence equals them (a test reads both). If a rule was added: the fourth run is in the results beside the three, and the unit tests cover the rule. |
| P5 | BUNDLED: "invented example" occurs once in zone 1; the step line is one line at 1440 px; the single keep-line is there, the two old ones are not. |
| P6 | New pictures: 10, 11 and 12 again, and `13-egress-fail-card.png`, the seeded leak at 1440 x 900. Every earlier test passes. |
