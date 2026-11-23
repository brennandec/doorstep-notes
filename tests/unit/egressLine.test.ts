import { describe, expect, it } from "vitest";
import { checkEgress, type CheckResult } from "../../src/egress/check";
import { buildBlockedLine, buildLines, type EgressLines } from "../../src/egress/line";
import { flattenStrings, strings } from "../../src/app/strings";

const BANNED = /\b(safe|private by design|anonymised|guaranteed|cleared|compliant|compliance)\b/i;
const NOTHING_LEFT = /nothing private|no private|nothing left/i;

function result(over: Partial<CheckResult> = {}): CheckResult {
  return {
    listedChecked: 7,
    listedFound: [],
    maskedChecked: 5,
    maskedFound: [],
    onPurposeFound: [],
    passed: true,
    ...over,
  };
}
const all = (l: EgressLines) => [l.verdict, ...l.rows.flatMap((r) => [r.label, r.value]), l.standing].join("\n");
const row = (l: EgressLines, label: RegExp) => l.rows.find((r) => label.test(r.label))?.value;
const words = (s: string) => s.trim().split(/\s+/).length;

// Rewritten by egress-check task 25 (fifth review N1): the paragraph form of the line is now a verdict and rows.
describe("buildLines (the card)", () => {
  it("pass: one verdict of at most ten words with computed counts", () => {
    const l = buildLines({ result: result(), connected: true, host: "firebasevertexai.googleapis.com" });
    expect(l.kind).toBe("pass");
    expect(l.icon).toBe("check");
    expect(l.failure).toBe(false);
    expect(l.verdict).toBe("No listed name left this device: 0 of 7.");
    expect(words(l.verdict)).toBeLessThanOrEqual(10);
  });

  it("pass: three rows, label and value", () => {
    const l = buildLines({ result: result(), connected: true, host: "firebasevertexai.googleapis.com" });
    expect(l.rows).toEqual([
      { label: "Masked values in the text sent", value: "0 of 5" },
      { label: "Single name parts of 3 letters or more", value: "checked, none found" },
      { label: "The request", value: "sent to firebasevertexai.googleapis.com" },
    ]);
  });

  it("the near-variants sentence is no longer in the card", () => {
    const l = buildLines({ result: result(), connected: true });
    expect(all(l)).not.toContain("Near variants");
    expect(all(l)).not.toContain("Checked on the bytes");
    expect(strings.egress.nearVariants).toBe("Near variants that were not masked are not checked.");
  });

  it("always carries the standing sentence", () => {
    for (const r of [result(), result({ passed: false, listedFound: ["Priya Halloran"] }), result({ onPurposeFound: ["Priya Halloran"] })]) {
      expect(buildLines({ result: r, connected: true }).standing).toBe(
        "This checks listed names and masked values only. Other details in the text can still identify a person.",
      );
    }
    expect(buildBlockedLine(result({ passed: false, listedFound: ["Priya Halloran"] })).standing).toContain("can still identify a person");
  });

  it("on purpose: names the value and is not a failure", () => {
    const l = buildLines({ result: result({ onPurposeFound: ["Maria Okonkwo-Reyes"] }), connected: true });
    expect(l.kind).toBe("onPurpose");
    expect(l.failure).toBe(false);
    expect(l.icon).toBe("check");
    expect(l.verdict).toBe("1 of 7 listed names sent on purpose: Maria Okonkwo-Reyes.");
    expect(l.rows).toHaveLength(3);
  });

  // Rewritten by egress-check task 33 (sixth review R3): the fail card has two last rows, not one.
  it("fail: words, the count, the names, the crossed octagon and two last rows", () => {
    const l = buildLines({
      result: result({ passed: false, listedFound: ["Tomas Brandvold", "Priya Halloran"] }),
      connected: true,
    });
    expect(l.kind).toBe("fail");
    expect(l.failure).toBe(true);
    expect(l.icon).toBe("crossedOctagon");
    expect(l.verdict).toBe("Egress check failed. Found 2 of 7 listed names: Tomas Brandvold, Priya Halloran.");
    expect(l.verdict).toContain("Egress check failed");
    expect(l.verdict).toContain("Found");
    expect(l.rows).toHaveLength(5);
    expect(row(l, /what happened/i)).toBe("this text has left this device.");
    expect(row(l, /what to do/i)).toBe("report it to whoever runs this page; mask the name before the next send.");
    expect(l.rows.slice(-2).map((r) => r.label)).toEqual(["What happened", "What to do"]);
    expect(row(l, /single name parts/i)).toBe("checked, found in 2 of 7 names");
  });

  it("fail on a masked value alone still says Egress check failed and Found", () => {
    const l = buildLines({ result: result({ passed: false, maskedFound: ["Alder Court"] }), connected: true });
    expect(l.failure).toBe(true);
    expect(l.verdict).toBe("Egress check failed. Found 1 of 5 masked values: Alder Court.");
    expect(row(l, /masked values/i)).toBe("1 of 5: Alder Court");
  });

  it("fail when both a listed name and a masked value are found", () => {
    const l = buildLines({ result: result({ passed: false, listedFound: ["Priya Halloran"], maskedFound: ["Bea"] }), connected: true });
    expect(l.verdict).toContain("Found 1 of 7 listed names: Priya Halloran.");
    expect(row(l, /masked values/i)).toBe("1 of 5: Bea");
  });

  it("preview blocked: the verdict, the crossed octagon and one row that says what to do", () => {
    const l = buildBlockedLine(result({ passed: false, listedFound: ["Maria Okonkwo-Reyes"] }));
    expect(l.kind).toBe("blocked");
    expect(l.failure).toBe(true);
    expect(l.icon).toBe("crossedOctagon");
    expect(l.verdict).toBe("Found in the text that would leave: Maria Okonkwo-Reyes.");
    expect(l.rows).toEqual([{ label: "What to do", value: "Mask it, then send." }]);
  });

  it("double: the request row says none made, a fixed sample, cloud off", () => {
    const l = buildLines({ result: result(), connected: false });
    expect(row(l, /request/i)).toBe("none made, answered by a fixed sample: cloud off");
    expect(l.verdict).toContain("0 of 7");
    expect(row(buildLines({ result: result(), connected: true }), /request/i)).not.toMatch(/cloud off/i);
  });

  it("connected with no host recorded still says something true", () => {
    expect(row(buildLines({ result: result(), connected: true }), /request/i)).toBe("sent to the cloud service");
  });

  it("offline device draft: nothing went to the cloud", () => {
    const l = buildLines({ result: result(), connected: true, deviceOnly: true });
    expect(l.kind).toBe("offlineDevice");
    expect(l.verdict).toBe("Nothing went to the cloud: 0 of 7 listed names.");
    expect(l.failure).toBe(false);
    expect(row(l, /request/i)).toBe("none made, draft made on this device");
  });

  it("offline device draft that did send something found is still a failure", () => {
    const l = buildLines({ result: result({ passed: false, listedFound: ["Priya Halloran"] }), connected: true, deviceOnly: true });
    expect(l.kind).toBe("fail");
  });

  it("says what was checked, with the part length from the run", () => {
    expect(buildLines({ result: result(), connected: true, minPartLength: 4 }).rows[1]!.label).toBe("Single name parts of 4 letters or more");
  });

  it("computes its counts and never repeats the example number", () => {
    for (const m of [0, 1, 12, 41]) {
      for (const k of [0, 3, 19]) {
        const l = buildLines({ result: result({ listedChecked: m, maskedChecked: k }), connected: true });
        expect(l.verdict).toBe(`No listed name left this device: 0 of ${m}.`);
        expect(row(l, /masked values/i)).toBe(`0 of ${k}`);
        if (m !== 28 && k !== 28) expect(all(l)).not.toContain("28");
      }
    }
  });

  it("takes its counts from a real check", () => {
    const r = checkEgress({
      captured: [{ url: "https://example.invalid/", body: new TextEncoder().encode("a note about [Person 1]") }],
      listedNames: ["Priya Halloran", "Tomas Brandvold", "Wren Castellano-Hughes"],
      surfaceForms: ["Bea"],
      sentOnPurpose: [],
    });
    const l = buildLines({ result: r, connected: true });
    expect(l.verdict).toBe("No listed name left this device: 0 of 3.");
    expect(row(l, /masked values/i)).toBe("0 of 1");
  });

  it("uses no banned word and never says nothing private left", () => {
    const cases = [
      buildLines({ result: result(), connected: false }),
      buildLines({ result: result({ onPurposeFound: ["Priya Halloran"] }), connected: true }),
      buildLines({ result: result({ passed: false, listedFound: ["Priya Halloran"], maskedFound: ["Bea"] }), connected: true }),
      buildLines({ result: result(), connected: true, deviceOnly: true }),
      buildBlockedLine(result({ passed: false, listedFound: ["Priya Halloran"] })),
    ];
    for (const l of cases) {
      expect(all(l)).not.toMatch(BANNED);
      expect(all(l)).not.toMatch(NOTHING_LEFT);
    }
    for (const text of flattenStrings(strings.egress)) {
      expect(text).not.toMatch(BANNED);
      expect(text).not.toMatch(NOTHING_LEFT);
      expect(text).not.toMatch(/\d/);
    }
  });
});
