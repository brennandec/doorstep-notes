
// @vitest-environment happy-dom
// H12 (drafting R15.4), changed by H17 (R16.4): a tag or token left after restore is flagged in plain words and holds
// Copy. A name the model added also holds Copy until she presses to put it back. Invented people only.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { renderFinishedZone } from "../../src/app/zones/finished";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });

const finished = (r: ReturnType<typeof restoreDraft>) => ({
  text: r.shown,
  held: r.text,
  source: "IN_CLOUD" as const,
  connected: true,
  notes: r.notes,
  added: r.added,
  copyHeld: r.copyHeld,
});

describe("leftovers hold Copy (R15.4, R16.4)", () => {
  for (const left of ["[Person 9]", "{he:Person 9}", "(Place 4)", "[Detail 7]", "{his:[Date 3]}"]) {
    it(`flags ${left} in plain words and holds Copy`, () => {
      const r = restoreDraft({ draft: `[Person 1] spoke to ${left} today.`, outgoing, clients });
      expect(r.copyHeld).toBe(true);
      expect(r.notes.some((n) => n.startsWith("Not put back: "))).toBe(true);
      expect(r.notes.join(" ")).not.toMatch(/[[\]{}]/);
      expect(r.shown).not.toMatch(/[[\]{}]/);
    });
  }
  it("does not hold Copy when every tag is put back", () => {
    const r = restoreDraft({ draft: "[Person 1] spoke to [Person 2].", outgoing, clients });
    expect(r.copyHeld).toBe(false);
  });
  it("holds Copy for a name the model added, keeps its put-back button, and lets go after the press", () => {
    const withAdded = { ...outgoing, addedNames: [{ tag: "[Person 3]", name: "Bea" }] };
    const r = restoreDraft({ draft: "[Person 1] met [Person 3].", outgoing: withAdded, clients });
    expect(r.copyHeld).toBe(true);
    expect(r.added.map((a) => a.tag)).toEqual(["[Person 3]"]);
    const zone = renderFinishedZone({ ...emptyState(), finished: finished(r) });
    expect(zone.querySelector("[data-put-back]")).not.toBeNull();
    expect((zone.querySelector("#copy") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the sheet when Copy is held (R15.4)", () => {
  const r = restoreDraft({ draft: "[Person 1] spoke to [Person 9].", outgoing, clients });
  const zone = renderFinishedZone({ ...emptyState(), finished: finished(r) });
  it("disables Copy with the reason from the string table", () => {
    const copy = zone.querySelector("#copy") as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    expect(copy.title).toBe(strings.drafting.copyHeld);
    expect(strings.drafting.copyHeld.length).toBeGreaterThan(10);
  });
  it("shows the flag line in the failure colour class, with the crossed octagon and words", () => {
    const flag = [...zone.querySelectorAll(".sheet-notes li")].find(
      (li) => li.textContent === "Not put back: a name (Person 9). The app cannot tell what it stands for.",
    )!;
    expect(flag).toBeDefined();
    expect(flag.classList.contains("error")).toBe(true);
    expect(flag.querySelector("svg")).not.toBeNull();
  });
});
