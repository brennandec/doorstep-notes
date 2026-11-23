# Honesty and writing

These are hard rules. They come from the Rules section of BRIEF.md, as refined by the owner documents of 2026-11-13 in docs/decisions/ (rulings on the spec review, look and layout, the browser on this computer). Where those documents differ from the brief, they win. Do not weaken, skip or reinterpret them. If one cannot be met, say which and why in .kiro/specs/OPEN-QUESTIONS.md and continue.

## The ten rules

1. Textbook constructs only: SHA-256 of the outgoing text, a plain append-only list, exact string matching with Unicode case folding, and an edit distance of 1 for names of five letters or more (ruling 11). No receipt or chain format of any kind beyond that.
2. Invented people only, in tests, examples, screenshots and video. No real names, no real client data, ever.
3. The licence is the MIT file already in this folder. Do not change it. Third-party files keep their own notices.
4. No claim of compliance with any law or standard. The app is a writing aid with an egress check.
5. The raw note, the photo and the client list never leave the browser. A test proves it by recording every network request in a real-browser run and asserting none carries a listed name, the original of a masked value, or the raw note (ruling 1). It runs in two parts, against the test double and against the real service with invented people, and both are required before any claim (ruling 2).
6. Honest wording: "egress check on listed names", never "safe", "private by design", "anonymised" or "guaranteed".
7. No project keys or tokens in the repository. The Firebase web config is read from `firebase.config.local.json` in the project root, which git ignores and which holds the real values. `firebase.config.example.json` holds placeholders and is committed. Never print, log or copy the values of the local file. A hosting build injects the values into `dist/`, which is never committed (ruling 16). Until the AI service is enabled, cloud calls go through the SDK's documented interface with a test double, and every place that does so says "not connected" on screen. Device jobs call the SDK whenever the device model is available (ruling 23).
8. Plain words in everything a person reads. No emoji. No measured number on the page or in the README without a results file. Fixed numbers (targets, documented limits, sizes) live in `src/constants.ts` with their source and are exempt by name (ruling 22).
9. Nothing is pushed, hosted or published by a build session.
10. The no-cost tier of the cloud model: what is sent may be used by the provider to improve its products and may be read by reviewers, and the provider says not to send sensitive or personal information on that tier. So the app says this in plain words wherever something is about to be sent; the demo uses invented people only; the README says real use needs the paid tier and what changes with it. Until the AI service is enabled the page says "not connected" and the README "not hosted"; then the tier is one constant and is shown (ruling 15).

## Wording rules

- Say "egress check" and "egress check on listed names". The line reads like: "0 of 28 listed names in the text sent. Checked on the bytes. Near variants that were not masked are not checked." (ruling 4). The counts are always computed; the 28 is a format example only.
- A "masked value" means the original text that was masked, never the tag that replaced it (ruling 1).
- Never write that nothing private left. Say why: unlisted details can still identify a person.
- Until H2 part B has run, the page and README say "not yet checked against the real service" (ruling 2).
- Never use these words about the app: safe, private by design, anonymised, guaranteed, cleared. They may appear only inside a quoted list of banned words, as here.
- Say "masked", "listed names", "on this device", "in the cloud", "off", "not measured".
- A failed egress check prints in the failure colour `#B3261E`, with the crossed octagon icon and in words, never colour alone. Errors use the same colour; nothing else does.
- No padlock or shield icons; they would say "safe".
- Plain words. Short sentences. No jargon the caseworker would not use. No emoji anywhere: code, docs, UI, commit text.
- Every measured figure shown has its date and browser, and comes from a file in `results/`. If there is no file, it reads "not measured". A figure from the author's computer says so; on any other computer it reads "not measured" (ruling 20).
- Label every result with its source from `inferenceSource`.
- No metaphors about security. No marketing adjectives.
- Examples use invented people. Keep demo scenes undramatic.
- Do not copy, quote or echo values from `firebase.config.local.json` or any token anywhere.
- Where the documentation and the brief differ, the documentation wins and the difference is written down in docs/sdk-facts.md.

## Second review (2026-11-13): additions

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. These rules are added to the ten rules and win over any older wording.

11. The model never writes a date. A date, weekday or relative day in a record is the note's own words. The app's reading of a date is always marked "assumed", "confirmed by you" or "set by you" in the same line. No year the note does not contain appears unmarked, on the page, in the outgoing text or in the README.
12. Say what the egress check scans, and no more: the address and the body of each request, each listed name whole, its other names, its single parts of three letters or more, and a value of five letters or more also inside a longer word. Do not write that it scans "the request body" only. The words follow the code; where they differ, change the words and write the difference in .kiro/specs/OPEN-QUESTIONS.md.
13. The likely-names line says "a guess by capital letters". It is a guess, never a check.
14. Figures on the page and in the README come from the same function and the same results file. Each part carries its own date and browser. The list-alone figure says it came from Node with no browser, the model figure says Google Chrome with its version. Both say "Measured on the author's computer". A missing or unreadable file reads "not measured".
15. "Send this name on purpose" appears only in the panel of a pressed listed chip. It is never printed beside chips.
16. Removed on 2026-11-14 (docs/decisions/2026-11-14-cut-three-firebase-parts.md).
17. New wording in the interface goes in the string table so the word, emoji and number audits cover it. Words from this review that are allowed and checked: assumed, confirmed by you, set by you, not in your note, guess by capital letters, Scanned.
