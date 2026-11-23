# Cut Remote Config, anonymous sign-in and the cloud ledger store

2026-11-14

Decision: the three were cut, not wired (PANEL-RULING-INPUT D-10; ruled by the orch desk on 2026-11-14 under the owner's order to finish the contests; the owner may overrule).

Why: no module imported firebase/remote-config, firebase/auth or firestore; the build showed a Save control only in tests; the rules name these products as examples (RULES line 118) and do not require them.

Removed: src/firebase/remoteConfig.ts, auth.ts, ledgerStore.ts, ledgerStoreDouble.ts, src/egress/syncLedger.ts and the tests for them.

Kept: the egress ledger on this device (src/storage/ledger.ts, src/egress/ledger.ts).

Left as history, not edited: .kiro/specs/second-reader/design.md:35, .kiro/specs/second-reader/design.md:75, .kiro/specs/drafting/requirements.md:11, .kiro/specs/drafting/design.md:9, .kiro/specs/drafting/design.md:64, .kiro/specs/judges-see-true/requirements.md:13, .kiro/specs/shell-and-offline/requirements.md:93, .kiro/specs/shell-and-offline/requirements.md:94, .kiro/specs/shell-and-offline/requirements.md:124, .kiro/specs/shell-and-offline/requirements.md:125, .kiro/specs/shell-and-offline/requirements.md:240, .kiro/specs/shell-and-offline/tasks.md:15, .kiro/specs/shell-and-offline/design.md:22, .kiro/specs/egress-check/requirements.md:50, .kiro/specs/egress-check/requirements.md:90, .kiro/specs/egress-check/tasks.md:14, .kiro/specs/OPEN-QUESTIONS.md:18, .kiro/specs/OPEN-QUESTIONS.md:32, .kiro/specs/OPEN-QUESTIONS.md:33, .kiro/specs/OPEN-QUESTIONS.md:56, .kiro/specs/OPEN-QUESTIONS.md:79, .kiro/specs/OPEN-QUESTIONS.md:92, .kiro/specs/OPEN-QUESTIONS.md:196, .kiro/specs/OPEN-QUESTIONS.md:227, .kiro/specs/OPEN-QUESTIONS.md:597, .kiro/specs/masking/requirements.md:58, .kiro/specs/masking/requirements.md:59, .kiro/specs/masking/tasks.md:16, .kiro/specs/masking/design.md:14, .kiro/specs/masking/design.md:111, docs/decisions/2026-11-13-rulings-on-spec-review.md:44, docs/decisions/2026-11-13-rulings-on-spec-review.md:45, docs/reviews/2026-11-13-spec-review-b.md:47, docs/sdk-facts.md:74, docs/sdk-facts.md:85.
