# Real-browser checks, bundled browser, 2026-11-13

Browser: Chromium 158.0.8127.18 (Playwright 1.65.0 bundled, headless). Headless. No device model. The cloud is not connected, so cloud steps ran against the test double.

15 passed, 0 failed, 1 missed, of 16 checks.

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
| Installable, offline after first load, cache holds only allowed files | shell-and-offline 27 | passed |
| Masking offline with no model: exact, near, tap, Enter and the live region | masking 16 | passed |
| Interface rules: colours, type, controls, targets, focus, motion | shell-and-offline 26 | passed |
| Layout: zones, boundary and stacking | shell-and-offline 25 | passed |
| Screenshot: stacked at 1024 by 768 | look-and-layout: screenshot 07 | passed |
| The test hooks are not in the production build | egress-check 12 (production build has no hook) | passed |
| first screen and the invented visit |  | passed |

## Why a check did not pass

- H2 part A: rewrite and ledger save (missed): No control on the screen calls the rewrite, and the Save ledger part is not placed on the screen. Neither could be run in a browser.

The device model checks are not part of this file. They run in Google Chrome in a later session.
H2 part B (the real cloud service) has not run. Until it does, the page and README say "not yet checked against the real service".
