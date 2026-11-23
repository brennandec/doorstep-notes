# Hostile review

D1 · blocker · BRIEF Rule 5 / H2 vs drafting R1.3, R9.1 and egress-check R6.4 · "no request carries a listed name, a masked value or the raw note" · H2 as written requires a real cloud call to prove what leaves; while the AI service is off, every cloud job is a double and no request exists, so H2 cannot be satisfied by the specs as sequenced (OPEN-QUESTIONS 10 admits this). · FIX: enable the AI service and run H2 part B with invented people before claiming H2, or restate H2 as "no request carries… in the double run" and record the real-call proof as a miss.

D2 · blocker · BRIEF Rule 10 / drafting R3.2, shell R2.2 · "tier: not decided" · The brief requires the page and README to state which tier the hosted demo uses; a placeholder is not a statement, and the app would be making a claim it cannot prove about its own tier. · FIX: set the tier before the demo, or remove the hosted demo claim and say "not hosted".

D3 · blocker · BRIEF step 6 / egress-check R3.1 vs masking R2.2, R3.1 · "Matching is exact; the check does not use case folding or near match" · The masking pass masks case-insensitively and by near match, but the egress check only catches exact forms plus lower/upper; a masked value that survives in mixed case or as a near match will not be caught, so the printed "0 of M" can be false. · FIX: check every masked value in the exact form it was replaced with, and state in the line that near-match variants are not checked.

D4 · blocker · BRIEF step 3 / masking R4.1, design "Flow" step 4 · "the model sees placeholders where listed names were" · The propose-masks job is given text with listed names already replaced, so it cannot propose "other names" that are the same person's nickname unless the nickname is on the list; the brief asks the device to propose further names, which this design prevents. · FIX: run the propose job on the raw record text on device and merge candidates with the exact pass.

D5 · blocker · BRIEF "What it must be" / measurement R3.1, design "Flow" step 3 · "runs the device pass on text that already has exact masks applied" · The device pass is measured on already-masked text, so its catch rate is not the catch rate the app achieves on a raw note; the figure shown would be a claim the app cannot prove. · FIX: measure the device pass on the raw synthetic note and report exact and device separately on the same input.

D6 · major · BRIEF H8 / capture R9.1, measurement R6.1 · "at most 60 seconds on the author's computer" · H8 is defined against one machine and one downloaded model; the spec records it as a results file but the acceptance is not reproducible and the page would show a number that describes only the author's laptop. · FIX: state H8 as a target with the machine named in the results file, and show "not measured" on any other machine.

D7 · major · BRIEF step 2 / capture R3.1, design "Inference mode" · "expected input `text` and `image`" · The create options declare image input for every structure call, including typed notes; on a device without multimodal support this can raise NotSupportedError for a text-only note (sdk-facts 30). · FIX: declare image input only when a photo is attached.

D8 · major · BRIEF step 2 / capture R6.1 · "The guard uses a character bound, not token counting" · A character bound cannot be tested against the 9216-token limit; the requirement is untestable as written and the "not measured" bound means the guard may never fire correctly. · FIX: measure the bound in a real-browser run and record it in a results file before shipping the guard.

D9 · major · BRIEF step 4 / drafting R1.3, design "Network and device states" · "Offline, model available | short device draft" · `PREFER_IN_CLOUD` does not wait for the device model and falls back to cloud; with the network off the SDK has no cloud to fall back from, and the spec does not say how the offline device draft is actually produced (sdk-facts 12). · FIX: specify a separate `ONLY_ON_DEVICE` call for the offline draft, or state that the fallback is the SDK's and test it.

D10 · major · BRIEF step 5 / drafting R6.2, masking design "Pronouns" · "Only rewriting of pronouns the draft marks with tokens" · The brief says pronouns come from the client list entry; the design only rewrites tokens the model was asked to emit, so free-text pronouns in the draft are not restored and the finished note can show the wrong pronoun. · FIX: state that pronoun restoration is limited to tokens and show a visible note when the draft contains no tokens.

D11 · major · BRIEF step 7 / second-reader R3.1 · "the value is not stored" · The reply is shown on screen and the evidence quotes are tappable; nothing in the spec prevents the reply text (which may contain a listed name) from being rendered, copied or screenshotted, and the guard only stops storage. · FIX: redact the matched value in the displayed reply, not only in storage.

D12 · major · BRIEF Rule 5 / shell R4.4, design "Offline" · "It ignores requests to Firebase and Google domains" · The service worker ignoring Firebase requests means the app cannot tell offline from a failed cloud call, and the "offline" text state may be wrong; also the cache rule does not prove no user data is cached. · FIX: detect offline from `navigator.onLine` and a failed probe, and assert the cache contents by name in the test.

D13 · major · BRIEF Rule 7 / shell R5.1, design "Config handling" · "The loader reads the local file in development and tests" · A Vite build that imports the local file will inline the values into built output; the spec says the build does not copy the file but does not say how the loader avoids bundling it. · FIX: load the config at runtime from a non-bundled path and add a build test that greps the output for the placeholder values.

D14 · major · BRIEF H1 / capture tasks 10, 12 · "Record a miss if the model is not downloaded" · H1 and H8 are marked real-browser but the tasks allow recording a miss; the acceptance says "works", so a miss is a failure, not a pass. · FIX: state that H1 and H8 fail if the model is not present, and record the failure.

D15 · major · BRIEF step 6 / egress-check R4.4 · "a failure blocks the Send button" · The preview check runs before sending, but the check is defined on the bytes sent; blocking Send on a preview means the user cannot send even when the failure is a false positive from a listed name that is legitimately in the masked text. · FIX: allow the user to override with a plain warning, or define the preview check on the masked text only.

D16 · major · BRIEF "Measured, not asserted" / measurement R5.5 · "every number in README matches a results file" · The README also contains the tier line, the 44 px target, the 60 s target and the 22 GB figure; these are numbers not from results files and the test as written would fail or be bypassed. · FIX: scope the test to measured figures and list the fixed numbers as constants with their source.

D17 · minor · BRIEF step 3 / masking R2.3 · "Parts of a full name … are also masked when they are 3 letters or longer" · Masking a 3-letter surname part will mask common words and inflate false masks; the measurement spec counts false masks only for the device pass, so this is not measured. · FIX: count false masks for the exact pass too, or raise the minimum part length.

D18 · minor · BRIEF step 6 / egress-check R3.2 · "N of M listed names in the text sent" · M counts listed names and masked values together, but the line says "listed names"; the second line gives masked values, so the first line's M is ambiguous and the printed sentence is not true to its count. · FIX: make the first line count listed names only and the second line masked values only.

D19 · minor · BRIEF step 4 / drafting R2.2 · "A unit test compares the displayed string with the string given to the job" · The displayed string is the outgoing text, but the job receives `DraftInput` with `maskedRecord` and `placeholders`; the test cannot compare a string to an object. · FIX: define the exact string passed to the job and compare that.

D20 · minor · BRIEF step 2 / capture R5.5 · "Availability is read by `LanguageModel.availability()`" · The Firebase SDK wraps the Prompt API; calling `LanguageModel.availability()` directly bypasses the SDK and may not match the SDK's own availability check. · FIX: use the SDK's documented availability path, or state that the direct call is intentional and tested.

D21 · minor · BRIEF step 1 / capture R2.1 · "Only JPEG or PNG photos can be read on this device." · The line is shown for any other file type, but the brief allows a photo of a handwritten page; a HEIC photo from a phone is refused with a line that does not say how to convert it. · FIX: add "Convert it to JPEG or PNG first."

D22 · minor · BRIEF Rule 8 / shell R1.4 · "A test scans `src/`, `public/` and README for emoji ranges" · The test scans source and README but not the built output or the video script; an emoji in a built string or the demo script would pass. · FIX: scan the built output and the demo script too.

D23 · minor · BRIEF step 7 / second-reader R2.1 · "quoted spans from the text" · The model is asked to return exact quotes, but the spec does not say what happens when the model paraphrases; the design drops quotes not found, which can leave an empty guess list with no explanation. · FIX: show a plain line when all quotes are dropped.

D24 · minor · BRIEF "Later, for the agentic web entry" / all specs · "Keep each job behind a small, clean interface" · The interfaces are defined per spec, but the second-reader and rewrite jobs are not listed in the shell `InferenceKit` table with their modes and what leaves the device, so the README table would be incomplete. · FIX: add rewrite and second-reader rows to the README table source.

D25 · minor · BRIEF Rule 9 / shell tasks 1–17 · "Nothing is pushed, hosted or published by a build session" · Task 14 runs a real-browser install check against a hosted page, which requires hosting; the spec does not say how the page is served without publishing. · FIX: serve the built app from a local static server for the install check and state that no hosting occurs.

## MISSING

- H3 seeded-leak test is specified (egress-check R4.3, task 10) but no requirement covers the red-text rendering in a real browser with the words; the acceptance says "prints a failure in red text and words" and the spec only asserts the words.
- H7 install criteria: the brief says "passes the browser's install criteria"; the spec lists manifest fields but no requirement names the criteria or the test that checks them.
- The brief's "one accent colour" and "large type" are in shell R1.2, but no requirement covers the "drawn controls" (icons drawn, not images) or the "plain light interface" beyond a colour word.
- The brief's "Every screen, the README and the video are about this one person" — no spec covers the video or the demo script.
- The brief's "Demo content stays plain and undramatic" — no requirement or test enforces the content rules (no injuries, no court language).
- The brief's "No other runtime dependency without a written reason" — shell R8.2 covers it, but no task writes the decisions note for the Firebase SDK itself or Vite.
- The brief's "A table in the README lists each job, its mode and what leaves the device" — shell R7.1 covers it, but the rewrite and second-reader jobs are missing from the design's summary table.
- The brief's "The page and README state which tier the hosted demo uses" — covered only by a placeholder (D2).
- The brief's "the app says this in plain words wherever something is about to be sent" — drafting R3 covers the draft and second-reader, but the rewrite cloud fallback (drafting R7.3) is not covered by a notice requirement in the rewrite spec.

## BUILD ORDER

1. shell-and-offline task 1 (scaffold, pinned versions)
2. shell-and-offline task 2 (.gitignore and example config)
3. shell-and-offline task 3 (config loader)
4. capture-and-record task 1 (types and schema)
5. capture-and-record task 4 (device model wrapper and double)
