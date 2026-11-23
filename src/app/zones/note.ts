import { el, svg } from "../dom";
import { iconSvg } from "../icons";
import { verifiedSteps } from "../firstRun";
import { button } from "../parts/button";
import { modelDownload } from "../parts/modelProgress";
import { deviceRunFigure } from "../deviceStill";
import { DEVICE_MODEL_SIZE_GB } from "../../constants";
import { fold } from "../parts/fold";
import { sourceLabel } from "../parts/sourceLabel";
import { renderMaskView } from "../parts/maskView";
import { coldStartLine } from "../coldStart";
import { screenFigureLines } from "../figureText";
import { fill, strings } from "../strings";
import { isEmptyState, nextStep, type AppState, type Handlers, type RecordField } from "../state";
import { renderSteps } from "../parts/steps";
import { renderClearControls } from "../parts/clearPanel";
import { parseClientList } from "../../masking/clientList";
import type { VisitRecord } from "../../inference/types";

export function renderNoteZone(state: AppState, h: Handlers): HTMLElement {
  const s = strings;
  const deviceReady = state.device.state === "available";
  // A download in progress is waited for, not refused (sdk-facts 12).
  const canMake = deviceReady || state.device.state === "downloading";
  const empty = isEmptyState(state) && state.photo === null;

  const note = el("textarea", { id: "note", class: "note-area", rows: "8", placeholder: s.firstRun.notePlaceholder, "aria-label": s.firstRun.noteLabel });
  note.value = state.noteText;
  note.addEventListener("input", () => h.onNoteInput(note.value));

  const list = el("textarea", { id: "client-list", class: "list-area", rows: "4", placeholder: s.firstRun.listPlaceholder, "aria-label": s.firstRun.listLabel });
  list.value = state.clientList;
  list.addEventListener("input", () => h.onListInput(list.value));

  // The camera control: a drawn label over a real file input, so the keyboard and
  // assistive technology see an ordinary file chooser. JPEG and PNG only.
  const photoInput = el("input", { id: "photo-input", class: "file-input", type: "file", accept: "image/jpeg,image/png", "aria-label": s.record.photoLabel });
  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (file) h.onPhoto?.(file);
  });
  const camera = el("label", { class: "btn file-btn", for: "photo-input" }, svg(iconSvg("camera")), el("span", {}, s.record.addPhoto));

  // The first control (capture-and-record R13). One control, filled when it is the next step.
  const noteWaiting = state.noteText.trim() !== "" || state.photo !== null;
  // H51: the first check of the device model (status bar "starting") is not an answer yet. Until it
  // answers, the first control waits; it does not open the no-model path on a computer that has the model.
  const checking = state.device.starting === true && state.device.state === "unavailable";
  const byHand = !canMake && !checking; // device model unavailable or downloadable: the same control opens hand entry
  let firstLabel: string = byHand ? s.actions.enterByHand : s.actions.makeRecord;
  // H35b D4: with the example loaded and no device model the control opens the example's own record, and says so.
  const exampleByHand = byHand && state.example && state.record === null;
  if (exampleByHand) firstLabel = s.actions.useExampleRecord;
  let firstKind: "primary" | "secondary" = "secondary";
  let firstDisabled = false;
  let firstReason = "";
  if (state.record !== null) {
    firstLabel = s.actions.makeRecord;
    firstDisabled = !canMake || !state.makeRecordWired || state.working;
    firstReason = canMake ? s.makeRecordNotBuilt : s.makeRecordNeedsModel;
  } else if (!noteWaiting) {
    firstDisabled = true;
    firstReason = s.addNoteFirst;
  } else if (checking) {
    firstDisabled = true;
    firstReason = s.firstRun.startingModel;
  } else {
    firstKind = "primary";
    firstDisabled = state.working || (canMake && !state.makeRecordWired);
    firstReason = s.makeRecordNotBuilt;
  }
  const makeRecord = button(firstLabel, firstKind, { id: "make-record", icon: "pencil", disabled: firstDisabled, reason: firstReason });
  makeRecord.addEventListener("click", () => (byHand && state.record === null ? h.onStartByHand?.() : h.onMakeRecord()));
  const firstReasonLine =
    state.record === null && !noteWaiting ? el("p", { class: "first-reason", "data-first-reason": "" }, s.addNoteFirst) : null;

  // Once a record exists the editor and the list fold to one line each (shell-and-offline R20.3).
  const folding = state.record !== null;
  const noteLines = state.noteText.split("\n").filter((l) => l.trim() !== "").length;
  const listNames = parseClientList(state.clientList).entries.length;
  const noteFold = folding
    ? foldLine("note", fill(noteLines === 1 ? s.fold.noteOne : s.fold.note, { n: noteLines }), state.example, state.unfolded.note, h)
    : null;
  const listFold = folding
    ? foldLine("list", fill(listNames === 1 ? s.fold.listOne : s.fold.list, { m: listNames }), false, state.unfolded.list, h)
    : null;
  const showNote = !folding || state.unfolded.note;
  const showList = !folding || state.unfolded.list;

  const actions = el("div", { class: "actions" }, makeRecord, photoInput, camera);
  const exampleOrigin = exampleByHand
    ? el("p", { class: "example-record-origin", "data-example-record-origin": "" }, s.firstRun.exampleRecordOrigin)
    : null;
  // H35b D1, D4: on a cold open the one filled button stands in its own row under the steps, above the note.
  let firstRunRow: HTMLElement | null = null;
  if (empty) {
    const tryIt = button(s.firstRun.tryExample, "primary", { id: "try-example", icon: "eye" });
    tryIt.addEventListener("click", () => h.onTryExample());
    firstRunRow = el("div", { class: "first-run-row", "data-first-run-row": "" }, tryIt);
  } else if (state.example) {
    const remove = button(s.firstRun.removeExample, "secondary", { id: "remove-example" });
    remove.addEventListener("click", () => h.onRemoveExample());
    actions.append(remove);
  }
  if (state.device.state === "downloadable") {
    const starting = state.device.starting === true;
    const get = button(s.firstRun.getModel, "secondary", { id: "get-model", disabled: starting, reason: starting ? s.firstRun.startingModel : undefined });
    get.addEventListener("click", () => h.onGetModel());
    actions.append(get, el("p", { class: "model-size", "data-model-size": "" }, fill(s.firstRun.modelSize, { size: DEVICE_MODEL_SIZE_GB })));
  }
  const noteReasons: HTMLElement[] = [];
  if (firstDisabled && firstReasonLine === null && !state.working && firstReason) {
    noteReasons.push(el("p", { class: "control-reason", "data-control-reason": "make-record" }, firstReason));
  }
  if (state.device.state === "downloadable" && state.device.starting === true) {
    noteReasons.push(el("p", { class: "control-reason", "data-control-reason": "get-model" }, s.firstRun.startingModel));
  }

  const photoLine = state.photo
    ? el("p", { class: "photo-line" }, el("span", { "data-photo-line": "" }, s.record.photoAdded), " ", inlineButton(s.record.removePhoto, "remove-photo", () => h.onRemovePhoto?.()))
    : null;

  const modelLines: HTMLElement[] = [];
  if (state.device.state === "downloading") {
    modelLines.push(modelDownload(state.device.percent));
  }
  // H51c: while the first check is starting there is no answer yet, so the page does not say the model is not on this computer.
  if (!deviceReady && !checking) {
    // H51e: a first check that ended at its bound is not an answer that the model is absent.
    if (state.device.noAnswer === true) {
      modelLines.push(el("p", { class: "model-line", "data-model-no-answer": "" }, s.deviceModelNoAnswer));
    } else {
      modelLines.push(el("p", { class: "model-line", "data-model-line": "" }, s.deviceModelAbsent));
    }
    modelLines.push(el("p", { class: "model-line", "data-model-way-forward": "" }, s.deviceModelWayForward));
    const steps = verifiedSteps(state.results);
    if (steps) {
      const [lead, ...rest] = steps;
      modelLines.push(el(
        "div",
        { class: "model-steps", "data-model-steps": "" },
        el("p", {}, s.deviceFirstRunTitle),
        el("p", { "data-past-measurement": "" }, lead ?? ""),
        ...rest.map((t) => el("p", {}, t)),
      ));
    }
  }

  const working = state.working
    ? el(
        "p",
        { class: "working", role: "status", "data-working": "" },
        state.waiting ? fill(s.record.waiting, { percent: Math.round(state.device.percent ?? 0) }) : s.record.working,
      )
    : null;

  const showRun = !deviceReady && !checking && state.device.noAnswer !== true
    && (state.device.state === "unavailable" || state.device.state === "downloadable");
  const coldStart = fold(
    "measured",
    s.folds.measured,
    { open: state.unfolded.measured, onToggle: h.onToggleFold ? () => h.onToggleFold!("measured") : undefined },
    el("p", { class: "cold-start", "data-cold-start": "" }, coldStartLine(state.results)),
    state.record ? figuresSection(state) : null,
    showRun ? deviceRunFigure() : null,
  );
  const errorLine = state.error
    ? el(
        "p",
        { class: "error", role: "alert" },
        svg(iconSvg("crossedOctagon")),
        el("span", {}, state.error),
        // H35a D3: a failed model press offers the record by hand beside the line.
        state.errorHand
          ? el("button", { type: "button", class: "btn inline", "data-kind": "inline", "data-error-hand-entry": "" }, s.record.handEntry)
          : null,
      )
    : null;
  errorLine?.querySelector("[data-error-hand-entry]")?.addEventListener("click", () => h.onStartByHand?.());

  return el(
    "section",
    { class: "zone zone-note", "data-zone": "note", "aria-labelledby": "zone-note-title" },
    el("h2", { id: "zone-note-title" }, s.zones.note),
    el("p", { class: "zone-line" }, s.zoneNoteLine),
    state.keptLine ? el("p", { class: "kept-warning", role: "status", "data-kept-line": "" }, state.keptLine) : null,
    renderClearControls(state, h),
    renderSteps(state),
    empty ? el("p", { class: "audience-line", "data-audience": "" }, s.audience) : null,
    empty ? el("p", { class: "job-line", "data-job": "" }, s.job) : null,
    firstRunRow,
    state.network === "offline" ? el("p", { class: "offline-line", role: "status" }, s.offline) : null,
    state.example && !folding ? el("span", { class: "mark", "data-mark": "example" }, s.firstRun.exampleMark) : null,
    noteFold,
    showNote ? note : null,
    state.hint ? el("p", { class: "hint", role: "status", "data-hint": "" }, state.hint) : null,
    listFold,
    showList ? list : null,
    // With a record, the masking view comes right under the folded note and list, and the record's fields
    // (folded to one line each) follow it; the controls that made the record and the help about the device
    // model stand below. Without a record the order is the first-run order (shell-and-offline R24.6).
    ...(state.record
      ? [errorLine, renderRecord(state, h), actions, firstReasonLine, ...noteReasons, photoLine, working, ...modelLines, coldStart]
      : [actions, errorLine, exampleOrigin, firstReasonLine, ...noteReasons, photoLine, working, ...modelLines, coldStart, state.errorHand ? null : handEntry(h)]),
  );
}

/** One folded line: "Note: N lines." and an Edit control that unfolds the editor (aria-expanded). */
function foldLine(which: "note" | "list", text: string, example: boolean, open: boolean, h: Handlers): HTMLElement {
  const b = el(
    "button",
    {
      type: "button",
      class: "btn inline",
      id: `fold-${which}`,
      "data-kind": "inline",
      "aria-expanded": open ? "true" : "false",
      "aria-controls": which === "note" ? "note" : "client-list",
    },
    open ? strings.fold.close : strings.fold.edit,
  );
  b.addEventListener("click", () => h.onToggleFold?.(which));
  return el(
    "div",
    { class: "fold-line", "data-fold": which },
    el("span", { class: "fold-text" }, text),
    example ? el("span", { class: "mark", "data-mark": "example" }, strings.firstRun.exampleMark) : null,
    b,
  );
}

/** The two measured lines, under the masking controls (measurement R11.1). They come from results files only. */
function figuresSection(state: AppState): HTMLElement {
  const f = strings.figures;
  const { one, two } = screenFigureLines(state.results);
  return el(
    "div",
    { class: "figures", "data-figures": "" },
    el("p", { class: "figure", "data-figure-one": "" }, one),
    el("p", { class: "figure", "data-figure-two": "" }, two),
    el("p", { class: "figures-limits", "data-figures-limits": "" }, f.limits),
  );
}

function inlineButton(label: string, id: string, onPress: () => void, ariaLabel?: string): HTMLButtonElement {
  const b = el("button", { type: "button", class: "btn inline", id, "data-kind": "inline", "aria-label": ariaLabel }, label);
  b.addEventListener("click", onPress);
  return b;
}

function handEntry(h: Handlers): HTMLElement {
  return el("div", { class: "hand-entry" }, inlineButton(strings.record.handEntry, "start-by-hand", () => h.onStartByHand?.()));
}

const splitLines = (value: string) => value.split("\n").map((l) => l.trim()).filter((l) => l !== "");

/** The note sentences a checked device record lacks, each with Add to Seen (capture-and-record R15). Null when the record is not checked. */
export function renderRecordMissing(state: AppState, h: Handlers): HTMLElement | null {
  if (!state.recordChecked) return null;
  const n = state.recordMissing.length;
  return el(
    "div",
    { class: "record-missing", "data-record-missing": String(n), role: "status", hidden: n === 0 },
    n > 0 ? el("p", { id: "record-missing-title" }, n === 1 ? strings.record.missingOne : strings.record.missingMany) : null,
    n > 0
      ? el(
          "ul",
          { "aria-labelledby": "record-missing-title" },
          ...state.recordMissing.map((line, i) =>
            el(
              "li",
              {},
              el("span", { "data-missed-line": "" }, line),
              " ",
              inlineButton(strings.record.addToSeen, `add-seen-${i}`, () => h.onAddToSeen?.(i), fill(strings.record.addToSeenNamed, { line })),
            ),
          ),
        )
      : null,
  );
}

function renderRecord(state: AppState, h: Handlers): HTMLElement {
  const r: VisitRecord = state.record!;
  const f = strings.recordFields;
  let current: VisitRecord = { ...r };
  const edit = (patch: Partial<VisitRecord>, field: RecordField) => {
    current = { ...current, ...patch };
    h.onRecordEdit?.(current, field);
  };

  const date = el("input", { id: "record-date", class: "record-input", type: "text", "aria-label": f.date });
  date.value = r.visitDate;
  date.addEventListener("input", () => edit({ visitDate: date.value }, "date"));

  const list = (id: "seen" | "agreed" | "risks" | "nextSteps", label: string) => {
    const area = el("textarea", { id: `record-${id}`, class: "record-area", rows: "3", "aria-label": `${label}. ${strings.record.editLabel}` });
    area.value = r[id].join("\n");
    area.addEventListener("input", () => edit({ [id]: splitLines(area.value) }, id));
    return area;
  };

  // Each field that holds text folds to one line with Edit (shell-and-offline R24). A field with no text
  // stays open so she can type, and so does a field she opened or typed into.
  const holds: Record<RecordField, string> = {
    date: r.visitDate.trim(),
    present: r.present.map((p) => p.label).join(", "),
    seen: r.seen.join("; "),
    agreed: r.agreed.join("; "),
    risks: r.risks.join("; "),
    nextSteps: r.nextSteps.join("; "),
  };
  const labels: Record<RecordField, string> = { date: f.date, present: f.present, seen: f.seen, agreed: f.agreed, risks: f.risks, nextSteps: f.nextSteps };
  const controls: Record<RecordField, string> = { date: "record-date", present: "record-present", seen: "record-seen", agreed: "record-agreed", risks: "record-risks", nextSteps: "record-nextSteps" };
  const isFolded = (field: RecordField) => holds[field] !== "" && !state.unfolded[field];
  const foldFor = (field: RecordField): HTMLElement | null => {
    if (holds[field] === "") return null;
    const open = state.unfolded[field];
    const b = el(
      "button",
      { type: "button", class: "btn inline", id: `fold-${field}`, "data-kind": "inline", "aria-expanded": open ? "true" : "false", "aria-controls": controls[field] },
      open ? strings.fold.close : strings.fold.edit,
    );
    b.addEventListener("click", () => h.onToggleFold?.(field));
    return el("div", { class: "fold-line record-fold", "data-fold": `record-${field}` }, open ? null : el("span", { class: "fold-text" }, `${labels[field]}: ${holds[field]}`), b);
  };
  /** The fold line, then the editor row when the field is open. */
  const field = (name: RecordField, editor: () => HTMLElement): (HTMLElement | null)[] => [foldFor(name), isFolded(name) ? null : editor()];

  const addedKeys = new Set(state.recordAdded.map((n) => n.toLowerCase()));
  const chips = r.present.map((p, i) =>
    el(
      "span",
      { class: "chip", "data-role": p.role, ...(addedKeys.has(p.label.trim().toLowerCase()) ? { "data-added": "" } : {}) },
      el("span", { class: "chip-label" }, p.label),
      addedKeys.has(p.label.trim().toLowerCase()) ? el("span", { class: "chip-added" }, ` (${strings.record.addedChip})`) : null,
      inlineButton("x", `remove-tag-${i}`, () => h.onRemoveTag?.(i), `${strings.record.removeTag} ${p.label}`),
    ),
  );
  const tagLabel = el("input", { id: "tag-label", class: "record-input", type: "text", "aria-label": strings.record.tagLabel, placeholder: strings.record.tagLabel });
  const tagRole = el(
    "select",
    { id: "tag-role", class: "record-input", "aria-label": "Role" },
    el("option", { value: "client" }, "client"),
    el("option", { value: "worker" }, "worker"),
    el("option", { value: "other" }, "other"),
  );
  tagRole.value = "other";
  const add = inlineButton(strings.record.addTag, "add-tag", () => {
    const label = tagLabel.value.trim();
    if (label === "") return;
    h.onAddTag?.({ label, role: tagRole.value as "client" | "worker" | "other" });
  });

  const row = (label: string, id: string, control: Node) =>
    el("div", { class: "record-row" }, el("label", { class: "record-label", for: id }, label), control);

  return el(
    "div",
    { class: "record", "data-record": "" },
    el("h3", { class: "record-title" }, strings.recordTitle),
    state.recordSource ? sourceLabel(state.recordSource, true) : null,
    // The masking view first, then the fields it was made from, each folded to one line (shell-and-offline R24.6).
    maskSection(state, h),
    renderRecordMissing(state, h),
    ...field("date", () => row(f.date, "record-date", date)),
    dateBlock(state, h),
    state.dateLine ? el("p", { class: "date-line guard", "data-date-guard": "", role: "status" }, state.dateLine) : null,
    state.dateFlags.length > 0
      ? el("p", { class: "date-line not-in-note", "data-not-in-note": "", role: "status" }, fill(strings.date.notInNote, { tokens: state.dateFlags.join(", ") }))
      : null,
    ...field("present", () =>
      el("div", { class: "record-row" }, el("span", { class: "record-label" }, f.present), el("div", { class: "chips", id: "record-present" }, ...chips), el("div", { class: "tag-add" }, tagLabel, tagRole, add)),
    ),
    state.recordAdded.length > 0
      ? el("p", { class: "added-by-model", "data-added-by-model": "", role: "status" }, fill(strings.record.addedByModel, { names: state.recordAdded.join(", ") }))
      : null,
    ...field("seen", () => row(f.seen, "record-seen", list("seen", f.seen))),
    ...field("agreed", () => row(f.agreed, "record-agreed", list("agreed", f.agreed))),
    ...field("risks", () => row(f.risks, "record-risks", list("risks", f.risks))),
    ...field("nextSteps", () => row(f.nextSteps, "record-nextSteps", list("nextSteps", f.nextSteps))),
  );
}

/** The reading of the date words, with its mark, and the two controls (capture-and-record R12.5). */
function dateBlock(state: AppState, h: Handlers): HTMLElement | null {
  const v = state.date;
  if (v === null || v.status === "none") return null;
  const d = strings.date;
  const confirm = inlineButton(d.confirm, "confirm-date", () => h.onConfirmDate?.());
  const correct = inlineButton(d.correct, "correct-date", () => h.onCorrectDate?.());
  const parts: (Node | null)[] = [];
  if (v.line !== null) parts.push(el("span", { class: "date-reading", "data-date-reading": "", "data-status": v.status }, v.line));
  if (v.status === "editing") {
    const input = el("input", { id: "record-date-set", class: "record-input date-set", type: "date", "aria-label": d.inputLabel });
    input.value = v.iso;
    input.addEventListener("change", () => h.onSetDate?.(input.value));
    parts.push(input);
  } else if (v.status !== "set") {
    if (v.status !== "confirmed") parts.push(confirm);
    parts.push(correct);
  } else parts.push(correct);
  return el("div", { class: "date-block", "data-date-block": "" }, ...parts);
}

/** The Mask control and, once pressed, the record text with its masks as chips (masking R5). */
function maskSection(state: AppState, h: Handlers): HTMLElement {
  const press = button(strings.actions.mask, nextStep(state) === "mask" ? "primary" : "secondary", { id: "mask", icon: "eye" });
  press.addEventListener("click", () => h.onMask?.());
  const m = state.mask;
  const view = m
    ? renderMaskView({
        raw: m.raw,
        spans: m.spans,
        onChange: (spans) => h.onMaskChange?.(spans),
        likely: state.device.state !== "available" || state.draftGate,
        keptLikely: m.keptLikely ?? [],
        onKeep: (word: string) => h.onKeepLikely?.(word),
        ...(h.confirmPurpose ? { confirmPurpose: (q: string) => h.confirmPurpose!(q) } : {}),
      })
    : null;
  return el(
    "div",
    { class: "mask-section", "data-mask-section": "" },
    el("h3", { class: "mask-title" }, strings.masking.title),
    m ? el("p", { class: "mask-explain" }, strings.masking.explain) : null,
    el("div", { class: "actions" }, press),
    m ? el("p", { class: "device-pass-line", "data-device-pass-line": "", role: "status" }, m.proposing ? strings.masking.proposing : m.line) : null,
    m && state.draftGate ? el("p", { class: "resolve-line", "data-resolve-before-draft": "", role: "status" }, strings.masking.resolveBeforeDraft) : null,
    m?.proposals ? sourceLabel(m.proposals.source, m.proposals.connected) : null,
    view ? el("div", { "data-mask-view": "" }, view.element) : null,
  );
}
