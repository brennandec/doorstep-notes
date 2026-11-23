import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { parseClientList } from "../../src/masking/clientList";

describe("client list parser (masking task 1)", () => {
  it("reads the 12-line invented list", () => {
    const r = parseClientList(inventedVisit.clientList);
    expect(r.errors).toEqual([]);
    expect(r.entries).toHaveLength(12);
    expect(r.entries[0]).toEqual({
      id: "c1",
      fullName: "Maria Okonkwo-Reyes",
      otherNames: ["Maria O-R", "Mari"],
      pronouns: "she/her",
    });
    expect(r.entries[1]).toMatchObject({ fullName: "Tomas Brandvold", otherNames: ["Tom"], pronouns: "he/him" });
    expect(r.entries[2]).toMatchObject({ fullName: "Priya Halloran", otherNames: [], pronouns: "she/her" });
    expect(r.entries[6]).toMatchObject({ fullName: "Rosalind Achterberg", pronouns: "they/them" });
  });

  it("allows other names and pronouns to be empty", () => {
    const r = parseClientList("Wren Castellano-Hughes; ;\nEmeka Fairbairn;;");
    expect(r.errors).toEqual([]);
    expect(r.entries.map((e) => [e.fullName, e.otherNames, e.pronouns])).toEqual([
      ["Wren Castellano-Hughes", [], ""],
      ["Emeka Fairbairn", [], ""],
    ]);
  });

  it("skips blank lines and reads Windows line ends", () => {
    const r = parseClientList("Priya Halloran; ; she/her\r\n\r\nEmeka Fairbairn; ; he/him\r\n");
    expect(r.entries.map((e) => e.fullName)).toEqual(["Priya Halloran", "Emeka Fairbairn"]);
  });

  it("accepts pronouns in any letter case", () => {
    expect(parseClientList("Priya Halloran; ; She/Her").entries[0]?.pronouns).toBe("she/her");
  });

  it("names a bad line by its line number and still loads the rest", () => {
    const lines = inventedVisit.clientList.split("\n");
    lines[4] = "Sunniva Teodorescu; ; xe/xem"; // line 5
    const r = parseClientList(lines.join("\n"));
    expect(r.entries).toHaveLength(11);
    expect(r.entries.map((e) => e.fullName)).not.toContain("Sunniva Teodorescu");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.line).toBe(5);
    expect(r.errors[0]?.message).toMatch(/^Line 5:/);
  });

  it("reports an empty name, a line with too many parts and a line with too few, each with its line number", () => {
    const r = parseClientList("; Tom; he/him\nPriya Halloran; ; she/her\nA; B; he/him; extra\nno semicolons here");
    expect(r.entries.map((e) => e.fullName)).toEqual(["Priya Halloran"]);
    expect(r.errors.map((e) => e.line)).toEqual([1, 3, 4]);
  });
});
