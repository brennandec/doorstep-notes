# SDK facts

Read on 2026-11-12. Each fact lists its source and the date it was read. Sources are only firebase.google.com and developer.chrome.com. Abbreviations: FGS = https://firebase.google.com/docs/ai-logic/hybrid/web/get-started ; FCO = https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options ; CPA = https://developer.chrome.com/docs/ai/prompt-api ; CGS = https://developer.chrome.com/docs/ai/get-started .

Page dates as printed: FGS and FCO "Last updated 2026-11-12 UTC". CPA "Last updated 2026-08-26 UTC" in the footer and "Last updated: October 21, 2026" in the header. CGS "Last updated 2024-05-20 UTC" in the footer and "Last updated: May 20, 2025" in the header.

Not read: the Firebase structured output page for web (https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output). The fetch returned only navigation text. Structured output support on device is taken from FGS, which lists it. Schema syntax is unverified.

## Platform and versions

| # | Fact | Source | Read |
|---|---|---|---|
| 1 | On-device inference through Firebase AI Logic is supported for web apps on Firebase AI Logic SDK v12.5.0 or later, in Chrome on Desktop version 139 or higher. | FGS | 2026-11-12 |
| 2 | In-cloud inference uses the Gemini Developer API or the Agent Platform Gemini API (formerly Vertex AI). On-device inference uses Chrome's Prompt API. | FGS | 2026-11-12 |
| 3 | The `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` flag must be set to Enabled and Chrome restarted, per the localhost steps. | FGS | 2026-11-12 |
| 4 | On-device needs enough storage for the first model download. The end user must run desktop Chrome with the required flags enabled. | FGS | 2026-11-12 |
| 5 | Chrome's Prompt API hardware list: Windows 10 or 11, macOS 13 or later, Linux, or ChromeOS on Chromebook Plus. At least 22 GB free on the Chrome profile volume. GPU with strictly more than 4 GB VRAM, or CPU with 16 GB RAM and 4 cores. Unmetered network for the first download. If free space drops below 10 GB after download, the model is removed and downloaded again once requirements are met. | CPA, CGS | 2026-11-12 |
| 6 | After the first download, use of the model needs no network. Chrome states no data is sent to Google or any third party when using the model. (Quoted claim from Chrome; do not repeat it as an app claim.) | CPA, CGS | 2026-11-12 |
| 7 | The Prompt API on the web is listed as Chrome 148; for extensions Chrome 138. A sampling-parameter origin trial is listed for Chrome 148. | CPA | 2026-11-12 |
| 8 | From Chrome 149 the models support English, Spanish, Japanese, German and French for input and output text. The Prompt API accepts "en", "ja", "es", "de", "fr" in expected input and output languages. | CGS, CPA | 2026-11-12 |
| 9 | By default the Prompt API is available only to top-level windows and their same-origin iframes. It is not available in Web Workers. | CPA | 2026-11-12 |

## Model download and activation

| # | Fact | Source | Read |
|---|---|---|---|
| 10 | `initializeDeviceModel()` must be called after or on an end-user page interaction such as a button click, and before any query such as `generateContent()`. It takes an optional progress callback receiving a fraction. | FGS | 2026-11-12 |
| 11 | The download can take several minutes. If the model is not yet downloaded, `initializeDeviceModel()` starts it in the background. | FGS | 2026-11-12 |
| 12 | Calling `generateContent()` before the download completes: `ONLY_ON_DEVICE` waits for the download, then answers on device. `PREFER_IN_CLOUD` and `PREFER_ON_DEVICE` do not wait and fall back to the cloud model. `ONLY_IN_CLOUD` uses the cloud model. | FGS | 2026-11-12 |
| 13 | `LanguageModel.availability()` returns `unavailable`, `downloadable`, `downloading` or `available`. Pass the same options to `availability()` as to `prompt()`. | CGS, CPA | 2026-11-12 |
| 14 | If the model is `downloadable` or `downloading`, `create()` needs user activation (a tap, click or key press since page load). | CGS | 2026-11-12 |
| 15 | Troubleshooting: restart Chrome, open `chrome://on-device-internals`, check the Broker State tab, then run `LanguageModel.availability()` in DevTools. | CGS | 2026-11-12 |

## Capabilities

| # | Fact | Source | Read |
|---|---|---|---|
| 16 | On device: single-turn text generation only (not chat), streaming or not. Supported: text from text, text from text plus image (JPEG and PNG only), structured output (JSON and enums). | FGS | 2026-11-12 |
| 17 | Not yet supported on device: image generation, image types other than JPEG and PNG, audio, video and PDF input, files by URL (inline data only), multi-turn chat, tools (function calling, code execution, URL context, grounding). In `PREFER_ON_DEVICE` many of these fall back to the cloud; `ONLY_ON_DEVICE` throws for several. | FGS | 2026-11-12 |
| 18 | Not supported for hybrid at all: Gemini Live API, server prompt templates, count tokens. | FGS | 2026-11-12 |
| 19 | For on-device inference the maximum token limit is 9216 tokens (stated in the text-and-image section). | FGS | 2026-11-12 |
| 20 | AI monitoring in the Firebase console shows no data for on-device inference. Cloud inference is monitored as usual. | FGS | 2026-11-12 |
| 21 | Image input is passed as an inline part: `{ type: "inlineData", inlineData: { data: <base64>, mimeType } }`, in an array after the text prompt. | FGS | 2026-11-12 |
| 22 | Chrome's own Prompt API takes a JSON Schema in `responseConstraint` on `prompt()` or `promptStreaming()`. The schema uses part of the context window unless `omitResponseConstraintInput` is set. | CPA | 2026-11-12 |
| 23 | Chrome's context overflow: oldest prompt and response pairs are dropped, except the system prompt. If it still cannot fit, the call fails with `QuotaExceededError` (properties `requested`, `contextWindow`). | CPA | 2026-11-12 |

## Modes, source label and models

| # | Fact | Source | Read |
|---|---|---|---|
| 24 | `InferenceMode.PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`, passed as `mode` to `getGenerativeModel(ai, { mode })`. "Only" modes throw when their side is unavailable. | FGS, FCO | 2026-11-12 |
| 25 | Imports: `getAI`, `getGenerativeModel`, `GoogleAIBackend`, `InferenceMode` from `firebase/ai`. `const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() })`. | FGS | 2026-11-12 |
| 26 | `result.response.inferenceSource` is `ON_DEVICE` or `IN_CLOUD`, available from JS SDK v12.5.0. | FCO | 2026-11-12 |
| 27 | The default cloud model is `gemini-3.5-flash-lite`, stated as the default starting with JS SDK v13.0.0. It is the fallback for `PREFER_ON_DEVICE` and the default for `ONLY_IN_CLOUD` and `PREFER_IN_CLOUD`. | FCO, FGS | 2026-11-12 |
| 28 | `inCloudParams: { model, generationConfig }` overrides the cloud model and configures it. | FCO | 2026-11-12 |
| 29 | `onDeviceParams: { createOptions: { expectedInputs, expectedOutputs, initialPrompts } }` configures the device model. The system prompt is an `initialPrompts` entry with `role: "system"` and content `[{ type: "text", value }]`. | FCO | 2026-11-12 |
| 30 | Chrome's `expectedOutputs` allows type `text` only. `expectedInputs` types are `text`, `image`, `audio`. An unsupported input or output can raise a `NotSupportedError` DOMException. | CPA | 2026-11-12 |
| 31 | Banner on the Firebase pages: Gemini 2.5 models are deprecated or shut down. Models named as current: `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`. | FGS, FCO | 2026-11-12 |

## App Check and project setup

| # | Fact | Source | Read |
|---|---|---|---|
| 32 | Banner: starting November 2, 2026, Firebase App Check enforcement is required to use Firebase AI Logic. | FGS | 2026-11-12 |
| 33 | The console guided setup (AI Services, AI Logic, Get started) enables the required APIs and automatically enforces App Check for AI Logic. Check Security, App Check, APIs tab: if the AI Logic row says Unenforced, enforce it. | FGS | 2026-11-12 |
| 34 | Local development: set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before `initializeAppCheck(...)`; read the printed debug token from the console; register it under App Check, Apps, Manage debug tokens. | FGS | 2026-11-12 |
| 35 | Keep the debug token and debug build private. Do not commit the token. Do not add localhost to the reCAPTCHA allowed domains. | FGS | 2026-11-12 |
| 36 | To release to end users, register the app with a production App Check attestation provider. The page names Play Integrity as an example; the web provider is on the App Check page, which was not read. | FGS | 2026-11-12 |
| 37 | The page recommends the Gemini Developer API as the way to start at no cost, and says the Agent Platform Gemini API can be set up later and requires billing. | FGS | 2026-11-12 |
| 38 | The SDK is installed with `npm install firebase`. | FGS | 2026-11-12 |

## Where the documentation differs from the brief

1. Cloud model default and SDK version. The brief gives SDK 12.5.0 as the floor and `gemini-3.5-flash-lite` as the default. The documentation says that default applies starting with v13.0.0. On a 12.x SDK the default may differ. Documentation wins: use v13.0.0 or later, and still set `inCloudParams.model` explicitly (from Remote Config, as the brief intends).
2. `ONLY_ON_DEVICE` when the model is not yet downloaded. The brief says it throws when the device model is unavailable. The documentation says that, during a download, the request waits and then answers on device, which may take minutes. Throwing applies when the device cannot use the model. The app must show download progress and not treat a wait as a failure.
3. Chrome flag. The brief names Chrome 139 only. The documentation also requires enabling `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restarting Chrome. The first-run line about getting the device model must say this.
4. Chrome version. Firebase says desktop Chrome 139 or later. Chrome's Prompt API page lists the web API as Chrome 148. The two pages do not explain the gap. Not resolved by reading. It must be checked on the author's Chrome (acceptance H1).
5. Hardware. The brief gives no hardware limits. Chrome lists 22 GB free storage, more than 4 GB VRAM or 16 GB RAM and 4 cores, and an unmetered network for the download. These belong in the "what the device model would add and how to get it" line and in the README.
6. Token counting. The brief lists counting tokens under "not on device". The documentation lists it as not supported for hybrid at all, in any mode, because counts differ between cloud and device.
7. Token limit. The brief gives none. The documentation states a maximum of 9216 tokens for on-device inference. Long notes and photos may exceed it. The structuring job needs a length check and a plain message.
8. Other limits not in the brief. Files must be inline for on-device. The Prompt API does not run in Web Workers. The Firebase console does not monitor on-device calls. Languages are limited to en, es, ja, de, fr.
9. System prompt. The brief says `createOptions` takes "a system prompt". In the documented example it is an `initialPrompts` entry with role system.
10. App Check. The brief says it must be enforced. The documentation says enforcement became required on 2026-11-02 and that the console setup turns it on. The brief's note that a hosted page needs a production attestation provider matches, but the only provider the Firebase page names is Play Integrity, which is for mobile. The web provider is unverified here.
11. Rule 10 (no-cost tier terms). The pages read say only that the Gemini Developer API is the no-cost way to start. They do not state the data-use and reviewer terms the brief describes. This could not be confirmed from the allowed sites. See OPEN-QUESTIONS.md.
12. Remote Config for model names and the Firestore ledger store. The brief names both. The Firebase pages read link a "Change model name remotely" page, which was not read. Not verified.
13. Date check. The brief says its facts were read 2026-11-12. The Firebase pages read today show "Last updated 2026-11-12 UTC". No change to the facts the brief lists was found, apart from items 1 to 10.


## Structured output page, second reading (capture-and-record task 1)

Tried on 2026-11-12 (local time, 21:55 UTC-8) for https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output.

Could not be read. The web fetch tool was refused in this session ("tool permission approval is not supported in non-interactive mode"), so no page text was received. Nothing below comes from the page.

What was read instead, from the installed package `@firebase/ai` (firebase 13.0.0, `dist/ai-public.d.ts` and `dist/esm/index.esm.js`, read on the same date). This is the SDK's own type file and code, not the documentation, and it has not been run in a real browser.

| # | Fact | Source |
|---|---|---|
| 39 | `HybridParams` is `{ mode, onDeviceParams?, inCloudParams? }`. `OnDeviceParams` is `{ createOptions?, promptOptions? }`. | `ai-public.d.ts` |
| 40 | `LanguageModelPromptOptions` is `{ responseConstraint?: object }`. The on-device adapter passes `onDeviceParams.promptOptions` straight to `session.prompt()`. So on device, a JSON Schema goes in `onDeviceParams.promptOptions.responseConstraint`. | `ai-public.d.ts`, `index.esm.js` |
| 41 | For the cloud, `generationConfig` takes `responseMimeType: "application/json"` with `responseSchema` or `responseJsonSchema`. The on-device adapter code read does not map `generationConfig` to the Prompt API. | `ai-public.d.ts`, `index.esm.js` |
| 42 | The adapter calls `availability()` with `onDeviceParams.createOptions`, so the availability options and the create options are the same object. | `index.esm.js` |
| 43 | `ONLY_ON_DEVICE` with state `unavailable` throws an `AIError` (API not enabled); with `downloadable` or `downloading` it waits for the download promise. | `index.esm.js` |

Status of the structured-output syntax: NOT CHECKED IN A REAL BROWSER and not confirmed by the documentation page. The structure job uses `onDeviceParams.promptOptions.responseConstraint` (fact 40). Capture-and-record task 8 (DEVICE MODEL) is the check that settles it; it was not run in this session.
