import type { DeviceModelState, InferenceSource, VisitRecord } from "../inference/types";
import type { StoredPhoto } from "../storage/notes";
import type { ResultsLookup } from "./figures";
import type { CloudTier } from "../constants";
import type { CloudStatusView } from "./cloudStatus";
import type { EgressLines } from "../egress/line";
import type { LedgerEntry } from "../egress/ledger";
import type { ReaderResult } from "../secondReader/flow";
import type { MaskSpan } from "../masking/types";
import type { Replacement } from "../drafting/sentences";

/** The fields of the visit record that fold (shell-and-offline R24). */
export const RECORD_FIELDS = ["date", "present", "seen", "agreed", "risks", "nextSteps"] as const;
export type RecordField = (typeof RECORD_FIELDS)[number];
/** Everything that folds to one line with an Edit control. */
export type FoldKey = "note" | "list" | "scans" | "reader" | "ledger" | "measured" | RecordField;

/** Which of the three clear controls is asking (shell-and-offline R27.4). */
export type ClearKind = "visit" | "list" | "all";

export interface AppState {
  network: "online" | "offline";
  device: { state: DeviceModelState; percent?: number; starting?: boolean; didNotStart?: boolean; noAnswer?: boolean };
  /** the cloud switch, AI_SERVICE_ENABLED */
  cloud: boolean;
  /** the derived cloud state for the status bar; absent in tests that pass only the switch */
  cloudStatus?: CloudStatusView;
  tier: CloudTier;
  results: ResultsLookup;
  noteText: string;
  clientList: string;
  /** true while the invented example is loaded */
  example: boolean;
  /** true after Start a visit. An untouched visit before that is the cold first screen. */
  started: boolean;
  /** false: the masks step is the two columns. true: the record rows are open. Absent keeps the rows. */
  recordOpen?: boolean;
  /** true: the exact text that would be sent is on the masks step. */
  exactOpen?: boolean;
  record: VisitRecord | null;
  /** names in the record that are in neither the note nor the client list (ruling 24); worked out on each render */
  recordAdded: string[];
  /** true after a record from the device model for a typed note; only then is the record checked against the note */
  recordChecked: boolean;
  /** note sentences a checked device record lacks; worked out on each render */
  recordMissing: string[];
  /** where the record came from; null for a hand-made or example record, which carries no label */
  recordSource: InferenceSource | null;
  outgoingText: string;
  /** true while zone 2 shows the text a draft would send, before she has pressed Draft; Send waits for Draft */
  previewOnly: boolean;
  /** the printed egress check line; null before any send */
  egressLines: EgressLines | null;
  finished: {
    /** the text on the sheet and on the clipboard: no token syntax (drafting R16.1) */
    text: string;
    /** the working text, with tags still in it where a name or token was not put back; never shown (R16.6) */
    held?: string;
    source: InferenceSource;
    connected: boolean;
    /** plain lines about the restore: unmatched tags, pronoun notes */
    notes?: string[];
    /** "Shorter draft made on this device." for a device draft */
    shortLine?: string | null;
    /** names the model added; each stays a tag until she presses to put it back */
    added?: { tag: string; name: string; clientId?: string }[];
    /** a tag or token that names a tag is still in the text: Copy is held (drafting R15.4) */
    copyHeld?: boolean;
    /** count of repaired pronoun:Role / 1st-2nd / multi-tag / possessive marks on this finished note (H39b) */
    repairedMarks?: number;
    /** true when names were put back on this device (tokensReplaced > 0) */
    namesRestored?: boolean;
  } | null;
  /** true while a draft is being made */
  drafting: boolean;
  /** the cloud service refused the draft and a device model is present: offer the shorter draft here */
  offerDeviceDraft: boolean;
  /** offline with no usable device model: the plain line and the masked record to copy */
  noDraft: { line: string; copyText: string } | null;
  /** true when a structure job is wired in (capture-and-record spec) */
  makeRecordWired: boolean;
  error: string | null;
  /** H35a D3: the error line above comes from a failed model press; offer "Fill in by hand" beside it */
  errorHand: boolean;
  /** H35a D8: Draft was pressed while unlisted name-like words were unresolved; Draft goes on when she has resolved the last one */
  draftGate: boolean;
  /** the photo of the handwritten page, kept on this device */
  photo: StoredPhoto | null;
  /** true while the structure job runs */
  working: boolean;
  /** true while the job waits for the device model download */
  waiting: boolean;
  /** a plain line under the note, for example the language line */
  hint: string | null;
  reader: ReaderState;
  /** the masking step on the record text; null until she presses Mask, and again after any edit to the record */
  mask: MaskState | null;
  /** date-like tokens in the record that the rough note does not hold; marked, and left out of the outgoing text (capture-and-record R12.3) */
  dateFlags: string[];
  /** "The device wrote a date that is not in your note..." while it applies */
  dateLine: string | null;
  /** her answer about the reading of the date words; it holds only while the words are the same */
  dateChoice: DateChoice | null;
  /** worked out on each render from the date words, the locale and the clock */
  date: DateView | null;
  /**
   * shell-and-offline R20.3 and R24: the note editor, the client list and each record field fold once a
   * record exists; true here means she opened it, or typed into it, and it stays open until she folds it.
   */
  unfolded: Record<FoldKey, boolean>;
  /** drafting R10: sentences of the outgoing text replaced by a rewrite, in order */
  rewrites: Replacement[];
  /** drafting R10.1: the start of the selected sentence in the outgoing text, or null */
  selectedSentence: number | null;
  /** drafting R10.2: the state of the last rewrite press */
  rewrite: RewriteState;
  /** egress-check R10: the ledger fold; null before any send */
  ledger: LedgerView | null;
  /** Reviewer X-ray. Closed hides the ledger word. Never kept. */
  xrayOpen?: boolean;
  /** shell-and-offline R27.5, R27.6: one line when saved data was not read or this browser keeps nothing; else null */
  keptLine: string | null;
  /** shell-and-offline R27.4: the clear control that is asking now, or null. Never kept. */
  confirmClear: ClearKind | null;
  /** A second Draft is asking before it replaces the finished note. Never kept. */
  confirmReplace: boolean;
}

export interface DateChoice {
  words: string;
  mode: "confirmed" | "editing" | "set";
  /** the date she set, as a date input holds it */
  iso?: string;
}

/** What the record view shows about the date words (capture-and-record R12.5). */
export interface DateView {
  words: string;
  /** the line beside the words; null when the words cannot be read as a date */
  line: string | null;
  status: "none" | "plain" | "assumed" | "confirmed" | "editing" | "set";
  /** the value for the date input */
  iso: string;
}

export interface RewriteState {
  working: boolean;
  line: string | null;
  result: { source: InferenceSource; connected: boolean } | null;
  /** with the cloud switch on the press waits for Send: the exact text zone 2 shows meanwhile */
  pending: { kind: "shorter" | "plainer"; text: string } | null;
  /** count of stored sentence rewrites that no longer matched when rebuilding outgoing text */
  skipped?: number;
}

export interface LedgerView {
  /** every entry of the ledger, for the tables in the fold (shell-and-offline R39.2) */
  entries: readonly LedgerEntry[];
  /** Wall time for the call that appended each entry. Null when that call was not timed. */
  ms?: readonly (number | null)[];
}

export function emptyRewrite(): RewriteState {
  return { working: false, line: null, result: null, pending: null };
}

/** The record text with its masks (masking R5). Spans change without a re-render, so a pressed chip keeps focus. */
export interface MaskState {
  /** the record text the spans belong to, as zone 2 will build it */
  raw: string;
  spans: MaskSpan[];
  /** the plain line about the device pass for the current device state */
  line: string;
  /** where the device proposals came from, once there are some */
  proposals: { source: InferenceSource; connected: boolean } | null;
  /** true while the device pass runs */
  proposing: boolean;
  /**
   * H35a D8: words that look like names and are not on her list, which she chose to keep unmasked.
   * Reset whenever the record changes (the mask is rebuilt). Not kept on this device.
   */
  keptLikely?: string[];
}

/** The second reader (second-reader spec). Everything here lives in memory for the session only. */
export interface ReaderState {
  /** zone 2 shows the reader's text and waits for Send */
  pending: boolean;
  /** true while the question is being answered */
  asking: boolean;
  /** the redacted answer; the raw reply is never kept (R3.3) */
  result: ReaderResult | null;
  /** a plain line about a failure or being offline; the text is kept */
  line: string | null;
  /** quotes she masked from the answer, so their chips show as masked */
  maskedQuotes: string[];
  /** words for the polite live region */
  announce: string;
}

export function emptyReader(): ReaderState {
  return { pending: false, asking: false, result: null, line: null, maskedQuotes: [], announce: "" };
}

export interface Handlers {
  onNoteInput(value: string): void;
  onListInput(value: string): void;
  onTryExample(): void;
  /** Leaves the cold first screen for an empty visit. Does not make a record. */
  onStartVisit?(): void;
  /** Masks step: open the record rows. */
  onOpenRecord?(): void;
  /** Masks step: show or hide the exact text that would be sent. */
  onToggleExact?(): void;
  /** Masks step: mask the leftover clue phrase. */
  onMaskClue?(phrase: string): void;
  /** Masks step: toggle one chip. */
  onToggleMask?(span: MaskSpan): void;
  onRemoveExample(): void;
  /** Called from the "Get the device model" press only. */
  onGetModel(): void;
  onMakeRecord(): void;
  // Capture and record (optional so the shell's own tests stay valid).
  /** A file chosen with the camera control. The type is checked before anything else. */
  onPhoto?(file: File): void;
  onRemovePhoto?(): void;
  /** The whole record after a hand edit. Does not re-render, so the cursor stays. */
  /** `field` is the record field she typed into, so it stays open (shell-and-offline R24.2). */
  onRecordEdit?(record: VisitRecord, field?: RecordField): void;
  /** Add or remove a person tag, or start an empty record by hand. These re-render. */
  onAddTag?(tag: { label: string; role: "client" | "worker" | "other" }): void;
  onRemoveTag?(index: number): void;
  /** Puts the listed note sentence at this index into Seen, as written. Re-renders. */
  onAddToSeen?(index: number): void;
  onStartByHand?(): void;
  /** Her press on a word that looks like a name and is not on her list: keep it unmasked (H35a D8). */
  onKeepLikely?(word: string): void;
  // Masking (masking spec).
  /** Her press on Mask: exact and near on the record text, then the device pass if the model is ready. */
  onMask?(): void;
  /** After a chip or word is pressed: the new spans. Does not re-render. */
  onMaskChange?(spans: MaskSpan[]): void;
  // Second review.
  onConfirmDate?(): void;
  onCorrectDate?(): void;
  onSetDate?(iso: string): void;
  onToggleFold?(which: FoldKey): void;
  /** Select a sentence of the outgoing text by its start, or null to clear. Re-renders zone 2 only. */
  onSelectSentence?(start: number | null): void;
  onRewrite?(kind: "shorter" | "plainer"): void;
  /** Kept on this device (shell-and-offline R27.4): a clear control asks, then the go-ahead or the keep press answers. */
  onAskClear?(which: ClearKind): void;
  onConfirmClear?(): void;
  onCancelClear?(): void;
  /** Her answer when a second Draft would replace the finished note. */
  onConfirmReplace?(): void;
  onCancelReplace?(): void;
  /** Egress-check R15: the chip in the block line was pressed; mask that name again. */
  onMaskBlocked?(name: string): void;
  /** Egress-check R15.4: "Try to send a listed name" on the invented visit; unmasks one listed name. */
  onTryListed?(): void;
  /** The named question for "send this name on purpose". Without it chips offer no such control. */
  confirmPurpose?(question: string): boolean | Promise<boolean>;
  // Drafting (drafting spec).
  /** Builds the outgoing text and, offline with a device model, makes the device draft at once. */
  onDraft?(): void;
  /** Sends the shown text through the egress module and drafts. */
  onSend?(): void;
  /** Her press after a refusal: make the shorter draft on this device from the same shown text. */
  onDeviceDraft?(): void;
  onCopyFinished?(): void;
  /** Copy the plain-text case note, headings included. */
  onCopyCaseNote?(text: string): void;
  /** Opens or closes the reviewer X-ray on the finished step. */
  onToggleXray?(): void;
  onCopyMasked?(): void;
  /** Her press: put one name the model added back into the finished note. */
  onRestoreAdded?(tag: string): void;
  // Second reader (second-reader spec).
  /** Builds the reader's outgoing text for zone 2; Send then asks. */
  onAskReader?(): void;
  /** Her press on a quote: mask those words, using the same masking as the rest. */
  onMaskQuote?(quote: string): void;
}

export function emptyState(partial: Partial<AppState> = {}): AppState {
  return {
    network: "online",
    device: { state: "unavailable" },
    cloud: false,
    tier: "no-cost",
    results: () => undefined,
    noteText: "",
    clientList: "",
    example: false,
    started: false,
    record: null,
    recordAdded: [],
    recordChecked: false,
    recordMissing: [],
    recordSource: null,
    outgoingText: "",
    previewOnly: false,
    egressLines: null,
    finished: null,
    drafting: false,
    offerDeviceDraft: false,
    noDraft: null,
    makeRecordWired: true,
    error: null,
    errorHand: false,
    draftGate: false,
    photo: null,
    working: false,
    waiting: false,
    hint: null,
    reader: emptyReader(),
    mask: null,
    dateFlags: [],
    dateLine: null,
    dateChoice: null,
    date: null,
    unfolded: allFolded(),
    rewrites: [],
    selectedSentence: null,
    rewrite: emptyRewrite(),
    ledger: null,
    keptLine: null,
    confirmClear: null,
    confirmReplace: false,
    ...partial,
  };
}

/** Nothing opened by hand: every foldable part folds as soon as it has text. */
export function allFolded(): AppState["unfolded"] {
  return { note: false, list: false, scans: false, reader: false, ledger: false, measured: false, date: false, present: false, seen: false, agreed: false, risks: false, nextSteps: false };
}

export function isEmptyState(s: AppState): boolean {
  return s.noteText === "" && s.clientList === "" && !s.example && s.record === null;
}

/** The cold first screen: nothing opened, and Start a visit has not been pressed. */
export function isColdFirst(s: AppState): boolean {
  if (s.started || !isEmptyState(s) || s.photo !== null || s.finished !== null) return false;
  if (s.outgoingText !== "" || s.egressLines !== null || s.error !== null || s.mask !== null) return false;
  if (s.working || s.waiting || s.hint !== null || s.keptLine !== null || s.confirmClear !== null) return false;
  if (s.drafting || s.offerDeviceDraft || s.noDraft !== null || s.previewOnly || s.confirmReplace) return false;
  if (s.reader.pending || s.reader.asking || s.reader.result !== null || s.reader.line !== null) return false;
  return true;
}


export type Step = "makeRecord" | "mask" | "draft" | "send" | "copy" | null;

/**
 * The one primary control: the next step that is open to her now (look and layout, Controls).
 * It is filled with the accent. When nothing is open yet, no control is primary.
 */
export function nextStep(s: AppState): Step {
  // H35a D6: a second reader request is prepared and waits for Send; Send is the next step.
  if (s.reader.pending && !s.reader.asking) return "send";
  if (s.finished !== null) return "copy";
  if (s.record === null) {
    // With a note waiting, the first control is the next step: "Make the record", or without a
    // device model "Enter the record by hand" (capture-and-record R13).
    const canMake = s.device.state === "available" || s.device.state === "downloading";
    const noteWaiting = s.noteText.trim() !== "" || s.photo !== null;
    const open = canMake ? s.makeRecordWired : true;
    return open && noteWaiting && !s.working ? "makeRecord" : null;
  }
  if (s.outgoingText === "" || s.previewOnly) return s.mask === null ? "mask" : "draft";
  return "send";
}
