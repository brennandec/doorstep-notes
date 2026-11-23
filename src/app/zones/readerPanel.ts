import { el, svg } from "../dom";
import { requestWords, withCommas } from "../countWords";
import { iconSvg } from "../icons";
import { button } from "../parts/button";
import { fold } from "../parts/fold";
import { sourceLabel } from "../parts/sourceLabel";
import { fill, strings } from "../strings";
import { PLACE_CLUE, RELATION_CLUE } from "../example/inventedVisit";
import { tagsIn } from "../../masking/tags";
import { pointingCount, quotedClue } from "../../secondReader/rank";
import { masksOutgoing } from "./masksScreen";
import type { Guess } from "../../inference/types";
import type { AppState, Handlers } from "../state";

/** Why the control is off, or null when she can ask. */
export function readerControl(input: { hasRecord: boolean; offline: boolean; busy: boolean }): { disabled: boolean; reason: string } {
  const s = strings.secondReader;
  if (input.offline) return { disabled: true, reason: s.needsConnection };
  if (!input.hasRecord) return { disabled: true, reason: s.needsText };
  if (input.busy) return { disabled: true, reason: s.working };
  return { disabled: false, reason: "" };
}

type Pass = NonNullable<AppState["reader"]["result"]>["pass"];

/** The words of the pass line (second-reader R7): the bytes sent to the model, and the bytes with the App Check exchange. */
export function passText(pass: Pass): string {
  const s = strings.secondReader;
  if (!pass.left) return s.passNone;
  const requests = requestWords;
  return [
    fill(s.passLeft, { host: pass.host }),
    fill(s.passModelCount, { bytes: withCommas(pass.modelBytes), requests: requests(pass.modelRequests) }),
    fill(s.passAllCount, { bytes: withCommas(pass.bytes), requests: requests(pass.requests) }),
    pass.model ? fill(s.passModel, { model: pass.model }) : "",
    fill(s.passHash, { hash: pass.sha256.slice(0, 12) }),
  ]
    .filter((p) => p !== "")
    .join(" ");
}

/** One line about the pass: the bytes that left, where to, and who read them; or that none left. */
function passLine(pass: Pass): HTMLElement {
  return el("p", { class: "reader-pass", "data-reader-pass": "", "data-left": pass.left ? "true" : "false", role: "status" }, passText(pass));
}

/** A quote that is only tags has nothing to mask. */
export function hasMaskableWords(quote: string): boolean {
  let rest = quote;
  for (const tag of tagsIn(quote)) rest = rest.split(tag).join(" ");
  return /[\p{L}\p{N}]/u.test(rest);
}

function quoteChip(quote: string, masked: boolean, h?: Handlers): HTMLElement {
  const s = strings.secondReader;
  if (!hasMaskableWords(quote)) {
    return el("span", { class: "reader-quote tag-only", "data-quote": quote, "aria-label": fill(s.quoteTagLabel, { what: quote }) }, quote);
  }
  const b = el(
    "button",
    {
      type: "button",
      class: `mask-chip ${masked ? "manual" : "proposed"}`,
      "data-quote": quote,
      "data-chip": masked ? "manual" : "proposed",
      "aria-pressed": masked ? "true" : "false",
      "aria-label": masked ? fill(strings.masking.label.masked, { what: quote }) : fill(s.quoteLabel, { what: quote }),
    },
    el("span", { class: "chip-text" }, quote),
    el("span", { class: "chip-state" }, masked ? strings.masking.state.manual : strings.masking.state.notMasked),
  );
  const press = () => {
    if (!masked) h?.onMaskQuote?.(quote);
  };
  b.addEventListener("click", press);
  b.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    // Enter masks once. Stopping the default keeps the browser from also sending a click.
    e.preventDefault();
    press();
  });
  return b;
}

/**
 * The second reader panel: the control, what a reader in the cloud could still infer,
 * the words that led there as chips she can press to mask, and the standing sentence.
 * The outgoing text and the notice are in zone 2; Send is there too.
 */
export function renderReaderPanel(state: AppState, h?: Handlers): HTMLElement {
  const s = strings.secondReader;
  const r = state.reader;
  const offline = state.network === "offline";
  const control = readerControl({ hasRecord: state.record !== null, offline, busy: state.drafting || r.asking });
  const ask = button(r.result ? s.askAgain : s.ask, "secondary", { id: "ask-reader", disabled: control.disabled, reason: control.reason });
  if (h?.onAskReader) ask.addEventListener("click", () => h.onAskReader!());

  const result = r.result;
  // A guess whose quotes are all tags has nothing she can mask. It is hidden and counted.
  const tagOnly = (g: Guess): boolean => g.evidence.length > 0 && g.evidence.every((q) => !hasMaskableWords(q));
  const shown = result ? result.guesses.filter((g) => !tagOnly(g)) : [];
  const hidden = result ? result.guesses.length - shown.length : 0;
  const pointing = result
    ? pointingCount(result.guesses, { place: PLACE_CLUE, relation: RELATION_CLUE }, masksOutgoing(state)?.maskedRecord ?? "")
    : null;
  const pointingLine =
    pointing === null ? null : fill(pointing === 1 ? s.pointingOne : s.pointing, { n: String(pointing) });
  const maskedNow = result ? masksOutgoing(state)?.maskedRecord ?? "" : "";
  const phrase = result ? quotedClue(result.guesses, { place: PLACE_CLUE, relation: RELATION_CLUE }, maskedNow) : null;
  const maskClue = phrase === null ? null : button(strings.firstRun.maskClue, "secondary", { id: "mask-clue" });
  if (maskClue && phrase) {
    maskClue.setAttribute("data-quoted-clue", phrase);
    maskClue.addEventListener("click", () => h?.onMaskClue?.(phrase));
  }
  const guesses = shown.map((g) =>
    el(
      "li",
      { class: "reader-guess", "data-guess": "", "aria-label": s.guessAria },
      el("p", { class: "reader-who" }, `${s.guessLabel}: ${g.description && g.description !== "" ? g.description : g.who}`),
      g.why ? el("p", { class: "reader-why", "data-reader-why": "" }, `${s.whyLabel}: ${g.why}`) : null,
      g.kind ? el("p", { class: "reader-kind", "data-reader-kind": "" }, `${s.kindLabel}: ${g.kind}`) : null,
      g.evidence.length > 0
        ? el(
            "div",
            { class: "reader-words" },
            el("span", { class: "reader-words-label" }, `${s.wordsLabel}:`),
            ...g.evidence.map((q) => quoteChip(q, r.maskedQuotes.includes(q), h)),
          )
        : null,
    ),
  );

  return el(
    "section",
    { class: "reader-panel", "data-reader": "", "aria-labelledby": "reader-title" },
    el("h3", { id: "reader-title" }, s.title),
    fold(
      "reader",
      strings.folds.reader,
      { open: state.unfolded.reader, onToggle: h?.onToggleFold ? () => h.onToggleFold!("reader") : undefined },
      el("p", { class: "reader-help", "data-reader-help": "" }, state.cloud ? s.help : `${s.help} ${s.helpNotConnected}`),
    ),
    el(
      "div",
      { class: "actions" },
      ask,
      r.pending && !r.asking ? el("p", { class: "reader-prepared", "data-reader-prepared": "", role: "status" }, s.prepared) : null,
    ),
    control.disabled && !offline && !r.asking ? el("p", { class: "control-reason", "data-control-reason": "reader" }, control.reason) : null,
    offline ? el("p", { class: "offline-line", "data-reader-offline": "", role: "status" }, s.needsConnection) : null,
    r.asking ? el("p", { class: "working", "data-working": "", role: "status" }, s.working) : null,
    r.line ? el("p", { class: "error", "data-reader-error": "", role: "alert" }, svg(iconSvg("crossedOctagon")), el("span", {}, r.line)) : null,
    result ? el("div", { class: "reader-source" }, sourceLabel(result.source, result.connected)) : null,
    result ? passLine(result.pass) : null,
    result && result.replaced > 0 ? el("p", { class: "reader-redacted", "data-reader-redacted": "", role: "status" }, s.redacted) : null,
    result && result.guesses.length === 0 ? el("p", { class: "reader-none", "data-reader-none": "" }, s.noGuesses) : null,
    guesses.length > 0 ? el("ul", { class: "reader-guesses" }, ...guesses) : null,
    maskClue,
    pointingLine !== null ? el("p", { class: "reader-pointing", "data-pointing": String(pointing) }, pointingLine) : null,
    hidden > 0
      ? el("p", { class: "reader-hidden", "data-reader-hidden": "", role: "status" }, hidden === 1 ? s.hiddenTagOnlyOne : fill(s.hiddenTagOnly, { n: String(hidden) }))
      : null,
    result && result.allDropped ? el("p", { class: "reader-dropped", "data-reader-dropped": "" }, s.allDropped) : null,
    el("p", { class: "reader-standing", "data-reader-standing": "" }, s.standing),
    el("div", { class: "sr-only", "data-live": "", role: "status", "aria-live": "polite", "aria-atomic": "true" }, r.announce),
  );
}
