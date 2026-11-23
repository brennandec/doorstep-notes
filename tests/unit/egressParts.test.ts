import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { checkEgress, valuesForName } from "../../src/egress/check";
import { buildLines } from "../../src/egress/line";
import { makePreview } from "../../src/egress/send";
import { parseClientList } from "../../src/masking/clientList";

const clients = parseClientList(inventedVisit.clientList).entries;
const listedNames = clients.flatMap((c) => [c.fullName, ...c.otherNames]);
const scan = (text: string, sentOnPurpose: string[] = []) =>
  checkEgress({ captured: [{ url: "", body: new TextEncoder().encode(text) }], listedNames, surfaceForms: [], sentOnPurpose });

// Ruling 24: the check scans each full name, each other name and each single part
// of a listed name of three letters or more, ignoring case.
describe("egress check: parts of listed names (ruling 24)", () => {
  it("finds a surname alone", () => {
    const r = scan("The landlord wrote to Brandvold twice.");
    expect(r.passed).toBe(false);
    expect(r.listedFound).toEqual(["Tomas Brandvold"]);
  });

  it("finds a first name alone", () => {
    const r = scan("Priya was at home.");
    expect(r.passed).toBe(false);
    expect(r.listedFound).toEqual(["Priya Halloran"]);
  });

  it("finds a part of a hyphenated surname", () => {
    expect(scan("Mrs Okonkwo called.").listedFound).toContain("Maria Okonkwo-Reyes");
    expect(scan("the Reyes family").listedFound).toContain("Maria Okonkwo-Reyes");
  });

  it("finds a part in any case", () => {
    expect(scan("HALLORAN").listedFound).toEqual(["Priya Halloran"]);
    expect(scan("achterberg").listedFound).toEqual(["Rosalind Achterberg"]);
  });

  it("finds a part inside a JSON escape", () => {
    const body = '{"t":"met Hallor\\u0061n today"}';
    expect(checkEgress({ captured: [{ url: "", body: new TextEncoder().encode(body) }], listedNames, surfaceForms: [], sentOnPurpose: [] }).listedFound).toEqual(["Priya Halloran"]);
  });

  it("ignores parts shorter than three letters", () => {
    expect(valuesForName("Maria O-R", 3)).toEqual(["maria o-r", "maria"]);
    const lone = checkEgress({
      captured: [{ url: "", body: new TextEncoder().encode("Option R is to wait. O and R.") }],
      listedNames: ["Anna O-R"],
      surfaceForms: [],
      sentOnPurpose: [],
    });
    expect(lone.passed).toBe(true);
  });

  it("honours a different part length", () => {
    const body = new TextEncoder().encode("Fairbairn arrived.");
    const base = { captured: [{ url: "", body }], listedNames: ["Emeka Fairbairn"], surfaceForms: [], sentOnPurpose: [] };
    expect(checkEgress(base).passed).toBe(false);
    expect(checkEgress({ ...base, minPartLength: 10 }).passed).toBe(true);
  });

  it("finds short other names only as whole words", () => {
    expect(scan("Tomorrow we meet across the road, again.").passed).toBe(true);
    // "Ros" and "Dima" are listed other names, so they are found as names of their own.
    expect(scan("Ros came to the door.").listedFound).toEqual(["Ros"]);
    expect(scan("see Dima's letter").listedFound).toEqual(["Dima"]);
  });

  it("counts a person once even when the full name and its parts are all there", () => {
    const r = scan("Maria Okonkwo-Reyes, Maria, Okonkwo, Reyes");
    expect(r.listedFound.filter((n) => n === "Maria Okonkwo-Reyes")).toHaveLength(1);
  });

  it("treats a name sent on purpose, and its parts, as on purpose", () => {
    const r = scan("Maria Okonkwo-Reyes, then Maria, then Okonkwo.", ["Maria Okonkwo-Reyes"]);
    expect(r.passed).toBe(true);
    expect(r.listedFound).toEqual([]);
    expect(r.onPurposeFound).toContain("Maria Okonkwo-Reyes");
  });

  it("treats another name of the same person as on purpose only when that form was chosen too", () => {
    const text = "Maria Okonkwo-Reyes, then Maria O-R.";
    expect(scan(text, ["Maria Okonkwo-Reyes"]).passed).toBe(false);
    expect(scan(text, ["Maria Okonkwo-Reyes", "Maria O-R"]).passed).toBe(true);
  });

  it("does not treat one name on purpose as leave for another person", () => {
    const r = scan("Maria Okonkwo-Reyes and Halloran", ["Maria Okonkwo-Reyes"]);
    expect(r.passed).toBe(false);
    expect(r.listedFound).toEqual(["Priya Halloran"]);
  });

  it("blocks the preview on a surname alone and on a first name alone", () => {
    const values = { listedNames, surfaceForms: [], sentOnPurpose: [] };
    expect(makePreview("Seen: Okonkwo at home", values).canSend).toBe(false);
    expect(makePreview("Seen: Priya at home", values).canSend).toBe(false);
    expect(makePreview("Seen: [Person 1] at home", values).canSend).toBe(true);
  });
});

describe("egress line says what was checked (ruling 24)", () => {
  it("names the part length with the number from the run", () => {
    const line = buildLines({ result: scan("clean"), connected: true });
    expect(line.rows[1]!.label).toBe("Single name parts of 3 letters or more");
    expect(line.rows[1]!.label).toContain("Single name parts");
    expect(line.verdict).toContain(`of ${new Set(listedNames.map((n) => n.toLowerCase())).size}.`);
  });

  it("names the surname when it is the only thing found", () => {
    const line = buildLines({ result: scan("A note about Brandvold."), connected: true });
    expect(line.failure).toBe(true);
    expect(line.verdict).toContain("Found 1 of");
    expect(line.verdict).toContain("Tomas Brandvold");
  });
});
