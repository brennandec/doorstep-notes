# Real-browser checks, bundled browser, 2026-11-13

Browser: Chromium 158.0.8127.18 (Playwright 1.65.0 bundled, headless). Headless. No device model. The cloud is not connected, so cloud steps ran against the test double.

8 passed, 1 failed, 0 missed, of 9 checks.

| Check | Tasks | Result |
|---|---|---|
| Seeded leak: the line fails in the failure colour, in words, with the crossed octagon | egress-check 12 | passed |
| Without the seed the same run passes (the control for the seeded leak) | egress-check 12 | passed |
| H2 part A in full: masks, Shorter, draft, second reader and Save ledger against the doubles, every request recorded | egress-check 23; egress-check 13 (replaced); second-reader 9 | passed |
| Second reader: mask through a quote, ask again, two ledger entries, redaction line | second-reader 8 | passed |
| L2: the three clear controls each ask once, Escape cancels, and the store is read | shell-and-offline 56 | passed |
| L4: across the whole journey with data kept, no request carries a listed name or kept text | shell-and-offline 57 | passed |
| L8: after a send with the folds closed, zones 2 and 3 hold no paragraph over two lines, and each fold works from the keyboard | shell-and-offline 60 | failed |
| Installable, offline after first load, cache holds only allowed files | shell-and-offline 27; shell-and-offline 55 | passed |
| Masking offline with no model: exact, near, tap, Enter and the live region | masking 16 | passed |

## Why a check did not pass

- L8: after a send with the folds closed, zones 2 and 3 hold no paragraph over two lines, and each fold works from the keyboard (failed): Error: paragraphs over two lines in zones 2 and 3  expect(received).toEqual(expected) // deep equality  - Expected  -  1 + Received  + 32

The device model checks are not part of this file. They run in Google Chrome in a later session.
H2 part B (the real cloud service) has not run. Until it does, the page and README say "not yet checked against the real service".
