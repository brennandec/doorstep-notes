// measurement R17.5 (session H15): the footer and the README read the newest dated h2-part-b record,
// falling back to results/h2-part-b.json. The two status lines of the new records are written from them.
import { describe, expect, it } from "vitest";
import { cloudStatusLines, notCheckedLine } from "../../src/app/figureText";
import { newestResult, newestResultName, type ResultFile, type ResultsLookup } from "../../src/app/figures";
import { standingStatements } from "../../src/app/standing";

function lookupOf(files: Record<string, Record<string, unknown>>, listNames = true): ResultsLookup {
  const f = ((name: string) => files[name] as ResultFile | undefined) as ResultsLookup;
  if (listNames) f.names = () => Object.keys(files);
  return f;
}

const old = { status: "miss", reason: "old unpaid-tier reason" };
const passRecord = { status: "pass", date: "2026-11-14T13:00:00.000Z", browser: "Google Chrome 157.0.8103.79", hybridRun: "results/hybrid-run-2026-11-14.json" };

describe("the newest dated record", () => {
  it("falls back to the undated file when there is no dated one", () => {
    const l = lookupOf({ "h2-part-b": old });
    expect(newestResultName(l, "h2-part-b")).toBe("h2-part-b");
    expect(newestResult(l, "h2-part-b")?.status).toBe("miss");
  });

  it("falls back when the lookup cannot list its files", () => {
    const l = lookupOf({ "h2-part-b": old, "h2-part-b-2026-11-14": passRecord }, false);
    expect(newestResultName(l, "h2-part-b")).toBe("h2-part-b");
  });

  it("takes the later date, then the higher number, and ignores other checks", () => {
    const l = lookupOf({
      "h2-part-b": old,
      "h2-part-b-2026-11-14": passRecord,
      "h2-part-b-2026-11-14-2": { status: "fail" },
      "h2-part-b-2026-11-15": { status: "miss" },
      "h2-part-bx-2026-11-30": { status: "pass" },
    });
    expect(newestResultName(l, "h2-part-b")).toBe("h2-part-b-2026-11-15");
    const m = lookupOf({ "h2-part-b": old, "h2-part-b-2026-11-14": passRecord, "h2-part-b-2026-11-14-2": { status: "fail" }, "h2-part-b-2026-11-14-10": { status: "miss" } });
    expect(newestResultName(m, "h2-part-b")).toBe("h2-part-b-2026-11-14-10");
  });
});

describe("the footer line follows the newest record", () => {
  const tier = { aiServiceEnabled: true, tier: "paid" as const };
  it("is shown while the newest record did not pass, even when an older one did", () => {
    const l = lookupOf({ "h2-part-b": { status: "pass" }, "h2-part-b-2026-11-14": { status: "fail" } });
    expect(standingStatements({ results: l, ...tier }).h2Line).not.toBeNull();
  });

  it("goes when the newest dated record passed, although the undated file is a miss", () => {
    const l = lookupOf({ "h2-part-b": old, "h2-part-b-2026-11-14": passRecord });
    expect(standingStatements({ results: l, ...tier }).h2Line).toBeNull();
    expect(notCheckedLine(l)).toBeNull();
  });

  it("says the newest record ran and did not pass, instead of saying the run did not happen", () => {
    const l = lookupOf({ "h2-part-b": old, "h2-part-b-2026-11-14": { ...passRecord, status: "fail" } });
    const line = notCheckedLine(l)!;
    expect(line).toContain("Not yet checked against the real service.");
    expect(line).toContain("results/h2-part-b-2026-11-14.json");
    expect(line).toContain("ran on 2026-11-14 and did not pass");
    expect(line).not.toContain("has not run");
  });
});

describe("the status lines of the two new records", () => {
  const drop = { status: "pass", date: "2026-11-14T13:10:00.000Z", browser: "Google Chrome 157.0.8103.79", label: "on this device" };

  it("read not measured with no dated record", () => {
    const lines = cloudStatusLines(lookupOf({ "h2-part-b": old }));
    expect(lines.slice(3)).toEqual(["Both halves in one Chrome session: not measured.", "Draft cut during the call: not measured."]);
  });

  it("carry the date, browser and status of the newest record", () => {
    const lines = cloudStatusLines(lookupOf({ "h2-part-b-2026-11-14": passRecord, "draft-network-drop-2026-11-14": drop }));
    expect(lines[3]).toBe(
      "Both halves in one Chrome session: pass (2026-11-14, Google Chrome 157.0.8103.79). The record, masks, offline draft and Shorter answered on this device; the second reader and the online draft answered in the cloud. Every request was recorded.",
    );
    expect(lines[4]).toContain("(2026-11-14, Google Chrome 157.0.8103.79)");
    expect(lines[4]).toContain("simulated drop, route.abort");
    expect(lines[4]).toContain('labelled "on this device"');
  });

  it("keeps the newest pass and names a later miss", () => {
    const reason = "The local Firebase config file is not in the project root.";
    const miss = { status: "miss", date: "2026-11-23T12:00:00.000Z", browser: "none", reason };
    const lines = cloudStatusLines(lookupOf({
      "h2-part-b-2026-11-14": passRecord,
      "h2-part-b-2026-11-23-h20": miss,
      "draft-network-drop-2026-11-14": drop,
      "draft-network-drop-2026-11-23-h18": miss,
    }));
    const kept = "Both halves in one Chrome session: pass (2026-11-14, Google Chrome 157.0.8103.79). The record, masks, offline draft and Shorter answered on this device; the second reader and the online draft answered in the cloud. Every request was recorded.";
    const keptCut = 'Draft cut during the call: pass (2026-11-14, Google Chrome 157.0.8103.79). The call was cut by the test (a simulated drop, route.abort). The SDK\'s own fallback wrote the note, labelled "on this device".';
    expect(lines[3]?.startsWith(kept)).toBe(true);
    expect(lines[3]?.slice(kept.length).startsWith(" Later attempt")).toBe(true);
    expect(lines[3]).toContain("Later attempt on 2026-11-23 did not run (`results/h2-part-b-2026-11-23-h20.json`)");
    expect(lines[3]).toContain(reason);
    expect(lines[3]).not.toContain("not measured");
    expect(lines[4]?.startsWith(keptCut)).toBe(true);
    expect(lines[4]?.slice(keptCut.length).startsWith(" Later attempt")).toBe(true);
    expect(lines[4]).toContain("Later attempt on 2026-11-23 did not run (`results/draft-network-drop-2026-11-23-h18.json`)");
    expect(lines[4]).toContain(reason);
    expect(lines[4]).not.toContain("not measured");
    expect(notCheckedLine(lookupOf({ "h2-part-b-2026-11-14": passRecord, "h2-part-b-2026-11-23-h20": miss }))).toBeNull();
  });

  it("names a later fail beside the pass", () => {
    const lines = cloudStatusLines(lookupOf({
      "h2-part-b-2026-11-14": passRecord,
      "h2-part-b-2026-11-17-h20": { ...passRecord, status: "fail", date: "2026-11-17T01:00:00.000Z" },
    }));
    expect(lines[3]).toContain("pass (2026-11-14, Google Chrome 157.0.8103.79)");
    expect(lines[3]).toContain("Later attempt on 2026-11-17 did not pass (`results/h2-part-b-2026-11-17-h20.json`).");
    expect(lines[3]).not.toContain("not measured");
  });

  it("names a dated miss when no pass exists", () => {
    const lines = cloudStatusLines(lookupOf({
      "h2-part-b-2026-11-23-h20": { status: "miss", date: "2026-11-23T12:00:00.000Z", browser: "none", reason: "Config absent." },
    }));
    expect(lines[3]).toBe(
      "Both halves in one Chrome session: the attempt on 2026-11-23 did not run (`results/h2-part-b-2026-11-23-h20.json`): Config absent.",
    );
  });

  it("never read a failed record as a pass", () => {
    const lines = cloudStatusLines(lookupOf({ "h2-part-b-2026-11-14": { ...passRecord, status: "fail" }, "draft-network-drop-2026-11-14": { ...drop, status: "fail" } }));
    expect(lines[3]).toContain("fail (");
    expect(lines[3]).not.toContain("answered on this device");
    expect(lines[4]).toContain("fail (");
    expect(lines[4]).not.toContain("simulated drop");
  });
});

describe("a session suffix (H17)", () => {
  it("ranks h16 above the numbered records of the same date, and a later date above h16", () => {
    const l = lookupOf({ "h2-part-b-2026-11-14": passRecord, "h2-part-b-2026-11-14-2": { status: "fail" }, "h2-part-b-2026-11-14-h16": { status: "pass" } });
    expect(newestResultName(l, "h2-part-b")).toBe("h2-part-b-2026-11-14-h16");
    const m = lookupOf({ "h2-part-b-2026-11-14-h16": { status: "pass" }, "h2-part-b-2026-11-15": { status: "miss" }, "h2-part-b-2026-11-14-h2": { status: "fail" } });
    expect(newestResultName(m, "h2-part-b")).toBe("h2-part-b-2026-11-15");
    const n = lookupOf({ "h2-part-b-2026-11-14-h2": { status: "fail" }, "h2-part-b-2026-11-14-h16": { status: "pass" } });
    expect(newestResultName(n, "h2-part-b")).toBe("h2-part-b-2026-11-14-h16");
  });
});
