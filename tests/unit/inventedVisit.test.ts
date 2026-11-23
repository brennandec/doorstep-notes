import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { parseClientList } from "../../src/masking/clientList";
import { INVENTED_LIST_SIZE } from "../../src/constants";

describe("client list parser", () => {
  it("parses the 12-line invented list", () => {
    const r = parseClientList(inventedVisit.clientList);
    expect(r.errors).toEqual([]);
    expect(r.entries).toHaveLength(12);
    expect(r.entries[0]).toEqual({ id: "c1", fullName: "Maria Okonkwo-Reyes", otherNames: ["Maria O-R", "Mari"], pronouns: "she/her" });
    expect(r.entries[2]).toMatchObject({ fullName: "Priya Halloran", otherNames: [], pronouns: "she/her" });
  });
  it("names the line number of a bad line", () => {
    const r = parseClientList("Maria Okonkwo-Reyes; Mari; she/her\nthis line has no semicolons\nTomas Brandvold; Tom; him");
    expect(r.entries).toHaveLength(1);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(r.errors[0]!.message).toContain("Line 2");
  });
  it("skips blank lines and keeps their numbering", () => {
    const r = parseClientList("\nMaria Okonkwo-Reyes; ; she/her\n\nbad");
    expect(r.entries).toHaveLength(1);
    expect(r.errors[0]!.line).toBe(4);
  });
});

describe("invented visit", () => {
  it("has the size the constants name", () => {
    expect(parseClientList(inventedVisit.clientList).entries).toHaveLength(INVENTED_LIST_SIZE);
  });
  it("is marked invented example", () => {
    expect(inventedVisit.mark).toBe("invented example");
  });
  it("holds a listed name, another listed name, a near variant and an unlisted name", () => {
    const names = parseClientList(inventedVisit.clientList).entries;
    const note = inventedVisit.note;
    expect(note).toContain("Maria O-R");
    expect(names.some((n) => n.fullName === "Tomas Brandvold")).toBe(true);
    expect(note).toContain("Brandvald");
    expect(note).not.toContain("Brandvold");
    expect(note).toContain("Bea");
    expect(names.some((n) => /Bea/.test(n.fullName + n.otherNames.join()))).toBe(false);
  });
  it("has a prepared record with the worker and the unlisted name", () => {
    const labels = inventedVisit.preparedRecord.present.map((p) => p.label);
    expect(labels).toEqual(["Maria Okonkwo-Reyes", "Bea", "Dana Whitfield"]);
  });
});

describe("invented visit, capture and record R10", () => {
  it("has a note that names a listed client by an other name, as the list gives it", () => {
    const entries = parseClientList(inventedVisit.clientList).entries;
    const maria = entries.find((e) => e.fullName === "Maria Okonkwo-Reyes")!;
    expect(maria.otherNames).toContain("Maria O-R");
    expect(inventedVisit.note).toContain("Maria O-R");
    expect(inventedVisit.note).toContain("Tomas");
  });
  it("keeps the worker off the client list", () => {
    const text = inventedVisit.clientList;
    expect(text).not.toContain("Dana");
    expect(text).not.toContain("Whitfield");
  });
  it("parses every line of the list on its own", () => {
    for (const line of inventedVisit.clientList.split("\n")) {
      const r = parseClientList(line);
      expect(r.errors).toEqual([]);
      expect(r.entries).toHaveLength(1);
    }
  });
});
