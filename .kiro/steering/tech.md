# Tech

## Stack

- TypeScript, Vite.
- Firebase JS SDK, the `firebase/ai` module. Needs 12.5.0 or later for on-device inference. The default cloud model is documented from 13.0.0; see docs/sdk-facts.md before choosing the version, and set the cloud model name explicitly.
- Vitest for unit tests. Playwright 1.65.0 for real-browser checks. Plain TypeScript and the DOM for the interface; no UI framework.
- Real-browser checks are of two kinds (docs/decisions/2026-11-13-browser-on-this-computer.md), and every task says which:
  - BUNDLED: Playwright's bundled Chromium, headless, no device model. Already on this computer; nothing is fetched.
  - DEVICE MODEL: Google Chrome with the built-in model, through one fixture (`channel: 'chrome'`, profile `.browser-profile/`, `--disable-component-update` removed, `--use-mock-keychain` added, headless unless `DEVICE_MODEL_HEADED=1`). It reads `LanguageModel.availability()` under 15 seconds, calls `create()` only from a click and only when `available`, and never starts a download. When Chrome or the model is absent it records a miss with its reason; a miss never turns the suite red and is never a pass.
- No browser window opens on the screen during a build session.
- Firebase parts: AI Logic and App Check (required). Masked records are not synced in this version (ruling 18). Hosting is not used by build sessions.
- No other runtime dependency without a written reason in docs/decisions/. Pin exact versions.
- Web Crypto SHA-256 for the egress hash. Exact string matching with Unicode case folding, and an edit distance of 1 for names of five letters or more (ruling 11). A plain append-only list for the ledger. Nothing else.
- Fixed numbers (targets, limits, sizes) live in `src/constants.ts`, each with its source (ruling 22).

## The four inference modes

- `PREFER_ON_DEVICE`: device model if available, else cloud.
- `ONLY_ON_DEVICE`: device model, else throw.
- `PREFER_IN_CLOUD`: cloud, else device.
- `ONLY_IN_CLOUD`: cloud, else throw.

Every response carries `inferenceSource`, `ON_DEVICE` or `IN_CLOUD`. Every result on screen shows "on this device" or "in the cloud" from it.

## Which job uses which

| Job | Mode | Why |
|---|---|---|
| Structure the rough note or photo into the visit record (JSON schema) | `ONLY_ON_DEVICE` | raw notes never leave; if no device model, say so and offer typing the record by hand |
| Propose more things to mask | `ONLY_ON_DEVICE` | same; exact-match masking works without a model |
| Draft the formal note from the masked record | `PREFER_IN_CLOUD` online; `ONLY_ON_DEVICE` when the app finds it is offline (ruling 12) | best prose online; shorter labelled device draft offline, decided by the app from the browser's online state plus one failed probe, not left to a fallback |
| Small rewrite of one masked sentence | `PREFER_ON_DEVICE` | instant and free on device; cloud if no device model |
| Second reader: guess who this is about | `ONLY_IN_CLOUD` | the point is an outside reader |

## Constraints the design must respect

- `initializeDeviceModel()` is called after a user action and before the first prompt. The download can take minutes; show progress.
- On device: single-turn text, text plus JPEG or PNG inline, structured output. Not on device: audio, video, PDF, tools, multi-turn chat. Token counting is not for hybrid at all.
- Image input is declared in the create options only when a photo is attached (ruling 8).
- The real-browser check of the device structured-output syntax comes before the structuring job is built (ruling 10).
- The length guard is best-effort, counts the schema and system prompt, and takes its bound from a results file; until then the model's own error is the check (ruling 9).
- App Check is enforced. Debug provider for local work; a production provider for a hosted page.
- Two switches, shown separately in the status bar (ruling 23). Device jobs call the SDK whenever the browser reports the model `available`, whether or not the cloud service is enabled. Cloud jobs use a fixed sample and say "off" on screen until the AI service is enabled on the project (`AI_SERVICE_ENABLED`).
- Every cloud call goes through `src/egress/send.ts`. The egress check runs on the request body the browser actually sends, captured in the page (ruling 3).
- Configuration: dev and tests read `firebase.config.local.json` at run time without importing it; a hosting build injects the values into `dist/`, which is never committed (ruling 16).
- The Prompt API is not available in Web Workers. Call it from the main thread.

## Commands and limits for build sessions

- Allowed shell commands, inside this project folder only: `npm`, `npx`, `node`, `perl` (only as the time limit wrapper), and read-only `git` (status, diff, log).
- No global installs, no sudo, nothing outside this folder.
- Never run a test suite without a time limit: `perl -e 'alarm 300; exec @ARGV' npm test`.
- Do not commit, push, host or publish.
- A web fetch may only go to firebase.google.com and developer.chrome.com.
- Run the type check and the build after any code change.

## Acceptance

H1 to H9 in BRIEF.md are the acceptance list, as refined by the owner's rulings of 2026-11-13. A miss in a real-browser check is recorded as a miss, not hidden. H1 and H8 are recorded as failures with their reason when the device model is absent (ruling 20). H2 needs part A (test double) and part B (real service, invented people) before any claim (ruling 2). H3 includes a real-browser check of the failure colour and words; H7 checks the installability errors Chrome reports (ruling 21).

## Second review (2026-11-13): additions

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. It wins over the sections above where they differ.

- Acceptance. U1 to U11 are the direction items and V1 to V8 the acceptance checks of the second review. They sit next to H1 to H9 and are numbered requirements in the specs: capture-and-record R12 and R13, masking R13 to R16, measurement R11 and R12, egress-check R9 and R10, drafting R10, shell-and-offline R20 to R23. Each real-browser check says BUNDLED or DEVICE MODEL in its task.
- Viewport. The layout checks V3 and V8 use 1440 x 900 (and 1024 x 768 for the stacked screenshot), headless.
- Dates. The structuring prompt and schema forbid the model to change, convert or complete a date. The app also checks that any date-like token in a record is in the rough note, and reads the date itself with `readNoteDate` (day and month order from the browser's locale, the clock's year, marked "assumed"). The record date field is the note's words.
- Measurement. The device-pass time box is 15 minutes with a 1200 second wrapper (V7). Both device runs are kept: the first run's files are copied before the second run writes.
- Figures. One function builds the figure lines for the page and the README. The page shows the later device run.
- Egress words. What the check scans is stated from one string table and the constants `MIN_NAME_PART_LENGTH` and `NEAR_MATCH_MIN_LETTERS`. The words follow the code.
- Ledger. The egress ledger is shown in a closed fold and kept on this device. Nothing in a build session talks to the Firebase project.
- Cloud. `AI_SERVICE_ENABLED` stays `false` until the product owner says billing exists (U11).
- Whole suite. Every task runs the whole suite with the time limit; the count before this review was 1,015 passed and 1 skipped.
