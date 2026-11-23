# happy-dom as a development dependency (2026-11-13)

Written by the build session for shell-and-offline.

The spec asks for unit tests on the DOM structure of the screen, the status bar, the controls and the source label (tasks 14 to 19). Vitest runs in Node, which has no DOM.

Decision: add `happy-dom` 21.0.4 as a development dependency, pinned exactly. Each DOM test file opts in with `// @vitest-environment happy-dom`. It is not a runtime dependency and is not in the built app, so the rule "no runtime dependency beyond the Firebase JS SDK" still holds. The interface stays plain TypeScript and the DOM, with no UI framework.

Alternative considered: building the parts as HTML strings and testing them with patterns. Rejected because it cannot check the structure the spec names (order of zones, last child of zone 2, tab order).

Layout, computed colours, sizes and focus rings are not checked in happy-dom. Those are the BUNDLED real-browser tasks (25 and 26), left for a later session.
