// masking task 22 (R15.1, U6): likelyNames, the guess by capital letters. No model, no DOM.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { recordBlock } from "../../src/drafting/buildOutgoing";
import { parseClientList } from "../../src/masking/clientList";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { likelyNames } from "../../src/masking/likelyNames";

const clients = parseClientList(inventedVisit.clientList).entries;
const note = inventedVisit.note;
const known = (text: string) => exactAndNear(text, clients, DEFAULT_POLICY);
const words = (text: string, spans = known(text)) => likelyNames(text, spans).map((l) => l.word);

describe("likelyNames on the invented note", () => {
  it("returns Alder, Court and Bea, in the order they first stand", () => {
    expect(words(note)).toEqual(["Alder", "Court", "Bea"]);
  });

  it("does not return Maria, Tomas, Brandvald, Mon, Fri, DOB or a word that starts a sentence", () => {
    const got = words(note);
    for (const w of ["Maria", "Tomas", "Brandvald", "Mon", "Fri", "DOB", "Mould", "Landlord", "Agreed", "Risk", "Next", "I", "O-R"]) {
      expect(got, w).not.toContain(w);
    }
  });

  it("returns each place the word stands", () => {
    const [alder] = likelyNames(note, known(note));
    expect(alder!.occurrences).toHaveLength(1);
    const o = alder!.occurrences[0]!;
    expect(note.slice(o.start, o.end)).toBe("Alder");
  });

  it("reads the record text the same way, including items joined by a semicolon", () => {
    const text = recordBlock(inventedVisit.preparedRecord);
    expect(words(text)).toEqual(["Bea"]);
    // H12 (drafting R15.6): the join drops one trailing full stop, so no ".;" is left.
    expect(text).not.toMatch(/\.; /);
    expect(text).toMatch(/\w; \w/);
  });
});

describe("likelyNames: what counts", () => {
  const w = (text: string) => words(text, []);

  it("skips the first word after a full stop, a question mark, an exclamation mark or a colon", () => {
    expect(w("Done. Later. Why? Now! Next: Soon")).toEqual([]);
  });

  it("skips the first word of the text and the first word of a line", () => {
    expect(w("Quiet visit\nPlain line\nanother Bea")).toEqual(["Bea"]);
    expect(w("Quiet visit with no end\nPlain line")).toEqual([]);
  });

  it("skips a word written wholly in capitals", () => {
    expect(w("form from DWP and the NHS")).toEqual([]);
    expect(w("sister Bea")).toEqual(["Bea"]);
  });

  it("skips weekday and month names and their short forms", () => {
    expect(w("on Monday and Fri and Tues in November, Sept and May")).toEqual([]);
  });

  it("skips a word that is already masked or matched, wherever the span says", () => {
    const text = "sister Bea and Cara";
    const bea = text.indexOf("Bea");
    expect(likelyNames(text, [{ start: bea, end: bea + 3 }]).map((l) => l.word)).toEqual(["Cara"]);
  });

  it("returns a word once with all its places, ignoring case", () => {
    const text = "sister Bea. Later sister Bea and BEA and friend Bea";
    const got = likelyNames(text, []);
    expect(got.map((l) => l.word)).toEqual(["Bea"]);
    expect(got[0]!.occurrences).toHaveLength(3);
  });

  it("returns a word with an accent or an apostrophe whole", () => {
    expect(w("sister Zoë and Mr O'Neil")).toEqual(["Zoë", "Mr", "O'Neil"]);
  });

  it("returns nothing for an empty text", () => {
    expect(w("")).toEqual([]);
  });
});

describe("likelyNames: imports", () => {
  it("imports no inference code (R2.4)", () => {
    const src = readFileSync("src/masking/likelyNames.ts", "utf8");
    expect(src).not.toMatch(/from "\.\.\/(inference|firebase)|firebase\/ai/);
  });
});
