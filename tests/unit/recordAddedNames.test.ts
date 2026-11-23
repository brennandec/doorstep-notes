// @vitest-environment happy-dom
// Ruling 24, capture-and-record task 20: a name in the record that is in neither
// the rough note nor the client list is marked "added by the model" and is never
// restored into the finished note without a press. Invented people only.
import { describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { findAddedNames } from "../../src/drafting/addedNames";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreAddedTag, restoreDraft } from "../../src/drafting/restoreDraft";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import type { DraftJob, VisitRecord } from "../../src/inference/types";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
// What a device model once did: the note said only "her son Daniel".
const NOTE = "Visit 12/11. Maria O-R in, her son Daniel there too. Mould in the back bedroom. I ring landlord Mon.";
const withSurname = (): VisitRecord => ({
  visitDate: "2026-11-12",
  present: [
    { label: "Maria Okonkwo-Reyes", role: "client" },
    { label: "Daniel Okafor", role: "other" },
    { label: "Dana Whitfield", role: "worker" },
  ],
  seen: ["Mould in the back bedroom."],
  agreed: ["Worker rings the landlord on Monday."],
  risks: [],
  nextSteps: [],
});

describe("findAddedNames", () => {
  it("flags a person tag whose surname is in neither the note nor the list", () => {
    expect(findAddedNames(withSurname(), NOTE, clients)).toEqual(["Daniel Okafor"]);
  });

  it("flags a name in a free-text field, not only in the present list", () => {
    const r = withSurname();
    r.present = r.present.filter((p) => p.label !== "Daniel Okafor");
    r.agreed = ["The neighbour Glenda Pruitt offered to help with the form."];
    expect(findAddedNames(r, NOTE, clients)).toEqual(["Glenda Pruitt"]);
  });

  it("flags nothing for the prepared invented record against the invented note and list", () => {
    expect(findAddedNames(inventedVisit.preparedRecord, inventedVisit.note, clients)).toEqual([]);
  });

  it("does not flag listed names, names in the note, the worker's label, days or sentence starts", () => {
    const r: VisitRecord = {
      visitDate: "2026-11-12",
      present: [
        { label: "Maria Okonkwo-Reyes", role: "client" },
        { label: "Daniel", role: "other" },
        { label: "Dana Whitfield", role: "worker" },
      ],
      seen: ["Mould in the back bedroom."],
      agreed: ["Worker rings the landlord on Monday."],
      risks: ["Priya Halloran may also need the form."],
      nextSteps: [],
    };
    expect(findAddedNames(r, NOTE, clients)).toEqual([]);
  });

  it("ignores case when it compares with the note", () => {
    const r = withSurname();
    expect(findAddedNames(r, `${NOTE} OKAFOR was named on the door.`, clients)).toEqual([]);
  });

  it("lists each added name once", () => {
    const r = withSurname();
    r.seen = ["Daniel Okafor opened the door."];
    expect(findAddedNames(r, NOTE, clients)).toEqual(["Daniel Okafor"]);
  });
});

describe("the outgoing text and the restore", () => {
  const out = () => buildOutgoing({ record: withSurname(), clients, policy: DEFAULT_POLICY, addedNames: ["Daniel Okafor"] });

  it("masks the added name and says which tag stands for it", () => {
    const o = out();
    expect(o.text).not.toMatch(/Okafor/i);
    expect(o.addedNames).toHaveLength(1);
    expect(o.addedNames[0]!.name).toBe("Daniel Okafor");
    expect(o.text).toContain(o.addedNames[0]!.tag);
  });

  it("does not put the name back by itself, and puts it back on a press", () => {
    const o = out();
    const tag = o.addedNames[0]!.tag;
    const draft = `${o.maskedRecord.includes("[Person 1]") ? "[Person 1]" : ""} met ${tag}.`;
    const r = restoreDraft({ draft, outgoing: o, clients });
    expect(r.text).not.toContain("Okafor");
    expect(r.text).toContain(tag);
    expect(r.added.map((a) => a.tag)).toEqual([tag]);
    expect(r.notes.join(" ")).toMatch(/Added by the model/);
    const back = restoreAddedTag(r, tag, clients);
    expect(back.text).toContain("Daniel Okafor");
    expect(back.added).toEqual([]);
  });

  it("an empty list of added names changes nothing", () => {
    const a = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
    const b = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY, addedNames: [] });
    expect(b.text).toBe(a.text);
    expect(a.addedNames).toEqual([]);
  });
});

describe("on the screen", () => {
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
  const press = async (root: HTMLElement, sel: string) => {
    (root.querySelector(sel) as HTMLButtonElement).click();
    await settle();
    // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it, and then goes on.
    for (let i = 0; sel === "#draft" && i < 5 && root.querySelector("[data-keep-likely]"); i++) {
      (root.querySelector("[data-keep-likely]") as HTMLElement).click();
      await settle();
    }
  };
  const text = (root: HTMLElement, sel: string) => root.querySelector(sel)?.textContent ?? "";

  async function start(draftText: string) {
    const root = document.createElement("div");
    document.body.append(root);
    const draft: DraftJob = {
      run: vi.fn(async (t, i, m) => {
        const r = await draftDouble.run(t, i, m);
        return { ...r, value: { text: draftText, short: false } };
      }),
    } as never;
    const deps: ControllerDeps = {
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: false,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      drafting: {
        draftFor: () => draft,
        ledger: makeLedger(),
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => undefined,
      },
    };
    const c = makeController(deps);
    await c.start();
    c.handlers.onNoteInput(NOTE);
    c.handlers.onListInput(inventedVisit.clientList);
    c.handlers.onRecordEdit?.(withSurname());
    c.render();
    return { root, c, draft };
  }

  it("marks the added name in the record view", async () => {
    const { root } = await start("x");
    const mark = root.querySelector("[data-added-by-model]");
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toMatch(/Added by the model/);
    expect(mark!.textContent).toContain("Daniel Okafor");
    expect(mark!.textContent).toMatch(/not in your note or your list/i);
    // The people are folded to one line (shell-and-offline task 42); open them to see the chips.
    (root.querySelector("#fold-present") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 5));
    const chips = [...root.querySelectorAll(".chip")];
    const flagged = chips.filter((c) => c.hasAttribute("data-added"));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.textContent).toContain("Daniel Okafor");
    expect(flagged[0]!.textContent).toMatch(/added by the model/i);
  });

  it("shows no mark when every name is in the note or the list", async () => {
    const { root, c } = await start("x");
    c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
    c.handlers.onNoteInput(inventedVisit.note);
    c.render();
    expect(root.querySelector("[data-added-by-model]")).toBeNull();
  });

  it("keeps the name out of the outgoing text", async () => {
    const { root } = await start("");
    await press(root, "#draft");
    const shown = text(root, "pre.outgoing");
    expect(shown).not.toMatch(/Okafor/i);
    expect(shown.match(/\[Person \d+\]/g)!.length).toBeGreaterThan(1);
  });

  it("puts the name back only when she presses", async () => {
    const { root } = await start("");
    await press(root, "#draft");
    const present = text(root, "pre.outgoing").split("\n").find((l) => l.startsWith("Present:"))!;
    const tags = present.match(/\[Person \d+\]/g)!;
    const addedTag = tags[1]!;
    // Re-run with a draft that uses both tags.
    const second = await start(`${tags[0]!} met ${addedTag} at the flat.`);
    await press(second.root, "#draft");
    await press(second.root, "#send");
    expect(text(second.root, ".sheet-text")).toContain("Maria Okonkwo-Reyes met");
    expect(text(second.root, ".sheet-text")).not.toContain("Okafor");
    expect(text(second.root, "[data-note]")).toMatch(/Added by the model/);
    const back = second.root.querySelector("[data-put-back]") as HTMLButtonElement;
    expect(back).not.toBeNull();
    back.click();
    await settle();
    expect(text(second.root, ".sheet-text")).toContain("Daniel Okafor at the flat.");
  });
});
