# H45: ONLY_ON_DEVICE and the missing LanguageModel API (Firebase JS SDK issue #10635)

Date: 2026-11-17. Repository head at the start: ed2e962. SDK as installed: firebase 13.0.0, @firebase/ai 3.0.0.

## The SDK behaviour (read from node_modules/@firebase/ai/dist/esm/index.esm.js)

- `chromeAdapterFactory` (1219-1227) returns undefined when `globalThis.LanguageModel` is falsy, whatever the mode.
- `callCloudOrDevice` (2551-2556): with no chrome adapter it calls `inCloudCall()` first and never looks at the mode. `generateContent` reaches it at 2679.
- `countTokens` (3236-3240): throws for ONLY_ON_DEVICE only when an adapter exists; with none, `countTokensOnCloud` runs.
- `initializeDeviceModel` (3303-3306): with no adapter it returns without a call.
- The request goes to `firebasevertexai.googleapis.com` (DEFAULT_DOMAIN, line 27), also for `GoogleAIBackend`. Headers carry `x-goog-api-key` (1537) and, when an App Check provider exists, `X-Firebase-AppCheck` (1541-1545). The body holds the prompt.

## What deviceOnlyService configures (src/firebase/deviceApp.ts)

- Config at 12-16: `apiKey: "device-only"`, `projectId: "device-only"`, `appId: "1:0:web:device-only"`. Placeholders, no real key, no App Check.
- `getAI(app, { backend: new GoogleAIBackend() })` at 31.
- Could the fallback transmit the payload even though auth fails? Yes. The SDK builds the request and calls `fetch` before any server verdict. Google's front end would answer with a key or project error (not observed here; no cloud call was made in H45), but the request body, with the note, has already left the browser. A failed auth does not undo a transmission. This is the whole risk.

## Where the SDK sees `LanguageModel`

- The SDK reads `globalThis.LanguageModel` live at every `getGenerativeModel` (index.esm.js 4861).
- The app reads it once, at module load: src/app/main.ts:40 (`languageModel: globalThis.LanguageModel`), and `makeDeviceModel.state()` (src/inference/deviceModel.ts:186-187) answers "unavailable" only if that captured reference is missing. Once `sessionMade` is true, `state()` still asks the captured object's `availability()` (190) and returns "available" (192).
- Consequence: every gate below is a gate on the captured reference, not on what the SDK will see. If the API is present at load and gone at call time (extension or policy removing it, a test deleting it, a frame without it), the app says "available" and the SDK goes to the cloud.

## Call sites

| # | Site (file:line) | How it is reached | Gated on device state? | Would leak under #10635? |
|---|---|---|---|---|
| 1 | src/firebase/proposeSdk.ts:9-17 (propose-masks on the raw note; `deviceOnlyService` 9, `ONLY_ON_DEVICE` 11, `generateContent` 17) | `makeProposeMasksJob.run` (src/inference/proposeMasks/proposeMasks.real.ts:64-76), wired at src/app/main.ts:61; the controller gets it through `makeKit` (src/inference/index.ts:78, `deviceReady` only) at main.ts:80, called by `runProposals` (src/app/controller.ts:557-561) and `runDevicePass` (src/masking/devicePass.ts:61) | Yes: `deps.state()` at 64, "unavailable" throws "absent" (65); kit swaps in `absentPropose` unless `sw.device === "available"`. Both read the captured reference. | No when the API was never there (state "unavailable"). Yes when it is present at load and gone at call time: raw note in the request body. |
| 2 | src/firebase/structureSdk.ts:9-18 (structure on the raw note and photo) | `makeStructureJob.run` (src/inference/structure/structure.real.ts:111-112 state check, 121 call), wired directly at src/app/main.ts:47 (no kit), called by `onMakeRecord` (src/app/controller.ts:1112-1125) | Yes, `deps.state(kind)` at structure.real.ts:111, "unavailable" throws "absent" (112). Captured reference, as above. | Same as 1: note and photo bytes. |
| 3 | src/firebase/rewriteSdk.ts:14-20 (rewrite, ONLY_ON_DEVICE branch) | `makeRewriteJob.run` (src/inference/rewrite/rewrite.real.ts:101-111). Mode ONLY_ON_DEVICE only when `rewriteCallMode` (69) sees `device === "available"` and cloud off | Yes, by the same `device.state()` snapshot (rewrite.real.ts:101). | Same as 1: the one masked sentence. |
| 4 | src/firebase/draftSdk.ts:15-21 (device draft) | `makeDraftJob.run` (src/inference/draft/draft.real.ts:78-91); kit gate at src/inference/index.ts:84-87 (`deviceReady`); `onDeviceDraft` (src/app/controller.ts:1060-1085) checks `deps.device.state()` at 1067-1068 before `sendDraft(prep, "ONLY_ON_DEVICE", ...)` at 1071 | Yes, three times (controller 1068, kit 86, job 79-80), all on the captured reference. | Same as 1: the masked outgoing record text. |
| 5 | Screen-draft look: src/app/main.ts:108-111 (`findNames`) to src/drafting/draftFlow.ts:102 and src/drafting/screenDraft.ts (input of the look) | `makeKit(...).proposeMasks.run(text)`, so site 1. Errors are swallowed (draftFlow.ts:101-105), no extra names are marked. | Yes, as site 1 (kit gate and job gate). | Same as 1: the returned draft text (masked tags plus prose). A swallowed error hides the failure, not the request. |
| 6 | src/firebase/deviceInit.ts:8-10 (`initializeDeviceModel` on the "Get the device model" press) | `deviceModel.initialize` (src/inference/deviceModel.ts:203-206); `canInitialize` button | Button only; no payload. | No payload, no request (SDK returns at 3304-3306 with no adapter). Afterwards `lm.create` is missing and the press rejects (deviceModel.ts:208-210). |
| 7 | `countTokens` | No call site. `grep -rn countTokens src` finds nothing. The README states token counting is not available for hybrid inference (README.md:238). | n/a | Not reachable today. A future call would go to the cloud with no adapter (SDK 3236-3240). The guard covers it by being the required first step; a unit test fails if a `countTokens(` appears in src. |
| 8 | src/firebase/structureSdk.ts:36-52 (`measureStructureInput`) | Calls `LanguageModel.create` directly, never the SDK; returns null when the API is missing (37-38). | n/a | No. |

## Finding outside the order (not changed, not an ONLY_ON_DEVICE path)

`rewriteCallMode` (src/inference/rewrite/rewrite.real.ts:68-70) returns "PREFER_ON_DEVICE" whenever the device is not "available", including when the page said device-only (`deviceOnly`, set by src/drafting/rewriteFlow.ts:97 as `!prep.cloud`). On a build with the cloud service on (`sw.cloud`, main.ts:53) and a press made with the page's cloud switch off, a missing device model sends the sentence through `cloudService()` (src/firebase/rewriteSdk.ts:24). H45 does not touch it: the order forbids changing what any cloud path sends. Recorded for the desk (see NOT DONE in the H45 report).

## Decision

One guard, `assertDeviceUsable` in src/firebase/deviceGuard.ts, runs inside every SDK wrapper before `deviceOnlyService()`:

1. refuses unless `"LanguageModel" in globalThis` and the live object has `availability`;
2. asks `availability()` with the call's own expected inputs and outputs, under the existing availability time limit;
3. refuses on "unavailable", an unknown word, an error or a timeout; "available", "downloadable" and "downloading" pass (the jobs already wait for a download);
4. refuses by throwing `DeviceModelAbsentError` ("The device model is not available."), the error the kit already uses; the structure, propose-masks and draft jobs turn it into their existing "absent" failure.

No fetch is attempted before the guard. Cloud paths (`cloudService()`) are untouched.

## H45b: the rewrite fall-through, closed (desk ruling 2026-11-17)

Ruling: when the page's cloud switch is off, no path may reach `cloudService()`, whatever the device state.

- Search: every `PREFER_ON_DEVICE` / `PREFER_IN_CLOUD` choice in `src/`. Only `rewriteCallMode` (src/inference/rewrite/rewrite.real.ts:68-74) chose the mode from the switch and let a missing device fall to a cloud-capable mode. The draft is different: the kit gives the draft job only when the cloud is on (`src/inference/index.ts:84-87`, `onlineDraft` is a double otherwise) and `chooseMode` (src/drafting/chooseMode.ts:20-25) picks the cloud only for an online, probe-passed page. The second reader is `ONLY_IN_CLOUD` by design and is gated by the cloud switch in the kit. No change there.
- Change: `rewriteCallMode` returns `ONLY_ON_DEVICE` whenever `cloudEnabled` is false, and `PREFER_ON_DEVICE` otherwise (before: `ONLY_ON_DEVICE` only when the device was "available"). `makeRewriteJob` ends a device-only call on an "unavailable" device with `RewriteFailure("absent", strings.deviceModelAbsent)` before any SDK call; the guard's `DeviceModelAbsentError` maps to the same failure. The page shows `e.line` (src/drafting/rewriteFlow.ts:105), the existing device-absent line. "downloadable" and "downloading" now wait on the device like the other device jobs, instead of going to the cloud.
- Switch on: mode, parameters and text are unchanged (`PREFER_ON_DEVICE`, `inCloudParams.model`, the same text through `cloudService()`).
- Ledger: a rewrite press with the switch off is now recorded as `ONLY_ON_DEVICE` (test tests/unit/rewriteScreen.test.ts updated).
- Tests: tests/unit/rewriteSwitchOff.test.ts, real `rewriteSdk`, real firebase packages, fetch spy.
