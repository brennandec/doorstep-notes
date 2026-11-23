// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderScreen } from "../../src/app/screen";
import { allFolded, emptyState, type AppState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";

function handlers(over: Partial<Handlers> = {}): Handlers {
  return {
    onNoteInput: vi.fn(), onListInput: vi.fn(), onTryExample: vi.fn(), onRemoveExample: vi.fn(),
    onGetModel: vi.fn(), onMakeRecord: vi.fn(), onPhoto: vi.fn(), onRemovePhoto: vi.fn(), onRecordEdit: vi.fn(),
    onAddTag: vi.fn(), onRemoveTag: vi.fn(), onStartByHand: vi.fn(), ...over,
  };
}
function mount(state: AppState, h: Handlers = handlers()): HTMLElement {
  const root = document.createElement("div");
  document.body.append(root);
  root.append(...renderScreen(state, h));
  return root;
}
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const text = (n: Element | null) => n?.textContent ?? "";
// Rewritten by shell-and-offline task 42 (third review, X6): with a record every field that holds text folds,
// so the editor tests open every field first, as a press on Edit does.
const allOpen = (): AppState["unfolded"] => ({ ...allFolded(), date: true, present: true, seen: true, agreed: true, risks: true, nextSteps: true });
const withRecord = (over: Partial<AppState> = {}) => emptyState({ record: structuredClone(inventedVisit.preparedRecord), ...over });
const withOpenRecord = (over: Partial<AppState> = {}) => withRecord({ unfolded: allOpen(), ...over });

describe("zone 1: note area and camera control", () => {
  it("has a note area, a client list and a camera control that takes only JPEG or PNG", () => {
    const root = mount(emptyState({ started: true }));
    expect(q<HTMLTextAreaElement>(root, "#note").disabled).toBe(false);
    const input = q<HTMLInputElement>(root, "#photo-input");
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/jpeg,image/png");
    expect(text(q(root, 'label[for="photo-input"]'))).toBe(strings.record.addPhoto);
    expect(q(root, 'label[for="photo-input"] svg')).not.toBeNull();
  });
  it("hands a chosen file to the handler", () => {
    const h = handlers();
    const root = mount(emptyState({ started: true }), h);
    const input = q<HTMLInputElement>(root, "#photo-input");
    const file = new File([new Uint8Array([1])], "page.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    expect(h.onPhoto).toHaveBeenCalledWith(file);
  });
  it("says a photo was added, stays on this device, and offers to remove it", () => {
    const h = handlers();
    const root = mount(emptyState({ photo: { mimeType: "image/png", base64: "AAAA" } }), h);
    expect(text(q(root, "[data-photo-line]"))).toBe(strings.record.photoAdded);
    q<HTMLButtonElement>(root, "#remove-photo").click();
    expect(h.onRemovePhoto).toHaveBeenCalledTimes(1);
  });
  it("keeps the empty state to one filled control and no outlined one", () => {
    // The first control is there but disabled and outlined until a note exists (capture-and-record R13.4).
    const zone = mount(emptyState({ started: true }));
    expect(zone.querySelectorAll('[data-zone="note"] button[data-kind="secondary"]:not([disabled])')).toHaveLength(0);
    expect(zone.querySelectorAll('[data-zone="note"] button[data-kind="primary"]:not([disabled])')).toHaveLength(1);
  });
});

describe("zone 1: Make the record", () => {
  it("is enabled when the model is ready or still downloading, and disabled otherwise", () => {
    // With a note waiting the control is enabled in every device state: it makes the record, or opens hand entry.
    for (const [state, label] of [["available", "Make the record"], ["downloading", "Make the record"], ["downloadable", "Enter the record by hand"], ["unavailable", "Enter the record by hand"]] as const) {
      const b = q<HTMLButtonElement>(mount(emptyState({ device: { state }, noteText: "a note" })), "#make-record");
      expect(b.disabled).toBe(false);
      expect(text(b)).toBe(label);
    }
    // With no note it is disabled in every state (R13.4).
    for (const state of ["available", "downloading", "downloadable", "unavailable"] as const) {
      expect(q<HTMLButtonElement>(mount(emptyState({ started: true, device: { state } })), "#make-record").disabled).toBe(true);
    }
  });
  it("calls the handler on a press", () => {
    const h = handlers();
    q<HTMLButtonElement>(mount(emptyState({ device: { state: "available" }, noteText: "a note" }), h), "#make-record").click();
    expect(h.onMakeRecord).toHaveBeenCalledTimes(1);
  });
  it("shows the working line while it runs and the waiting line with the percent while it waits", () => {
    const run = mount(emptyState({ device: { state: "available" }, working: true }));
    expect(text(q(run, "[data-working]"))).toBe(strings.record.working);
    expect(q<HTMLButtonElement>(run, "#make-record").disabled).toBe(true);
    const wait = mount(emptyState({ device: { state: "downloading", percent: 37.2 }, working: true, waiting: true }));
    expect(text(q(wait, "[data-working]"))).toBe("waiting for the device model, 37%");
  });
  it("shows an error as an error, with the failure icon", () => {
    const root = mount(emptyState({ error: strings.record.tooLong }));
    expect(text(q(root, ".error"))).toContain("Split it into two parts.");
    expect(q(root, ".error svg")).not.toBeNull();
  });
  it("shows the hint under the note", () => {
    expect(text(q(mount(emptyState({ hint: strings.record.language })), "[data-hint]"))).toBe(strings.record.language);
  });
});

describe("zone 1: the device model line", () => {
  it("is one line with no version and no steps when the model is absent", () => {
    const root = mount(emptyState({ started: true }));
    expect(root.querySelectorAll("[data-model-line]")).toHaveLength(1);
    expect(root.querySelector("[data-model-steps]")).toBeNull();
    expect(text(q(root, "[data-model-line]"))).not.toMatch(/\d|chrome|flag|GB/i);
  });
  it("shows no progress text when nothing is downloading", () => {
    expect(mount(emptyState({ started: true, device: { state: "available" } })).querySelector(".model-progress")).toBeNull();
  });
});

describe("zone 1: the record editor", () => {
  it("offers hand entry when there is no record, without making it a secondary control", () => {
    const h = handlers();
    const root = mount(emptyState({ started: true }), h);
    const b = q<HTMLButtonElement>(root, "#start-by-hand");
    expect(text(b)).toBe(strings.record.handEntry);
    expect(b.dataset.kind).not.toBe("secondary");
    b.click();
    expect(h.onStartByHand).toHaveBeenCalledTimes(1);
  });
  it("shows every field as editable and the people as chips", () => {
    const root = withOpenRecord();
    const el = mount(root);
    expect(q<HTMLInputElement>(el, "#record-date").value).toBe("12/11");
    for (const id of ["seen", "agreed", "risks", "nextSteps"]) {
      expect(q<HTMLTextAreaElement>(el, `#record-${id}`)).not.toBeNull();
    }
    expect(q<HTMLTextAreaElement>(el, "#record-agreed").value.split("\n")).toEqual(inventedVisit.preparedRecord.agreed);
    expect([...el.querySelectorAll(".chip")].map((c) => text(q(c, ".chip-label")))).toEqual(["Maria Okonkwo-Reyes", "Bea", "Dana Whitfield"]);
  });
  it("reports a hand edit of a field with the whole record, one item per line", () => {
    const h = handlers();
    const el = mount(withOpenRecord(), h);
    const area = q<HTMLTextAreaElement>(el, "#record-risks");
    area.value = "Rent arrears.\n\nHeating is off.";
    area.dispatchEvent(new Event("input"));
    const sent = (h.onRecordEdit as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(sent.risks).toEqual(["Rent arrears.", "Heating is off."]);
    expect(sent.agreed).toEqual(inventedVisit.preparedRecord.agreed);
    const date = q<HTMLInputElement>(el, "#record-date");
    date.value = "2026-11-13";
    date.dispatchEvent(new Event("input"));
    expect((h.onRecordEdit as ReturnType<typeof vi.fn>).mock.calls[1]![0].visitDate).toBe("2026-11-13");
  });
  it("removes a person by its remove control, which names the person", () => {
    const h = handlers();
    const el = mount(withOpenRecord(), h);
    const remove = el.querySelectorAll<HTMLButtonElement>(".chip button")[1]!;
    expect(remove.getAttribute("aria-label")).toBe("Remove Bea");
    remove.click();
    expect(h.onRemoveTag).toHaveBeenCalledWith(1);
  });
  it("adds a person with a label and a role", () => {
    const h = handlers();
    const el = mount(withOpenRecord(), h);
    q<HTMLInputElement>(el, "#tag-label").value = "Wren";
    q<HTMLSelectElement>(el, "#tag-role").value = "other";
    q<HTMLButtonElement>(el, "#add-tag").click();
    expect(h.onAddTag).toHaveBeenCalledWith({ label: "Wren", role: "other" });
  });
  it("does not add a person with an empty label", () => {
    const h = handlers();
    const el = mount(withOpenRecord(), h);
    q<HTMLButtonElement>(el, "#add-tag").click();
    expect(h.onAddTag).not.toHaveBeenCalled();
  });
  it("labels a record made by the device model 'on this device', and a hand-made one with no label", () => {
    const made = mount(withRecord({ recordSource: "ON_DEVICE" }));
    expect(text(q(made, "[data-record] .source-label"))).toBe("on this device");
    expect(mount(withRecord()).querySelector("[data-record] .source-label")).toBeNull();
  });
});
