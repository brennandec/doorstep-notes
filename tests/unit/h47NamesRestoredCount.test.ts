import { describe, expect, it } from "vitest";
import { restoreDraft, restoreAddedTag } from "../../src/drafting/restoreDraft";
import type { ClientEntry } from "../../src/masking/clientList";
import { pronounToken } from "../../src/masking/pronouns";
import type { MaskResult } from "../../src/masking/types";

// H47 (found by the real cloud run of 2026-11-19, bundled cloudDraft): the cloud draft held "[Person 1]" and no
// pronoun token, the name was put back, and the second mark did not show, because the mark read the pronoun count.
// The mark now reads how many tags were put back. Invented people only.

const clients = [{ id: "c1", full: "Maria Okonkwo-Reyes", names: ["Maria Okonkwo-Reyes"], pronouns: "she/her" }] as unknown as ClientEntry[];
const mask: MaskResult = {
  maskedText: "",
  spans: [],
  map: { "[Person 1]": "Maria Okonkwo-Reyes" },
  clientByTag: { "[Person 1]": "c1" },
  surfaceForms: [],
  listedNames: [],
  sentOnPurpose: [],
};
const run = (text: string) => restoreDraft({ draft: text, outgoing: { text, maskedRecord: "[Person 1]", mask }, clients });

describe("tags put back on this device (H47)", () => {
  it("counts a tag put back when the draft has no pronoun token", () => {
    const r = run("On 12/11, [Person 1] and the worker were present.");
    expect(r.shown).toContain("Maria Okonkwo-Reyes");
    expect(r.tokensReplaced).toBe(0);
    expect(r.tagsRestored).toBe(1);
  });
  it("counts nothing when the draft holds no tag", () => {
    const r = run("The worker was present.");
    expect(r.tagsRestored).toBe(0);
  });
  it("does not count a tag that appears only inside a pronoun token", () => {
    const r = run(`The worker rang. ${pronounToken("she", "[Person 1]")} agreed.`);
    expect(r.tokensReplaced).toBeGreaterThan(0);
    expect(r.tagsRestored).toBe(0);
  });
  it("a tag she puts back by pressing adds one", () => {
    const before = { ...run("The worker was present."), text: "[Person 9] was there.", added: [{ tag: "[Person 9]", name: "Ione Marsh" }] };
    const after = restoreAddedTag(before as never, "[Person 9]", clients);
    expect(after.tagsRestored).toBe(1);
  });
});
