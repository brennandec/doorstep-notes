// @vitest-environment happy-dom
// Shell-and-offline task 42 (third review, X6 and R24): the record fields fold to one line each with Edit,
// so the masking view starts above the fold. Invented people only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController } from "../../src/app/controller";
import { strings } from "../../src/app/strings";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import type { VisitRecord } from "../../src/inference/types";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 4; i++) await tick(); };
const FIELDS = ["date", "present", "seen", "agreed", "risks", "nextSteps"] as const;

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
  });
  return { root, c };
}
async function withExampleRecord() {
  const s = setup();
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onStartByHand?.();
  s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  await settle();
  return s;
}
const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T | null;
const line = (root: ParentNode, f: string) => q(root, `[data-fold="record-${f}"]`);

describe("a record with text folds each field to one line", () => {
  it("shows a fold line for every field and none of the editors", async () => {
    const { root } = await withExampleRecord();
    for (const f of FIELDS) expect(line(root, f), f).not.toBeNull();
    for (const id of ["record-date", "record-seen", "record-agreed", "record-risks", "record-nextSteps", "tag-label"]) expect(q(root, `#${id}`), id).toBeNull();
  });

  it("reads the label and the text of each field on its line", async () => {
    const { root } = await withExampleRecord();
    const r = inventedVisit.preparedRecord;
    expect(line(root, "date")!.querySelector(".fold-text")!.textContent).toBe("Date: 12/11");
    expect(line(root, "present")!.querySelector(".fold-text")!.textContent).toBe("Present: Maria Okonkwo-Reyes, Bea, Dana Whitfield");
    expect(line(root, "seen")!.querySelector(".fold-text")!.textContent).toBe(`Seen: ${r.seen.join("; ")}`);
    expect(line(root, "nextSteps")!.querySelector(".fold-text")!.textContent).toBe("Next steps: Revisit on 26/11.");
  });

  it("gives each line an Edit control that is closed, names its editor, and is at least 44 px by style", async () => {
    const { root } = await withExampleRecord();
    for (const f of FIELDS) {
      const b = q<HTMLButtonElement>(root, `#fold-${f}`)!;
      expect(b.textContent).toBe(strings.fold.edit);
      expect(b.getAttribute("aria-expanded")).toBe("false");
      expect(b.getAttribute("aria-controls")).toBe(f === "present" ? "record-present" : `record-${f}`);
      expect(b.classList.contains("inline")).toBe(true);
    }
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.btn\.inline \{[^}]*min-height: 44px/);
  });

  it("keeps a long field on one line, cut by the style", () => {
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.record-fold \.fold-text \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.record-fold \.fold-text \{[^}]*text-overflow: ellipsis/);
  });

  it("keeps the reading of the date words in view next to the folded date line", async () => {
    const { root } = await withExampleRecord();
    expect(q(root, "[data-date-reading]")!.textContent).toMatch(/^read as 1[12] (November|December) \d{4}, assumed$/);
    expect(q(root, "#confirm-date")).not.toBeNull();
    expect(q(root, "#correct-date")).not.toBeNull();
  });

  it("still shows the Mask control and the masking view", async () => {
    const { root, c } = await withExampleRecord();
    expect(q(root, "#mask")).not.toBeNull();
    c.handlers.onMask?.();
    await settle();
    expect(q(root, "[data-mask-view]")).not.toBeNull();
  });
});

describe("Edit and Fold", () => {
  it("Edit opens the editor with its text, sets aria-expanded and reads Fold; Fold closes it", async () => {
    const { root } = await withExampleRecord();
    q(root, "#fold-seen")!.click();
    await settle();
    const area = q<HTMLTextAreaElement>(root, "#record-seen")!;
    expect(area.value).toContain("Mould in the back bedroom");
    const b = q<HTMLButtonElement>(root, "#fold-seen")!;
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(b.textContent).toBe(strings.fold.close);
    expect(line(root, "seen")!.querySelector(".fold-text")).toBeNull();
    // The other fields stay folded.
    expect(q(root, "#record-agreed")).toBeNull();
    b.click();
    await settle();
    expect(q(root, "#record-seen")).toBeNull();
    expect(q(root, "#fold-seen")!.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps focus on the control she pressed", async () => {
    const { root } = await withExampleRecord();
    q(root, "#fold-agreed")!.focus();
    q(root, "#fold-agreed")!.click();
    await settle();
    expect(document.activeElement?.id).toBe("fold-agreed");
  });

  it("opens the present field with its tags and the add control", async () => {
    const { root } = await withExampleRecord();
    q(root, "#fold-present")!.click();
    await settle();
    expect(q(root, "#record-present")).not.toBeNull();
    expect(q(root, "#tag-label")).not.toBeNull();
    expect(q(root, "#add-tag")).not.toBeNull();
    expect(root.querySelectorAll("#record-present .chip").length).toBe(3);
  });

  it("an edit she makes goes into the record, and the field stays open after a redraw", async () => {
    const { root, c } = await withExampleRecord();
    q(root, "#fold-risks")!.click();
    await settle();
    const area = q<HTMLTextAreaElement>(root, "#record-risks")!;
    area.value = "Rent arrears.\nNo heating.";
    area.dispatchEvent(new Event("input"));
    expect(c.state().record!.risks).toEqual(["Rent arrears.", "No heating."]);
    c.render(); // a redraw for any reason, with the cursor in the field
    expect(q(root, "#record-risks")).not.toBeNull();
  });
});

describe("a field with no text stays open so she can type", () => {
  it("shows the editor and no fold line for an empty field, and folds it once she has typed and folded it", async () => {
    const s = setup();
    await s.c.start();
    const record: VisitRecord = { ...inventedVisit.preparedRecord, risks: [] };
    s.c.handlers.onRecordEdit?.(record);
    s.c.handlers.onStartByHand?.(); // empty record when no example is loaded
    s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
    await settle();
    // Hand entry with no example: an empty record, every field open.
    for (const id of ["record-date", "record-seen", "record-agreed", "record-risks", "record-nextSteps"]) expect(q(s.root, `#${id}`), id).not.toBeNull();
    for (const f of FIELDS) expect(line(s.root, f), f).toBeNull();
  });

  it("an empty risks field stays open next to folded fields that hold text", async () => {
    const { root, c } = await withExampleRecord();
    c.handlers.onRecordEdit?.({ ...inventedVisit.preparedRecord, risks: [] });
    c.render();
    expect(q(root, "#record-risks")).not.toBeNull();
    expect(line(root, "risks")).toBeNull();
    expect(line(root, "seen")).not.toBeNull();
  });

  it("a field she typed into stays open after a redraw", async () => {
    const s = setup();
    await s.c.start();
    s.c.handlers.onStartByHand?.();
    s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
    await settle();
    const date = q<HTMLInputElement>(s.root, "#record-date")!;
    date.value = "12/11";
    date.dispatchEvent(new Event("input"));
    s.c.render();
    expect(q(s.root, "#record-date")).not.toBeNull();
    // It is open, so its line holds only the Fold control, and no text.
    expect(line(s.root, "date")!.querySelector(".fold-text")).toBeNull();
    expect(q(s.root, "#fold-date")!.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("the order of zone 1 with a record (R24.6)", () => {
  const index = (zone: Element, sel: string) => [...zone.querySelectorAll("*")].indexOf(zone.querySelector(sel)!);
  it("puts the masking view before the folded fields, and the controls and device model help after them", async () => {
    const { root, c } = await withExampleRecord();
    c.handlers.onMask?.();
    await settle();
    const zone = q(root, '[data-zone="note"]')!;
    const order = ["#fold-note", "#fold-list", "[data-mask-section]", "#fold-date", "#fold-nextSteps", "#make-record", "[data-model-line]", "[data-cold-start]"].map((s) => index(zone, s));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("keeps the first-run order without a record: the controls, then the help, then hand entry", async () => {
    const s = setup();
    await s.c.start();
    (s.root.querySelector("#start-visit") as HTMLButtonElement).click();
    const zone = q(s.root, '[data-zone="note"]')!;
    const order = ["#make-record", "[data-model-line]", "[data-cold-start]", "#start-by-hand"].map((x) => index2(zone, x));
    expect(order.every((n) => n >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it("puts the measured figures under the masking view", async () => {
    const { root, c } = await withExampleRecord();
    c.handlers.onMask?.();
    await settle();
    const zone = q(root, '[data-zone="note"]')!;
    expect(index(zone, "[data-figures]")).toBeGreaterThan(index(zone, "[data-mask-view]"));
  });
});
const index2 = (zone: Element, sel: string) => [...zone.querySelectorAll("*")].indexOf(zone.querySelector(sel)!);

describe("hand entry moves focus to the first thing in the record (R24.4)", () => {
  it("is the Edit control of the date line when the prepared invented record is shown", async () => {
    await withExampleRecord();
    expect(document.activeElement?.id).toBe("fold-date");
  });

  it("is the date field when the record is empty", async () => {
    document.body.replaceChildren();
    const s = setup();
    await s.c.start();
    s.c.handlers.onStartByHand?.();
    s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
    await settle();
    expect(document.activeElement?.id).toBe("record-date");
  });
});

describe("the strings and the wording", () => {
  it("use the existing Edit and Fold words from the string table", () => {
    expect(strings.fold.edit).toBe("Edit");
    expect(strings.fold.close).toBe("Fold");
  });
});
