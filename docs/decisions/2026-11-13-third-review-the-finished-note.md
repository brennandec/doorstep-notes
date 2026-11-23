# Third review: the finished note (2026-11-13)

The product owner's review of the build as chain 3 left it (commit df63ba7, 1,359 tests). Looked at: `docs/screens/10-whole-journey-device.png` (Google Chrome with the device model, 1440 x 900) and `results/catch-rate.json` after the second measurement (device pass 927 of 1,141 with 66 needless suggestions; all together 1,019 with 82).

## What is right

The steps line says where she is. The date is the note's own words with the app's reading marked assumed. The cold-start figure names its date, browser and computer. The egress line says what it scanned.

## What is wrong

| # | Seen in the whole-journey picture | Problem |
|---|---|---|
| W1 | The finished note reads "Present: Maria Okonkwo-Reyes, [Person 4]", "DOB on form [Date 1]", "I ring landlord [Place 1]", "revisit [Place 3]", and a list says each was "added by the model" and "not put back" | These values were in her own note. The device knows them. A finished note full of tags is not a finished note. "Added by the model" was meant for names a model invents, not for her own words that a suggestion masked |
| W2 | The egress line counts "0 of 3 masked values" while the text carries at least eight tags | The count and the text disagree |
| W3 | The outgoing box shows "Present: [Person 1], Bea" while the draft was made with Bea as [Person 4] | The box is not showing the text that leaves |
| W4 | "12/11" is read as 11 December; the same note says "26/11" | The note itself shows its dates are day first |
| W5 | "Mon" and "Fri" are tagged as places | A suggestion's kind is wrong, and weekdays were to be left alone |
| W6 | The chips begin at the bottom edge of the first screen | The masks are the step most worth seeing |

## Direction

| # | Item |
|---|---|
| X1 | **What the device knows, it puts back.** In the finished note every tag whose original is in the mask map is restored: listed names, near matches, words she pressed, and suggestions she accepted. "Added by the model" is kept only for a name that appears in a model's output and is in neither the note, the client list nor the mask map; only those stay as they are with the press to put back. |
| X2 | **One count.** The "masked values" number in the egress line is the number of mask-map entries applied to the outgoing text. |
| X3 | **One text.** The outgoing box renders the very string that the send uses, built after every accepted suggestion and every press. A test compares the two byte for byte. |
| X4 | **Day and month.** If any date in the note has a first number above 12, every date in that note is read day first; otherwise the browser's locale decides. The reading still says "assumed" until she confirms. |
| X5 | **Kinds.** A weekday, a time or a relative day is not suggested (the prompt already says so) and, if the model suggests one anyway, the app drops it. A suggestion with no kind from the model is tagged [Detail n], never [Place n]. |
| X6 | **Masks in view.** With a record present, each record field folds to one line with Edit, as the note and the client list do, so the masking view starts above the fold at 1440 x 900. |
| X7 | Honesty rules unchanged. The cloud half stays on the test double. |

## Acceptance

| # | Check |
|---|---|
| Y1 | Unit and DEVICE MODEL: the invented visit with every suggestion accepted: the finished note holds no square-bracket tag except for names a model added, and reads "Present: Maria Okonkwo-Reyes, Bea." |
| Y2 | Unit: the masked-values count equals the applied mask-map entries; the outgoing box equals the sent string byte for byte. |
| Y3 | Unit: "12/11" with "26/11" in the same note reads as 12 November; alone, it follows the locale. |
| Y4 | Unit: a suggested "Mon" is dropped; a suggestion without a kind is [Detail n]. |
| Y5 | BUNDLED at 1440 x 900 with a record present: the first chip is inside the viewport. |
| Y6 | Screenshots: `10-whole-journey-device.png` again, and `11-whole-journey-all-accepted.png` (Google Chrome with the device model, every suggestion accepted, the finished note in view with names restored). Every earlier test passes. |
