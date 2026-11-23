# Open questions

Items in BRIEF.md that could not be met as written, or could not be confirmed. Written 2026-11-12.

1. Rule 10, no-cost tier terms. The brief says the provider may use sent text to improve its products, may have reviewers read it, and tells users not to send personal information. The Firebase pages I was allowed to read do not state these terms. Fetching was limited to firebase.google.com and developer.chrome.com, and the terms live on other sites. The app text for Rule 10 should be checked by the product owner against the provider's current terms before it is written into the UI or README. Candidate page not read: https://firebase.google.com/docs/ai-logic/data-governance .
2. Structured output on device. The brief's structuring job depends on JSON schema output. The Firebase page for it (https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output) returned only navigation text when fetched, so its syntax is not recorded in docs/sdk-facts.md. The support claim itself is confirmed by the get-started page.
3. Chrome version gap. Firebase says Chrome 139 or later; Chrome's Prompt API page lists the web API at Chrome 148. Which versions work with the flag is not settled by the documents. Needs a check on the author's Chrome.
4. Production App Check provider for the web. Not named on the pages read. Needs the App Check page (https://firebase.google.com/docs/ai-logic/app-check), not read in this session.
5. Rule 7 and the build. Reading `firebase.config.local.json` into a Vite build puts the web config in the built files. I did not open that file. The brief treats its values as not to be copied. How the build loads it without copying values into committed or hosted output is a design decision for the build session.
6. Existing record. On 2026-11-12 this item said `docs/kiro-sessions/` held a session log. That directory is not in this tree. The notes that remain are under `docs/`.
