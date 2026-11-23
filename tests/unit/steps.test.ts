// @vitest-environment happy-dom
// shell-and-offline tasks 32, 33 and 34: the five-step line, folding, and the outgoing block's height.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { currentStep, renderSteps, STEPS } from "../../src/app/parts/steps";
import { renderScreen } from "../../src/app/screen";
import { allFolded, emptyState, type AppState, type Handlers } from "../../src/app/state";
import { flattenStrings, strings } from "../../src/app/strings";
import { buildLines } from "../../src/egress/line";
import { checkEgress } from "../../src/egress/check";

const record = inventedVisit.preparedRecord;
const finished = { text: "Done.", source: "ON_DEVICE" as const, connected: true };
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const handlers = (over: Partial<Handlers> = {}): Handlers => ({
  onNoteInput: vi.fn(), onListInput: vi.fn(), onTryExample: vi.fn(), onRemoveExample: vi.fn(), onGetModel: vi.fn(), onMakeRecord: vi.fn(), ...over,
});
const mount = (s: AppState, h = handlers()) => {
  const root = document.createElement("div");
  root.append(...renderScreen(s, h));
  document.body.replaceChildren(root);
  return root;
};

describe("task 32: currentStep", () => {
  const table: [string, Partial<AppState>, string][] = [
    ["no note text", {}, "note"],
    ["spaces only", { noteText: "   " }, "note"],
    ["a note and no record", { noteText: "12/11 visit" }, "record"],
    ["a photo and no note text", { photo: { mimeType: "image/png", base64: "AA==" } }, "record"],
    ["a record and no draft asked for", { noteText: "x", record }, "masks"],
    ["a record made by hand, with no note", { record }, "masks"],
    ["the preview text showing, Draft not pressed", { noteText: "x", record, outgoingText: "text", previewOnly: true }, "masks"],
    ["a draft asked for", { noteText: "x", record, outgoingText: "text", previewOnly: false, drafting: true }, "send"],
    ["a draft asked for and waiting for Send", { noteText: "x", record, outgoingText: "text", previewOnly: false }, "send"],
    ["the second reader's text waiting (H35a D6: Send is the step)", { noteText: "x", record, outgoingText: "text", previewOnly: false, reader: { pending: true, asking: false, result: null, line: null, maskedQuotes: [], announce: "" } }, "send"],
    ["the finished note", { noteText: "x", record, outgoingText: "text", previewOnly: false, finished }, "finished"],
    ["the way back: she clears the record after a note", { noteText: "x", record: null }, "record"],
    ["the way back: she clears the note", { noteText: "", record: null }, "note"],
    ["the way back: the preview is rebuilt after an edit", { noteText: "x", record, outgoingText: "text", previewOnly: true, finished: null }, "masks"],
  ];
  for (const [name, patch, want] of table) {
    it(`is ${want} for ${name}`, () => expect(currentStep(emptyState(patch))).toBe(want));
  }
});

describe("task 32: the line of steps on the page", () => {
  it("is an ordered list with an accessible name and the five words in order", () => {
    const ol = renderSteps(emptyState());
    expect(ol.tagName).toBe("OL");
    expect(ol.getAttribute("aria-label")).toBe("Steps");
    expect([...ol.children].map((li) => li.getAttribute("data-step"))).toEqual([...STEPS]);
    expect(strings.steps.name).toBe("Steps");
  });

  STEPS.forEach((name, i) => {
    it(`marks ${name} as the current step in words and in shape, and the others differently`, () => {
      const patch: Record<string, Partial<AppState>> = {
        note: {},
        record: { noteText: "x" },
        masks: { record },
        send: { record, outgoingText: "t", previewOnly: false },
        finished: { record, finished },
      };
      const ol = renderSteps(emptyState(patch[name]));
      const items = [...ol.querySelectorAll("li")];
      const current = items.filter((li) => li.getAttribute("aria-current") === "step");
      expect(current.length).toBe(1);
      expect(current[0]!.getAttribute("data-step")).toBe(name);
      expect(current[0]!.querySelector(".step-text")!.textContent).toBe(`Step ${i + 1} of 5: ${strings.steps[name]}`);
      expect(current[0]!.querySelector('[data-icon="step-filled"]')).not.toBeNull();
      items.forEach((li, j) => {
        if (j === i) return;
        expect(li.getAttribute("aria-current")).toBeNull();
        expect(li.querySelector(".step-text")!.textContent).toBe(strings.steps[STEPS[j]!]);
        if (j < i) expect(li.querySelector('[data-icon="check"]'), `${STEPS[j]} shows the check icon`).not.toBeNull();
        else expect(li.querySelector('[data-icon="step-outlined"]'), `${STEPS[j]} shows an outlined marker`).not.toBeNull();
      });
    });
  });

  // Shell-and-offline task 69 (R35.3, fifth review N5): the step line fits on one line.
  it("keeps 'Step N of 5:' in the page for assistive technology and draws it hidden", () => {
    const ol = renderSteps(emptyState({ record }));
    const current = ol.querySelector('li[aria-current="step"]')!;
    const count = current.querySelector(".step-text .step-count")!;
    expect(count.textContent).toBe("Step 3 of 5: ");
    expect(count.classList.contains("sr-only")).toBe(true);
    expect(current.querySelector(".step-text")!.textContent).toBe("Step 3 of 5: Masks");
    expect(ol.querySelectorAll(".step-count")).toHaveLength(1);
    expect(current.querySelector('[data-icon="step-filled"]')).not.toBeNull();
  });

  it("does not wrap: the list is one row with tight gaps", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    const rule = css.match(/\.steps\s*\{([^}]*)\}/)![1]!;
    expect(rule).toMatch(/flex-wrap:\s*nowrap/);
    expect(rule).toMatch(/gap:\s*[^;]*0\.75rem/);
    expect(css).toMatch(/\.step\.current\s*\{[^}]*font-weight:\s*700/);
  });

  it("is drawn in ink only: no colour in its rules", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    const rules = [...css.matchAll(/(\.steps[^{]*)\{([^}]*)\}/g)].map((m) => m[2]!).join("\n");
    expect(rules.length).toBeGreaterThan(0);
    expect(rules).not.toMatch(/accent|failure|#[0-9a-fA-F]{3,6}/);
  });

  // Rewritten by shell-and-offline task 52: the line "Kept in this browser only." now stands between the
  // line that says it stays on this device and the steps.
  // Rewritten again by shell-and-offline task 68: the one line "Everything here stays in this browser, on this device." is all there is.
  it("stands at the top of zone 1, under the title and the one line that says it stays here", () => {
    const zone = q(mount(emptyState({ started: true })), '[data-zone="note"]');
    expect(zone.children[0]!.tagName).toBe("H2");
    expect(zone.children[1]!.textContent).toBe(strings.zoneNoteLine);
    // With nothing kept yet the clear controls are not drawn, so the steps follow the line at once.
    expect(zone.children[2]!.hasAttribute("data-steps")).toBe(true);
  });

  it("follows the state on the page", () => {
    const root = mount(emptyState({ record, noteText: "x" }));
    expect(q(root, '[data-steps] [aria-current="step"]').getAttribute("data-step")).toBe("masks");
  });
});

describe("task 33: folding", () => {
  const withRecord = (patch: Partial<AppState> = {}) =>
    emptyState({ noteText: inventedVisit.note, clientList: inventedVisit.clientList, record, ...patch });

  it("shows the editor and the list in full while no record exists", () => {
    const root = mount(emptyState({ noteText: "a\nb", clientList: "Maria Okonkwo-Reyes" }));
    expect(root.querySelector("#note")).not.toBeNull();
    expect(root.querySelector("#client-list")).not.toBeNull();
    expect(root.querySelector("[data-fold]")).toBeNull();
  });

  it("folds each to one line with an Edit control once a record exists, with N and M computed", () => {
    const root = mount(withRecord());
    expect(root.querySelector("#note")).toBeNull();
    expect(root.querySelector("#client-list")).toBeNull();
    const lines = inventedVisit.note.split("\n").filter((l) => l.trim() !== "").length;
    const names = inventedVisit.clientList.split("\n").filter((l) => l.trim() !== "").length;
    expect(q(root, '[data-fold="note"] .fold-text').textContent).toBe(`Note: ${lines} lines.`);
    expect(q(root, '[data-fold="list"] .fold-text').textContent).toBe(`Client list: ${names} names.`);
    for (const which of ["note", "list"]) {
      const b = q<HTMLButtonElement>(root, `[data-fold="${which}"] button`);
      expect(b.textContent).toBe("Edit");
      expect(b.getAttribute("aria-expanded")).toBe("false");
      expect(b.classList.contains("inline")).toBe(true);
    }
  });

  it("uses the singular for one line and one name, and counts zero", () => {
    const root = mount(withRecord({ noteText: "just one line", clientList: "Maria Okonkwo-Reyes; Mari; she/her" }));
    expect(q(root, '[data-fold="note"] .fold-text').textContent).toBe("Note: 1 line.");
    expect(q(root, '[data-fold="list"] .fold-text').textContent).toBe("Client list: 1 name.");
    const none = mount(withRecord({ noteText: "", clientList: "" }));
    expect(q(none, '[data-fold="list"] .fold-text').textContent).toBe("Client list: 0 names.");
  });

  // Rewritten by shell-and-offline task 68 (N5): the mark stands once, beside the note.
  it("marks the invented example once, on the folded note line and not on the list line", () => {
    const root = mount(withRecord({ example: true }));
    expect(q(root, '[data-fold="note"]').textContent).toContain("invented example");
    expect(q(root, '[data-fold="list"]').textContent).not.toContain("invented example");
    expect(root.querySelectorAll("[data-mark]")).toHaveLength(1);
  });

  it("unfolds on Edit with aria-expanded, shows the data unchanged, and folds again", () => {
    const onToggleFold = vi.fn();
    const open = mount(withRecord({ unfolded: { ...allFolded(), note: true } }), handlers({ onToggleFold }));
    expect(q<HTMLTextAreaElement>(open, "#note").value).toBe(inventedVisit.note);
    expect(open.querySelector("#client-list")).toBeNull();
    const b = q<HTMLButtonElement>(open, '[data-fold="note"] button');
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(b.textContent).toBe(strings.fold.close);
    b.click();
    expect(onToggleFold).toHaveBeenCalledWith("note");
    const closed = mount(withRecord(), handlers({ onToggleFold }));
    q<HTMLButtonElement>(closed, '[data-fold="list"] button').click();
    expect(onToggleFold).toHaveBeenLastCalledWith("list");
  });

  it("keeps the 44 px minimum for the fold controls", () => {
    expect(readFileSync("src/app/styles/app.css", "utf8")).toMatch(/\.btn\.inline \{[^}]*min-height: 44px[^}]*min-width: 44px/);
  });

  it("has no digit in the new strings", () => {
    for (const t of [...flattenStrings(strings.steps), ...flattenStrings(strings.fold)]) expect(t).not.toMatch(/\d/);
  });
});

describe("task 34: the outgoing block", () => {
  const css = readFileSync("src/app/styles/app.css", "utf8");
  const block = (sel: string) => css.match(new RegExp(`${sel.replace(/\./g, "\\.")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

  it("has a maximum height and scrolls inside itself", () => {
    expect(block(".outgoing")).toMatch(/max-height:\s*\d/);
    expect(block(".outgoing")).toMatch(/overflow-y:\s*auto/);
  });

  it("still holds the whole text, equal to the string given to the job", () => {
    const text = "Visit date: 12/11\n".repeat(60) + "\nInstructions: Write a formal case note.";
    const root = mount(emptyState({ record, outgoingText: text, previewOnly: false }));
    expect(q(root, "pre.outgoing").textContent).toBe(text);
  });

  it("keeps the egress line as the last child of zone 2, with and without a ledger panel", () => {
    const result = checkEgress({ captured: [{ url: "", body: new TextEncoder().encode("x") }], listedNames: ["Maria"], surfaceForms: [], sentOnPurpose: [] });
    const lines = buildLines({ result, connected: false });
    for (const s of [emptyState({ record }), emptyState({ record, outgoingText: "t", previewOnly: false, egressLines: lines })]) {
      const zone = q(mount(s), '[data-zone="leaves"]');
      expect(zone.lastElementChild!.hasAttribute("data-egress-line")).toBe(true);
    }
  });
});
