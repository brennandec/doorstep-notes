import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { VISIT_RECORD_SCHEMA, checkVisitRecord, emptyRecord } from "../../src/inference/structure/structure.schema";

describe("visit record check", () => {
  it("accepts the prepared invented record", () => {
    const r = checkVisitRecord(inventedVisit.preparedRecord);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record).toEqual(inventedVisit.preparedRecord);
  });
  it("accepts a partial record and fills missing items with empty lists and an empty date", () => {
    const r = checkVisitRecord({ present: [{ label: "Dana Whitfield", role: "worker" }], seen: ["Letter on the table."] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.visitDate).toBe("");
      expect(r.record.agreed).toEqual([]);
      expect(r.record.risks).toEqual([]);
      expect(r.record.nextSteps).toEqual([]);
      expect(r.record.seen).toEqual(["Letter on the table."]);
    }
  });
  it("accepts an empty object as an empty record", () => {
    const r = checkVisitRecord({});
    expect(r.ok && r.record).toEqual(emptyRecord());
  });
  it("refuses things that are not objects", () => {
    for (const bad of [null, undefined, 4, "text", [], true]) {
      const r = checkVisitRecord(bad);
      expect(r.ok).toBe(false);
    }
  });
  it("refuses wrong types and keeps the parts that were fine", () => {
    const r = checkVisitRecord({
      visitDate: "2026-11-12",
      present: [{ label: "Bea", role: "friend" }],
      seen: "Mould in the back bedroom.",
      agreed: ["Worker rings the landlord on Monday."],
      risks: [3],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problems.length).toBeGreaterThanOrEqual(3);
      expect(r.partial.visitDate).toBe("2026-11-12");
      expect(r.partial.agreed).toEqual(["Worker rings the landlord on Monday."]);
      expect(r.partial.seen).toBeUndefined();
    }
  });
  it("refuses an empty tag label", () => {
    expect(checkVisitRecord({ present: [{ label: "  ", role: "client" }] }).ok).toBe(false);
  });
  it("has a schema with the six fields and no extras", () => {
    expect(Object.keys(VISIT_RECORD_SCHEMA.properties).sort()).toEqual(["agreed", "nextSteps", "present", "risks", "seen", "visitDate"]);
    expect(VISIT_RECORD_SCHEMA.additionalProperties).toBe(false);
    expect(VISIT_RECORD_SCHEMA.required).toHaveLength(6);
  });
});
