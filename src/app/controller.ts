// Holds the app state and re-renders the screen on discrete actions. Typing
// updates the state without a re-render, so the cursor stays where it is.
import { FIRST_DEVICE_CHECK_LIMIT_MS, MIN_NAME_PART_LENGTH, type CloudTier } from "../constants";
import type { CloudStatusView } from "./cloudStatus";
import { valuesForName } from "../egress/check";
import { findWholeWords, fold } from "../masking/fold";
import { maskText, toggleSpan } from "../masking/toggle";
import type { DeviceModel } from "../inference/deviceModel";
import { checkLength } from "../inference/lengthGuard";
import { errorNameOf, StructureFailure } from "../inference/structure/structure.real";
import { emptyRecord } from "../inference/structure/structure.schema";
import type { DeviceModelState, DraftJob, SecondReaderJob, StructureJob } from "../inference/types";
import { findAddedNames } from "../drafting/addedNames";
import { recordBlock } from "../drafting/buildOutgoing";
import { guardSend } from "../drafting/oneText";
import { checkValuesForMask, prepareDraft, sendDraft, type DraftOutcome, type Prepared } from "../drafting/draftFlow";
import { requestDraft, type DraftStep } from "../drafting/requestDraft";
import { restoreAddedTag, type Restored } from "../drafting/restoreDraft";
import type { ProposedText } from "../drafting/screenDraft";
import type { Ledger } from "../egress/ledger";
import { parseClientList } from "../masking/clientList";
import { planDevicePass } from "../masking/deviceState";
import { DownloadContinuing } from "../inference/downloadContinuing";
import { setDownloadProgressFeed } from "../inference/downloadProgress";
import { runDevicePass, type ProposalJobLike } from "../masking/devicePass";
import { runPasses } from "../masking/entry";
import { likelyNames } from "../masking/likelyNames";
import { maskPresentEntries } from "../masking/presentEntries";
import type { MaskSpan } from "../masking/types";
import { DEFAULT_POLICY, type MaskPolicy } from "../masking/policy";
import type { OnlineDeps } from "../net/online";
import { askWhenOnline, prepareSecondReader, type AskOutcome, type ReaderPrepared } from "../secondReader/flow";
import { tagsIn } from "../masking/tags";
import type { KeptData, KeptStore } from "../storage/kept";
import { languageLine } from "./language";
import { readPhoto } from "./photo";
import { inventedVisit } from "./example/inventedVisit";
import type { ResultsLookup } from "./figures";
import { renderScreen } from "./screen";
import { currentStep } from "./parts/steps";
import { clearControlId, hasVisit } from "./parts/clearPanel";
import { renderLeavesZone } from "./zones/leaves";
import { prepareRewrite, runRewrite, type RewritePrepared } from "../drafting/rewriteFlow";
import { applyRecordReplacements, maskTermsInOutgoing, occurrenceIndex, selectableSentences, type Replacement, type SentenceRange } from "../drafting/sentences";
import { makePreview } from "../egress/send";
import type { RewriteJob } from "../inference/types";
import { allFolded, emptyReader, emptyRewrite, emptyState, type AppState, type ClearKind, type DateView, type Handlers, type LedgerView, type RewriteState } from "./state";
import {
  dateTokens,
  formatDate,
  guardRecordDates,
  parseIsoDate,
  readNoteDate,
  recordHolds,
  withoutFlagged,
} from "../record/noteDate";
import type { VisitRecord } from "../inference/types";
import { findMissingSentences } from "../record/noteCoverage";
import { renderRecordMissing } from "./zones/note";
import { fill, strings } from "./strings";

/** What the draft flow needs (drafting spec). Optional so the shell's own tests stay valid. */
export interface DraftingDeps {
  /** The draft job for the current device state; the kit decides real or double. */
  draftFor(device: DeviceModelState): DraftJob;
  ledger: Ledger;
  policy: MaskPolicy;
  /** The browser's online state and the one probe (ruling 17). */
  online: OnlineDeps;
  copy(text: string): Promise<void>;
  now?: () => Date;
  /** An ONLY_ON_DEVICE look at the returned draft for names the masker does not know (ruling 24). */
  findNames?: (draft: string) => Promise<ProposedText[]>;
  /** The rewrite job for the current device state ("Shorter" and "Plainer", drafting R10); the kit decides real or double. */
  rewriteFor?(device: DeviceModelState): RewriteJob;
  /** "Clear everything this page keeps": empties the ledger in memory and in storage (shell-and-offline R27.4). */
  clearLedger?: () => Promise<void>;
  /** Test-only, from a build in mode e2e. Changes the body after the preview to prove a leak is caught. */
  seedLeak?: () => ((body: Uint8Array) => Uint8Array) | undefined;
}

/** The second reader (second-reader spec). It uses the drafting deps for the ledger, the policy and the online state. */
export interface SecondReaderDeps {
  /** The job for the current device state; the kit decides real or double. */
  readerFor(device: DeviceModelState): SecondReaderJob;
}

export interface ControllerDeps {
  root: HTMLElement;
  device: DeviceModel;
  /** H51e: the bound on the first device check, in ms; FIRST_DEVICE_CHECK_LIMIT_MS when absent. */
  firstCheckLimitMs?: number;
  aiServiceEnabled: boolean;
  tier: CloudTier;
  results: ResultsLookup;
  isOffline(): Promise<boolean>;
  /** Present when the structure job is wired in (capture-and-record spec). */
  makeRecordWired?: boolean;
  /** The structure job (ONLY_ON_DEVICE). Without it the control stays disabled. */
  structure?: StructureJob;
  /** What the page keeps in this browser (shell-and-offline R27). Optional so tests can leave it out. */
  kept?: KeptStore;
  drafting?: DraftingDeps;
  secondReader?: SecondReaderDeps;
  /** The propose-masks job for the current device state; the kit gives the real one only when the model is available. */
  proposeMasks?: (device: DeviceModelState) => ProposalJobLike;
  /** The named question for "send this name on purpose"; without it chips offer no such control. */
  confirmPurpose?: (question: string) => boolean | Promise<boolean>;
  /** The clock and the browser's locale, for the reading of the date words (capture-and-record R12.4). */
  clock?: { now(): Date; locale(): string };
  /** The cloud state for the status bar, derived from the config and the last call (hosted-cloud R4). */
  cloudStatus?: () => CloudStatusView;
}

export interface Controller {
  start(): Promise<void>;
  refreshNetwork(): Promise<void>;
  /** Reads the cloud state again and redraws the status bar. */
  refreshCloud(): void;
  state(): AppState;
  handlers: Handlers;
  render(): void;
}

export function makeController(deps: ControllerDeps): Controller {
  let state: AppState = emptyState({
    cloud: deps.aiServiceEnabled,
    tier: deps.tier,
    results: deps.results,
    makeRecordWired: deps.makeRecordWired === true || deps.structure !== undefined,
    ...(deps.cloudStatus ? { cloudStatus: deps.cloudStatus() } : {}),
  });

  const clock = deps.clock ?? { now: () => new Date(), locale: () => (typeof navigator === "undefined" ? "en-GB" : navigator.language) };

  // The record as the outgoing text is built from it: tokens the rough note does not hold are left out while marked.
  const outRecord = (): VisitRecord | null => (state.record === null ? null : withoutFlagged(state.record, state.dateFlags));
  const noteForPresent = (): string | undefined => (state.photo === null ? state.noteText : undefined);
  const rawRecord = (record = outRecord()!): string => recordBlock(record, noteForPresent());

  const isoOf = (d: { day: number; month: number; year: number }) =>
    `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

  // The app's reading of the date words, with its mark (capture-and-record R12.4, R12.5).
  function dateViewNow(): DateView | null {
    const r = state.record;
    if (r === null) return null;
    const words = r.visitDate;
    const choice = state.dateChoice !== null && state.dateChoice.words === words ? state.dateChoice : null;
    const d = strings.date;
    if (choice?.mode === "set" && choice.iso !== undefined) {
      const parts = parseIsoDate(choice.iso);
      if (parts) return { words, status: "set", line: fill(d.readSet, { date: formatDate(parts) }), iso: choice.iso };
    }
    const reading = readNoteDate(words, { locale: clock.locale(), now: () => clock.now(), note: state.noteText });
    if (reading === null) return choice?.mode === "editing" ? { words, status: "editing", line: null, iso: choice.iso ?? "" } : { words, status: "none", line: null, iso: "" };
    const date = formatDate(reading);
    const iso = isoOf(reading);
    if (choice?.mode === "editing") {
      const assumed = reading.yearAssumed || reading.orderAssumed || reading.orderFromNote;
      return { words, status: "editing", line: fill(assumed ? d.readAssumed : d.readPlain, { date }), iso: choice.iso ?? iso };
    }
    if (choice?.mode === "confirmed") return { words, status: "confirmed", line: fill(d.readConfirmed, { date }), iso };
    const assumed = reading.yearAssumed || reading.orderAssumed || reading.orderFromNote;
    return { words, status: assumed ? "assumed" : "plain", line: fill(assumed ? d.readAssumed : d.readPlain, { date }), iso };
  }

  // A record from the device model, checked against the rough note (R12.3). A photo cannot be checked against typed words.
  function adopt(record: VisitRecord): Partial<AppState> {
    if (state.photo !== null || state.noteText.trim() === "") return { record, recordOpen: false, dateFlags: [], dateLine: null, dateChoice: null };
    const g = guardRecordDates(record, state.noteText);
    return {
      record: g.record,
      recordOpen: false,
      dateFlags: g.flagged,
      dateLine: g.replacedDate ? strings.date.deviceWroteDate : null,
      dateChoice: null,
    };
  }

  // Names the model put in the record that she did not give (ruling 24).
  const addedNow = (): string[] =>
    state.record === null ? [] : findAddedNames(state.record, state.noteText, parseClientList(state.clientList).entries);

  // Note sentences a checked device record lacks (R15). Only for a typed note and a record the model made.
  const missingNow = (): string[] =>
    state.recordChecked && state.record !== null && state.photo === null && state.noteText.trim() !== "" ? findMissingSentences(state.noteText, state.record) : [];

  // The spans from the masking step, but only while the record is the text they were made for.
  const spansPart = () => {
    const spans = maskSpansNow();
    return spans ? { spans } : {};
  };
  const maskSpansNow = (): MaskSpan[] | undefined =>
    state.mask !== null && state.record !== null && state.mask.raw === rawRecord() ? state.mask.spans : undefined;

  // H35a D8: capitalised words that look like names, are not on her list and are neither masked nor kept.
  // A guess by capital letters, never a check. Worked out on the masks as they are now, or on the exact and
  // near passes when she has not pressed Mask.
  // Present entries are masked in the shared core. Count them as known so Draft does not
  // stop on a name the outgoing text already tags. An existing span, including an unmask, stays.
  function withPresent(raw: string, spans: MaskSpan[]): MaskSpan[] {
    if (state.record === null) return spans;
    return maskPresentEntries(raw, spans, state.record.present);
  }

  function unresolvedLikely(): string[] {
    if (state.record === null) return [];
    const raw = rawRecord();
    const m = state.mask !== null && state.mask.raw === raw ? state.mask : null;
    const spans = withPresent(raw, m ? m.spans : runPasses(raw, clientsNow(), deps.drafting?.policy ?? DEFAULT_POLICY).combined);
    const kept = new Set((m?.keptLikely ?? []).map((w) => fold(w)));
    return likelyNames(raw, spans).filter((l) => !kept.has(fold(l.word))).map((l) => l.word);
  }

  // Set when she has confirmed that a second Draft may replace the finished note. Not kept.
  let replaceArmed = false;

  // One check for every path that can send text. Same words, same reason as Draft.
  function stopForUnresolved(): boolean {
    if (state.record === null || unresolvedLikely().length === 0) return false;
    const d = deps.drafting;
    const raw = rawRecord();
    const own = state.mask !== null && state.mask.raw === raw ? state.mask : null;
    const spans = withPresent(raw, own ? own.spans : runPasses(raw, clientsNow(), d?.policy ?? DEFAULT_POLICY).combined);
    const mask = own
      ? { ...own, spans }
      : {
          raw,
          spans,
          line: planDevicePass(state.device.state, state.device.percent, state.device.starting === true, state.device.noAnswer === true).line,
          proposals: null,
          proposing: false,
          keptLikely: [] as string[],
        };
    prepared = null;
    readerPrepared = null;
    rewritePrep = null;
    set({
      mask,
      draftGate: true,
      confirmReplace: false,
      outgoingText: "",
      previewOnly: false,
      egressLines: null,
      error: null,
      reader: { ...state.reader, pending: false, line: null },
    });
    (deps.root.querySelector("[data-likely-word]") as HTMLElement | null)?.focus({ preventScroll: true });
    const gateReason = deps.root.querySelector("[data-draft-reason]") as HTMLElement | null;
    if (gateReason && typeof window !== "undefined" && typeof gateReason.getBoundingClientRect === "function") {
      const r = gateReason.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) gateReason.scrollIntoView?.({ block: "nearest" });
    }
    return true;
  }

  // The finished note stays until she says a new draft may replace it.
  function askReplace(): boolean {
    if (state.finished === null || replaceArmed) return false;
    set({ confirmReplace: true });
    (deps.root.querySelector("#replace-yes") as HTMLElement | null)?.focus();
    return true;
  }

  // A quote she masked from the reader is masked in the record too, including a likely name inside the quote.
  function maskQuoteInRecord(pieces: string[]): void {
    if (state.record === null || pieces.length === 0) return;
    const raw = rawRecord();
    const own = state.mask !== null && state.mask.raw === raw ? state.mask : null;
    let spans = withPresent(raw, own ? own.spans : runPasses(raw, clientsNow(), deps.drafting?.policy ?? DEFAULT_POLICY).combined);
    const likely = likelyNames(raw, spans).map((l) => l.word);
    const words: string[] = [];
    const add = (word: string) => {
      if (word.trim() === "" || words.some((w) => fold(w) === fold(word))) return;
      words.push(word);
    };
    for (const piece of pieces) {
      add(piece);
      for (const word of likely) {
        if (findWholeWords(piece, word).length > 0) add(word);
      }
    }
    for (const word of words) spans = maskText(raw, spans, word).spans;
    const kept = (own?.keptLikely ?? []).filter((k) => !pieces.some((p) => fold(p) === fold(k) || findWholeWords(p, k).length > 0));
    const plan = planDevicePass(state.device.state, state.device.percent, state.device.starting === true, state.device.noAnswer === true);
    state = {
      ...state,
      mask: {
        raw,
        spans,
        line: own?.line ?? plan.line,
        proposals: own?.proposals ?? null,
        proposing: own?.proposing ?? false,
        keptLikely: kept,
      },
    };
  }

  // Draft stopped at the gate; when her press has resolved the last word, Draft goes on by itself.
  function continueGate(): void {
    if (!state.draftGate || unresolvedLikely().length > 0) return;
    state = { ...state, draftGate: false };
    handlers.onDraft?.();
  }

  // Kept on this device (shell-and-offline R27). Nothing is written until the restore at start is done.
  let restored = false;
  let storeUsable = true;

  // The visit as it is saved. A text that belongs to a second reader or a rewrite waiting for Send is not kept:
  // it is rebuilt as a preview when the page loads.
  function keptNow(): KeptData {
    const transient = state.reader.pending || rewritePrep !== null;
    const outgoingText = transient ? "" : state.outgoingText;
    const previewOnly = transient ? true : state.previewOnly;
    const m = state.mask;
    return {
      example: state.example,
      clientList: state.clientList,
      opened: { ...state.unfolded },
      visit: {
        noteText: state.noteText,
        photo: state.photo,
        record: state.record,
        recordSource: state.recordSource,
        ...(state.recordChecked ? { recordChecked: true as const } : {}),
        mask: m === null ? null : { raw: m.raw, spans: m.spans, line: m.line, proposals: m.proposals },
        outgoingText,
        previewOnly,
        rewrites: state.rewrites,
        dateChoice: state.dateChoice,
        dateFlags: state.dateFlags,
        dateLine: state.dateLine,
        finished: state.finished,
        step: currentStep({ ...state, outgoingText, previewOnly, reader: emptyReader() }),
      },
    };
  }

  function persist(): void {
    if (!deps.kept || !restored || !storeUsable) return;
    deps.kept.save(keptNow()).catch(storeFailed);
  }

  function storeFailed(): void {
    if (!storeUsable) return;
    storeUsable = false;
    state = { ...state, keptLine: strings.kept.notKept };
    render();
  }

  function applyKept(d: KeptData): void {
    const v = d.visit;
    state = {
      ...state,
      example: d.example,
      clientList: d.clientList,
      unfolded: { ...allFolded(), ...d.opened },
      noteText: v.noteText,
      photo: v.photo,
      record: v.record,
      recordSource: v.recordSource,
      recordChecked: v.recordChecked === true,
      mask: v.mask === null ? null : { ...v.mask, proposing: false },
      // H35a D2: a text that was only a preview is not brought back; Draft builds it.
      outgoingText: v.previewOnly ? "" : v.outgoingText,
      previewOnly: false,
      rewrites: v.rewrites,
      dateChoice: v.dateChoice,
      dateFlags: v.dateFlags,
      dateLine: v.dateLine,
      finished: v.finished,
      recordOpen: v.record !== null && v.finished === null && (v.previewOnly || v.outgoingText === "") ? false : undefined,
    };
    // A name the model added can still be put back after a reload.
    if (v.finished !== null) {
      const held = v.finished.held ?? v.finished.text;
      restoredNow = {
        text: held,
        shown: v.finished.text,
        notes: v.finished.notes ?? [],
        tokensReplaced: 0,
        tagsRestored: v.finished.namesRestored ? 1 : 0,
        repairedMarks: v.finished.repairedMarks ?? 0,
        added: v.finished.added ?? [],
        copyHeld: v.finished.copyHeld ?? false,
      };
    }
    // The text held for Send is built again from the record, the masks and the sentences she replaced.
    if (deps.drafting && v.record !== null && v.outgoingText !== "" && !v.previewOnly) {
      const { prepared: p, skipped } = buildOutgoingPrepared(deps.drafting.policy);
      prepared = p;
      state = { ...state, outgoingText: p.outgoing.text, rewrite: syncRewrite(state.rewrite, skipped) };
    }
  }

  const visitReset = (): Partial<AppState> => ({
    noteText: "", photo: null, record: null, recordSource: null, recordChecked: false, mask: null, outgoingText: "", previewOnly: false,
    egressLines: null, finished: null, rewrites: [], selectedSentence: null, rewrite: emptyRewrite(), dateFlags: [],
    dateLine: null, dateChoice: null, reader: emptyReader(), offerDeviceDraft: false, noDraft: null, error: null, errorHand: false, draftGate: false, confirmReplace: false,
    drafting: false, ledger: null,
  });

  function forgetVisit(): void {
    prepared = null;
    restoredNow = null;
    extraMasked = [];
    rewriteMaskDepth = [];
    readerPrepared = null;
    rewritePrep = null;
    replaceArmed = false;
    keepEgressLines = false;
  }

  async function confirmClear(which: ClearKind): Promise<void> {
    forgetVisit();
    const line = storeUsable ? { keptLine: null } : {};
    const keptFold = { ...allFolded(), list: state.unfolded.list };
    try {
      if (which === "visit") {
        set({ ...visitReset(), confirmClear: null, unfolded: keptFold, ...line });
        await deps.kept?.clearVisit();
      } else if (which === "list") {
        // The example mark goes only when the visit is also gone.
        const example = state.example && hasVisit(state);
        set({ clientList: "", example, confirmClear: null, ...line });
        await deps.kept?.clearList();
      } else {
        set({ ...visitReset(), clientList: "", example: false, unfolded: allFolded(), confirmClear: null, ...line });
        await deps.kept?.clearAll();
        await deps.drafting?.clearLedger?.();
      }
    } catch {
      storeFailed();
    }
    (deps.root.querySelector("#note") as HTMLElement | null)?.focus();
  }

  function render(): void {
    state = { ...state, hint: languageLine(state.noteText), recordAdded: addedNow(), recordMissing: missingNow(), date: dateViewNow(), ledger: ledgerNow() };
    // The gate for unlisted name-like words ends when the masks it belongs to are gone (the record changed).
    if (state.draftGate && (state.mask === null || state.record === null)) state = { ...state, draftGate: false };
    // H35a D2: Zone 2 stays empty until Draft (or Ask a second reader) is pressed, on every path. The text
    // that would leave is built by that press. Once Draft has prepared text waiting for Send, a change to the
    // masks or to a sentence rebuilds it in place.
    const d = deps.drafting;
    if (d && waitingForSend()) {
      // One text (X3): Draft has been pressed and Send has not. The box and the string Send gives the job
      // are one value, built again from the masks as they are now.
      const { prepared: p, skipped } = buildOutgoingPrepared(d.policy);
      prepared = p;
      // A line from an earlier send stays; a blocking line goes when the text is no longer blocked.
      state = {
        ...state,
        outgoingText: p.outgoing.text,
        egressLines: p.preview.blockedLine ?? (state.egressLines?.kind === "blocked" ? null : state.egressLines),
        rewrite: syncRewrite(state.rewrite, skipped),
      };
      keepEgressLines = false;
    }
    const active = document.activeElement;
    const id = active instanceof HTMLElement ? active.id : "";
    deps.root.replaceChildren(...renderScreen(state, handlers));
    persist();
    if (id) {
      const again = deps.root.querySelector(`#${id}`) as HTMLElement | null;
      again?.focus();
      // A text box she was typing in keeps its cursor at the end of what she typed.
      if (again instanceof HTMLTextAreaElement) again.setSelectionRange(again.value.length, again.value.length);
    }
  }
  const syncRewrite = (r: RewriteState, skipped: number, invalidateResult = false): RewriteState => {
    const next: RewriteState = {
      working: r.working,
      line: r.line,
      result: invalidateResult || skipped > 0 ? null : r.result,
      pending: r.pending,
    };
    if (skipped > 0) next.skipped = skipped;
    return next;
  };
  // Sentences she replaced with "Shorter" or "Plainer" and quote masks are replayed in chronological order (Fault A + Fault B).
  function buildOutgoingPrepared(
    policy: MaskPolicy,
    rewrites: readonly Replacement[] = state.rewrites,
    record = outRecord()!,
  ): { prepared: Prepared; skipped: number; lastApplied: boolean } {
    const spans = record === outRecord() ? spansPart() : {};
    let out = prepareDraft({ record, clients: clientsNow(), policy, extraMasked: [], addedNames: addedNow(), ...spans, noteText: noteForPresent() }).outgoing;
    let maskCursor = 0;
    let skipped = 0;
    let lastApplied = true;
    for (let i = 0; i < rewrites.length; i += 1) {
      const depth = i < rewriteMaskDepth.length ? rewriteMaskDepth[i]! : 0;
      if (depth > maskCursor) {
        out = maskTermsInOutgoing(out, extraMasked.slice(maskCursor, depth));
        maskCursor = depth;
      }
      const step = applyRecordReplacements(out, [rewrites[i]!]);
      if (i === rewrites.length - 1) lastApplied = step.skipped === 0;
      out = step.outgoing;
      skipped += step.skipped;
    }
    if (maskCursor < extraMasked.length) {
      out = maskTermsInOutgoing(out, extraMasked.slice(maskCursor));
    }
    const values = checkValuesForMask(out.mask);
    return {
      prepared: { outgoing: out, preview: makePreview(out.text, values), values, policy },
      skipped,
      lastApplied,
    };
  }
  // The prepared draft from the record, the masks and the sentences she replaced, as they are now.
  const builtNow = (): Prepared => buildOutgoingPrepared(deps.drafting!.policy).prepared;
  // Draft has been pressed, a text is held for Send, and nothing has been sent or is being asked.
  const waitingForSend = (): boolean =>
    deps.drafting !== undefined && state.record !== null && prepared !== null && !state.previewOnly && !state.drafting && state.finished === null &&
    state.noDraft === null && !state.reader.pending && !state.rewrite.working && rewritePrep === null;
  // A rewrite waiting for Send, when the cloud switch is on (drafting R10.5).
  let rewritePrep: { prep: RewritePrepared; range: SentenceRange; nth: number; wasPreview: boolean } | null = null;
  // Set by a rewrite so that the line it printed survives the rebuild of the preview.
  let keepEgressLines = false;
  let resultMs: (number | null)[] = [];
  function ledgerNow(): LedgerView | null {
    const entries = deps.drafting ? deps.drafting.ledger.all() : [];
    if (resultMs.length > entries.length) resultMs.length = entries.length;
    while (resultMs.length < entries.length) resultMs.push(null);
    if (entries.length === 0) return null;
    return { entries, ms: resultMs.slice() };
  }
  function clockMs(): number {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  }
  async function timed<T>(run: () => Promise<T>): Promise<T> {
    const before = deps.drafting?.ledger.all().length ?? 0;
    const t0 = clockMs();
    try {
      return await run();
    } finally {
      const after = deps.drafting?.ledger.all().length ?? before;
      const ms = Math.max(0, Math.round(clockMs() - t0));
      while (resultMs.length < before) resultMs.push(null);
      for (let i = before; i < after; i += 1) resultMs[i] = ms;
    }
  }

  // Zone 2 alone, from the state: the focus is in zone 1 when this runs.
  function redrawLeaves(): void {
    const zone = deps.root.querySelector('[data-zone="leaves"]');
    zone?.replaceWith(renderLeavesZone(state, handlers));
  }

  // The list of missing note sentences alone, from the state: the textarea she is typing in keeps its node and focus.
  function redrawMissing(): void {
    state = { ...state, recordMissing: missingNow() };
    const old = deps.root.querySelector("[data-record-missing]");
    const next = renderRecordMissing(state, handlers);
    if (old !== null && next !== null) old.replaceWith(next);
  }

  // While the preview is showing (Draft not pressed), the text follows the masks.
  function refreshPreview(): void {
    const d = deps.drafting;
    if (!d || state.record === null || state.drafting || state.reader.pending) return;
    if (!state.previewOnly && !waitingForSend()) return;
    const { prepared: p, skipped } = buildOutgoingPrepared(d.policy);
    if (!state.previewOnly) prepared = p; // the string held for Send follows the box
    const lines = state.previewOnly ? p.preview.blockedLine : p.preview.blockedLine ?? (state.egressLines?.kind === "blocked" ? null : state.egressLines);
    state = { ...state, outgoingText: p.outgoing.text, egressLines: lines, rewrite: syncRewrite(state.rewrite, skipped) };
    redrawLeaves();
  }

  const set = (patch: Partial<AppState>) => {
    // An error line keeps its "Fill in by hand" button only while the same press that set it is the latest.
    state = { ...state, ...("error" in patch && !("errorHand" in patch) ? { errorHand: false } : {}), ...patch };
    render();
  };

  // The text zone 2 shows, kept so Send gives the job exactly that text.
  let prepared: Prepared | null = null;
  // The restored note with its added names, so a press can put one back.
  let restoredNow: Restored | null = null;

  // Words she masked from the second reader's quotes; the next text built uses them.
  let extraMasked: string[] = [];
  let rewriteMaskDepth: number[] = [];
  let readerPrepared: ReaderPrepared | null = null;

  function setReader(patch: Partial<AppState["reader"]>): void {
    set({ reader: { ...state.reader, ...patch } });
  }

  function applyAsk(o: AskOutcome): void {
    switch (o.status) {
      case "blocked":
        return set({ egressLines: o.lines, reader: { ...state.reader, asking: false } });
      case "offline":
        return setReader({ asking: false, line: o.line });
      case "failed":
        return set({ egressLines: o.lines, reader: { ...state.reader, asking: false, line: o.line } });
      case "answered":
        return set({ egressLines: o.lines, reader: { ...state.reader, pending: false, asking: false, line: null, result: o.result } });
    }
  }

  // Test-only. Read at the moment of sending, so a test can set it after the page has loaded.
  const seedPart = () => {
    const hook = deps.drafting?.seedLeak?.();
    return hook ? { seedLeak: hook } : {};
  };

  function clientsNow() {
    return parseClientList(state.clientList).entries;
  }

  function applyOutcome(o: DraftOutcome): void {
    if (o.status === "blocked") return set({ drafting: false, egressLines: o.lines });
    if (o.status === "failed") {
      if (!o.refused) return set({ drafting: false, error: o.line, egressLines: o.lines, offerDeviceDraft: false });
      // The service accepted nothing. The masked text stays; she can draft on this device or copy it.
      const device = state.device.state === "available";
      set({
        drafting: false,
        error: o.line,
        egressLines: o.lines,
        offerDeviceDraft: device,
        noDraft: device || prepared === null ? null : { line: strings.cloud.copyInstead, copyText: prepared.outgoing.maskedRecord },
        ...(deps.cloudStatus ? { cloudStatus: deps.cloudStatus() } : {}),
      });
      // Hosted-cloud R5.3: bring the refusal line under Send into view when it is outside the viewport, and leave the
      // page alone when it is inside. The alert in the note column is not the target: on a narrow page it is about
      // 2,400 px from Send, so scrolling to it would move the visitor away from the control just pressed and take the
      // line under Send out of view. No focus: that would move a keyboard user.
      const refusal = deps.root.querySelector("[data-refused-line]") as HTMLElement | null;
      if (refusal && typeof window !== "undefined" && typeof refusal.getBoundingClientRect === "function") {
        const r = refusal.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) refusal.scrollIntoView?.({ block: "nearest" });
      }
      return;
    }
    restoredNow = o.restored;
    const cloudNow = deps.cloudStatus?.() ?? state.cloudStatus;
    const shortLine =
      o.labels.source === "ON_DEVICE" &&
      o.entry.mode === "PREFER_IN_CLOUD" &&
      cloudNow?.kind === "refused"
        ? strings.drafting.browserRefusedDeviceDraft
        : o.labels.shortLine;
    set({
      drafting: false,
      error: null,
      noDraft: null,
      offerDeviceDraft: false,
      egressLines: o.lines,
      finished: {
        added: o.restored.added,
        text: o.restored.shown,
        held: o.restored.text,
        source: o.labels.source,
        connected: o.labels.connected,
        notes: o.restored.notes,
        copyHeld: o.restored.copyHeld,
        repairedMarks: o.restored.repairedMarks,
        namesRestored: (o.restored.tagsRestored ?? 0) > 0,
        shortLine,
      },
    });
  }

  function applyStep(step: DraftStep): void {
    switch (step.step) {
      case "blocked":
        return set({ drafting: false, egressLines: step.lines });
      case "needsSend":
        return set({ drafting: false });
      case "done":
        return applyOutcome(step.outcome);
      case "noDraft":
        return set({ drafting: false, noDraft: { line: step.line, copyText: step.copyText } });
    }
  }

  // The device pass on the record text. Its proposals are added to whatever she has pressed meanwhile.
  function runProposals(raw: string, base: MaskSpan[], policy: MaskPolicy): void {
    const make = deps.proposeMasks;
    if (!make) return;
    void (async () => {
      try {
        const result = await runDevicePass(raw, base, make(state.device.state), policy, { presentLine: true });
        if (state.mask === null || state.mask.raw !== raw) return;
        const proposed = result.spans.filter((s) => s.kind === "proposed");
        const spans = [...state.mask.spans, ...proposed].sort((a, b) => a.start - b.start);
        set({ mask: { ...state.mask, spans, proposing: false, proposals: { source: result.inferenceSource, connected: result.connected } } });
      } catch {
        if (state.mask !== null && state.mask.raw === raw) set({ mask: { ...state.mask, proposing: false, line: strings.masking.proposeFailed } });
      }
    })();
  }

  // One press of "Shorter" or "Plainer". The answer goes through the masker inside runRewrite before it is used.
  async function runRewritePress(press: NonNullable<typeof rewritePrep>): Promise<void> {
    const d = deps.drafting;
    const rewriteFor = d?.rewriteFor;
    if (!d || !rewriteFor) return;
    set({ rewrite: { working: true, line: null, result: null, pending: null }, selectedSentence: null });
    rewritePrep = null;
    let outcome;
    try {
      const device = await deps.device.state();
      outcome = await timed(() => runRewrite(press.prep, { rewrite: rewriteFor(device), ledger: d.ledger, device, ...(d.now ? { now: d.now } : {}) }));
    } catch {
      return set({ rewrite: { ...emptyRewrite(), line: strings.drafting.rewriteFailed }, ...(press.wasPreview ? { previewOnly: true } : {}) });
    }
    // Whatever happened, zone 2 goes back to the text it showed before the press.
    const back = press.wasPreview ? { previewOnly: true } : prepared !== null ? { outgoingText: prepared.outgoing.text, previewOnly: false } : {};
    if (outcome.status === "blocked") {
      return set({ ...back, egressLines: outcome.lines, rewrite: emptyRewrite() });
    }
    if (outcome.status !== "rewritten") {
      keepEgressLines = true;
      return set({ ...back, egressLines: outcome.lines, rewrite: { ...emptyRewrite(), line: outcome.line } });
    }
    const replacement: Replacement = { from: press.range.text, to: outcome.value, nth: press.nth };
    state = { ...state, rewrites: [...state.rewrites, replacement] };
    rewriteMaskDepth = [...rewriteMaskDepth, extraMasked.length];
    const rebuilt = buildOutgoingPrepared(d.policy);
    if (!press.wasPreview && prepared !== null) {
      prepared = rebuilt.prepared;
      back.outgoingText = prepared.outgoing.text;
    }
    keepEgressLines = true;
    set({
      ...back,
      egressLines: outcome.lines,
      rewrite: syncRewrite(
        {
          working: false,
          line: null,
          result: rebuilt.lastApplied && rebuilt.skipped === 0 ? { source: outcome.source, connected: outcome.connected } : null,
          pending: null,
        },
        rebuilt.skipped,
      ),
    });
  }

  const handlers: Handlers = {
    onNoteInput(value) {
      const flipped = (state.noteText.trim() !== "") !== (value.trim() !== "");
      state = { ...state, noteText: value };
      persist();
      // Typing does not re-render, so the cursor stays. The first control depends on whether a note
      // exists at all (R13.4), so it is drawn again at that one moment.
      if (flipped) render();
    },
    onListInput(value) {
      state = { ...state, clientList: value };
      persist();
    },
    onStartVisit() {
      set({ started: true });
    },
    onOpenRecord() {
      set({ recordOpen: true });
      (deps.root.querySelector("#record-date, #fold-date") as HTMLElement | null)?.focus();
    },
    onToggleExact() {
      set({ exactOpen: !state.exactOpen });
    },
    onToggleXray() {
      set({ xrayOpen: !state.xrayOpen });
    },
    onMaskClue(phrase) {
      if (state.record === null || phrase.trim() === "") return;
      const raw = rawRecord();
      const own = state.mask !== null && state.mask.raw === raw ? state.mask : null;
      const spans = withPresent(raw, own ? own.spans : runPasses(raw, clientsNow(), deps.drafting?.policy ?? DEFAULT_POLICY).combined);
      const change = maskText(raw, spans, phrase);
      const plan = planDevicePass(state.device.state, state.device.percent, state.device.starting === true, state.device.noAnswer === true);
      set({
        mask: {
          raw,
          spans: change.spans,
          line: own?.line ?? plan.line,
          proposals: own?.proposals ?? null,
          proposing: false,
          keptLikely: own?.keptLikely ?? [],
        },
      });
    },
    onToggleMask(span) {
      if (state.record === null) return;
      const raw = rawRecord();
      const own = state.mask !== null && state.mask.raw === raw ? state.mask : null;
      const spans = withPresent(raw, own ? own.spans : runPasses(raw, clientsNow(), deps.drafting?.policy ?? DEFAULT_POLICY).combined);
      const index = spans.findIndex((item) => item.start === span.start && item.end === span.end && item.key === span.key);
      if (index < 0) return;
      const change = toggleSpan(spans, index);
      const plan = planDevicePass(state.device.state, state.device.percent, state.device.starting === true, state.device.noAnswer === true);
      set({
        mask: {
          raw,
          spans: change.spans,
          line: own?.line ?? plan.line,
          proposals: own?.proposals ?? null,
          proposing: false,
          keptLikely: own?.keptLikely ?? [],
        },
      });
    },
    onTryExample() {
      rewritePrep = null;
      rewriteMaskDepth = [];
      set({
        example: true,
        noteText: inventedVisit.note,
        clientList: inventedVisit.clientList,
        // The record is not filled here. The first control makes it, or with no device model opens
        // hand entry with the prepared invented record, so every step is one press (R13.3).
        record: null,
        mask: null,
        dateFlags: [], dateLine: null, dateChoice: null, rewrites: [], selectedSentence: null, rewrite: emptyRewrite(),
        error: null,
      });
    },
    onRemoveExample() {
      forgetVisit();
      set({ ...visitReset(), example: false, clientList: "", unfolded: allFolded() });
    },
    onGetModel() {
      // Runs from the press: nothing else starts the download (sdk-facts 10, 14).
      const afterReady = (next: DeviceModelState) => {
        setDownloadProgressFeed(null);
        if (next !== "available") {
          const probeErr = deps.device.probeError?.() ?? null;
          set({
            device: { state: next, ...(next === "downloadable" ? { didNotStart: true } : {}) },
            error: fill(strings.errors.modelStartNamed, { name: probeErr ? errorNameOf(probeErr) : "NotSupportedError" }),
            errorHand: true,
          });
          return;
        }
        set({ device: { state: next } });
        // A masking step already on screen gets its device proposals now that the model is ready.
        const m = state.mask;
        if (m !== null && deps.proposeMasks) {
          set({ mask: { ...m, line: planDevicePass(next).line, proposing: true } });
          runProposals(m.raw, m.spans, deps.drafting?.policy ?? DEFAULT_POLICY);
        }
      };
      const fail = (e: unknown) => {
        setDownloadProgressFeed(null);
        set({
          device: { state: "downloadable", didNotStart: true },
          error: fill(strings.errors.modelStartNamed, { name: errorNameOf(e) }),
          errorHand: true,
        });
      };
      set({ device: { state: "downloadable", starting: true, percent: 0 }, error: null, errorHand: false });
      deps.device
        .initialize((fraction) => {
          const percent = fraction * 100;
          if (fraction >= 1) {
            set({ device: { state: "downloadable", starting: true, percent: 100 } });
          } else {
            set({ device: { state: "downloading", starting: true, percent } });
          }
        })
        .then(() => {
          set({ device: { state: "downloadable", starting: true } });
          return deps.device.state();
        })
        .then(afterReady)
        .catch((e: unknown) => {
          if (e instanceof DownloadContinuing) {
            set({
              device: { state: "downloading", percent: state.device.percent, starting: false },
              error: null,
              errorHand: false,
            });
            e.done
              .then(() => {
                setDownloadProgressFeed(null);
                return deps.device.state();
              })
              .then(afterReady)
              .catch(fail);
            return;
          }
          fail(e);
        });
    },
    onPhoto(file) {
      void readPhoto(file).then(async (r) => {
        if (!r.ok) return set({ error: r.line });
        set({ photo: r.photo, error: null });
      });
    },
    onRemovePhoto() {
      set({ photo: null });
    },
    onRecordEdit(record, field) {
      // No re-render: the cursor stays where it is. The masks belonged to the old text.
      // A marked token she has edited out is no longer marked; the guard line goes when the date words change.
      // The field she typed into stays open until she folds it (shell-and-offline R24.2).
      const dateLine = state.record !== null && state.record.visitDate !== record.visitDate ? null : state.dateLine;
      const unfolded = field !== undefined ? { ...state.unfolded, [field]: true } : state.unfolded;
      const dateFlags = state.dateFlags.filter((t) => recordHolds(record, t));
      const skipped =
        deps.drafting && state.rewrites.length > 0
          ? buildOutgoingPrepared(deps.drafting.policy, state.rewrites, withoutFlagged(record, dateFlags)).skipped
          : 0;
      state = { ...state, record, mask: null, dateLine, unfolded, dateFlags, rewrite: syncRewrite(state.rewrite, skipped, true) };
      persist();
      redrawMissing();
    },
    onAddTag(tag) {
      const record = { ...(state.record ?? emptyRecord()) };
      record.present = [...record.present, tag];
      const skipped =
        deps.drafting && state.rewrites.length > 0
          ? buildOutgoingPrepared(deps.drafting.policy, state.rewrites, withoutFlagged(record, state.dateFlags)).skipped
          : 0;
      // The field she is adding to stays open until she folds it (shell-and-offline R24.2).
      set({ record, mask: null, unfolded: { ...state.unfolded, present: true }, rewrite: syncRewrite(state.rewrite, skipped, true) });
    },
    onRemoveTag(index) {
      if (!state.record) return;
      const record = { ...state.record, present: state.record.present.filter((_, i) => i !== index) };
      const skipped =
        deps.drafting && state.rewrites.length > 0
          ? buildOutgoingPrepared(deps.drafting.policy, state.rewrites, withoutFlagged(record, state.dateFlags)).skipped
          : 0;
      set({ record, mask: null, unfolded: { ...state.unfolded, present: true }, rewrite: syncRewrite(state.rewrite, skipped, true) });
    },
    onAddToSeen(index) {
      const line = state.recordMissing[index];
      if (state.record === null || line === undefined) return;
      const record = { ...state.record, seen: [...state.record.seen, line] };
      const skipped =
        deps.drafting && state.rewrites.length > 0
          ? buildOutgoingPrepared(deps.drafting.policy, state.rewrites, withoutFlagged(record, state.dateFlags)).skipped
          : 0;
      set({ record, mask: null, rewrite: syncRewrite(state.rewrite, skipped, true) });
      const next = state.recordMissing.length > 0
        ? deps.root.querySelector(`#add-seen-${Math.min(index, state.recordMissing.length - 1)}`)
        : deps.root.querySelector("#fold-seen, #record-seen");
      (next as HTMLElement | null)?.focus();
    },
    onStartByHand() {
      rewritePrep = null;
      rewriteMaskDepth = [];
      // With the invented example loaded, hand entry opens with its prepared record (marked "invented example").
      const record = state.example ? structuredClone(inventedVisit.preparedRecord) : emptyRecord();
      set({ record, recordOpen: false, recordSource: null, recordChecked: false, error: null, mask: null, dateFlags: [], dateLine: null, dateChoice: null, rewrites: [], selectedSentence: null, rewrite: emptyRewrite(), unfolded: { ...allFolded(), note: state.unfolded.note, list: state.unfolded.list } });
      // The masks step shows the two columns. Edit opens the record rows, and the cursor goes to the first field.
      (deps.root.querySelector("#edit-record, #record-date, #fold-date") as HTMLElement | null)?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    },
    onConfirmDate() {
      const v = state.date;
      if (v === null || v.line === null) return;
      set({ dateChoice: { words: v.words, mode: "confirmed" } });
    },
    onCorrectDate() {
      const v = state.date;
      if (v === null) return;
      set({ dateChoice: { words: v.words, mode: "editing", iso: v.iso } });
    },
    onSetDate(iso) {
      const v = state.date;
      if (v === null || parseIsoDate(iso) === null) return;
      set({ dateChoice: { words: v.words, mode: "set", iso } });
    },
    onToggleFold(which) {
      set({ unfolded: { ...state.unfolded, [which]: !state.unfolded[which] } });
    },
    onSelectSentence(start) {
      const before = state.selectedSentence;
      state = { ...state, selectedSentence: start, rewrite: { ...state.rewrite, line: null } };
      redrawLeaves();
      const id = start ?? before;
      if (id !== null) (deps.root.querySelector(`#sentence-${id}`) as HTMLElement | null)?.focus();
    },
    onRewrite(kind) {
      const d = deps.drafting;
      if (!d?.rewriteFor || state.record === null || state.selectedSentence === null || state.rewrite.working || state.drafting) return;
      const base = !state.previewOnly && prepared !== null ? prepared : builtNow();
      const range = selectableSentences(state.outgoingText).find((r) => r.start === state.selectedSentence);
      if (!range) return;
      if (stopForUnresolved()) return;
      // The job gets exactly this one masked sentence and the fixed instructions (R10.2).
      const prep = prepareRewrite({
        sentence: range.text,
        kind,
        cloud: state.cloud,
        online: state.network !== "offline",
        values: base.values,
        screen: { outgoing: { mask: base.outgoing.mask }, clients: clientsNow(), policy: d.policy },
      });
      const press = { prep, range, nth: occurrenceIndex(state.outgoingText, range), wasPreview: state.previewOnly };
      if (prep.requiresSend) {
        // With the cloud switch on, the sentence could leave: show the exact text and wait for Send (R10.5).
        rewritePrep = press;
        return set({
          outgoingText: prep.text,
          previewOnly: false,
          selectedSentence: null,
          egressLines: prep.preview.blockedLine,
          rewrite: { working: false, line: null, result: null, pending: { kind, text: prep.text } },
        });
      }
      void runRewritePress(press);
    },
    onMask() {
      if (state.record === null) return;
      const policy = deps.drafting?.policy ?? DEFAULT_POLICY;
      const raw = rawRecord();
      const base = runPasses(raw, clientsNow(), policy).combined;
      const plan = planDevicePass(state.device.state, state.device.percent, state.device.starting === true, state.device.noAnswer === true);
      const willPropose = plan.runDevicePass && deps.proposeMasks !== undefined;
      const keptLikely = state.mask !== null && state.mask.raw === raw ? (state.mask.keptLikely ?? []) : [];
      set({ mask: { raw, spans: base, line: plan.line, proposals: null, proposing: willPropose, keptLikely }, draftGate: false });
      if (willPropose) runProposals(raw, base, policy);
    },
    onMaskChange(spans) {
      // No re-render: the pressed chip keeps its focus. Zone 2 alone is drawn again, so the text
      // that would leave follows her masks before she presses Draft.
      if (state.mask === null) return;
      state = { ...state, mask: { ...state.mask, spans } };
      refreshPreview();
      persist();
      continueGate();
    },
    onKeepLikely(word) {
      if (state.mask === null) return;
      const kept = state.mask.keptLikely ?? [];
      if (kept.some((k) => fold(k) === fold(word))) return;
      state = { ...state, mask: { ...state.mask, keptLikely: [...kept, word] } };
      continueGate();
    },
    onMaskBlocked(name) {
      // Egress-check R15.2: the chip in the block line masks the name again, at every place it stands unmasked.
      const m = state.mask;
      if (m === null || state.record === null) return;
      // The record may write her under another of her names than the chip shows: find the client by any name.
      const chipName = fold(name.trim());
      const client = clientsNow().find((c) => [c.fullName, ...c.otherNames].some((n) => fold(n.trim()) === chipName));
      const wanted = new Set(
        client ? [client.fullName, ...client.otherNames].flatMap((n) => valuesForName(n, MIN_NAME_PART_LENGTH)) : valuesForName(name, MIN_NAME_PART_LENGTH),
      );
      let spans = m.spans;
      for (let guard = 0; guard <= spans.length; guard++) {
        const at = spans.findIndex((s) => !s.accepted && !s.sentOnPurpose && (wanted.has(fold(s.surfaceForm)) || (client !== undefined && s.clientId === client.id)));
        if (at === -1) break;
        spans = toggleSpan(spans, at).spans;
      }
      if (spans === m.spans) {
        // Not a span she unmasked: mask the words by hand, the name whole first, then its parts.
        for (const word of [name, ...name.split(/\s+/)]) spans = maskText(m.raw, spans, word).spans;
      }
      set({ mask: { ...m, spans } });
      (deps.root.querySelector("#draft") as HTMLElement | null)?.focus();
    },
    onTryListed() {
      // Egress-check R15.4: only on the invented visit. One listed name is unmasked, so the block can be met.
      const d = deps.drafting;
      if (!d || !state.example || state.record === null || state.drafting) return;
      let m = state.mask;
      if (m === null) {
        const raw = rawRecord();
        const plan = planDevicePass(state.device.state, state.device.percent, state.device.starting === true, state.device.noAnswer === true);
        m = { raw, spans: withPresent(raw, runPasses(raw, clientsNow(), d.policy).combined), line: plan.line, proposals: null, proposing: false };
      }
      const at = m.spans.findIndex((s) => s.accepted && !s.sentOnPurpose && s.kind === "listed");
      if (at === -1) return;
      set({ mask: { ...m, spans: toggleSpan(m.spans, at).spans } });
    },
    onAskClear(which) {
      set({ confirmClear: which });
      (deps.root.querySelector("#clear-keep") as HTMLElement | null)?.focus();
    },
    onCancelClear() {
      const which = state.confirmClear;
      if (which === null) return;
      set({ confirmClear: null });
      (deps.root.querySelector(`#${clearControlId(which)}`) as HTMLElement | null)?.focus();
    },
    onConfirmClear() {
      const which = state.confirmClear;
      if (which === null) return;
      return confirmClear(which);
    },
    onConfirmReplace() {
      if (state.finished === null || !state.confirmReplace) return;
      replaceArmed = true;
      handlers.onDraft?.();
    },
    onCancelReplace() {
      replaceArmed = false;
      if (!state.confirmReplace) return;
      set({ confirmReplace: false });
      (deps.root.querySelector("#draft") as HTMLElement | null)?.focus();
    },
    confirmPurpose: deps.confirmPurpose,
    onDraft() {
      const d = deps.drafting;
      if (!d || state.record === null || state.drafting) return;
      // H35a D8: nothing that looks like an unlisted name leaves without her press. Draft stops here, shows the
      // words to mask or keep, and goes on by itself when the last one is resolved.
      if (stopForUnresolved()) {
        replaceArmed = false;
        return;
      }
      if (askReplace()) return;
      replaceArmed = false;
      const clients = clientsNow();
      const { prepared: prep, skipped } = buildOutgoingPrepared(d.policy);
      prepared = prep;
      rewritePrep = null;
      set({
        drafting: true,
        confirmReplace: false,
        outgoingText: prep.outgoing.text,
        previewOnly: false,
        egressLines: prep.preview.blockedLine,
        noDraft: null,
        offerDeviceDraft: false,
        error: null,
        selectedSentence: null,
        rewrite: syncRewrite(emptyRewrite(), skipped),
        reader: { ...state.reader, pending: false, line: null },
      });
      readerPrepared = null;
      void (async () => {
        try {
          const device = await deps.device.state();
          const percent = state.device.percent;
          const step = await timed(() => requestDraft(prep, {
            online: d.online,
            device: async () => ({ state: device, ...(percent === undefined ? {} : { percent }) }),
            draft: d.draftFor(device),
            ledger: d.ledger,
            clients,
            noteText: state.noteText,
            ...(d.now ? { now: d.now } : {}),
            ...(d.findNames ? { findNames: d.findNames } : {}),
            ...seedPart(),
          }));
          applyStep(step);
        } catch {
          set({ drafting: false, error: strings.drafting.failed });
        }
      })();
    },
    onAskReader() {
      const d = deps.drafting;
      if (!d || !deps.secondReader || state.record === null || state.drafting || state.reader.asking) return;
      if (stopForUnresolved()) return;
      const { prepared: built, skipped } = buildOutgoingPrepared(d.policy);
      const prep = prepareSecondReader(built.outgoing);
      readerPrepared = prep;
      set({
        outgoingText: prep.text,
        previewOnly: false,
        egressLines: prep.preview.blockedLine,
        noDraft: null,
        error: null,
        rewrite: syncRewrite(state.rewrite, skipped),
        reader: { ...state.reader, pending: true, line: null },
      });
      // H35a D6 + H40 Item 2: keep the prepared outgoing request and Send visible together and move focus to Send.
      const outgoing = deps.root.querySelector("[data-outgoing]") as HTMLElement | null;
      const sendBtn = deps.root.querySelector("#send") as HTMLElement | null;
      outgoing?.scrollIntoView?.({ block: "nearest" });
      sendBtn?.focus?.({ preventScroll: true });
      const viewH = typeof window === "object" ? window.innerHeight : 0;
      const sendRect = sendBtn?.getBoundingClientRect?.();
      if (sendBtn && viewH > 0 && sendRect && (sendRect.top < 0 || sendRect.bottom > viewH)) {
        sendBtn.scrollIntoView?.({ block: "nearest" });
      }
    },
    onMaskQuote(quote) {
      const d = deps.drafting;
      if (!d) return;
      let rest = quote;
      for (const tag of tagsIn(quote)) rest = rest.split(tag).join("\n");
      const pieces: string[] = [];
      for (const piece of rest.split("\n").map((p) => p.trim())) {
        if (!/[\p{L}\p{N}]/u.test(piece)) continue;
        if (!extraMasked.includes(piece)) extraMasked = [...extraMasked, piece];
        pieces.push(piece);
      }
      maskQuoteInRecord(pieces);
      const reader = {
        ...state.reader,
        maskedQuotes: state.reader.maskedQuotes.includes(quote) ? state.reader.maskedQuotes : [...state.reader.maskedQuotes, quote],
        announce: fill(strings.secondReader.maskedAnnounce, { what: quote }),
      };
      // While the reader's text is waiting for Send, show the text with the new mask.
      if (state.reader.pending && state.record !== null) {
        const { prepared: built, skipped } = buildOutgoingPrepared(d.policy);
        const prep = prepareSecondReader(built.outgoing);
        readerPrepared = prep;
        set({ outgoingText: prep.text, previewOnly: false, egressLines: prep.preview.blockedLine, rewrite: syncRewrite(state.rewrite, skipped), reader });
      } else {
        set({ reader });
      }
      continueGate();
    },
    onSend() {
      if (stopForUnresolved()) return;
      const d = deps.drafting;
      if (rewritePrep !== null) {
        if (!state.rewrite.working) void runRewritePress(rewritePrep);
        return;
      }
      if (d && deps.secondReader && state.reader.pending && readerPrepared !== null) {
        if (state.drafting || state.reader.asking) return;
        const prep = readerPrepared;
        const readers = deps.secondReader;
        setReader({ asking: true, line: null });
        void (async () => {
          try {
            const device = await deps.device.state();
            applyAsk(
              await askWhenOnline(prep, {
                reader: readers.readerFor(device),
                ledger: d.ledger,
                clients: clientsNow(),
                policy: d.policy,
                online: d.online,
                ...(d.now ? { now: d.now } : {}),
              }),
            );
          } catch {
            setReader({ asking: false, line: strings.secondReader.needsConnection });
          }
        })();
        return;
      }
      if (!d || prepared === null || state.drafting) return;
      // Nothing is sent unless the box shows the very string that is held for sending (X3).
      const guard = guardSend(state.outgoingText, prepared.outgoing.text);
      if (!guard.ok) return set({ outgoingText: guard.redraw });
      const prep = prepared;
      set({ drafting: true, error: null });
      void (async () => {
        try {
          const device = await deps.device.state();
          const outcome = await timed(() => sendDraft(prep, "PREFER_IN_CLOUD", {
            draft: d.draftFor(device),
            ledger: d.ledger,
            clients: clientsNow(),
            noteText: state.noteText,
            ...(d.now ? { now: d.now } : {}),
            ...(d.findNames ? { findNames: d.findNames } : {}),
            ...seedPart(),
          }));
          applyOutcome(outcome);
        } catch {
          set({ drafting: false, error: strings.drafting.failed });
        }
      })();
    },
    onDeviceDraft() {
      const d = deps.drafting;
      if (!d || state.drafting) return;
      if (stopForUnresolved()) return;
      if (prepared === null) return;
      const prep = prepared;
      set({ drafting: true, error: null, offerDeviceDraft: false });
      void (async () => {
        try {
          const device = await deps.device.state();
          if (device !== "available") return set({ drafting: false, error: strings.deviceModelAbsent });
          applyOutcome(
            await timed(() => sendDraft(prep, "ONLY_ON_DEVICE", {
              draft: d.draftFor(device),
              ledger: d.ledger,
              clients: clientsNow(),
              noteText: state.noteText,
              ...(d.now ? { now: d.now } : {}),
              ...(d.findNames ? { findNames: d.findNames } : {}),
              ...seedPart(),
            })),
          );
        } catch {
          set({ drafting: false, error: strings.drafting.failed });
        }
      })();
    },
    onCopyFinished() {
      // One string: the sheet prints state.finished.text and Copy sends the same value. A held note is not copied.
      if (state.finished?.copyHeld) return;
      const text = state.finished?.text;
      if (text !== undefined) void deps.drafting?.copy(text).catch(() => undefined);
    },
    onCopyCaseNote(text: string) {
      if (state.finished?.copyHeld) return;
      void deps.drafting?.copy(text).catch(() => undefined);
    },
    onRestoreAdded(tag) {
      if (restoredNow === null || state.finished === null) return;
      restoredNow = restoreAddedTag(restoredNow, tag, clientsNow());
      set({
        finished: {
          ...state.finished,
          text: restoredNow.shown,
          held: restoredNow.text,
          notes: restoredNow.notes,
          added: restoredNow.added,
          copyHeld: restoredNow.copyHeld,
          repairedMarks: restoredNow.repairedMarks,
          namesRestored: (restoredNow.tagsRestored ?? 0) > 0,
        },
      });
    },
    onCopyMasked() {
      const text = state.noDraft?.copyText;
      if (text !== undefined) void deps.drafting?.copy(text).catch(() => undefined);
    },
    onMakeRecord() {
      const job = deps.structure;
      if (!job || state.working) return;
      const hasPhoto = state.photo !== null;
      if (state.noteText.trim() === "" && !hasPhoto) return set({ error: strings.record.noInput });
      if (checkLength({ note: state.noteText, hasPhoto, results: deps.results }) === "tooLong") {
        return set({ error: strings.record.tooLong });
      }
      const waiting = state.device.state === "downloading";
      set({ working: true, waiting, error: null });
      const input = state.photo ? { noteText: state.noteText, photo: state.photo } : { noteText: state.noteText };
      job.run(input).then(
        (result) => {
          rewritePrep = null;
          rewriteMaskDepth = [];
          const adopted = adopt(result.value);
          const checked = result.fromModel === true && input.photo === undefined && input.noteText.trim() !== "";
          set({ ...adopted, working: false, waiting: false, recordSource: result.inferenceSource, recordChecked: checked, mask: null, rewrites: [], selectedSentence: null, rewrite: emptyRewrite(), unfolded: { ...allFolded(), note: state.unfolded.note, list: state.unfolded.list } });
        },
        (e: unknown) => {
          const demoteNames = new Set(["QuotaExceededError", "NotSupportedError", "InvalidStateError"]);
          if (e instanceof StructureFailure) {
            const partial = e.kind === "notClean" && e.partial ? { ...emptyRecord(), ...e.partial } : null;
            // H35a D3: a failure that is not the model's own length finding carries the error's name and offers hand entry.
            const named = e.kind === "failed";
            const errName = e.errorName ?? "Error";
            const demote = named && demoteNames.has(errName);
            if (demote) deps.device.clearSessionMade?.();
            set({
              ...(partial ? adopt(partial) : {}),
              ...(demote ? { device: { state: "downloadable", didNotStart: true } } : {}),
              working: false,
              waiting: false,
              error: named ? fill(strings.record.failedNamed, { name: errName }) : e.line,
              errorHand: named,
              recordSource: null,
              recordChecked: false,
            });
          } else {
            const errName = errorNameOf(e);
            const demote = demoteNames.has(errName);
            if (demote) deps.device.clearSessionMade?.();
            set({
              ...(demote ? { device: { state: "downloadable", didNotStart: true } } : {}),
              working: false,
              waiting: false,
              error: fill(strings.record.failedNamed, { name: errName }),
              errorHand: true,
              recordChecked: false,
            });
          }
        },
      );
    },
  };

  async function refreshNetwork(): Promise<void> {
    const offline = await deps.isOffline();
    set({ network: offline ? "offline" : "online" });
  }

  function refreshCloud(): void {
    if (deps.cloudStatus) set({ cloudStatus: deps.cloudStatus() });
  }

  return {
    async start() {
      // H51e: the first check ends at FIRST_DEVICE_CHECK_LIMIT_MS at the latest. A check that never answers, or that
      // rejects, counts as no answer: the page says so and goes on as with no device model.
      let bound: ReturnType<typeof setTimeout> | undefined;
      const devicePromise = Promise.race([
        Promise.resolve()
          .then(() => deps.device.state())
          .then((s) => ({ state: s, noAnswer: false }), () => ({ state: "unavailable" as DeviceModelState, noAnswer: true })),
        new Promise<{ state: DeviceModelState; noAnswer: boolean }>((resolve) => {
          bound = setTimeout(() => resolve({ state: "unavailable", noAnswer: true }), deps.firstCheckLimitMs ?? FIRST_DEVICE_CHECK_LIMIT_MS);
        }),
      ]).finally(() => clearTimeout(bound));
      const offlinePromise = deps.isOffline();
      let deviceSettled = false;
      void devicePromise.then(({ state: deviceState, noAnswer: bounded }) => {
        // The device model's own availability limit (15 s) ending without an answer is no answer too.
        const noAnswer = bounded || (deviceState === "unavailable" && deps.device.noAnswer?.() === true);
        deviceSettled = true;
        const probeErr = deviceState === "downloadable" ? deps.device.probeError?.() ?? null : null;
        // H51c: a masking step opened while the check was starting now gets the line of the answer, and the device
        // pass when the answer is available.
        const m = state.mask;
        const waiting = m !== null && state.device.starting === true && state.device.state === "unavailable" && m.proposals === null && !m.proposing;
        const plan = planDevicePass(deviceState, 0, false, noAnswer);
        const propose = waiting && plan.runDevicePass && deps.proposeMasks !== undefined;
        set({
          ...(waiting && m !== null ? { mask: { ...m, line: plan.line, proposing: propose } } : {}),
          device: { state: deviceState, ...(probeErr !== null ? { didNotStart: true } : {}), ...(noAnswer ? { noAnswer: true } : {}) },
          ...(probeErr !== null
            ? {
                error: fill(strings.errors.modelStartNamed, { name: errorNameOf(probeErr) }),
                errorHand: true,
              }
            : {}),
        });
        if (propose && m !== null) runProposals(m.raw, m.spans, deps.drafting?.policy ?? DEFAULT_POLICY);
      });
      void offlinePromise.then((offline) => {
        set({ network: offline ? "offline" : "online" });
      });
      if (deps.kept) {
        const r = await deps.kept.load();
        if (r.status === "ok") applyKept(r.data);
        else if (r.status === "unreadable") state = { ...state, keptLine: strings.kept.unknownVersion };
        else if (r.status === "failed") {
          storeUsable = false;
          state = { ...state, keptLine: strings.kept.notKept };
        }
      }
      if (!deviceSettled) state = { ...state, device: { ...state.device, starting: true } };
      restored = true;
      render();
      await Promise.all([devicePromise, offlinePromise]);
    },
    refreshNetwork,
    refreshCloud,
    state: () => state,
    handlers,
    render,
  };
}
