# The browser on this computer (2026-11-13, rewritten 06:05 UTC)

What the product owner observed on the author's computer, and what build sessions do about it. This version replaces the one written at 05:20 UTC, which said no device model could run here. That is no longer true.

## State now

- **Google Chrome 157.0.8103.79 is installed** in the Applications folder (installed 2026-11-13 05:54 UTC from Google's own download; signature and notarization checked before the first run).
- **The built-in model is downloaded** in the profile folder `.browser-profile/` in this workspace (ignored by git). It went from `downloadable` to `available` after one click, in 4.5 minutes. No Chrome flag was set.
- **It runs headless**, driven by Playwright 1.65.0.
- **It runs through the Firebase JS SDK 13.0.0.** Results files: `results/device-model-probe-2026-11-13-raw-api.json` and `results/device-model-probe-2026-11-13-firebase-sdk.json`. The script that produced the second one is `docs/probes/probe-firebase-sdk-on-device.mjs`: copy its launch and its request recorder.

## The launch that works

```js
chromium.launchPersistentContext(profileDir, {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ignoreDefaultArgs: true,
  args: [`--user-data-dir=${profileDir}`, '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check',
         '--use-mock-keychain', '--password-store=basic', '--headless=new', 'about:blank'],
});
```

- `ignoreDefaultArgs: true` matters: Playwright's own switches turn the component updater off, and with them a testing build reported `unavailable`.
- One browser at a time on `.browser-profile/`. Run DEVICE MODEL checks one after another and close the browser after each file.
- Never delete `.browser-profile/`. Never start a model download in a session. If the state is not `available`, record a miss with the state and stop.
- Headless only. No browser window may open on the screen during a build session.

## Observed through the Firebase SDK (placeholder project config, every outside request refused)

| Call | Result | Source reported | Time |
|---|---|---|---|
| `model.initializeDeviceModel()` from a click | resolved, no progress calls (already downloaded) | | 1.6 s |
| `ONLY_ON_DEVICE`, plain text, first call after launch | "Ready." | `on_device` | 8.1 s |
| `PREFER_ON_DEVICE`, "rewrite in plainer words" | four options and a recommendation, not one sentence | `on_device` | 2.8 s |
| `ONLY_ON_DEVICE`, record with `onDeviceParams.promptOptions.responseConstraint` (a JSON Schema object) | JSON that parses, with exactly the schema's keys | `on_device` | 3.4 s |
| `ONLY_ON_DEVICE`, system prompt in `onDeviceParams.createOptions.initialPrompts` | obeyed | `on_device` | 0.2 s |
| `ONLY_ON_DEVICE`, text plus a PNG as `inlineData`, with `expectedInputs` naming image | three printed lines typed out exactly | `on_device` | 1.2 s |
| `ONLY_IN_CLOUD` | one POST to `https://firebasevertexai.googleapis.com/v1beta/projects/<project>/models/gemini-3.5-flash-lite:generateContent`, refused by the probe | | |

Browser start to page: 5.4 s. Click to all seven calls done: 17.4 s.

## Facts the code must use

1. `response.inferenceSource` is the string `on_device` or `in_cloud` (the SDK exports `InferenceSource`). Compare against the export, not against upper-case text.
2. Structured output on the device: `onDeviceParams.promptOptions.responseConstraint` with a plain JSON Schema object. This is the answer to the open question about schema syntax.
3. The six device calls made **no** outside request. The cloud call goes to the host `firebasevertexai.googleapis.com`. The request recorder for the egress check watches that host; a test asserts that device jobs produce no request at all.
4. The raw browser session shows `contextWindow` 9216 and `contextUsage`; there is no `inputQuota`, no `measureInputUsage` and no `LanguageModel.params()` in this Chrome. The SDK shows none of them. So the length guard (ruling 9) cannot count tokens: rely on the model's own error and a character bound measured later.
5. A bare rewrite prompt returns a list of options. Every device job states the exact output wanted, or uses a schema.
6. The picture test used printed text drawn on a canvas, not handwriting. Handwriting is not yet observed.
7. First-run instructions may now state what was observed: Chrome 157, no flag set, one click, 4.5 minutes for the download on this computer's connection. Nothing else.

## Ruling 23: device jobs and cloud jobs are switched separately

A device job calls the SDK whenever the browser reports the model `available`, whether or not the cloud service is enabled. A cloud job uses the test double and says "not connected" until the service is enabled on the project. One switch for each side, shown separately in the status bar. Observed: the device jobs work with a placeholder project config.

## Ruling 24: a model's output is text like any other, and it can add names

In one run the device model wrote "Daniel Okafor" where the rough note said only "her son Daniel". So:

- Everything a model returns (the record, a draft, a rewrite) goes through the same masking as the note before it is shown in the outgoing text or sent.
- A name in a model's output that is not in the note or the client list is marked "added by the model" and is never restored into the finished note without the person's press.
- The egress check scans for each listed full name, each listed other name, and each single part of a listed name of three letters or more, ignoring case.

## Kinds of real-browser task

- **BUNDLED**: Playwright's bundled Chromium, headless, no device model. Playwright stays pinned to 1.65.0.
- **DEVICE MODEL**: Google Chrome with the built-in model through the launch above. These now run for real. A miss is recorded only when the state is not `available`, with the state, and is never reported as a pass.

## Ports

Another project on this computer builds and serves at the same time. Serve this app, built or in development, on port 4311 only, with the strict port option, and stop the server when the check ends. If the port is busy, stop and say so; never fall back to a default port, or a check may read another project's page.

## Earlier the same day

Before Chrome was installed, a "Google Chrome for Testing" 153 build from another tool's cache exposed `LanguageModel` but reported `unavailable` under Playwright's default switches and gave no answer with the component updater on. Do not use that build.

## The AI service on the project (rewritten after the first real calls)

- The Gemini Developer API was enabled on the project on 2026-11-13. AI monitoring is off. App Check is enforced for the AI service.
- A debug token for local test runs exists in `appcheck-debug-token.local` in this folder (ignored by git). Never open, print or copy it. Dev and test code may load it at run time; a hosted build never does. A commit that contains it is refused by a guard in this working copy.
- **Observed** (results file `results/cloud-probe-2026-11-13.json`): the token exchange was accepted; one cloud call answered "Ready." with source `in_cloud` in 1.5 s; every call after it was refused with HTTP 403 and the words "The Gemini API free tier is not available for this project. To use the Gemini API, please set up billing". The provider's troubleshooting page says eligibility for its unpaid tier is decided per project and the remedy is billing.
- **So the cloud half is still not available.** Leave `AI_SERVICE_ENABLED` off, keep the cloud jobs on the test double with "not connected", and leave H2 part B and the network-drop task waiting, with this reason: the project is refused the provider's unpaid tier; billing is the product owner's decision and is not made.
- The wiring that worked, for the day billing exists: set `self.FIREBASE_APPCHECK_DEBUG_TOKEN` to the token before `initializeAppCheck(app, { provider: new ReCaptchaV3Provider(<any placeholder>), isTokenAutoRefreshEnabled: false })`. The request for the reCAPTCHA script may fail; the exchange still works. A request recorder must let two hosts through: `content-firebaseappcheck.googleapis.com` and `firebasevertexai.googleapis.com`.
- The tier line reads "not connected" until billing exists. Do not write "unpaid tier": this project has none.
- Two facts for every notice shown before something is sent, and for the README (source: the provider's terms and usage policies, read 2026-11-13): the provider keeps what is sent and what it answers for 55 days to detect misuse, and its staff may read flagged content. What it may do with the content beyond that depends on the tier and is stated only once the tier is known.
