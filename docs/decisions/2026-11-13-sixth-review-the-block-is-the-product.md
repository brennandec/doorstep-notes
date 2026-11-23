# Sixth review: the block is the product; notices; the verdict first (2026-11-13)

The product owner's review of the build as chain 6 left it (commit c86c098, 29 of 29 browser checks passed). Looked at: `docs/screens/11-whole-journey-all-accepted.png` and `13-egress-fail-card.png` at 1440 x 900; the README's lines on the egress check; a count of what the built site ships from other authors.

## What is right

The egress result is a card: one verdict line and three rows. The zones share the width as ordered. Nothing is cut. The 61 not-needed suggestions have names: 34 date words, 16 common words, 10 numbers.

## What is wrong

| # | Seen | Problem |
|---|---|---|
| Q1 | The built site ships 86 packages from other authors, most under the Apache-2.0 licence, and the repository has no notices file | A licence duty unmet in a repository that must be public |
| Q2 | The README says a listed name in the outgoing text blocks sending. No picture shows that, and no step of the journey makes her meet it | The strongest thing the product does is invisible. A reader sees a check that runs after sending and asks why not before |
| Q3 | On a failed check the card says "Mask them, then send again." By then the text has left | The words hide the one fact that matters in that moment |
| Q4 | In zone 2 the verdict card sits under the egress ledger, and the ledger shows a raw log line with pipes | The verdict is the point; the log is for an auditor |
| Q5 | The finished note carries two marks side by side: "in the cloud" and "not connected" | They contradict each other at a glance |
| Q6 | 34 of the 61 not-needed suggestions are date words | One rule may remove half of what she waves away |

## Direction

| # | Item |
|---|---|
| R1 | **Notices.** A script, `npm run notices`, writes `THIRD-PARTY-NOTICES.txt` from the lock file: every production package with its name, version, licence and source address, the full text of each distinct licence once, and the content of every NOTICE file a package carries. The file is committed, copied into the built site, and linked from the page footer as "Third-party notices". A test fails when a production package of the lock is missing from the file. The README's licence section names the file. No package is added or removed in this chain. |
| R2 | **The block is seen.** When the outgoing text holds a listed name (she unmasked one on purpose, or typed one in), Send is not available and one line beside it says why: "Not sent: 1 listed name is in this text: <the name as a chip>. Mask it, or press Send this name on purpose." The step line shows Send as stopped, in words and shape, not colour alone. The invented visit gains a small control under the outgoing text, "Try to send a listed name", which unmasks one listed name so a first-time reader meets the block in one press; pressing the chip masks it again. Nothing is sent while the block holds, and a test proves no request is made. |
| R3 | **A failed check says the text has left.** The fail card's verdict line stays. Its last row becomes two: "What happened: this text has left this device." and "What to do: report it to whoever runs this page; mask the name before the next send." The fail state stays reachable only through the seeded test path, and the page says so in the card: "Seeded for a test." when it is. |
| R4 | **The verdict first.** In zone 2 the order is: outgoing text, the connection line, Draft and Send, the verdict card, the sentence that never folds, then two folds: "What this check scans" and "Egress ledger (N entries)". Inside the ledger fold each entry is a small table (time, job, mode, source, outcome, bytes, hash), not a line with pipes. "Save ledger" stays inside that fold. |
| R5 | **One mark.** While the cloud is not connected the finished note carries one mark: "test double: cloud not connected". Once connected it carries the source mark as now. |
| R6 | **Date words.** A date suggestion from the device pass is dropped when it has no year and no word of birth (born, birth, DOB, date of birth, age, aged) within three words of it. Unit tests for both sides. Then measure the device pass a fourth time on the same 200 notes, time-boxed to 15 minutes, and keep the three earlier files. If the found count for dates of birth drops below the third run's, take the rule out again, say so, and keep the fourth file as the record of the try. |
| R7 | Unchanged: the cloud half stays on the test double until the product owner says billing exists. Honesty rules unchanged. No target is changed; a miss is recorded as a miss. |

## Acceptance

| # | Check |
|---|---|
| S1 | The notices test passes; the built site holds the file; the footer link opens it (BUNDLED). The count of packages in the file equals the count of production packages in the lock. |
| S2 | BUNDLED: on the invented visit, "Try to send a listed name" makes the block line appear with the name as a chip, Send unavailable, the step line stopped; the request record shows no request; pressing the chip restores Send. A unit test covers a name typed into the outgoing text. |
| S3 | BUNDLED, seeded path: the fail card holds the two rows of R3 and the words "Seeded for a test." |
| S4 | BUNDLED at 1440 x 900 after a send: the verdict card's top edge is above the ledger fold; the ledger fold is closed by default and opens to a table; no pipe character is in zone 2. |
| S5 | BUNDLED: not connected, the finished note holds exactly one mark with the words of R5. |
| S6 | DEVICE MODEL: the fourth measurement beside the three; unit tests for R6; the page and the README show the run that stands. |
| S7 | New pictures: 10, 11 and 13 again, and `14-send-blocked.png`. Every earlier test passes. |
