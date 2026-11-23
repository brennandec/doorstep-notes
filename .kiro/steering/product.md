# Product

Working title: Doorstep Notes. The name is not settled. Do not build the name into file names, package names or identifiers beyond what the brief already uses (project ID `doorstep-notes`).

Source of truth: BRIEF.md, as refined by the owner documents of 2026-11-13 in docs/decisions/. Where those documents differ from BRIEF.md, they win. If this file and those sources disagree, they win and the difference is reported.

## The person

A caseworker: a social worker, housing officer or outreach worker. She has just finished a home visit. There was no signal in the stairwell or the car park. She has rough notes, either a few typed lines on her laptop or a photo of a handwritten page. By tonight she owes a formal case note. Her employer forbids putting a client's name into a cloud AI tool, so today she writes it all by hand after hours.

Every screen, the README and the video are about this one person. She is tired and it is 9 pm. Design for that.

Demo content stays plain and undramatic: a housing visit, a missed appointment, a benefits form. No injuries, no court language, no real people. Every person in an example, test, screenshot or video is invented.

## What the app does

1. Capture, offline. She types a rough note or adds a JPEG or PNG photo of her page. Nothing is sent.
2. The device makes a record. The browser's built-in model turns the note into a visit record: date, who was present (tags), what was seen, what was agreed, risks, next steps. Device only.
3. The device masks. Her own client list (pasted once, kept only in this browser) is masked by exact and near match with no model. The built-in model then proposes more: other names, places, dates of birth, describing phrases such as "her twin brother". She can tap any word to mask or unmask it.
4. The cloud writes, when there is a connection. The formal note is drafted from the masked record. Offline, a shorter draft is made on the device and labelled as such.
5. The device puts the names back. The finished note shows real names, restored locally, with pronouns from the client list entry.
6. One line of proof. Before sending she sees the exact text that will leave. A listed name in it blocks sending, unless she chooses to send that one name on purpose (ruling 5). After sending, an egress check scans the request body the browser actually sent (ruling 3) for every listed name and the exact surface form of every masked value, ignoring case with Unicode case folding (ruling 4), and prints the result, for example: "0 of 28 listed names in the text sent. Checked on the bytes. Near variants that were not masked are not checked." The counts are always computed.
7. A second reader. On request the cloud model guesses who the masked text is about, so she can see what it can still infer and mask more. Any listed name in its reply is replaced by its tag before it is shown (ruling 14).

## The screen

One screen, laid out as the owner's look and layout document says (docs/decisions/2026-11-13-look-and-layout.md). Three zones run left to right: "Your note", "What leaves", "Finished note", with a labelled rule between "this device" and "the cloud". A status bar shows the network, the device model and the cloud separately. The page opens on the tool. An empty first run offers "Try an invented visit", which fills an invented note and an invented client list of 12 names, so a judge gets a result in a few presses.

## What it must never claim

- Never that anything is safe, private by design, anonymised or guaranteed.
- Never that nothing private left. The egress check covers listed names and masked values only. Unlisted details can still identify a person, and the page says so.
- Never compliance with any law or standard.
- Never a number that has no results file behind it. An unmeasured figure reads "not measured". Fixed numbers from the constants file are exempt (ruling 22).
- Never that a cloud model call is live when it goes through a fixed sample. Those places say "off" on screen.
- Never that the no-cost cloud tier is suitable for real client data. It is not. Real use needs the paid tier, and the app and README say so.
- Never that H2 has been checked against the real service until part B has run (ruling 2).
- Never that masked records are stored in the cloud.

It is a writing aid with an egress check. That is the whole claim.

## Second review (2026-11-13): changes to this document

Source: `docs/decisions/2026-11-13-second-review-after-the-first-build.md`. It is the latest owner document and wins over the sections above where they differ.

- The date. The model never writes a date (U1). The record keeps the note's own words ("12/11"). The app proposes a reading in the order of the browser's locale and the current year, shown as "read as 12 November 2026, assumed", with one press to confirm or correct. No year the note does not contain appears anywhere unless marked "assumed", "confirmed by you" or "set by you".
- The screen. A line of five steps (Note, Record, Masks, Send, Finished) sits at the top of zone 1. Once a record exists, the note and the client list fold to one line each with an Edit control, so at 1440 x 900 the chips, the outgoing text, the egress line and the finished note are in view together (U3).
- The first control is filled and enabled when a note exists. With no device model it reads "Enter the record by hand" (U8).
- "Send this name on purpose" lives on the chip, in a small panel, not beside every chip (U4). Ordinary words in the record carry no underline or box; a word shows it can be masked on hover or focus (U5).
- With no device model, capitalised words that are not on her list and do not start a sentence get a dotted underline, and one line says they are a guess by capital letters (U6).
- The missing controls: "Shorter" and "Plainer" on a sentence of the outgoing text (U7; the ledger control was cut on 2026-11-14, see docs/decisions/2026-11-14-cut-three-firebase-parts.md).
- The measured figures are on the screen under Masking, read from `results/catch-rate.json`, with date and browser, or "not measured" (U2).
- What the egress check scans is stated on the page and in the README: the address and the body of each request, each listed name whole, its other names, its single parts of three letters or more, and a value of five letters or more also inside a longer word (U10).
- The cloud half is unchanged: "off" until the product owner says billing exists (U11).
- Tasks for all of this are in the seven specs under "Second review (2026-11-13)".
