import { describe, expect, it } from "vitest";
import {
  buildSet,
  INVENTED_FIRST_NAMES,
  INVENTED_NICKNAMES,
  INVENTED_OTHER_FIRST_NAMES,
  INVENTED_OTHER_SURNAMES,
  INVENTED_SURNAMES,
  setFile,
} from "../../../scripts/buildSet";
import { SYNTHETIC_SEED, SYNTHETIC_SET_SIZE } from "../../../src/constants";
import { fold } from "../../../src/masking/fold";
import { levenshtein } from "../../../src/masking/near";
import { nameParts } from "../../../src/masking/exact";
import type { SyntheticNote } from "../../../scripts/buildSet";

const set = buildSet(SYNTHETIC_SEED, SYNTHETIC_SET_SIZE);
const DRAMATIC = /\b(injury|injured|court|police|arrest|abuse|blood)\b/i;

const listedParts = (n: SyntheticNote) =>
  n.clientList.flatMap((c) => [c.fullName, ...c.otherNames].flatMap(nameParts)).map(fold);

describe("synthetic set builder (measurement R1)", () => {
  it("builds about 200 notes, the size named in the constants file", () => {
    expect(set).toHaveLength(SYNTHETIC_SET_SIZE);
    expect(SYNTHETIC_SET_SIZE).toBe(200);
  });

  it("gives the same set for the same seed, and a different one for another seed", () => {
    const again = buildSet(SYNTHETIC_SEED, SYNTHETIC_SET_SIZE);
    expect(JSON.stringify(again)).toBe(JSON.stringify(set));
    const other = buildSet(SYNTHETIC_SEED + 1, 20);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(set.slice(0, 20)));
  });

  it("gives every note a unique id, text, its own client list and identifiers", () => {
    expect(new Set(set.map((n) => n.id)).size).toBe(set.length);
    for (const n of set) {
      expect(n.text.length, n.id).toBeGreaterThan(80);
      expect(n.clientList.length, n.id).toBeGreaterThanOrEqual(4);
      expect(n.identifiers.length, n.id).toBeGreaterThan(0);
      expect(n.identifiers.some((i) => i.kind === "listedName"), n.id).toBe(true);
    }
    // Lists differ between notes.
    expect(new Set(set.map((n) => JSON.stringify(n.clientList))).size).toBeGreaterThan(100);
  });

  it("has identifier spans that match the note text exactly", () => {
    for (const n of set) {
      for (const i of n.identifiers) {
        expect(n.text.slice(i.start, i.end), `${n.id} ${i.kind}`).toBe(i.text);
        expect(i.end, n.id).toBeGreaterThan(i.start);
      }
    }
  });

  it("has no two identifiers that overlap", () => {
    for (const n of set) {
      const sorted = [...n.identifiers].sort((a, b) => a.start - b.start);
      for (let k = 1; k < sorted.length; k++) expect(sorted[k]!.start, n.id).toBeGreaterThanOrEqual(sorted[k - 1]!.end);
    }
  });

  it("uses only names from the fixed invented lists", () => {
    const first = new Set(INVENTED_FIRST_NAMES.map(fold));
    const sur = new Set(INVENTED_SURNAMES.map(fold));
    const nick = new Set(Object.values(INVENTED_NICKNAMES).map(fold));
    for (const n of set) {
      for (const c of n.clientList) {
        const [f, ...rest] = nameParts(c.fullName);
        expect(first.has(fold(f!)), `${n.id} ${c.fullName}`).toBe(true);
        for (const r of rest) expect(sur.has(fold(r)), `${n.id} ${c.fullName}`).toBe(true);
        for (const o of c.otherNames) expect(nick.has(fold(o)), `${n.id} ${o}`).toBe(true);
      }
    }
    const otherFirst = new Set(INVENTED_OTHER_FIRST_NAMES.map(fold));
    const otherSur = new Set(INVENTED_OTHER_SURNAMES.map(fold));
    for (const n of set) {
      for (const i of n.identifiers.filter((x) => x.kind === "otherName")) {
        for (const w of nameParts(i.text)) expect(otherFirst.has(fold(w)) || otherSur.has(fold(w)), `${n.id} ${i.text}`).toBe(true);
      }
    }
  });

  it("keeps the lists apart: no unlisted-person name is on a client list", () => {
    const all = new Set([...INVENTED_FIRST_NAMES, ...INVENTED_SURNAMES, ...Object.values(INVENTED_NICKNAMES)].map(fold));
    for (const w of [...INVENTED_OTHER_FIRST_NAMES, ...INVENTED_OTHER_SURNAMES]) expect(all.has(fold(w)), w).toBe(false);
  });

  it("marks listed names as words that are on that note's list, and other names as words that are not", () => {
    for (const n of set) {
      const parts = new Set(listedParts(n));
      const wholes = new Set(n.clientList.flatMap((c) => [c.fullName, ...c.otherNames]).map(fold));
      for (const i of n.identifiers) {
        if (i.kind === "listedName") {
          const words = nameParts(i.text).map(fold);
          const whole = wholes.has(fold(i.text));
          expect(whole || words.every((w) => parts.has(w)), `${n.id} ${i.text}`).toBe(true);
        }
        if (i.kind === "otherName") for (const w of nameParts(i.text)) expect(parts.has(fold(w)), `${n.id} ${i.text}`).toBe(false);
      }
    }
  });

  it("includes near variants at edit distance 1 from a listed name part of five letters or more", () => {
    const variants = set.flatMap((n) => n.identifiers.filter((i) => i.kind === "nearVariant").map((i) => ({ n, i })));
    expect(variants.length).toBeGreaterThan(20);
    for (const { n, i } of variants) {
      const word = fold(i.text);
      const parts = listedParts(n);
      expect(parts.includes(word), `${n.id} ${i.text}`).toBe(false);
      expect(
        parts.some((p) => [...p].length >= 5 && levenshtein(word, p) === 1),
        `${n.id} ${i.text}`,
      ).toBe(true);
    }
  });

  it("includes every kind of identifier somewhere", () => {
    const kinds = new Set(set.flatMap((n) => n.identifiers.map((i) => i.kind)));
    for (const k of ["listedName", "otherName", "nearVariant", "place", "dob", "phrase"]) expect(kinds.has(k as never), k).toBe(true);
  });

  it("varies the notes: nicknames, lower case, hyphenated surnames, names split across a line", () => {
    const text = set.map((n) => n.text).join("\n");
    const ids = set.flatMap((n) => n.identifiers);
    const nicknames = new Set(Object.values(INVENTED_NICKNAMES));
    expect(ids.some((i) => nicknames.has(i.text))).toBe(true);
    expect(ids.some((i) => i.kind === "listedName" && i.text === i.text.toLowerCase() && /\s/.test(i.text))).toBe(true);
    expect(set.some((n) => n.clientList.some((c) => /-/.test(c.fullName)))).toBe(true);
    expect(ids.some((i) => /-/.test(i.text))).toBe(true);
    // A name split across a line: two listed-name identifiers with a line break between them.
    const split = set.some((n) => {
      const sorted = [...n.identifiers].sort((a, b) => a.start - b.start);
      return sorted.some((a, k) => k > 0 && n.text.slice(sorted[k - 1]!.end, a.start) === "\n" && a.kind !== "place");
    });
    expect(split).toBe(true);
    expect(text).toContain("\n");
  });

  it("has notes with identifiers that are not on the list", () => {
    expect(set.filter((n) => n.identifiers.some((i) => i.kind === "otherName")).length).toBeGreaterThan(40);
  });

  it("passes the dramatic-word scan", () => {
    for (const n of set) expect(DRAMATIC.test(n.text), n.id).toBe(false);
  });

  it("writes the set file shape with its seed and count", () => {
    const f = setFile(set, SYNTHETIC_SEED);
    expect(f.seed).toBe(SYNTHETIC_SEED);
    expect(f.count).toBe(set.length);
    expect(f.notes).toBe(set);
  });
});
