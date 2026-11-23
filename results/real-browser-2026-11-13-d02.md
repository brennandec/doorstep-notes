# Real-browser checks, bundled browser, 2026-11-13

Browser: Chromium 158.0.8127.18 (Playwright 1.65.0 bundled, headless). Headless. No device model. The cloud is not connected, so cloud steps ran against the test double.

20 passed, 1 failed, 1 missed, of 22 checks.

| Check | Tasks | Result |
|---|---|---|
| Seeded leak: the line fails in the failure colour, in words, with the crossed octagon | egress-check 12 | passed |
| Without the seed the same run passes (the control for the seeded leak) | egress-check 12 | passed |
| H2 part A: draft and second reader against the doubles, every request recorded | egress-check 13 (draft and second reader); second-reader 9 | passed |
| H2 part A: rewrite and ledger save | egress-check 13 (rewrite and ledger save) | missed |
| Second reader: mask through a quote, ask again, two ledger entries, redaction line | second-reader 8 | passed |
| No device model: the invented visit, one press per step | shell-and-offline 28; drafting 13 | passed |
| Capture sends nothing: typing, a photo, the invented visit | capture-and-record 14 | passed |
| No model: hand entry builds a full record and the prepared record loads with one press | capture-and-record 15 | passed |
| Offline with no model: the online draft works, the offline case shows the no-model line | drafting 14 | passed |
| Installable, offline after first load, cache holds only allowed files | shell-and-offline 27 | failed |
| Masking offline with no model: exact, near, tap, Enter and the live region | masking 16 | passed |
| Interface rules: colours, type, controls, targets, focus, motion | shell-and-offline 26 | passed |
| Layout: zones, boundary and stacking | shell-and-offline 25 | passed |
| Screenshot: stacked at 1024 by 768 | look-and-layout: screenshot 07 | passed |
| The test hooks are not in the production build | egress-check 12 (production build has no hook) | passed |
| first screen and the invented visit |  | passed |
| V3: after hand entry and a send, the journey is in view together at 1440 by 900 | shell-and-offline 35 | passed |
| V4: 'Send this name on purpose' is not in the document until a listed chip is pressed | masking 19 | passed |
| V5: no device model, the likely-names line lists Bea and one press masks her | masking 24 | passed |
| V6 (ledger): after a send, 'Save ledger' shows its entries as text, and a press writes to the test double | egress-check 21 | passed |
| V6 (rewrite): 'Shorter' calls the rewrite double, shows a label, and the masker runs before the sentence is replaced | drafting 21 | passed |
| Y5: with a record present at 1440 by 900, the first chip is inside the viewport | shell-and-offline 43 | passed |

## Why a check did not pass

- H2 part A: rewrite and ledger save (missed): Not run. "Shorter", "Plainer" and "Save ledger" are now on the screen (session C02), but H2 part A has not been run again with them; the V6 checks cover the presses, not the full request record.
- Installable, offline after first load, cache holds only allowed files (failed): Error: expect(locator).toBeVisible() failed  Locator: locator('[data-mask-view] [data-chip]').first() Expected: visible Timeout: 5000ms Error: element(s) not found

The device model checks are not part of this file. They run in Google Chrome in a later session.
H2 part B (the real cloud service) has not run. Until it does, the page and README say "not yet checked against the real service".
