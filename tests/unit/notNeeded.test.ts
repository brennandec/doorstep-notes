// Masking task 25 (R16, direction U9): fewer needless suggestions. Invented people only.
import { describe, expect, it } from "vitest";
import { isNotNeeded, withoutRoleWord } from "../../src/masking/notNeeded";
import { mergeProposals } from "../../src/masking/merge";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { PROPOSE_SYSTEM_PROMPT } from "../../src/inference/proposeMasks/proposeMasks.schema";

describe("the propose-masks prompt (masking R16.1)", () => {
  it("tells the model not to suggest a weekday, a time or a relative day on its own", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("Do not suggest a weekday, a time or a relative day on its own.");
  });
  it("still asks for text copied exactly from the note", () => {
    expect(PROPOSE_SYSTEM_PROMPT).toContain("copied exactly as written in the note");
  });
});

describe("isNotNeeded (masking R16.2)", () => {
  it("is true for a weekday name or short form, in any case", () => {
    for (const t of ["Mon", "Fri", "monday", "FRIDAY", "Thurs"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("is true for a clock time", () => {
    for (const t of ["14:00", "9:30", "9.30am", "2pm", "09:05:10", "9:30 am"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("is true for a relative-day word", () => {
    for (const t of ["today", "Tomorrow", "yesterday", "TONIGHT"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("ignores spaces around the text", () => {
    expect(isNotNeeded("  Mon ")).toBe(true);
  });
  it("is false for a date, a name and a describing phrase", () => {
    for (const t of ["3/3/87", "Bea", "her twin brother", "Monday Club", "Friday Street", "14 Alder Court", "12/11", ""]) expect(isNotNeeded(t), t).toBe(false);
  });
});

describe("the backstop in the merge (masking R16.2)", () => {
  const raw = "Seen Mon at 14:00 with Bea. Back tomorrow. Born 3/3/87. Her twin brother was in.";
  const candidates = [
    { text: "Mon", kind: "phrase" as const },
    { text: "Fri", kind: "phrase" as const },
    { text: "14:00", kind: "dob" as const },
    { text: "tomorrow", kind: "phrase" as const },
    { text: "3/3/87", kind: "dob" as const },
    { text: "Bea", kind: "name" as const },
    { text: "her twin brother", kind: "phrase" as const },
  ];
  it("drops the weekday, the time and the relative day and keeps the rest", () => {
    const { spans } = mergeProposals(raw, [], candidates, DEFAULT_POLICY);
    expect(spans.map((s) => s.surfaceForm)).toEqual(["Bea", "3/3/87", "Her twin brother"]);
  });
});

describe("role and relation words (masking R18.1, K4)", () => {
  it("drops one lower-case role word", () => {
    for (const t of ["neighbour", "neighbor", "landlord", "doctor", "nurse", "teacher", "friend", "partner"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("drops one lower-case relation word", () => {
    for (const t of ["sister", "brother", "son", "daughter", "mother", "father", "husband", "wife"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("ignores spaces around a role word", () => {
    expect(isNotNeeded(" neighbour ")).toBe(true);
  });
  // CHANGED 2026-11-19 (chain R17 session A, item 3, masking R22): this case used to say a lone capitalised
  // "Doctor", "Nurse" or "Landlord" is kept (R18.2). That contradicts R22.1: fold() folds both sides, so a kept
  // "Landlord" masks every lower-case "landlord" in the note. The case now expects them dropped. What R18.2 meant
  // to protect, a capitalised role word that starts a name, is the phrase form, kept in the next case.
  it("drops a lone capitalised role word (R22.1, replaces the old R18.2 reading)", () => {
    for (const t of ["Doctor", "Nurse", "Landlord"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("R22.1: a lone role word in any case, with trailing punctuation, is dropped", () => {
    for (const t of ["Landlord", "Landlord,", "Landlord.", "Neighbour", "Landlady", "NEIGHBOUR", "Sister;"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("R22.1: a phrase that holds a role word stays maskable", () => {
    for (const t of ["Doctor Aldous", "neighbour Bea", "Landlord called", "the neighbour upstairs", "her twin brother"]) expect(isNotNeeded(t), t).toBe(false);
  });
  it("keeps a describing phrase that holds a role word", () => {
    for (const t of ["her twin brother", "the neighbour upstairs", "Doctor Aldous"]) expect(isNotNeeded(t), t).toBe(false);
  });
  it("drops a month, in any case", () => {
    for (const t of ["March", "november", "SEPT", "Dec"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("drops a time of day", () => {
    for (const t of ["morning", "Afternoon", "evening", "night", "midday"]) expect(isNotNeeded(t), t).toBe(true);
  });
  it("still keeps a date and a name", () => {
    for (const t of ["3/3/87", "12 November", "Bea"]) expect(isNotNeeded(t), t).toBe(false);
  });
});

describe("a role word followed by a name (masking R18.2)", () => {
  it("is cut to the capitalised words", () => {
    expect(withoutRoleWord("neighbour Bea")).toBe("Bea");
    expect(withoutRoleWord("landlord Mr Okafor-Lind")).toBe("Mr Okafor-Lind");
    expect(withoutRoleWord("  sister  Corinne Vale")).toBe("Corinne Vale");
  });
  it("leaves other text as it is", () => {
    for (const t of ["Bea", "neighbour", "neighbour upstairs", "Doctor Aldous", "her sister Bea", "14 Alder Court"]) expect(withoutRoleWord(t), t).toBe(t);
  });
  it("keeps only the name in the merge, and nothing for the role word", () => {
    const raw = "The neighbour Bea called. A neighbour waved. Her sister visited.";
    const { spans } = mergeProposals(
      raw,
      [],
      [
        { text: "neighbour Bea", kind: "name" },
        { text: "neighbour", kind: "phrase" },
        { text: "sister", kind: "phrase" },
      ],
      DEFAULT_POLICY,
    );
    expect(spans.map((s) => s.surfaceForm)).toEqual(["Bea"]);
  });
});

describe("the README names the lists (masking R18.3)", () => {
  it("names src/masking/notNeeded.ts", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("README.md", "utf8")).toContain("`src/masking/notNeeded.ts`");
  });
});
