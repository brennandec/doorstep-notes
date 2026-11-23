# Fourth review: what two outside readers marked down (2026-11-13)

The product owner's review of the build as chain 4 left it (commit b1ff460). Two outside readers scored the entry against the contest's four criteria without being told what to look for. Both named the same defects first. Looked at as well: `results/real-browser-2026-11-13-d02.md` (20 passed, 1 failed, 1 missed of 22), `results/h2-part-a.json`, `results/catch-rate.json`, and a screen recording of the whole journey at 1440 x 900.

## What is right

The journey runs and the finished note is whole. The device half is real: in Google Chrome the record is made offline in about ten seconds and no request leaves. Both readers scored the idea 4 of 5. The cloud gap is stated, not hidden.

## What is wrong

| # | Seen | Problem |
|---|---|---|
| J1 | After a reload the client list, the note and the record are gone. The check "Installable, offline after first load" fails at the first chip | She loses her note when a tab reloads in a car park, and she types her client list again at every visit. Both readers put this first |
| J2 | H2 part A has never run with "Shorter", "Plainer" and "Save ledger", although all three are on the screen since session C02 | One of the four modes has no full request record |
| J3 | The second measurement counts 82 suggestions of the device pass that were not needed. In the recording it suggests the word "neighbour" | She waves suggestions away; a reader of the figures sees a precision problem and no answer to it |
| J4 | The README's first screen does not say that the cloud half is answered by a test double in this build | A reader finds it far down and decides the entry is a device app with a cloud story attached |
| J5 | Zones 2 and 3 carry paragraphs of small print at all times: what the check scans, what a guess is | The page reads as text. The product is five steps and one line that passes or fails |

## Direction

| # | Item |
|---|---|
| K1 | **Kept on this device.** The client list, the note in progress, the record, the masks and their kinds, the outgoing text, the finished note, the step she is on and the local ledger entries are saved in the browser's own store (IndexedDB) as she works, and restored when the page loads, offline included. One line under the title of zone 1 says: "Kept in this browser only." Two controls, each asking once before it acts: "Clear this visit" (note, record, masks, outgoing text, finished note, step) and "Clear my list". In the footer: "Clear everything this page keeps". The stored data carries a version; data of an unknown version is not read, the page starts empty and says so in one line. Nothing that is kept may enter a request other than the outgoing text she sees; the egress check is unchanged. |
| K2 | **Say how it is kept.** README and the footer line: the store is the browser's own, on this device; this page does not encrypt it; it relies on the lock of the device; the three clear controls remove it. No stronger word than that. |
| K3 | **H2 part A in full.** BUNDLED, against the test doubles: the invented visit, masks, "Shorter" on one sentence, draft, second reader, "Save ledger" (the store's double). The request record lists every request; none leaves the page. `results/h2-part-a.json` says pass, or says what was seen. |
| K4 | **Fewer needless suggestions, in code and measured.** A suggestion from the device pass is dropped before it is shown when it is one lower-case word from a short list of role and relation words (neighbour, landlord, sister, brother, son, daughter, mother, father, partner, friend, doctor, nurse, teacher and the like), or a weekday, a month, a time of day or a relative day. A role word followed by a capitalised word is kept as a suggestion for the capitalised word only. The list lives in one file that the README names. Then measure the device pass a third time on the same 200 notes, time-boxed to 15 minutes: found, missed and not-needed counts beside runs 1 and 2. Keep both earlier files. The page and the README show the third run. No target is set: a lower found count is recorded as lower. |
| K5 | **The first screen says what is real.** The README's first paragraph after the title, and the status area of the page, state the two halves in one sentence each: the device half runs in Google Chrome's built-in model; the cloud half is "not connected: answered by a test double in this build", or names the connected service once it is. The words are read from the build flag and `results/cloud-probe-2026-11-13.json`, never typed. |
| K6 | **Small print folds.** Under "What leaves", the explanation of what the check scans folds behind one control, "What this check scans", closed by default. Under "Second reader", the explanation folds behind "What a second reader is". Use the native disclosure element so that keyboard and screen readers work without extra code. Two sentences never fold: the egress line itself, and "This checks listed names and masked values only. Other details in the text can still identify a person." Whether a fold is open is kept (K1). |
| K7 | Unchanged: the cloud half stays on the test double and says "not connected" until the product owner says billing exists. Honesty rules unchanged. No target is changed; a miss is recorded as a miss. |

## Acceptance

| # | Check |
|---|---|
| L1 | BUNDLED: the invented visit, record by hand entry, one mask added, then the network is cut and the page reloaded: the same list, note, chips, outgoing text and step are on the screen. The check "Installable, offline after first load, cache holds only allowed files" passes. |
| L2 | BUNDLED: "Clear this visit" empties the visit and keeps the list; "Clear my list" empties the list; "Clear everything this page keeps" leaves the store empty (the test reads the store). Each asks once; Escape cancels. |
| L3 | Unit tests: save, restore, each clear, a stored version the code does not know (starts empty and says so), a store that cannot be opened (the page works for this session and says that nothing is kept). |
| L4 | BUNDLED: across the whole journey with data kept, the request record holds no listed name and no kept text outside the outgoing text; every earlier egress test passes. |
| L5 | `results/h2-part-a.json` complete as K3 says. |
| L6 | DEVICE MODEL: the third measurement as K4 says, all three runs in the results, the page shows the third. Unit tests for the filter: each kind of dropped word, and the role word followed by a name. |
| L7 | A test reads the README's first paragraph and the page's status area and finds the cloud half's state equal to the build flag and the probe file. |
| L8 | BUNDLED at 1440 x 900 after a send, folds closed: zones 2 and 3 show no paragraph longer than two lines, the two sentences that never fold are visible, each fold opens and closes by keyboard. |
| L9 | New pictures: `10-whole-journey-device.png` and `11-whole-journey-all-accepted.png` again, and `12-after-reload-offline.png`. Every earlier test passes. |
