// H44 item 2: a draft sentence that starts with a record label is caught on the device and shown with one plain line.
// The model's words are not changed and Copy is not held. Built from the stored 2026-11-17 inventedVisit drafts (read, never written).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { copiedLabelSentences, restoreDraft } from "../../src/drafting/restoreDraft";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const clients = parseClientList(inventedVisit.clientList).entries;
const outgoing = buildOutgoing({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });
const finish = (draft: string) => restoreDraft({ draft, outgoing, clients });
const LINE = strings.drafting.copiedLabel;

describe("copied record label at the start of a sentence (H44 item 2)", () => {
  it("names each of the six labels, with or without the colon spacing", () => {
    for (const label of ["Visit date:", "Visit  date :", "Present:", "Seen:", "Agreed:", "Risks:", "Next steps:"]) {
      expect(copiedLabelSentences(`The visit went ahead. ${label} none.`)).toEqual([`${LINE} ${label} none.`]);
    }
  });

  it("H44b 1: catches a label after leading quote marks, brackets, asterisks or dashes, in any case", () => {
    const variants: Array<[string, string]> = [
      ['"Visit date: 12/12.', '"Visit date: 12/12.'],
      ["**Risks:** arrears", "**Risks:** arrears"],
      ["- Next steps: revisit.", "- Next steps: revisit."],
      ["(Seen: nobody.)", "(Seen: nobody.)"],
      ["[Agreed: none.]", "[Agreed: none.]"],
      ["\u2018Present: no one.", "\u2018Present: no one."],
      ["RISKS: arrears.", "RISKS: arrears."],
      ["**Risks**: arrears.", "**Risks**: arrears."],
    ];
    for (const [input, shown] of variants) expect(copiedLabelSentences(input)).toEqual([`${LINE} ${shown}`]);
  });

  it("does not catch a label word inside a sentence or a plain use of the word", () => {
    expect(copiedLabelSentences("The next steps are to revisit. Nobody was present: the door stayed shut. Risks were low.")).toEqual([]);
  });

  it("restoreDraft adds one visible line per caught sentence and leaves the text byte-equal", () => {
    const draft = "Dana visited. Risks: rent arrears if form is late. Next steps: revisit 26/11.";
    const r = finish(draft);
    expect(r.text).toBe(draft);
    expect(r.notes.filter((n) => n.startsWith(LINE))).toEqual([
      `${LINE} Risks: rent arrears if form is late.`,
      `${LINE} Next steps: revisit 26/11.`,
    ]);
    expect(r.copyHeld).toBe(false);
  });

  it("a draft with no label adds no line", () => {
    expect(finish("Rent arrears are a risk if the form is late. Revisit on 26/11.").notes.some((n) => n.startsWith(LINE))).toBe(false);
  });

  it("the stored inventedVisit attempts 1 and 3 of 2026-11-17 are caught; the other stored drafts of that file are not", () => {
    const file = JSON.parse(readFileSync("results/h43-n3-cloud-drafts-2026-11-17.json", "utf8")) as {
      samples: Array<{ fixtureId: string; attempt: number; restoredDraft: string; n4CopiedLabelFail: boolean }>;
    };
    const caught = file.samples.filter((s) => copiedLabelSentences(s.restoredDraft).length > 0);
    expect(caught.map((s) => `${s.fixtureId}#${s.attempt}`)).toEqual(["inventedVisit#1", "inventedVisit#3"]);
    expect(caught.every((s) => s.n4CopiedLabelFail)).toBe(true);
  });
});
