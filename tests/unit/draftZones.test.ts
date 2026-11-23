// @vitest-environment happy-dom
// Drafting task 12 (R2.1, R3.4, R4.2, R6.7): zone 2 and zone 3 parts.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type AppState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { renderLeavesZone } from "../../src/app/zones/leaves";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildLines } from "../../src/egress/line";
import type { CheckResult } from "../../src/egress/check";

function handlers(over: Partial<Handlers> = {}): Handlers {
  return {
    onNoteInput: vi.fn(), onListInput: vi.fn(), onTryExample: vi.fn(), onRemoveExample: vi.fn(),
    onGetModel: vi.fn(), onMakeRecord: vi.fn(), ...over,
  };
}
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const text = (n: Element | null) => n?.textContent ?? "";
const OUTGOING = "Visit date: 2026-11-12\nPresent: [Person 1], worker\n\nInstructions: Write a formal case note.";

describe("zone 2: What leaves (R2.1)", () => {
  it("shows the whole outgoing text, character for character, in the monospace block", () => {
    const z = renderLeavesZone(emptyState({ outgoingText: OUTGOING }), handlers());
    expect(q(z, "pre.outgoing").textContent).toBe(OUTGOING);
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.outgoing\s*\{[^}]*font-family:\s*var\(--mono\)/);
    expect(css).toMatch(/\.outgoing\s*\{[^}]*dashed/);
  });

  it("shows the notice before Send can be pressed, and Send is a real button that calls the handler", () => {
    const h = handlers({ onSend: vi.fn() });
    const z = renderLeavesZone(emptyState({ outgoingText: OUTGOING, cloud: true }), h);
    expect(text(q(z, "[data-send-notice]"))).toContain("no-cost tier");
    const send = q<HTMLButtonElement>(z, "#send");
    expect(send.disabled).toBe(false);
    send.click();
    expect(h.onSend).toHaveBeenCalledTimes(1);
  });

  it("says the cloud is off in the notice while the cloud flag is off", () => {
    const z = renderLeavesZone(emptyState({ outgoingText: OUTGOING, cloud: false }), handlers());
    expect(text(q(z, "[data-send-notice]"))).toMatch(/is off/i);
  });

  it("has a Draft control that needs a record, and calls the handler", () => {
    const h = handlers({ onDraft: vi.fn() });
    const none = renderLeavesZone(emptyState(), h);
    expect(q<HTMLButtonElement>(none, "#draft").disabled).toBe(true);
    const z = renderLeavesZone(emptyState({ record: inventedVisit.preparedRecord }), h);
    const draft = q<HTMLButtonElement>(z, "#draft");
    expect(draft.disabled).toBe(false);
    expect(text(draft)).toBe(strings.actions.draft);
    draft.click();
    expect(h.onDraft).toHaveBeenCalledTimes(1);
  });

  it("disables Send and Draft while a draft is being made", () => {
    const z = renderLeavesZone(emptyState({ outgoingText: OUTGOING, record: inventedVisit.preparedRecord, drafting: true }), handlers());
    expect(q<HTMLButtonElement>(z, "#send").disabled).toBe(true);
    expect(q<HTMLButtonElement>(z, "#draft").disabled).toBe(true);
    expect(text(q(z, "[data-working]"))).toBe(strings.drafting.working);
  });

  it("shows the no-draft line and a Copy masked record control that calls the handler (R4.2)", () => {
    const h = handlers({ onCopyMasked: vi.fn() });
    const z = renderLeavesZone(
      emptyState({ network: "offline", noDraft: { line: strings.drafting.noDraft, copyText: "Visit date: 2026-11-12" } }),
      h,
    );
    expect(text(q(z, "[data-no-draft]"))).toBe("No draft can be made right now. Your masked record is kept.");
    const copy = q<HTMLButtonElement>(z, "#copy-masked");
    expect(text(copy)).toBe("Copy masked record");
    copy.click();
    expect(h.onCopyMasked).toHaveBeenCalledTimes(1);
  });

  it("has no copy control when there is no no-draft line", () => {
    expect(renderLeavesZone(emptyState(), handlers()).querySelector("#copy-masked")).toBeNull();
  });

  it("keeps the egress line last, in the failure colour class when a block is shown", () => {
    const blocked = buildLines({
      result: { passed: false, listedFound: ["Priya Halloran"], maskedFound: [], onPurposeFound: [], listedChecked: 1, maskedChecked: 0 } as unknown as CheckResult,
      connected: true,
    });
    const z = renderLeavesZone(emptyState({ outgoingText: OUTGOING, egressLines: { ...blocked, kind: "blocked" } }), handlers());
    expect(z.lastElementChild!.hasAttribute("data-egress-line")).toBe(true);
    expect(z.lastElementChild!.className).toContain("fail");
    expect(q<HTMLButtonElement>(z, "#send").disabled).toBe(true);
  });
});

describe("zone 3: Finished note (R6.7)", () => {
  const done = (over: Partial<NonNullable<AppState["finished"]>> = {}): AppState =>
    emptyState({ finished: { text: "Maria Okonkwo-Reyes agreed.", source: "IN_CLOUD", connected: false, ...over } });

  it("shows the restored note on a sheet with the source label top right and Copy", () => {
    const z = renderFinishedZone(done(), handlers());
    expect(text(q(z, ".sheet-text"))).toBe("Maria Okonkwo-Reyes agreed.");
    expect(z.querySelector(".sheet .source-label")).not.toBeNull();
    // Rewritten by drafting task 26 (sixth review R5): one mark while the cloud is off.
    expect(text(q(z, ".sheet"))).not.toContain("in the cloud");
    expect(text(q(z, ".sheet"))).toContain("fixed sample: cloud off");
    expect(q<HTMLButtonElement>(z, "#copy").disabled).toBe(false);
  });

  it("is in the serif face with a soft shadow", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.sheet\s*\{[^}]*font-family:\s*var\(--serif\)/);
    expect(css).toMatch(/\.sheet\s*\{[^}]*box-shadow/);
  });

  it("labels a device draft 'on this device' and adds the shorter-draft line", () => {
    const z = renderFinishedZone(done({ source: "ON_DEVICE", connected: true, shortLine: strings.drafting.shortDraft }), handlers());
    expect(text(q(z, ".sheet"))).toContain("on this device");
    expect(text(q(z, "[data-short-draft]"))).toBe("Shorter draft made on this device.");
    expect(text(q(z, ".sheet"))).not.toContain("cloud off");
  });

  it("lists the restore notes under the note, one per line", () => {
    const notes = ["Not put back: a name (Person 9). The app cannot tell what it stands for.", "The draft used no pronoun tokens, so no pronouns were changed."];
    const z = renderFinishedZone(done({ notes }), handlers());
    expect([...z.querySelectorAll("[data-note] li")].map((n) => n.textContent)).toEqual(notes);
  });

  it("offers a press to put an added name back, one button for each", () => {
    const h = handlers({ onRestoreAdded: vi.fn() });
    const z = renderFinishedZone(
      done({ added: [{ tag: "[Person 3]", name: "Priya Halloran" }, { tag: "[Place 1]", name: "Harbour Row" }] }),
      h,
    );
    const buttons = [...z.querySelectorAll<HTMLButtonElement>("[data-put-back]")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Put back what the model added: Priya Halloran", "Put back what the model added: Harbour Row"]);
    buttons[1]!.click();
    expect(h.onRestoreAdded).toHaveBeenCalledWith("[Place 1]");
  });

  it("shows no short-draft line and no notes for a cloud draft without them", () => {
    const z = renderFinishedZone(done(), handlers());
    expect(z.querySelector("[data-short-draft]")).toBeNull();
    expect(z.querySelector("[data-note]")).toBeNull();
  });

  it("calls the handler from Copy and has Copy disabled before any draft", () => {
    const h = handlers({ onCopyFinished: vi.fn() });
    renderFinishedZone(done(), h).querySelector<HTMLButtonElement>("#copy")!.click();
    expect(h.onCopyFinished).toHaveBeenCalledTimes(1);
    expect(renderFinishedZone(emptyState(), h).querySelector<HTMLButtonElement>("#copy")!.disabled).toBe(true);
  });
});

describe("the whole screen passes the handlers to the zones", () => {
  it("wires Draft, Send and Copy through renderScreen", () => {
    const h = handlers({ onDraft: vi.fn(), onSend: vi.fn(), onCopyFinished: vi.fn() });
    const root = document.createElement("div");
    root.append(...renderScreen(emptyState({ record: inventedVisit.preparedRecord, outgoingText: OUTGOING, finished: { text: "t", source: "ON_DEVICE", connected: true } }), h));
    q<HTMLButtonElement>(root, "#draft").click();
    q<HTMLButtonElement>(root, "#send").click();
    q<HTMLButtonElement>(root, "#copy").click();
    expect([h.onDraft, h.onSend, h.onCopyFinished].map((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1, 1]);
  });
});
