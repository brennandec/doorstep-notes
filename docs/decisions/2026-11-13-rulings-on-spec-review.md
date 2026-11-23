# Rulings on the spec review (2026-11-13)

Product owner's rulings on the two outside reviews in `docs/reviews/2026-11-13-spec-review-a.md` (25 findings) and `-b.md` (24 findings). A third reviewer returned nothing. Kiro repairs the specs. Where a finding is wrong, Kiro says why in `docs/reviews/2026-11-13-spec-review-responses.md` instead of changing the spec. Where the two reviews and this file disagree, this file wins.

## What leaves the device, and how it is proved

1. **Wording of the promise.** "Masked value" in the acceptance table means the original value that was masked, never the tag that replaced it. The brief's H2 reads: no request carries a listed name, an original of a masked value, or the raw note.
2. **H2 has two parts and both are required before any claim.** Part A: a full run against the test double with every request recorded. Part B: a full run against the real cloud service with invented people, with the real request bodies captured by the browser test. "Not run" is not an end state for a submission; until part B has run, the page and README say "not yet checked against the real service".
3. **The same bytes.** The egress check is computed from the request body the browser actually sends, captured by the request recorder in the real-browser test. The preview shows the text that will be sent; the line after sending is computed from the captured body.
4. **The check covers what the masking did.** For every masked occurrence, the exact surface form found in the text is recorded on the device. The egress check scans the outgoing body for each recorded surface form and for each listed name, comparing case-insensitively with Unicode case folding. The line says what was checked and adds: "Near variants that were not masked are not checked."
5. **A listed name in the outgoing text blocks sending.** There is no general override. The user can unmask one value on purpose, by name, and then the line reports it as sent on purpose.

## The device model's jobs

6. **Proposing more masks runs on the raw record on the device.** The exact pass and the device pass both read the raw text; their results are merged.
7. **Measurement uses the same input for both passes.** Exact match and device pass are each measured on the raw synthetic note and reported separately, then together. The run is time-boxed: it reports how many notes were processed, the throughput, and stops at 30 minutes; the figure shown names its n.
8. **Image input is declared only when a photo is attached.**
9. **The token limit.** The guard is a best-effort bound with the schema and system prompt counted in. Its value is measured in a real browser and recorded in a results file; until then the app relies on the model's own error and says "this note is too long for the device model" in plain words.
10. **Order of work.** The real-browser check of the structured-output syntax comes before the structuring job is implemented.
11. **Near match is allowed.** Exact match, case folding and an edit distance of 1 for names of five letters or more are textbook constructs. The brief's rule 1 forbids custom receipt or chain formats, not these.

## Drafting

12. **Offline is decided by the app, not left to a fallback.** If the browser reports offline or a short probe fails, the draft job is called with `ONLY_ON_DEVICE` and the result is labelled as a device draft. Online it is called with `PREFER_IN_CLOUD`. A real-browser task records what the SDK itself does when the network drops mid-call.
13. **Pronouns.** Restoring is limited to the tokens the draft was asked to use. If the draft contains none, a line says so and nothing is rewritten.
14. **The second reader's reply is redacted before it is shown.** Any listed name or recorded surface form in the reply is replaced by its tag on screen, and the line says the reader produced a listed name.
15. **Tier.** Until the AI service is enabled the page says "not connected" and the README says "not hosted". When it is enabled the tier is written in one constant and shown.

## Shell, configuration, offline

16. **Configuration.** In development and tests the loader reads `firebase.config.local.json`. A hosting build injects the same values at build time; the built files are not committed. A test asserts that no committed file contains the real values. Never print them.
17. **Offline detection** uses the browser's online state plus one failed probe. The cache test names the files allowed in the cache and fails on anything else.
18. **Cloud store.** In this version only egress ledgers (counts, hashes, times) may be synced, after an explicit press. Masked records are not synced.
19. **First-run instructions** name only a Chrome version and steps that a real-browser task has verified on the author's computer. Unverified steps are not printed.

## Acceptance wording

20. **H1 and H8 fail when the device model is absent.** The result is recorded as a failure with its reason. The page shows "not measured" on any other machine.
21. **H3** includes a real-browser check that the failure line is shown in the failure colour and in words. **H7** names the browser's install criteria it checks. The interface rules (one accent colour, large type, 44 px targets, visible focus) each get a test.
22. **The number audit** covers measured figures. Fixed numbers (targets, limits quoted from documentation) live in one constants file with their source and are exempt by name.

## Scope for the first submission

Kept: capture (typed and photo), record, masking with tap-to-mask, egress check, drafting online and offline, second reader, measurement, installable offline shell, Remote Config for policy and model names, anonymous sign-in with ledger sync.
Cut if time runs short, in this order: ledger sync, Remote Config, the second reader's evidence taps, photo input. Typed capture, masking, the egress check and drafting are never cut.
