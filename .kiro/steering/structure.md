# Structure

This is the planned layout. No application code exists yet. Create folders only when a file needs them.

```
BRIEF.md                         the product owner's brief; do not edit
OPEN-QUESTIONS.md                old copy; the current one is .kiro/specs/OPEN-QUESTIONS.md
LICENSE                          MIT; do not change
firebase.config.example.json     placeholders, committed
firebase.config.local.json       real web config, ignored by git; never read aloud, print, log or copy
.browser-profile/                profile for the DEVICE MODEL fixture, ignored by git
.kiro/steering/                  these steering documents
.kiro/specs/                     the seven specs and OPEN-QUESTIONS.md
docs/
  sdk-facts.md                   documented facts the design depends on, with URL and date
  decisions/                     short written decisions, including the owner documents of 2026-11-13
  reviews/                       outside spec reviews and the responses to them
  kiro-sessions/                 session records (disclosure); keep
src/
  constants.ts                   every fixed number and switch, each with its source (ruling 22)
  app/                           the one screen, three zones, parts, string table, styles; plain TypeScript and DOM
  inference/                     one small interface per job (structure, proposeMasks, draft, rewrite, secondReader)
                                 real implementation, test double, the mode each job uses, and the two switches
  masking/                       exact match, near match, case folding, tags, surface forms, pronoun tokens; no model
  egress/                        the single path out, body capture, SHA-256, the egress check, the append-only ledger
  storage/                       client list, raw notes, records, mask state and ledger, in the browser only
  firebase/                      config loader, App Check, the SDK calls for the jobs
  net/                           online state plus one probe
public/                          manifest, icons, service worker for install and offline, probe file
scripts/                         synthetic note set builder and the catch-rate measurement
results/                         files written by scripts; the app reads figures only from here
tests/
  unit/                          Vitest
  e2e/                           Playwright 1.65.0: BUNDLED (bundled Chromium, headless) and DEVICE MODEL (one fixture)
README.md                        includes the table of all five jobs, modes and what leaves the device
```

## Rules for where things live

- Each inference job sits behind its own small interface in `src/inference/`. This is what lets the jobs become agents later without a rewrite.
- Nothing outside `src/inference/` and `src/firebase/` imports `firebase/ai`.
- Nothing outside `src/storage/` touches the raw note, the photo or the client list at rest.
- Nothing in `src/` may send the raw note, the photo or the client list anywhere. Only text built from the masked record leaves, and only through `src/egress/send.ts`.
- Every measured number shown in the app or README points to a file in `results/`. Fixed numbers live in `src/constants.ts` with their source.
- The invented visit (note, 12-name client list, prepared record) lives in `src/app/example/`. It is the only example data in `src/`.
- Test names, fixtures and examples use invented people only. Put fixtures under `tests/` or `scripts/`, never real data.
- No keys or tokens in any committed file. The config loader reads `firebase.config.local.json` from the project root.

## Second review (2026-11-13): additions to the layout

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. These files are planned by the new tasks; create them only when a task needs them.

```
src/record/noteDate.ts           readNoteDate and the date-token guard (capture-and-record R12)
src/masking/likelyNames.ts       the guess by capital letters, no model (masking R15)
src/app/parts/steps.ts           the five-step line and currentStep (shell-and-offline R20)
docs/screens/                    the nine screenshots under their old names, and 10-whole-journey-device.png
results/catch-rate-run-1.json    the first device run, kept (measurement R12)
results/misses-run-1.json        its misses, kept
results/date-check.json          V1, DEVICE MODEL
results/rewrite-device.json      V6, DEVICE MODEL
results/screens.json             V8: names, viewport, scroll position, date and browser
```

- The figure lines for the page and the README live in `src/app/figureText.ts` and nowhere else.
- The scan words live in the string table and are read by the page and by the README check.
- Nothing in `src/record/` or `src/masking/likelyNames.ts` imports `firebase/ai` or any inference module.
