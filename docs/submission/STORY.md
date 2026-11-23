# Doorstep Notes
Doorstep Notes masks a housing caseworker's client list on her own computer.
Four modes, one per job: `ONLY_ON_DEVICE` structures the note and proposes masks in Gemini Nano; `PREFER_IN_CLOUD` drafts; `PREFER_ON_DEVICE` rewrites one sentence; `ONLY_IN_CLOUD` runs the second reader.
Proof: `results/hybrid-run-2026-11-14-h20.json`, `results/second-reader-loop-2026-11-14.json`, `results/catch-rate.json`.

## Dana's evening

Dana is a housing caseworker. She has just finished a home visit, there was no signal in the stairwell, and she owes a formal case note by tonight. Her employer forbids putting a client's name into a cloud AI tool, so today she writes it all by hand after hours.

The Office of the Victorian Information Commissioner (OVIC) investigated a child protection worker's use of ChatGPT and reported:

> OVIC’s investigation confirmed DFFH’s initial findings – that CPW1 used ChatGPT in drafting the PA Report and input personal information in doing so.

The provider's terms for the Gemini API add: "Do not submit sensitive, confidential, or personal information to the Unpaid Services." This project runs on the paid tier.

Doorstep Notes is a writing aid with an egress check on listed names. Her client list is masked on her own computer before any text goes to a cloud model. Unlisted details can still identify a person.

## How the hybrid split works

Drafts and rewrites use gemini-3.5-flash-lite in the cloud, the second reader uses gemini-3.8-flash, and App Check is on for cloud calls.

| Job | Mode | What leaves the device |
|---|---|---|
| Structure the note or photo into a record | `ONLY_ON_DEVICE` | Nothing |
| Propose more things to mask | `ONLY_ON_DEVICE` | Nothing |
| Draft the formal note | `PREFER_IN_CLOUD` online, `ONLY_ON_DEVICE` offline | The outgoing text built from the masked record, online only |
| Rewrite one masked sentence | `PREFER_ON_DEVICE` | That one masked sentence, only if the cloud answers |
| Second reader | `ONLY_IN_CLOUD` | The masked outgoing text, on request |

Names are put back on the device. Before she sends, Dana sees the exact text that will leave, and a listed name in it blocks Send. After a send, the egress check scans the address and body of the request the browser actually sent.

## The second reader

On request, a cloud model reads the masked text and guesses who it is about, so Dana can see what it can still infer and mask more. Each guess quotes the words it relies on, and a quoted word is a chip she can press.

The first loop was recorded on an invented visit (`results/second-reader-loop-2026-11-14.json`, real service, two calls, both answered 200). In pass 1 the reader quoted "Bea", "worker" and "landlord". Dana pressed the chip "Bea" and asked again. The text sent in pass 2 no longer held "Bea", no guess quoted it, and the egress card counted one more masked value (2 to 3). The pass 2 guesses quoted other unmasked words, such as "Mould in the back bedroom" and "landlord".

The file does not prove the first guess went away because of the mask alone. Each loop is on invented people, and the model's answers vary between runs. How many missed identifiers the reader helps her find is not measured.

## The numbers and their limits

On 200 invented notes, her list alone (exact and near match, no model) found 509 of 1,141 identifying details (Node, no browser, 2026-11-13). With the model on the device added: 1,032 of 1,141 (Google Chrome 157.0.8103.79, 2026-11-13). The word lists were adjusted on this same set, so the figures are in-sample. They say little about other notes and were measured on the author's computer.

Describing phrases, such as "her twin brother", are the weak spot: 40 of 129 found.

In the recorded Chrome run with the built-in model and the real cloud (`results/hybrid-run-2026-11-14-h20.json`, one run, invented visit): the offline draft card read 0 of 20 listed names, the page made 0 requests outside itself while offline, and the cloud step made 3 `generateContent` calls and one App Check exchange. The check covers listed names and masked values only.

## Try it

- Hosted page: https://doorstep-notes.web.app
- Use desktop Google Chrome for the device half. Other browsers run the cloud half and the egress check only.
- On the first screen, press "Try an invented visit". It fills an invented note and an invented client list, so a result takes a few presses.
- Without the built-in model, she can still enter the record by hand, mask by exact and near match, draft in the cloud and run the egress check.
- The page needs the built-in model already downloaded in Chrome. Structuring a note, proposing masks and the offline draft all use it.
- From this repository, the cloud half needs your own Firebase project on the paid tier with App Check set up. The hosted page already has one.

## What's next

- Chrome on desktop only, for the device model.
- The device pass can add false masks and can miss identifiers.
- Install and cold-reload checks remain local-only; real-service hosted runs passed.

## Built in the submission period

- 2026-11-12: `BRIEF.md` and `OPEN-QUESTIONS.md`.
- 2026-11-20T19:20:55.762Z: `results/e2e-cloud-on-2026-11-21-h23.json`, 37 calls.
- 2026-11-20T19:23:37.875Z: `results/ds-r8-return.json`, pass, 7 calls.
- Plain MIT and `NOTICE.md`. `docs/kiro-sessions` is not in this tree.
- Written with AI coding tools from specifications.
