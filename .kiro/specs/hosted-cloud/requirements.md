# Hosted cloud: requirements (session H19, 2026-11-14)

A hosted build says what is true about its cloud. Sources: `docs/decisions/2026-11-14-cloud-tier.md`, `docs/sdk-facts.md` ("App Check and project setup"), the installed typings of `@firebase/ai` (`useLimitedUseAppCheckTokens`) and `@firebase/app-check` (`ReCaptchaEnterpriseProvider`, `CustomProvider`). The owner's console acts (registering the production provider and its site key) and the deploy come after this spec, on his word.

## R1. The debug provider exists only in dev and e2e builds

1. `src/firebase/appCheckDebug.ts` holds the debug path (`initAppCheckDebug`, the debug flag, a `CustomProvider` that gives no token of its own). Only the cloud service loads it, through a dynamic import behind `import.meta.env.MODE !== "production"`. The production build drops the import.
2. The production bundle, `dist/`, holds none of: the name `FIREBASE_APPCHECK_DEBUG_TOKEN`, the word `debug-provider-placeholder`, and the debug token value kept in the local file. The Firebase SDK's own App Check code names the debug global, so the production build renames that name inside `@firebase/app-check` (`stripAppCheckDebug` in `scripts/vitePlugins.ts`). A debug token set on a hosted page then does nothing.
3. A test builds the production bundle into a folder under `test-results/` and fails on any of the three.
4. Dev (`vite`) and e2e (`vite build --mode e2e`) builds keep the debug path the specs rely on: the spec sets `FIREBASE_APPCHECK_DEBUG_TOKEN` before the page starts, and the page keeps it.

## R2. Production uses reCAPTCHA Enterprise with limited-use tokens, or runs device-only

1. When the build config holds `appCheckSiteKey`, a production build starts App Check with `ReCaptchaEnterpriseProvider(siteKey)` and gets the AI service with `useLimitedUseAppCheckTokens: true`.
2. The site key is read from the same config file as the rest (`firebase.config.local.json`, git-ignored; a hosting build writes it into `dist/` with the rest). An empty value, a value in angle brackets (the example file) or a value that is not a string counts as no site key.
3. With no site key a production build starts no App Check and makes no cloud call. The cloud jobs use their test doubles, the page says so, and the status bar reads "Cloud: not configured". No placeholder provider is ever made.
4. In a dev or e2e build a missing site key is not an error: the debug path is used when the config is present.

## R3. One cloudService()

1. `src/firebase/cloudService.ts` initialises the app, App Check and the AI backend once, and is the only place that does. Draft, rewrite and second reader get their model through it. `draftSdk.ts`, `rewriteSdk.ts` and `secondReaderSdk.ts` do not import `firebase/app` or `firebase/app-check`.
2. The device-only jobs keep `deviceOnlyService()`, which makes no call to the project.
3. A failed start (no config, no site key, a module that does not load) is not kept: the next call tries again.

## R4. The status bar's cloud state is derived

1. The state is one of: not configured (no config file, or a production build with no site key), connected (configured, and the last call did not fail), refused (the browser check turned the last call away: "the cloud did not accept this browser"), or failed (the last call failed for another reason, with the status the SDK gave when it gave one).
2. No build constant decides the words. `AI_SERVICE_ENABLED` stays the owner's master permit and the e2e stand-in only turns the cloud off; when the permit is off the old words "not connected" show.
3. Words: "connected" and "not connected" already exist and are kept. New: "not configured" and "last call failed ({detail})". They are in the string table.
4. The bar changes after a call: a failure shows at once, and a later success shows "connected" again.
5. The state counts the config and the last call. It makes no call of its own to find out (no generateContent call, no token request at page load).

## R5. A refused browser sees the refusal where it is looking (order H52, 2026-11-19)

Source: the live page at 390 x 844, measured on 2026-11-19. The refusal line sat 2,921 px above the top of the viewport and the error line in the note column 2,360 px above it, and nothing scrolled to either. The visitor pressed Send, saw nothing change, and had to scroll back past two and a half screens to learn that anything had happened. At 1440 x 900 the three columns put the status bar beside the send control, so the same refusal was in view. The words were right. The placement was wrong.

1. After a cloud call is refused by the browser check (the state of R4.1 that reads "the cloud did not accept this browser"), the line that says so is on screen at the moment it arrives, at any width from 320 to 1440 px, without the visitor scrolling.
2. The line sits in the "What leaves" zone, directly under the row with Draft and Send, as a status line (`data-refused-line`). It does not take focus and it is not an alert; the note column already carries the alert.
3. The refusal line under Send is brought into view when it is outside the viewport, with the nearest edge, and is left alone when it is already inside it, so a desktop page does not jump. Focus does not move. The alert in the note column is not the scroll target: on a narrow page it is about 2,400 px from Send, and scrolling to it would take the line under Send out of view. It stays in the page for a screen reader.
4. The record, the masks, the outgoing text and the device half are unaffected: nothing is cleared, and the device draft is still offered where a device model is present.
5. The words are the existing ones: "The cloud did not accept this browser. Your masked record is kept." (`strings.cloud.browserRefusedDraft`). It says what the refused state means and what is kept, and it holds for a refused draft and a refused second reader alike. No string is reworded and none is added.
6. The line shows only while the cloud state is refused. A later success removes it, as it removes the words in the status bar (R4.4).

