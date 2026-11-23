# DOORSTEP-APPCHECK · why release 18 refuses cloud calls in ordinary Chrome — the mechanism, read in the shipped source

@deepseek · 2026-11-21 · plate 2026-11-21T04:18:09Z, checker @kimi. Branch `appcheck`, from `f4129d8` ("Release 18 public candidate"). Nothing written in @grok1's tree. Nothing deployed.

## Which failure this document is about — read this before the findings

**The live failure is the App Check token exchange, not billing.** The one refusal recorded in *this repository* (`results/cloud-probe-2026-11-13.json`) is `[403 Forbidden] The Gemini API free tier is not available for this project` — but that file is the **2026-11-13 pre-billing probe**, taken before the project could make cloud calls at all. It is eight days older than the failures being explained.

The refusals that matter now are token-exchange 403s, recorded in `ops-bridge/receipts/2026-11-21/doorstep-panel/DOORSTEP-PANEL-journal.jsonl`: three hosted runs failed with App Check 403 and **0 `generateContent` calls**; the panel's headless run saw both exchanges 403 at 19.2 s and then `AppCheck: 403 error. Attempts allowed again after 01d:00m:00s` with no later requests; the desktop-pane run saw 4 of 5 jobs succeed and 1 exchange 403.

Billing and quota stay on the owner's console checklist but are **not** what a judge would hit. RULING 04:24:39Z set this reading and it stands.

## The four findings, first

**1. The 24-hour backoff is real and it is 403-shaped, not score-shaped.** `@firebase/app-check` `0.13.2` (the exact version the lockfile pins) sets `allowRequestsAfter: Date.now() + ONE_DAY` for **any** `403` **or** `404` on a token exchange — `dist/index.cjs.js:1451-1461`. It does not read a reCAPTCHA score; it cannot, because the score is assessed server-side and never reaches the client. **So on this code the client's behaviour after a single 403 is: no further App Check token for 24 hours, on that page.**

**2. The backoff is IN MEMORY ONLY, so a reload clears it.** `this._throttleData = null` is a constructor field (`:1249`), `throwIfThrottled` reads that one field (`:1256`, `:1337`), and the dist contains **zero** occurrences of `localStorage` and never writes throttle state to IndexedDB. **This is the finding that reframes the plate.** A judge who reloads recovers. A judge who does not reload is dead for the session. The 1-in-5 failure rate is therefore consistent with "one refusal early in a session poisons the rest of that session" rather than with "1 in 5 calls are refused".

**3. The app already does the right thing with limited-use tokens and does it correctly.** `cloudService.ts:123` passes `useLimitedUseAppCheckTokens: true` in production. That is the correct setting for a call-per-token backend, and it narrows the window in which a single cached token can be replayed — it is not the cause of the refusals.

**4. The "connected" label is already gated on a real answer, and the fix the plate asks for is largely present.** `cloudService.ts:154-159`: only `inferenceSource === "IN_CLOUD"` clears `browserRefused` and `failure`. A device answer explicitly does **not** clear either (`:157-159` sets the refused state precisely when a 403 was seen on that call), so a device fallback after a cloud failure leaves the failed state showing rather than claiming connection. That is H43c c4-2, already implemented. **What is missing is not the gating — it is that the user is never told what to do about a refusal.**

## What the app ships, read from the config

The plate asks me to read the config the app ships, because the console side is the owner's.

| what | where | state |
|---|---|---|
| App Check provider | `src/firebase/appCheck.ts:11-13` | `ReCaptchaEnterpriseProvider(siteKey)`, `isTokenAutoRefreshEnabled: true` |
| site key source | `src/firebase/cloudService.ts:96` | `readSiteKey({ appCheckSiteKey: result.siteKey })` — from build config, **not** from source |
| limited-use tokens | `src/firebase/cloudService.ts:123` | `useLimitedUseAppCheckTokens: true` **in production only** |
| debug provider | `src/firebase/appCheckDebug.ts` | loaded **only** outside production (`cloudService.ts:190`) |
| production usability gate | `cloudService.ts:98` | `usable = deps.production ? siteKey !== undefined : true` — no key, no cloud, correctly |
| firebase | `package.json` | `13.4.0` |
| `@firebase/app-check` | `package-lock.json` | **`0.13.2`** — installed and verified from `node_modules` |

**The app does not ship a debug token.** `appCheckDebug.ts` is behind `import.meta.env.MODE === "production" ? undefined : import(...)` and the bundler drops it from production. There is no debug token in the shipped config. That satisfies the plate's "no debug token on any public surface" as written.

## What the owner must check in the console — exactly, because I cannot see it

Each line is something only the console shows, paired with the client behaviour it would explain.

| # | check in Firebase Console → App Check → Apps | what a wrong value looks like on the client |
|---|---|---|
| 1 | **reCAPTCHA Enterprise is the registered provider** for the web app, and its **site key matches the one in the build config** | a mismatch is an automatic `403` on every exchange → 24-hour in-memory death on first call |
| 2 | **The service's minimum score threshold.** Enterprise defaults to 0.5 and is configurable per site | in ordinary Chrome, low-interaction users can score under 0.5, and a refused exchange is a 403 like any other. **Ranked first by the desk** — an earlier version of this row called it "the single most likely cause", which I withdrew when the recorded artefact turned out to be a billing error; the desk restored it to first place on the hosted-run evidence, where it belongs |
| 3 | **`manymoats.com` (and the exact host the judge opens, www vs apex) is in the App Check allowed/registered domains** | a missing host = `403` on every exchange, silently |
| 4 | **The API key restrictions on the Firebase API key** — reCAPTCHA Enterprise API must be permitted, and the key must not be restricted to a different referrer list | wrong referrer = `403` |
| 5 | **Enforcement state.** If App Check is *enforced* for the Cloud AI Logic API, every call without a valid token is refused server-side | enforced + broken token = 100 % failure, not 20 % |
| 6 | **Whether the project has hit the reCAPTCHA Enterprise free-tier assessment quota** | quota exhaustion returns an error the client treats as 403-class |

I can name none of these from the repository. Checks 1–4 are the ones that produce the observed 403 pattern on a fraction of sessions.

## The fix, test first — what I would build

The plate says tests first, including the backoff path. The existing code makes this tractable because every boundary is already injected (`loadModules`, `loadConfig`, `loadDebug`, `production`) — a test can drive all six paths without a network or a real Firebase project.

**Test the backoff path explicitly, because it is the one that is invisible today:**

| test | behaviour it pins |
|---|---|
| T1 · a 403 on the first cloud call sets `browserRefused` and leaves it set across a following **device** answer | already implemented (`:157`); pins that a device fallback never reads as connected |
| T2 · a 403 then a **successful** cloud answer clears `browserRefused` | already implemented (`:155-158`); pins that recovery is possible without a reload |
| T3 · **the backoff survives as a state the UI can read**, and the UI offers "reload to clear" | **LANDED at `c2e3c58`** — the copy names the reload and its test asserts the in-memory mechanism it rests on. The app still cannot *query* the throttle: `_throttleData` is private to the SDK and the app cannot see it. The app must infer it: a 403 that repeats with **no** intervening success within N seconds is the backoff signature, since the SDK is not even sending the request |
| T4 · the refusal copy names an action, and the action is one the user can take | **LANDED at `c2e3c58`** — five strings, 8 tests written red-first |

**What T3 means practically.** Because `_throttleData` never persists and is not exposed, the app cannot query "am I throttled". It can only observe: *a second `generateContent` fails in under the SDK's retrial floor with the same 403*. That is the signal a refusal is local (throttled) rather than remote (scored low). **Distinguishing those two is the difference between "try again later" and "reload this page", and telling the user the wrong one wastes the judge's remaining minutes.**

**The recovery copy the plate asks for — WRITTEN AND LANDED at `c2e3c58`.** Five strings in `src/app/strings.ts`, each naming what failed and what to do:

| key | now reads |
|---|---|
| `cloud.refused` | "The cloud service is unavailable right now. Nothing was accepted. Your masked text is kept." — **no mention of a browser**, per the ruling |
| `cloud.browserRefusedDraft` | "The robot check refused this page. Reload the page to reset it. Your masked record is kept." |
| `cloudBrowserRefused` | "the robot check refused this page" |
| `cloudRefused` | "The cloud half is standing by: the robot check refused this page. Reload the page to reset it." |
| `drafting.browserRefusedDeviceDraft` / `drafting.browserRefused` | name the robot check **and** the reload |

**Why "reload" is a measured promise and not a reassuring word.** `@firebase/app-check` `0.13.2` keeps the 24-hour throttle in `_throttleData`, a constructor field (`:1249`), with zero `localStorage` and no IndexedDB write — so a reload genuinely clears it. `tests/unit/appCheckRecoveryCopy.test.ts` states that dependency explicitly: the assertion carries `throttleIsConstructorField: true` and `localStorageOccurrences: 0` beside the copy check, so the sentence cannot survive a change to the mechanism it relies on.

**Test-first, and four old pins moved deliberately.** The 8 copy tests were written before the change and run red: 4 failed against the old strings exactly where predicted. Four existing tests pinned the withdrawn wording (`cloudRefusal`, `h43Offline`, `h43cCloudService`, `h52RefusalVisible`) and were updated — none weakened; `cloudRefusal` now *also* asserts the line contains no "browser". Suite: **247 files / 2844 passed / 2 skipped / 0 failed**.

**The labelled recorded answer as fallback** is the right third option and the app already has a device path; the missing piece is labelling it in the UI as a recorded answer rather than as the model answering.

## What I did not do

- **No deploy.** The ruling says deploy waits for the owner's word and no deployment surface was touched.
- **The console values are not asserted.** Every row in the owner table is a check, not a fact; I cannot see the console.
- **The labelled recorded-answer fallback is not built.** The copy names the recovery; labelling the device path as a recorded answer is the next plate.
- **No console value assumed.** Every row in the owner table is something I cannot see, stated as a check rather than a fact.
- **No deploy.** The plate says deploy waits for the owner's word.
- **The determinism run is still going** in the background and owes its own receipt; this document does not touch it.

## Reproduce

```bash
node -e "console.log(require('./node_modules/@firebase/app-check/package.json').version)"   # 0.13.2
sed -n '1451,1461p' node_modules/@firebase/app-check/dist/index.cjs.js                     # 403|404 -> +ONE_DAY
sed -n '1245,1258p' node_modules/@firebase/app-check/dist/index.cjs.js                     # _throttleData = null
grep -c localStorage node_modules/@firebase/app-check/dist/index.cjs.js                    # 0
sed -n '150,175p' src/firebase/cloudService.ts                                             # the state gate
```
