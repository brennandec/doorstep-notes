# Brief: a field notebook for caseworkers (working title "Doorstep Notes")

Product owner's brief for an entry to #BuildHybridAI 2026 (Google · Firebase, deadline 2026-11-30 14:00 Pacific) and, extended later, the Open Agentic Web Challenge (2027-01-11). The name is a working title and is not settled; an earlier working title was dropped because it is close to a well-known notebook brand. The Firebase project exists: project ID `doorstep-notes`, one registered web app, a linked Hosting site of the same name, no Analytics. The AI service is not enabled on it yet.

## The person

A caseworker (social worker, housing officer, outreach worker) finishes a home visit. There is no signal in the stairwell or the car park. She has rough notes: a few lines typed on her laptop, or a page of handwriting. By tonight she owes a formal case note. Her employer forbids putting a client's name into a cloud AI tool, so today she writes it all by hand, after hours.

Every screen, the README and the video are about this one person. Demo content stays plain and undramatic: a housing visit, a missed appointment, a benefits form. No injuries, no court language, no real people.

## What it does

1. **Capture, offline.** She types her rough note or adds a photo of her handwritten page (JPEG or PNG). Nothing is sent anywhere.
2. **The device makes it a record.** The browser's built-in model turns the rough note into a structured visit record: date, who was present (as tags), what was seen, what was agreed, risks, next steps. This runs on the device only.
3. **The device masks.** Her own client list (names she pasted once, kept only in this browser) is masked by exact and near match with no model involved. The built-in model then proposes further things to mask: other names, places, dates of birth, and describing phrases that could identify someone ("her twin brother"). She can tap any word to mask it or unmask it.
4. **The cloud writes, when there is a connection.** The formal case note is drafted from the masked record. Offline, a shorter draft is made on the device and labelled as such.
5. **The device puts the names back.** The finished note shows real names, restored locally, with pronouns from the client list entry.
6. **One line of proof.** Before sending she sees the exact text that will leave. After sending, an egress check scans the request body the browser actually sent for every listed name and for the original of every masked value, ignoring case, and prints the result, for example: "0 of 28 listed names in the text sent. Checked on the bytes. Near variants that were not masked are not checked." It is called an egress check. It never says that nothing private left, and the page says why: unlisted details can still identify a person.
7. **A second reader.** On request, the cloud model is asked to guess who the masked text is about. What it can still infer is shown, so she can mask more.

## How hybrid inference is used (this is the technical heart; all four modes have a job)

Facts from Firebase's documentation, read 2026-11-12 (https://firebase.google.com/docs/ai-logic/hybrid/web/get-started and .../hybrid/web/configuration-options). Check them again before designing; where the documentation and this brief differ, the documentation wins and the difference is written down.

- On-device inference needs the Firebase JS SDK 12.5.0 or later and Chrome on desktop 139 or later. It uses Chrome's Prompt API. `initializeDeviceModel()` must be called after a user action and before the first prompt. The model may need a download of several minutes.
- On device: single-turn text generation only (no chat), streaming or not; text input; text-and-image input with JPEG or PNG given inline; structured output (JSON and enums). Not on device: audio, video, PDF, tools, multi-turn chat, counting tokens.
- Modes: `PREFER_ON_DEVICE`, `ONLY_ON_DEVICE` (throws when the device model is unavailable), `PREFER_IN_CLOUD` (falls back to the device), `ONLY_IN_CLOUD`. Each response carries `inferenceSource`: `ON_DEVICE` or `IN_CLOUD`.
- The default cloud model is `gemini-3.5-flash-lite`; `inCloudParams.model` overrides it. `onDeviceParams.createOptions` takes expected inputs and outputs and a system prompt.
- App Check must be enforced for AI Logic. Local development uses the debug provider; a hosted page needs a production attestation provider.

| Job | Mode | Why |
|---|---|---|
| Structure the rough note or the photo into the visit record (JSON schema) | `ONLY_ON_DEVICE` | if the device model is missing the app says so and offers typing into the record by hand |
| Propose more things to mask | `ONLY_ON_DEVICE` | exact-match masking of the client list works without any model |
| Draft the formal note from the masked record | `PREFER_IN_CLOUD` | best prose online; a shorter device draft offline, labelled |
| Small rewrites of one masked sentence (shorter, plainer) | `PREFER_ON_DEVICE` | instant and free on the device; cloud where there is no device model |
| Second reader: guess who this is about | `ONLY_IN_CLOUD` | the point is an outside reader |

Every result on screen carries a small label from `inferenceSource`: "on this device" or "in the cloud". A table in the README lists each job, its mode and what leaves the device.

Other Firebase parts: App Check (required). In this version masked records are not stored in the cloud. Raw notes and the client list are not stored in the cloud in this version.

## What it must be

- A web app for Chrome on desktop, installable, working offline for capture, structuring, masking and the device draft. Hosted (Firebase Hosting). TypeScript, Vite, the Firebase JS SDK; tests with Vitest; real-browser checks with Playwright. No other runtime dependency without a written reason.
- One screen with three zones: her note and the record with tags; the outgoing text with the egress check line; the finished note. Plain light interface, large type, one accent colour, drawn controls with visible focus, at least 44 px targets. It must look like a finished product a tired person can use at 9 pm.
- First run without the device model must still be useful: exact-match masking, cloud drafting, and a clear line saying what the device model would add and how to get it.
- Measured, not asserted: a script builds a synthetic set of about 200 rough notes with known names (invented people only) and reports how many identifiers the exact-match pass and the device pass each catch, with the misses listed. Results files; the app shows the figure with its date and browser. A figure that was not measured reads "not measured".

## Rules

1. Textbook constructs only: SHA-256 of the outgoing text, a plain append-only list, exact string matching with case folding, and an edit distance of 1 for names of five letters or more. No receipt or chain format of any kind beyond that.
2. Invented people only, in tests, examples, screenshots and video. No real names, no real client data, ever.
3. The licence is the MIT file already in this folder. Do not change it. Third-party files keep their own notices.
4. No claim of compliance with any law or standard. The app is a writing aid with an egress check.
5. A real-browser run records every network request and asserts none carries a listed name or the raw note. The assertion names a listed name and the raw note; it does not name the photo.
6. Honest wording: "egress check on listed names", never "safe", "private by design", "anonymised" or "guaranteed".
7. No project keys or tokens in the repository. The Firebase web config is read from `firebase.config.local.json` in the project root, which is ignored by git and already holds the real values; `firebase.config.example.json` holds placeholders and is committed. Never print, log or copy the values of the local file. Until the AI service is enabled on the project, model calls go through the SDK's documented interface with a test double, and every place that does so says "not connected" on screen.
8. Plain words in everything a person reads. No emoji. No number on the page or in the README without a results file.
9. Nothing is pushed, hosted or published by a build session.
10. The no-cost tier of the cloud model has terms that matter here: what is sent may be used by the provider to improve its products and may be read by reviewers, and the provider says not to send sensitive or personal information on that tier. So: the app says this in plain words wherever something is about to be sent; the demo uses invented people only; the README says that real use needs the paid tier and what changes with it. The page and README state which tier the hosted demo uses.

## Acceptance (numbers)

| # | Check | Number |
|---|---|---|
| H1 | Real Chrome with the built-in model: type a rough note offline, get a structured record and masks | works with the network off; every result labelled "on this device"; recorded as a failure, with its reason, when the device model is absent |
| H2 | Network recording during a full run. Part A: against the test double. Part B: against the real cloud service, invented people only | 0 requests carry a listed name, the original of a masked value, or the raw note. Until part B has run, the page and README say "not yet checked against the real service" |
| H3 | Egress check line | computed from the request body the browser actually sent; a seeded leak makes it print a failure in the failure colour and in words, checked in a real browser |
| H4 | Offline draft and online draft | both produced; each labelled with its source |
| H5 | Catch rate on the synthetic set | reported for exact match alone and with the device pass, misses listed |
| H6 | No device model | the app says so in one line and still masks by exact match and drafts in the cloud |
| H7 | Installable and offline after first load | passes the browser's install criteria; capture and masking work with the network off |
| H8 | First useful result from a cold start | at most 60 s on the author's computer with the model already downloaded; recorded as a failure when the device model is absent |
| H9 | Tests and type check | green; real-browser checks green or each miss recorded as a miss |

The owner's rulings of 2026-11-13 (`docs/decisions/2026-11-13-rulings-on-spec-review.md`), the look and layout (`docs/decisions/2026-11-13-look-and-layout.md`) and the browser facts for this computer (`docs/decisions/2026-11-13-browser-on-this-computer.md`) refine this brief. Where they differ from it, they win.

## Later, for the agentic web entry

The structuring, masking, drafting and second-reader jobs become a published network of agents that another site can load, with the same egress check available to any site. Keep each job behind a small, clean interface so this is an extension, not a rewrite.

## Disclosure

This project is written with AI coding tools from specifications. Notes from that work remain under `docs/`. `docs/kiro-sessions` is not in this tree.
