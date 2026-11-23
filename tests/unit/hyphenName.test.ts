// A hyphen between two parts of one listed or near name is inside one tag.
// Two different people stay two tags. Invented names only. The four notes are
// the WO-15 condition A rows whose masked text kept a ]-[ join.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyMask } from "../../src/masking/apply";
import { parseClientList, type ClientEntry } from "../../src/masking/clientList";
import { findExact } from "../../src/masking/exact";
import { exactAndNear } from "../../src/masking/passes";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { maskPresentEntries } from "../../src/masking/presentEntries";

const JOIN = /\]\s*[-‐‑–—]\s*\[/;

const one = (line: string) => parseClientList(line).entries;

function masked(raw: string, list: ClientEntry[]) {
  return applyMask(raw, exactAndNear(raw, list, DEFAULT_POLICY), list);
}

const whitlock = one("Maria Whitlock-Ferreira; ; he/him");

describe("a hyphenated name is one tag", () => {
  it("joins a double-barrelled surname on the list", () => {
    const raw = "Saw Whitlock-Ferreira at the door.";
    expect(findExact(raw, whitlock, DEFAULT_POLICY).map((s) => s.surfaceForm)).toEqual(["Whitlock", "Ferreira"]);
    const result = masked(raw, whitlock);
    expect(result.spans.map((s) => s.surfaceForm)).toEqual(["Whitlock-Ferreira"]);
    expect(result.maskedText).toBe("Saw [Person 1] at the door.");
    expect(result.maskedText).not.toMatch(JOIN);
  });

  it("joins three parts of one person across two hyphens", () => {
    const list = one("Ada Whitlock-Ferreira-Dunmore; ; she/her");
    const raw = "Saw Whitlock-Ferreira-Dunmore.";
    const result = masked(raw, list);
    expect(result.spans.map((s) => s.surfaceForm)).toEqual(["Whitlock-Ferreira-Dunmore"]);
    expect(result.maskedText).toBe("Saw [Person 1].");
  });

  it("joins a one-edit side to the exact side of the same person", () => {
    const raw = "Saw Whitjlock-Ferreira at the door.";
    const result = masked(raw, whitlock);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({ surfaceForm: "Whitjlock-Ferreira", kind: "near", key: "client:c1" });
    expect(result.maskedText).toBe("Saw [Person 1] at the door.");
    expect(result.maskedText).not.toMatch(JOIN);
  });

  it("joins a listed surname on a Present line into the one tag", () => {
    const list = one("Yusuf Brandvald-Ferreira; ; he/him");
    const raw = "Present: Brandvald-Ferreira was there.";
    const spans = maskPresentEntries(raw, exactAndNear(raw, list, DEFAULT_POLICY), [
      { label: "Brandvald-Ferreira", role: "client" },
    ]);
    const result = applyMask(raw, spans, list);
    expect(result.spans.map((s) => s.surfaceForm)).toEqual(["Brandvald-Ferreira"]);
    expect(result.maskedText).toBe("Present: [Person 1] was there.");
    expect(result.maskedText).not.toMatch(JOIN);
  });

  it("keeps a Present label that is not on the list as one span", () => {
    const raw = "Present: Whitlock-Ferreira was there.";
    const spans = maskPresentEntries(raw, exactAndNear(raw, [], DEFAULT_POLICY), [
      { label: "Whitlock-Ferreira", role: "client" },
    ]);
    const result = applyMask(raw, spans, []);
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0]).toMatchObject({ surfaceForm: "Whitlock-Ferreira", kind: "manual" });
    expect(result.maskedText).toBe("Present: [Person 1] was there.");
  });

  it("leaves two people joined by a hyphen as two tags", () => {
    const list = one("Maria Whitlock; ; she/her\nKen Nakamura; ; he/him");
    const raw = "Saw Whitlock-Nakamura at the door.";
    expect(masked(raw, list).maskedText).toBe("Saw [Person 1]-[Person 2] at the door.");
  });

  it("does not join the same person across a sentence or a comma", () => {
    const list = one("Maria Okonkwo-Reyes; ; she/her");
    expect(masked("Okonkwo said so. Reyes agreed.", list).maskedText).toBe("[Person 1] said so. [Person 1] agreed.");
    expect(masked("Saw Whitlock, Ferreira tomorrow.", whitlock).maskedText).toBe("Saw [Person 1], [Person 1] tomorrow.");
  });

  it("does not treat brother-in-law as a name", () => {
    expect(masked("His brother-in-law came.", whitlock).maskedText).toBe("His brother-in-law came.");
  });
});

describe("the four WO-15 notes have no hyphen join", () => {
  const notes = JSON.parse(readFileSync(new URL("../fixtures/wo15-hyphen-notes.json", import.meta.url), "utf8")) as {
    id: string;
    text: string;
    clientList: ClientEntry[];
  }[];

  it("is the condition A rows n023, n035, n047 and n048", () => {
    expect(notes.map((n) => n.id)).toEqual(["n023", "n035", "n047", "n048"]);
  });

  for (const note of notes) {
    it(`${note.id} masks with 0 joins`, () => {
      const result = masked(note.text, note.clientList);
      const found = result.maskedText.match(new RegExp(JOIN, "g")) ?? [];
      expect(found, result.maskedText).toEqual([]);
      if (note.text.includes("brother-in-law")) expect(result.maskedText).toContain("brother-in-law");
    });
  }

  it("covers each hyphenated name in those notes with one span", () => {
    const byId = Object.fromEntries(notes.map((n) => [n.id, masked(n.text, n.clientList)]));
    expect(byId.n023!.spans.map((s) => s.surfaceForm)).toContain("Maria Whitjlock-Ferreira");
    expect(byId.n035!.spans.map((s) => s.surfaceForm)).toContain("Iman Varga-Reyes");
    expect(byId.n035!.maskedText).toContain("to see [Person 1].");
    expect(byId.n047!.spans.map((s) => s.surfaceForm)).toEqual(expect.arrayContaining(["Brandvald-Ferreira", "Yusuf Brandvald-Ferrera"]));
    expect(byId.n047!.maskedText).toContain("[Person 1]\n[Person 1] at Westmarsh.");
    expect(byId.n048!.spans.map((s) => s.surfaceForm)).toEqual(expect.arrayContaining(["BRANDVALD-DUNMORE", "mirela brandvald-dunmore"]));
  });
});
