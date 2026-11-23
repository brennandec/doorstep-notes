// The record text with its masks as chips, and every other word as a button
// that masks it (masking R5). One polite live region says each change in words.
import { fill, strings } from "../strings";
import { el } from "../dom";
import { button } from "./button";
import { chip } from "./chip";
import { maskText, purposeQuestion, sendOnPurpose, toggleSpan, type Change } from "../../masking/toggle";
import { assignTags } from "../../masking/tags";
import { likelyNames } from "../../masking/likelyNames";
import { fold } from "../../masking/fold";
import type { MaskSpan } from "../../masking/types";

export interface MaskViewOptions {
  raw: string;
  spans: MaskSpan[];
  /** Called after every change with the new spans and the words announced. */
  onChange?(spans: MaskSpan[], announcement: string): void;
  /** Asks the named question. Without it, chips offer no "send on purpose" control. */
  confirmPurpose?(question: string): boolean | Promise<boolean>;
  /**
   * Without a device model: point at capitalised words that are not on her list (masking R15).
   * Dotted underline in the text, and one line that says it is a guess by capital letters.
   */
  likely?: boolean;
  /** H35a D8: words she chose to keep unmasked; they leave the guess line. */
  keptLikely?: string[];
  /** Called when she presses "Keep {word}". */
  onKeep?(word: string): void;
}

export interface MaskView {
  element: HTMLElement;
  liveRegion: HTMLElement;
  getSpans(): MaskSpan[];
  setSpans(spans: MaskSpan[]): void;
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'\u2019/-]*/gu;

export function renderMaskView(opts: MaskViewOptions): MaskView {
  let spans = assignTags(opts.spans);
  const live = el("div", { class: "sr-only", role: "status", "aria-live": "polite", "aria-atomic": "true", "data-live": "" });
  const text = el("div", { class: "mask-text", "data-mask-text": "" });
  const likelyBox = el("div", { class: "likely-box", "data-likely-box": "" });
  const root = el("div", { class: "mask-view" }, likelyBox, text, live);
  let likelyStarts = new Set<number>();

  // The record text is one tab stop (masking R14.3): the words and the chips take turns holding it,
  // and the arrow keys move from one to the next.
  const items = () => [...text.querySelectorAll<HTMLElement>("button.word, button.mask-chip")];
  let current = 0;
  const syncTabStop = () => {
    const all = items();
    current = Math.max(0, Math.min(current, all.length - 1));
    all.forEach((n, i) => { n.tabIndex = i === current ? 0 : -1; });
  };
  text.addEventListener("focusin", (e) => {
    const at = items().indexOf(e.target as HTMLElement);
    if (at !== -1 && at !== current) {
      current = at;
      syncTabStop();
    }
  });
  text.addEventListener("keydown", (e) => {
    const all = items();
    const at = all.indexOf(e.target as HTMLElement);
    if (at === -1) return;
    const go = e.key === "ArrowRight" || e.key === "ArrowDown" ? at + 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? at - 1
      : e.key === "Home" ? 0
      : e.key === "End" ? all.length - 1
      : null;
    if (go === null) return;
    e.preventDefault();
    all[Math.max(0, Math.min(go, all.length - 1))]!.focus();
  });

  const apply = (change: Change, focusAt: number) => {
    spans = change.spans;
    draw();
    live.textContent = change.announcement;
    // The pressed control may have become another kind of control: find what is at the same place.
    const target = [...text.querySelectorAll<HTMLElement>("[data-start]")].find(
      (n) => Number(n.dataset.start) <= focusAt && focusAt < Number(n.dataset.end) && !n.hasAttribute("data-purpose"),
    );
    target?.focus();
    opts.onChange?.(spans, change.announcement);
  };

  function wordButton(word: string, start: number): HTMLElement {
    const b = el(
      "button",
      {
        type: "button",
        class: "word",
        "data-start": String(start),
        "data-end": String(start + word.length),
        "aria-label": fill(strings.masking.wordLabel, { what: word }),
      },
      word,
    );
    if (likelyStarts.has(start)) b.classList.add("likely");
    const press = () => apply(maskText(opts.raw, spans, word), start);
    b.addEventListener("click", press);
    b.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      press();
    });
    return b;
  }

  function plain(from: number, to: number, into: Node[]) {
    const piece = opts.raw.slice(from, to);
    let at = 0;
    for (const m of piece.matchAll(WORD)) {
      const i = m.index ?? 0;
      if (i > at) into.push(document.createTextNode(piece.slice(at, i)));
      into.push(wordButton(m[0], from + i));
      at = i + m[0].length;
    }
    if (at < piece.length) into.push(document.createTextNode(piece.slice(at)));
  }

  // The guess by capital letters, worked out again after every change, so a masked word leaves the line.
  // A word she keeps unmasked (H35a D8) leaves it too.
  const kept = new Set((opts.keptLikely ?? []).map((w) => fold(w)));
  function drawLikely() {
    likelyStarts = new Set();
    if (!opts.likely) return likelyBox.replaceChildren();
    const found = likelyNames(opts.raw, spans).filter((l) => !kept.has(fold(l.word)));
    for (const l of found) for (const o of l.occurrences) likelyStarts.add(o.start);
    if (found.length === 0) return likelyBox.replaceChildren();
    const template = found.length === 1 ? strings.masking.likelyOne : strings.masking.likelyMany;
    const [head, tail] = fill(template, { n: found.length, words: "\u0000" }).split("\u0000");
    const pieces: (Node | string)[] = [head ?? ""];
    found.forEach((l, i) => {
      if (i > 0) pieces.push(", ");
      const b = el(
        "button",
        { type: "button", class: "likely-word", "data-likely-word": l.word, "aria-label": fill(strings.masking.likelyLabel, { what: l.word }) },
        l.word,
      );
      b.addEventListener("click", () => apply(maskText(opts.raw, spans, l.word), l.occurrences[0]!.start));
      pieces.push(b);
    });
    pieces.push(tail ?? "");
    // One keep control for each word, after the sentence, so she can leave a word unmasked on purpose.
    const keeps = found.map((l) => {
      const k = button(fill(strings.masking.keepLikely, { what: l.word }), "secondary");
      k.classList.add("keep-likely");
      k.dataset.keepLikely = l.word;
      k.setAttribute("aria-label", fill(strings.masking.keepLikelyLabel, { what: l.word }));
      k.addEventListener("click", () => {
        kept.add(fold(l.word));
        draw();
        opts.onKeep?.(l.word);
      });
      return k;
    });
    likelyBox.replaceChildren(
      el("p", { class: "likely-line", "data-likely-line": "" }, ...pieces),
      el("p", { class: "likely-keeps", "data-likely-keeps": "" }, ...keeps.flatMap((k, i) => (i > 0 ? [" ", k] : [k]))),
    );
  }

  function draw() {
    drawLikely();
    const nodes: Node[] = [];
    let at = 0;
    spans.forEach((s, index) => {
      plain(at, s.start, nodes);
      nodes.push(
        chip(s, {
          onToggle: () => apply(toggleSpan(spans, index), s.start),
          onAnnounce: (t) => { live.textContent = t; },
          onPurpose: opts.confirmPurpose
            ? async () => {
                if (await opts.confirmPurpose!(purposeQuestion(s))) apply(sendOnPurpose(spans, index), s.start);
              }
            : undefined,
        }),
      );
      at = s.end;
    });
    plain(at, opts.raw.length, nodes);
    text.replaceChildren(...nodes);
    syncTabStop();
  }

  draw();
  return {
    element: root,
    liveRegion: live,
    getSpans: () => spans,
    setSpans(next) {
      spans = assignTags(next);
      draw();
    },
  };
}
