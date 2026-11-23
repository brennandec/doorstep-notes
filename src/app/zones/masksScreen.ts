// The masks step: the record on this device, and the masked text that can leave.
// The record rows and the per-word buttons stay behind Edit.
import { buildOutgoing, recordBlock, type Outgoing } from "../../drafting/buildOutgoing";
import { chooseMode } from "../../drafting/chooseMode";
import { parseClientList } from "../../masking/clientList";
import { findWholeWords } from "../../masking/fold";
import { DEFAULT_POLICY } from "../../masking/policy";
import type { MaskSpan, TagKind } from "../../masking/types";
import type { Guess, VisitRecord } from "../../inference/types";
import { dateFlag } from "../../record/noteDate";
import { quotedClue } from "../../secondReader/rank";
import { PLACE_CLUE, RELATION_CLUE } from "../example/inventedVisit";
import { el } from "../dom";
import { button } from "../parts/button";
import { chip } from "../parts/chip";
import { renderSteps } from "../parts/steps";
import { requestsOn } from "../ledgerCount";
import { fill, strings } from "../strings";
import type { AppState, Handlers } from "../state";

const TAG = /\[(?:Person|Place|Date|Detail) \d+\]/g;

/** A legend names a tag the screen shows. Person and date are the two sentences this screen has. */
export function legendLine(spans: MaskSpan[]): string | null {
  const s = strings.firstRun;
  const shown = spans.filter((sp) => sp.accepted && !sp.sentOnPurpose && sp.tag !== "");
  const numberOf = (kind: TagKind): number | null => {
    const nums = shown
      .filter((sp) => sp.tagKind === kind)
      .map((sp) => {
        const hit = new RegExp(`\\[${kind} (\\d+)\\]`).exec(sp.tag);
        return hit ? Number(hit[1]) : null;
      })
      .filter((n): n is number => n !== null);
    return nums.length === 0 ? null : Math.min(...nums);
  };
  const parts: string[] = [];
  const person = numberOf("Person");
  const date = numberOf("Date");
  if (person !== null) parts.push(fill(s.tagStandsPerson, { person }));
  if (date !== null) parts.push(fill(s.tagStandsDate, { date }));
  if (parts.length === 0) return null;
  parts.push(s.tagStays);
  return parts.join(" ");
}

/**
 * Masks Send calls onDraft. Offline with no device model, that press reaches the no-draft line and
 * sends nothing. A cloud that is not configured cannot take the send either. The control stays quiet.
 */
export function masksSendReady(state: AppState): boolean {
  const offline = state.network === "offline";
  const choice = chooseMode({
    browserOnline: !offline,
    probe: offline ? "notRun" : "passed",
    device: state.device.state,
  });
  if (choice.kind === "none") return false;
  if (choice.kind === "cloud" && state.cloudStatus?.kind === "not-configured") return false;
  return true;
}

/** The masks step a person sees before Edit, and before any text has been asked to leave. */
export function isQuietMasks(state: AppState): boolean {
  return state.recordOpen === false
    && state.record !== null
    && state.finished === null
    && state.outgoingText === ""
    && !state.previewOnly
    && state.error === null
    && !state.working
    && !state.waiting
    && !state.drafting
    && !state.draftGate
    && state.confirmClear === null
    && !state.confirmReplace
    && !state.reader.pending
    && !state.reader.asking;
}

export function masksOutgoing(state: AppState): Outgoing | null {
  if (state.record === null) return null;
  const raw = recordBlock(state.record, state.noteText);
  const useSpans = state.mask !== null && state.mask.raw === raw;
  return buildOutgoing({
    record: state.record,
    clients: parseClientList(state.clientList).entries,
    policy: DEFAULT_POLICY,
    noteText: state.noteText,
    ...(useSpans ? { spans: state.mask!.spans } : {}),
  });
}

/** The clue still written in the masked text: the reader's quote, else the place clue, else the relation clue. */
export function cluePhrase(masked: string, record: VisitRecord, guesses: Guess[] = []): string | null {
  const quoted = quotedClue(guesses, { place: PLACE_CLUE, relation: RELATION_CLUE }, masked);
  if (quoted !== null) return quoted;
  if (findWholeWords(masked, PLACE_CLUE).length > 0) return PLACE_CLUE;
  if (findWholeWords(masked, RELATION_CLUE).length > 0) return RELATION_CLUE;
  const hay = masked.toLowerCase();
  const sources = [...record.seen, ...record.agreed, ...record.risks, ...record.nextSteps];
  let best = "";
  for (const source of sources) {
    const words = source.replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
    for (let n = 3; n >= 2; n -= 1) {
      for (let i = 0; i + n <= words.length; i += 1) {
        const slice = words.slice(i, i + n);
        if (slice.some((word) => /[A-Z]/.test(word[0] ?? "") || /\d/.test(word))) continue;
        const phrase = slice.join(" ");
        if (phrase.length < 8) continue;
        if (hay.includes(phrase.toLowerCase()) && phrase.length > best.length) best = phrase;
      }
    }
  }
  return best === "" ? null : best;
}

function roleWord(role: "client" | "worker" | "other"): string {
  const r = strings.record;
  if (role === "worker") return r.roleWorker;
  if (role === "other") return r.roleOther;
  return r.roleClient;
}

function quietChip(span: MaskSpan, h: Handlers): HTMLElement {
  return chip(span, { onToggle: () => h.onToggleMask?.(span) });
}

function withNames(text: string, spans: MaskSpan[], h: Handlers): Node[] {
  const accepted = spans.filter((span) => span.accepted && span.tag !== "" && span.surfaceForm !== "");
  const ordered = [...accepted].sort((a, b) => b.surfaceForm.length - a.surfaceForm.length);
  const taken = new Array<boolean>(text.length).fill(false);
  const ranges: { at: number; end: number; span: MaskSpan }[] = [];
  const lower = text.toLowerCase();
  for (const span of ordered) {
    const needle = span.surfaceForm.toLowerCase();
    let from = 0;
    while (from < text.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + span.surfaceForm.length;
      const free = taken.slice(at, end).every((bit) => !bit);
      const before = at === 0 || !/\p{L}/u.test(text[at - 1] ?? "");
      const after = end === text.length || !/\p{L}/u.test(text[end] ?? "");
      if (free && before && after) {
        for (let i = at; i < end; i += 1) taken[i] = true;
        ranges.push({ at, end, span });
      }
      from = end;
    }
  }
  ranges.sort((a, b) => a.at - b.at);
  const out: Node[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.at < cursor) continue;
    if (range.at > cursor) out.push(document.createTextNode(text.slice(cursor, range.at)));
    out.push(quietChip(range.span, h));
    cursor = range.end;
  }
  if (cursor < text.length) out.push(document.createTextNode(text.slice(cursor)));
  return out;
}

function withHit(text: string, phrase: string | null): Node[] {
  if (phrase === null) return [document.createTextNode(text)];
  const at = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (at < 0) return [document.createTextNode(text)];
  const hit = text.slice(at, at + phrase.length);
  return [
    document.createTextNode(text.slice(0, at)),
    el("span", { class: "masks-hit", "data-quoted-clue": hit }, hit),
    document.createTextNode(text.slice(at + phrase.length)),
  ];
}

function maskedNodes(text: string, spans: MaskSpan[], phrase: string | null, h: Handlers): Node[] {
  const out: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(TAG)) {
    const at = match.index ?? 0;
    if (at > last) out.push(...withHit(text.slice(last, at), phrase));
    const tag = match[0];
    const span = spans.find((item) => item.tag === tag && item.accepted);
    out.push(span ? quietChip(span, h) : document.createTextNode(tag));
    last = at + tag.length;
  }
  if (last < text.length) out.push(...withHit(text.slice(last), phrase));
  return out;
}

function line(label: string, ...nodes: Node[]): HTMLElement {
  return el("p", { class: "masks-line" }, el("span", { class: "masks-label" }, label), " ", ...nodes);
}

/** Two columns. Edit opens the record rows. The exact text stays hidden until its button. */
export function renderMasksStep(state: AppState, h: Handlers): HTMLElement {
  const record = state.record;
  if (record === null) return el("main", { class: "screen masks-step", id: "tool" });
  const outgoing = masksOutgoing(state);
  const masked = outgoing?.maskedRecord ?? "";
  const spans = outgoing?.mask.spans ?? [];
  const flagged = dateFlag(masked);
  const phrase = flagged?.phrase ?? cluePhrase(masked, record, state.reader.result?.guesses ?? []);
  const bytes = new TextEncoder().encode(outgoing?.text ?? "").length;
  const requests = requestsOn(state.ledger?.entries);
  const s = strings.firstRun;
  const shown = flagged?.what ?? (phrase === null ? "" : phrase.charAt(0).toUpperCase() + phrase.slice(1));
  const edit = button(strings.fold.edit, "secondary", { id: "edit-record" });
  edit.addEventListener("click", () => h.onOpenRecord?.());
  const clue = phrase === null ? null : button(s.maskClue, "secondary", { id: "mask-clue" });
  if (clue && flagged) clue.setAttribute("data-quoted-clue", flagged.phrase);
  clue?.addEventListener("click", () => h.onMaskClue?.(phrase!));
  const exactLabel = state.exactOpen ? s.hideExact : fill(s.showExact, { n: bytes });
  const exact = button(exactLabel, "secondary", { id: "show-exact" });
  exact.addEventListener("click", () => h.onToggleExact?.());
  const offline = state.network === "offline";
  const ask = button(strings.secondReader.ask, "secondary", {
    id: "ask-reader",
    disabled: offline || state.drafting || state.reader.asking,
    reason: offline ? strings.secondReader.needsConnection : "",
  });
  ask.addEventListener("click", () => h.onAskReader?.());
  const legend = legendLine(spans);
  const canSend = masksSendReady(state);
  const openSend = button(strings.actions.send, "primary", {
    id: "open-send",
    disabled: !canSend,
    reason: state.network === "offline" ? strings.cloudDisabledReason : strings.drafting.noDraft,
  });
  if (canSend) openSend.addEventListener("click", () => h.onDraft?.());
  const exactText = el("div", { class: "masks-exact", id: "exact-text", hidden: state.exactOpen ? false : true }, outgoing?.text ?? "");

  const present = record.present.flatMap((person, index) => {
    const nodes = withNames(person.label, spans, h);
    nodes.push(document.createTextNode(` ${roleWord(person.role)}`));
    if (index < record.present.length - 1) nodes.push(document.createTextNode(", "));
    return nodes;
  });

  const root = el(
    "main",
    { class: "screen masks-step", id: "tool", "data-masks-step": "" },
    el("h1", { class: "sr-only" }, strings.steps.masks),
    renderSteps(state),
    el(
      "div",
      { class: "masks-columns" },
      el(
        "section",
        { class: "masks-col", "data-masks-col": "record" },
        el("h2", {}, strings.recordTitle),
        state.example ? el("span", { class: "mark", "data-mark": "example" }, s.exampleMark) : null,
        state.example ? el("p", { class: "masks-people" }, s.examplePeople) : null,
        record.visitDate.trim() !== "" ? line(s.visitLabel, document.createTextNode(record.visitDate)) : null,
        record.present.length > 0 ? line(strings.recordFields.present, ...present) : null,
        record.seen.length > 0 ? line(strings.recordFields.seen, ...withNames(record.seen.join(" "), spans, h)) : null,
        record.agreed.length > 0 ? line(strings.recordFields.agreed, ...withNames(record.agreed.join(" "), spans, h)) : null,
        record.risks.length > 0 ? line(strings.recordFields.risks, ...withNames(record.risks.join(" "), spans, h)) : null,
        record.nextSteps.length > 0 ? line(strings.recordFields.nextSteps, ...withNames(record.nextSteps.join(" "), spans, h)) : null,
        legend === null ? null : el("p", { class: "masks-stands" }, legend),
        edit,
      ),
      el(
        "section",
        { class: "masks-col", "data-masks-col": "leaves" },
        el("h2", {}, strings.zones.leaves),
        el("div", { class: "masks-leaving", "data-masks-leaving": "" }, ...maskedNodes(masked, spans, phrase, h)),
        phrase === null ? null : el("p", { class: "masks-clue" }, fill(s.stillWritten, { what: shown })),
        clue,
        ask,
        el("p", { class: "masks-meta" }, fill(s.requestsBefore, { n: requests })),
        el("p", { class: "masks-meta" }, s.destination),
        exact,
        openSend,
        exactText,
      ),
    ),
  );
  root.querySelectorAll(".chip-state").forEach((node) => node.classList.add("sr-only"));
  return root;
}
