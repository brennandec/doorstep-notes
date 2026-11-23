// @vitest-environment happy-dom
// capture-and-record tasks 23, 25 and 26 on the screen: the guard line, the date line with its
// three states, and the year audit of the record view and the outgoing text (R12.3, R12.5, R12.6).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { makeController } from "../../src/app/controller";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { StructureJob, VisitRecord } from "../../src/inference/types";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { unmarkedYears } from "../../src/record/noteDate";

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
const NOW = new Date(2026, 10, 13, 9, 0, 0);

function setup(locale: string, record: VisitRecord = { ...inventedVisit.preparedRecord, visitDate: "2023-12-11" }) {
  const root = document.createElement("div");
  document.body.append(root);
  const job: StructureJob = { mode: "ONLY_ON_DEVICE", run: async () => ({ value: structuredClone(record), inferenceSource: "ON_DEVICE", connected: true }) };
  const c = makeController({
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "available", create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }) } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    structure: job,
    clock: { now: () => NOW, locale: () => locale },
    drafting: {
      draftFor: () => ({ run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) }) as never,
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  });
  return { root, c };
}

async function makeRecord(s: ReturnType<typeof setup>, note: string = inventedVisit.note) {
  await s.c.start();
  s.c.handlers.onNoteInput(note);
  s.c.handlers.onListInput(inventedVisit.clientList);
  s.c.render();
  const b = s.root.querySelector<HTMLButtonElement>("#make-record")!;
  expect(b.disabled).toBe(false);
  b.click();
  await settle();
  expect(s.c.state().record).not.toBeNull();
  s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
}

/** Every line a person can read in a part of the page: the text of each element, and the values of inputs. */
function lines(root: ParentNode): string[] {
  const out: string[] = [];
  for (const e of root.querySelectorAll("*")) {
    const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("").trim();
    if (own) out.push(own);
    if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) out.push(...e.value.split("\n"));
  }
  return out;
}
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const press = async (root: HTMLElement, sel: string) => {
  if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  q<HTMLButtonElement>(root, sel).click();
  await settle();
};

describe("task 23 on the screen: the guard line", () => {
  it("shows the exact line when the device wrote a date that is not in the note, and keeps the note's words", async () => {
    const s = setup("en-GB");
    await makeRecord(s);
    // Rewritten by shell-and-offline task 42 (X6): the date field is folded to one line; the line holds the words.
    expect(q(s.root, '[data-fold="record-date"] .fold-text').textContent).toBe("Date: 12/11");
    expect(q(s.root, "[data-date-guard]").textContent).toBe("The device wrote a date that is not in your note. The words from your note are shown instead.");
  });

  it("marks a bad token in another field, and leaves it out of the outgoing text while marked", async () => {
    const s = setup("en-GB", { ...inventedVisit.preparedRecord, nextSteps: ["Revisit on 27/11.", "Ring the landlord."] });
    await makeRecord(s);
    expect(q(s.root, "[data-not-in-note]").textContent).toBe(
      "Not in your note: 27/11. Left out of the text that leaves while it is marked.",
    );
    // H35a D2 and D8: Zone 2 is empty until Draft, and Draft stops at an unlisted name-like word (Bea) until she keeps it.
    await press(s.root, "#draft");
    for (let i = 0; i < 5 && s.root.querySelector("[data-keep-likely]"); i++) await press(s.root, "[data-keep-likely]");
    const out = q(s.root, "pre.outgoing").textContent!;
    expect(out).not.toContain("27/11");
    expect(out).toContain("Ring the landlord.");
    // The record she sees still holds the words, so she can edit them.
    await press(s.root, "#fold-nextSteps");
    expect(q<HTMLTextAreaElement>(s.root, "#record-nextSteps").value).toContain("27/11");
    // Taking the token out of the field removes the mark.
    const area = q<HTMLTextAreaElement>(s.root, "#record-nextSteps");
    area.value = "Ring the landlord.";
    area.dispatchEvent(new Event("input"));
    expect(s.c.state().dateFlags).toEqual([]);
  });
});

describe("task 25: the date line", () => {
  it("shows the words, the reading with its mark, and the two controls, en-GB", async () => {
    const s = setup("en-GB");
    await makeRecord(s);
    expect(q(s.root, "[data-date-reading]").textContent).toBe("read as 12 November 2026, assumed");
    const confirm = q<HTMLButtonElement>(s.root, "#confirm-date");
    const correct = q<HTMLButtonElement>(s.root, "#correct-date");
    expect(confirm.textContent).toBe("Confirm");
    expect(correct.textContent).toBe("Correct");
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(css).toMatch(/\.btn\.inline \{[^}]*min-height: 44px/);
    expect(confirm.classList.contains("inline")).toBe(true);
    expect(correct.classList.contains("inline")).toBe(true);
  });

  // Rewritten by capture-and-record task 30 (third review, X4): the invented note also holds "26/11",
  // which can only be day first, so en-US reads its "12/11" as 12 November. A note with no such date follows the locale.
  it("reads 12/11 as 12 November in en-US when the same note holds 26/11", async () => {
    const s = setup("en-US");
    await makeRecord(s);
    expect(q(s.root, "[data-date-reading]").textContent).toBe("read as 12 November 2026, assumed");
  });

  it("reads the same words the other way round in en-US when the note shows no day-first date", async () => {
    const s = setup("en-US");
    await makeRecord(s, inventedVisit.note.replace("26/11", "next week"));
    expect(q(s.root, "[data-date-reading]").textContent).toBe("read as 11 December 2026, assumed");
  });

  it("Confirm changes the line and never overwrites the words", async () => {
    const s = setup("en-GB");
    await makeRecord(s);
    await press(s.root, "#confirm-date");
    expect(q(s.root, "[data-date-reading]").textContent).toBe("read as 12 November 2026, confirmed by you");
    expect(q(s.root, '[data-fold="record-date"] .fold-text').textContent).toBe("Date: 12/11");
    expect(s.root.querySelector("#confirm-date")).toBeNull();
  });

  it("Correct opens a date input; her date changes the line to 'set by you'", async () => {
    const s = setup("en-GB");
    await makeRecord(s);
    await press(s.root, "#correct-date");
    const input = q<HTMLInputElement>(s.root, "#record-date-set");
    expect(input.type).toBe("date");
    input.value = "2026-11-12";
    input.dispatchEvent(new Event("change"));
    await settle();
    expect(q(s.root, "[data-date-reading]").textContent).toBe("set by you: 12 November 2026");
    expect(q(s.root, '[data-fold="record-date"] .fold-text').textContent).toBe("Date: 12/11");
  });

  it("goes back to assumed when she changes the words", async () => {
    const s = setup("en-GB");
    await makeRecord(s);
    await press(s.root, "#confirm-date");
    await press(s.root, "#fold-date");
    const words = q<HTMLInputElement>(s.root, "#record-date");
    words.value = "13/11";
    words.dispatchEvent(new Event("input"));
    s.c.render();
    expect(q(s.root, "[data-date-reading]").textContent).toBe("read as 13 November 2026, assumed");
  });

  it("shows no reading for words that are not a date, and no reading for an empty date", async () => {
    const s = setup("en-GB", { ...inventedVisit.preparedRecord, visitDate: "" });
    await s.c.start();
    s.c.handlers.onStartByHand?.();
    s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
    expect(s.root.querySelector("[data-date-block]")).toBeNull();
    const words = q<HTMLInputElement>(s.root, "#record-date");
    words.value = "Mon";
    words.dispatchEvent(new Event("input"));
    s.c.render();
    expect(s.root.querySelector("[data-date-block]")).toBeNull();
  });

  it("keeps the strings in the table, with no digit", () => {
    for (const v of Object.values(strings.date)) expect(v).not.toMatch(/\d/);
  });
});

describe("task 26: no year the note does not hold appears unmarked", () => {
  for (const locale of ["en-GB", "en-US"]) {
    it(`has none in the record view or the outgoing text, ${locale}, when the model answers 2023-12-11`, async () => {
      const s = setup(locale);
      await makeRecord(s);
      await press(s.root, "#mask");
      await press(s.root, "#draft");
      for (let i = 0; i < 5 && s.root.querySelector("[data-keep-likely]"); i++) await press(s.root, "[data-keep-likely]");
      const record = lines(q(s.root, "[data-record]")).join("\n");
      const outgoing = q(s.root, "pre.outgoing").textContent!;
      expect(record).toContain("2026");
      expect(record).not.toContain("2023");
      expect(unmarkedYears(record, inventedVisit.note)).toEqual([]);
      expect(unmarkedYears(outgoing, inventedVisit.note)).toEqual([]);
      expect(outgoing).toMatch(/^Visit date: 12\/11/);
    });
  }
});
