// H51d: the fixed-sample note (cloud off, as in a local run of the public repository) ran two record items
// together: "worse by the window Letter about the benefits form", "on Mon [Person 1] posts the form".
// Found by the first-visit audit 2026-11-19, item 4. Each item of a "; " list is now its own sentence.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { fixedNote } from "../../src/inference/draft/draft.double";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients: parseClientList(inventedVisit.clientList).entries, policy: DEFAULT_POLICY }).text;

describe("H51d: the fixed sample keeps record items apart", () => {
  it("the invented visit's items are separate sentences", () => {
    const note = fixedNote(outgoing, false);
    expect(note).toContain("Seen: Mould in the back bedroom, worse by the window. Her sister was there. Letter about the benefits form on the table.");
    expect(note).toContain("Agreed: Worker rings the landlord on Mon. [Person 1] posts the form on Fri. [Person 3] offered to help with the form.");
    expect(note).not.toMatch(/window Letter|Mon \[Person 1\]|Fri \[Person 3\]/);
  });

  it("the short note does the same, and a line with one item is unchanged", () => {
    const short = fixedNote(outgoing, true);
    expect(short).toContain("worse by the window. Her sister was there. Letter about");
    expect(fixedNote("Visit date: 1/1\nSeen: Damp\nRisks: none", false)).toContain("Seen: Damp.");
  });

  it("an empty item between separators adds no stray full stop", () => {
    expect(fixedNote("Visit date: 1/1\nSeen: Damp; ; Mould.", false)).toContain("Seen: Damp. Mould.");
  });
});
