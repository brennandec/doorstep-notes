# Shell and offline: design

Refined by the owner documents of 2026-11-13: rulings 15 to 23, the look and layout, and the browser on this computer.

## Modules

The interface is plain TypeScript and DOM. No UI framework is used (requirement R18.2).

- `src/constants.ts` every fixed number and switch, each with its source (ruling 22): sizes, colours, limits, `AI_SERVICE_ENABLED`, `CLOUD_TIER`, `PROBE_TIMEOUT_MS`, `DEVICE_AVAILABILITY_TIMEOUT_MS`, `INVENTED_LIST_SIZE`.
- `src/app/main.ts` mounts the screen.
- `src/app/statusBar.ts` network, device model and cloud states.
- `src/app/zones/note.ts`, `src/app/zones/leaves.ts`, `src/app/zones/finished.ts` the three zones.
- `src/app/boundary.ts` the labelled rule between this device and the cloud.
- `src/app/parts/` drawn controls, chips, source label, egress line, icons.
- `src/app/icons.ts` inline SVG for laptop, cloud, arrow crossing a line, check, crossed octagon, pencil, camera, eye.
- `src/app/strings.ts` every sentence a person reads, in one table, so the word tests can scan it.
- `src/app/standing.ts` standing statements, the H2 line, the tier line.
- `src/app/sendNotice.ts` the no-cost tier notice (owner check, OPEN-QUESTIONS 1).
- `src/app/example/inventedVisit.ts` the invented visit (note, 12-name list, prepared record). Defined in capture-and-record.
- `src/app/styles/` tokens and layout CSS.
- `src/app/figures.ts` reads results files (measurement spec).
- `src/firebase/config.ts` run-time loader; `src/firebase/appCheck.ts`; `src/firebase/auth.ts`; `src/firebase/remoteConfig.ts`; `src/firebase/ledgerStore.ts` ledger sync only.
- `src/inference/index.ts` reads the two switches and builds the kit.
- `src/net/online.ts` online state plus probe.
- `public/manifest.webmanifest`, `public/icons/`, `public/sw.js`, `public/probe.txt`.
- `tests/e2e/playwright.config.ts` two projects, BUNDLED and DEVICE MODEL.
- `tests/e2e/fixtures/deviceModel.ts` the one DEVICE MODEL fixture.
- `tests/e2e/fixtures/staticServer.ts` serves `dist/` on localhost for one check, then stops.

## Data shapes

```ts
type CloudTier = "no-cost" | "paid";

interface Switches {
  device: "available" | "downloadable" | "downloading" | "unavailable";  // from the browser
  cloud: boolean;                                                        // AI_SERVICE_ENABLED
}

interface InferenceKit {
  structure: StructureJob; proposeMasks: ProposeMasksJob; draft: DraftJob;
  rewrite: RewriteJob; secondReader: SecondReaderJob;
}
function makeKit(sw: Switches, deps: FirebaseDeps): InferenceKit
```

`makeKit` picks, per job: device jobs real when `sw.device === "available"`, otherwise a "not available" stub that throws a typed error the screen turns into the one-line message. Cloud jobs real when `sw.cloud`, otherwise the double with `connected: false`. Device doubles exist for unit tests only and are never chosen by `makeKit` in the built app.

## Layout

CSS grid on the main element.

- At 1200 px and wider: columns `minmax(0, 5fr) auto minmax(0, 3fr) minmax(0, 4fr)`. The second column is the boundary rule.
- Below 1200 px: one column; the boundary is a horizontal rule with "this device" above and "the cloud" below.

Zone 1 "Your note": the line "Everything here stays on this device.", the note area (20 px), the photo control, "Make the record", the record editor with chips, the device model line when the model is absent.
Zone 2 "What leaves": the outgoing text (`<pre>` in the monospace stack on `#F1EEE6`, 1 px dashed hairline border), the send notice, Send, and the egress line pinned to the bottom with `position: sticky; bottom: 0`.
Zone 3 "Finished note": a sheet with the serif stack, `box-shadow` soft, the source label top right, Copy.

Status bar: left the working title and "A writing aid with an egress check."; right three states with icon and words.

| State | Words | Icon |
|---|---|---|
| Network online / offline | "online" / "offline" | arrow crossing a line / the same, struck |
| Device model | "ready" / "downloading, N%" / "not on this computer" | laptop |
| Cloud | "connected" / "not connected" | cloud |

The device state `downloadable` shows "not on this computer" in the status bar, and zone 1 shows the "Get the device model" control.

## Tokens

| Token | Value | Source |
|---|---|---|
| paper | `#FAF8F3` | L&L |
| paper-2 | `#F1EEE6` | L&L |
| ink | `#1C1B19` | L&L |
| ink-2 | `#5E5A52` | L&L |
| hairline | `#D9D4C7` | L&L |
| accent | `#1E6B52` | L&L |
| failure | `#B3261E` | L&L |
| base type | 18 px | L&L |
| note type | 20 px | L&L |
| minimum type | 16 px | L&L |
| line height | 1.5 | L&L |
| control height | 48 px | L&L |
| control border | 1.5 px ink | L&L |
| control radius | 10 px | L&L |
| focus ring | 3 px accent, offset 2 px | L&L |
| minimum target | 44 px | brief, L&L |
| fade | at most 120 ms; 0 with reduced motion | L&L |
| stack width | 1200 px | L&L |

Face stacks: sans `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; serif `Georgia, "Times New Roman", serif`; monospace `ui-monospace, Menlo, Consolas, monospace`.

## First run

The page opens on the tool. Zone 1 empty state: the note area and one secondary control, "Try an invented visit". Pressing it calls `loadInventedVisit()`, which fills the note and the client list from `src/app/example/inventedVisit.ts` and sets the "invented example" mark. With the device switch off it also fills the prepared invented record, so the next press is "Mask". The mark goes away when she removes the example with the "Remove example" control.

The device model line, with no device model: "The device model would turn rough notes into a record, suggest more things to mask, and write a short draft offline. It is not on this computer." No Chrome version, flag or hardware figure is printed until a DEVICE MODEL check has passed and written `results/device-model-check.json` (ruling 19).

## Configuration (ruling 16)

- Development and tests: `src/firebase/config.ts` fetches `/firebase.config.local.json` at run time through a Vite dev-server middleware that reads the file from the project root. The file is never imported, so it is never bundled.
- Hosting build (outside build sessions): a Vite plugin reads the same file and injects the values into `dist/` at build time. `dist/` is ignored by git.
- Tests use `tests/fixtures/firebase.config.invented.json` with invented placeholder values.
- The committed-values test lists tracked files with `git ls-files`, loads the local file at run time, compares in memory and reports only file and key names.

## Offline (ruling 17)

`src/net/online.ts`: `isOffline()` is true when `navigator.onLine` is false, or when one probe of `/probe.txt?t=<time>` fails within `PROBE_TIMEOUT_MS`. The service worker passes `/probe.txt` through to the network.

The service worker precaches the allowed list, generated at build time from the Vite manifest, and serves the shell offline with a navigation fallback to the cached index. It ignores every other request. Cache is versioned and old versions are deleted on activate.

## Installability check (ruling 21)

The BUNDLED test builds the app, serves `dist/` from `staticServer.ts` on `http://localhost:<port>` with a 120 second limit, opens a CDP session, and asserts `Page.getInstallabilityErrors` returns an empty list. It then stops the server and the browser. Nothing is hosted.

## Real-browser projects (browser document)

`playwright.config.ts` has two projects:

- `bundled`: Playwright 1.65.0's Chromium, `headless: true`, default switches. Runs all BUNDLED tests.
- `device-model`: uses `tests/e2e/fixtures/deviceModel.ts` only. `channel: 'chrome'`, `launchPersistentContext('.browser-profile/')`, `ignoreDefaultArgs: ['--disable-component-update']`, `args: ['--use-mock-keychain']`, `headless` true unless `process.env.DEVICE_MODEL_HEADED === '1'`. First step: `LanguageModel.availability()` under a 15 second limit, result written to `results/device-model-check.json` with date and browser. If Chrome is absent, the launch error is caught and written as a miss. A miss marks the test as skipped with the reason in the results file, so the suite stays green and the miss is never a pass.

Commands: `npm run e2e:bundled` and `npm run e2e:device`, each run under `perl -e 'alarm 300; exec @ARGV'`.

## Inference summary (README table source)

| Job | Mode | Leaves the device |
|---|---|---|
| Structure the note or photo into the record | `ONLY_ON_DEVICE` | nothing |
| Propose more things to mask | `ONLY_ON_DEVICE` | nothing |
| Draft the formal note | `PREFER_IN_CLOUD` online; `ONLY_ON_DEVICE` when the app finds it is offline | the outgoing text built from the masked record, online only |
| Rewrite one masked sentence | `PREFER_ON_DEVICE` | that one masked sentence, only if the cloud answers |
| Second reader | `ONLY_IN_CLOUD` | the masked outgoing text |

## Stored where

| Item | Where |
|---|---|
| Raw note, photo, client list, restored note, mask map, surface forms | IndexedDB, this browser only |
| Masked record | this browser only; not synced (ruling 18) |
| Egress ledger | this browser; cloud store only after "Save ledger" |
| App files | service worker cache, allowed list only |
| Firebase config | read at run time; injected only into a hosting build in `dist/` |

## Tests

Unit (Vitest): constants have sources, contrast pairs, style scans (gradient, dark theme, font files, durations), icon set, string-table word scans, emoji scan, dramatic-word scan, number audit, config loader with invented values, committed-values test, `.gitignore` entries, switch combinations, kit selection, probe shape, cache allowed list, import rules, Playwright config headless.
BUNDLED: zone order and widths, stacking under 1200 px, boundary labels, zone 2 styling, zone 3 face, computed colours, type sizes, control sizes, targets, focus ring, reduced motion, installability errors, offline reload, cache contents, the one-press invented-visit path, H6.
DEVICE MODEL: the availability check that unlocks first-run instructions (ruling 19).
