import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { applyMask, forOutgoing } from "../../src/masking/apply";
import { parseClientList } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { exactAndNear } from "../../src/masking/passes";
import { restoreTags } from "../../src/masking/restore";
import { fold, findWholeWords } from "../../src/masking/fold";
import type { ClientEntry } from "../../src/masking/clientList";
import type { MaskSpan } from "../../src/masking/types";

const clients = parseClientList(inventedVisit.clientList).entries;
const note = inventedVisit.note;

function manual(raw: string, text: string, key = `text:${fold(text)}`, tagKind: MaskSpan["tagKind"] = "Detail"): MaskSpan[] {
  const out: MaskSpan[] = [];
  let i = raw.indexOf(text);
  while (i !== -1) {
    out.push({ start: i, end: i + text.length, surfaceForm: text, tag: "", kind: "manual", tagKind, key, accepted: true, sentOnPurpose: false });
    i = raw.indexOf(text, i + 1);
  }
  return out;
}

describe("apply, mask map and surface forms (masking task 6)", () => {
  const spans = exactAndNear(note, clients, DEFAULT_POLICY);
  const result = applyMask(note, spans, clients);

  it("masks Maria O-R, Maria, and Tomas Brandvald with person tags", () => {
    expect(result.maskedText).toContain("[Person 1] in, sister Bea there too.");
    expect(result.maskedText).toContain("[Person 1] missed the benefits form");
    expect(result.maskedText).toContain("Agreed: I ring landlord Mon. [Person 1] posts form Fri. [Person 2] (neighbour");
    expect(result.maskedText).not.toMatch(/Maria|Tomas|Brandvald/);
  });

  it("records every occurrence with its exact surface form", () => {
    const accepted = result.spans.filter((s) => s.accepted);
    expect(accepted.map((s) => s.surfaceForm)).toEqual(["Maria O-R", "Maria", "Maria", "Tomas Brandvald"]);
    for (const s of accepted) expect(note.slice(s.start, s.end)).toBe(s.surfaceForm);
    expect(result.surfaceForms).toEqual(["Maria O-R", "Maria", "Tomas Brandvald"]);
  });

  it("gives the same tag to the same person and a different tag to another", () => {
    const tags = result.spans.map((s) => [s.surfaceForm, s.tag]);
    expect(tags).toEqual([
      ["Maria O-R", "[Person 1]"], ["Maria", "[Person 1]"], ["Maria", "[Person 1]"], ["Tomas Brandvald", "[Person 2]"],
    ]);
  });

  it("maps a tag to the listed full name", () => {
    expect(result.map).toEqual({ "[Person 1]": "Maria Okonkwo-Reyes", "[Person 2]": "Tomas Brandvold" });
    expect(result.clientByTag).toEqual({ "[Person 1]": "c1", "[Person 2]": "c2" });
  });

  it("lists every full name and other name as the listed names", () => {
    expect(result.listedNames).toContain("Maria Okonkwo-Reyes");
    expect(result.listedNames).toContain("Maria O-R");
    expect(result.listedNames).toContain("Tom");
    expect(result.listedNames).not.toContain("she/her");
  });

  it("numbers places, dates and details separately", () => {
    const more = [
      ...spans,
      ...manual(note, "14 Alder Court", "text:alder", "Place"),
      ...manual(note, "3/3/87", "text:dob", "Date"),
      ...manual(note, "benefits form", "text:bf", "Detail"),
      ...manual(note, "Bea", "text:bea", "Person"),
    ];
    const r = applyMask(note, more, clients);
    expect(r.map["[Place 1]"]).toBe("14 Alder Court");
    expect(r.map["[Date 1]"]).toBe("3/3/87");
    expect(r.map["[Detail 1]"]).toBe("benefits form");
    expect(r.map["[Person 2]"]).toBe("Bea");
    expect(r.map["[Person 3]"]).toBe("Tomas Brandvold");
    expect(r.maskedText).toContain("flat 3, [Place 1].");
  });

  it("leaves a span that is not accepted in the text and out of the map", () => {
    const off = spans.map((s, i) => (i === 0 ? { ...s, accepted: false } : s));
    const r = applyMask(note, off, clients);
    expect(r.maskedText).toContain("Maria O-R in");
    expect(r.surfaceForms).not.toContain("Maria O-R");
    expect(r.spans[0]!.tag).toBe("[Person 1]"); // numbering does not move
  });

  it("builds outgoing text from the masked text only", () => {
    const out = forOutgoing(result);
    expect(Object.keys(out)).toEqual(["text"]);
    const json = JSON.stringify(out);
    for (const v of [...result.surfaceForms, ...result.listedNames, ...Object.values(result.map)]) {
      expect(findWholeWords(json, v), v).toEqual([]);
    }
  });
});

// A property test with generated invented lists. No new dependency: a small seeded generator.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SYLLABLES = ["bra", "ven", "tol", "mar", "ish", "uda", "keo", "lin", "som", "rey", "han", "ola", "pri", "det", "wen", "cas", "tel", "nor", "fai", "qua"];
const FILLER = ["the", "visit", "went", "well", "and", "rang", "about", "form", "on", "Monday", "tea", "kitchen", "letter", "was", "there", "again"];

function generate(seed: number) {
  const r = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
  const word = () => cap(pick(SYLLABLES) + pick(SYLLABLES) + (r() < 0.5 ? pick(SYLLABLES) : ""));
  const list: ClientEntry[] = Array.from({ length: 2 + Math.floor(r() * 5) }, (_, i) => ({
    id: `c${i + 1}`,
    fullName: `${word()} ${word()}`,
    otherNames: r() < 0.5 ? [word()] : [],
    pronouns: pick(["he/him", "she/her", "they/them", ""] as const),
  }));
  const pieces: string[] = [];
  for (let i = 0; i < 25 + Math.floor(r() * 25); i++) {
    if (r() < 0.35) {
      const c = pick(list);
      const form = pick([c.fullName, ...c.otherNames, c.fullName.split(" ")[0]!, c.fullName.split(" ")[1]!]);
      pieces.push(pick([form, form.toUpperCase(), form.toLowerCase()]));
    } else {
      pieces.push(pick(FILLER));
    }
  }
  return { list, raw: pieces.join(pick([" ", " ", ", "])) + "." };
}

describe("restoring (masking task 6, R11.2)", () => {
  it("returns the text with each surface form replaced by its map value, for 200 generated lists", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { list, raw } = generate(seed);
      const result = applyMask(raw, exactAndNear(raw, list, DEFAULT_POLICY), list);
      let expected = "";
      let at = 0;
      for (const s of result.spans.filter((x) => x.accepted)) {
        expected += raw.slice(at, s.start) + result.map[s.tag];
        at = s.end;
      }
      expected += raw.slice(at);
      expect(restoreTags(result.maskedText, result.map), `seed ${seed}`).toBe(expected);
      // every listed name is gone from the masked text
      for (const c of list) expect(fold(result.maskedText), `seed ${seed}`).not.toContain(fold(c.fullName));
    }
  });

  it("restores the invented note so that only the written forms become full names", () => {
    const r = applyMask(note, exactAndNear(note, clients, DEFAULT_POLICY), clients);
    const back = restoreTags(r.maskedText, r.map);
    expect(back).toContain("Maria Okonkwo-Reyes in, sister Bea there too.");
    expect(back).toContain("Tomas Brandvold (neighbour");
  });
});
