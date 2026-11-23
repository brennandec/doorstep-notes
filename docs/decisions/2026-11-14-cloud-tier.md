# Owner's ruling: the cloud tier is paid

Date: 2026-11-14.

## What happened

- On 2026-11-14 the owner linked a Cloud Billing account to the Firebase project `doorstep-notes`. The Firebase console then showed the pay-as-you-go (Blaze) plan.
- The same day one generateContent call through the entry's probe returned 200, and no prepayment was asked for.

## What the terms say (read 2026-11-14)

Source: https://ai.google.dev/gemini-api/terms (served as https://aistudio.google.com/docs/terms), effective March 23, 2026, section "Paid Services".

- Quoted: Your access to Gemini API is a "Paid Service" only when accessing the API through a Cloud Project associated with an active billing account.
- Quoted: Google "doesn't use your prompts (including associated system instructions, cached content, and files such as images, videos, or documents) or responses to improve our products".
- In short (our words, not a quote): for paid services Google logs prompts and responses for a limited period of time, solely for detecting and preventing violations of its Prohibited Use Policy, and for any required legal or regulatory disclosures.
- The data-use part of "Paid Services" names no number of days. The same terms page states thirty (30) days for Grounding with Google Search and for Grounding with Google Maps; this app calls neither (no grounding call under src/ on this date).
- Quoted, from the same page: You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom.

## Ruling

1. `CLOUD_TIER` is "paid".
2. The page and the README must say that the project runs on the paid tier of the Gemini Developer API through Firebase AI Logic, and that Google keeps prompts and responses for a limited period for abuse checks. They must state no number of days.
3. Why billing is on: the unpaid tier refused this project on its first real cloud call, commit d03356b ("First real cloud calls: the token works, the project is refused the unpaid tier; facts, results file, one task for the refusal"). The European Economic Area, Switzerland and United Kingdom clause is quoted above; it is not the reason, and nothing in this ruling says the project meets it.

## Legal seat

Legal seat, 2026-11-14, second read: the quoted lines match the pages named. No compliance claim is granted.
The two lines the legal seat did not re-open were checked by the desk the same day: `git grep` finds no grounding call under src/, and the subject of d03356b reads as quoted.
