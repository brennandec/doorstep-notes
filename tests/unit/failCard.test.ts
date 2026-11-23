// @vitest-environment happy-dom
// Egress-check tasks 33 (R16, sixth review R3): a failed check says the text has left. Invented people only.
import { describe, expect, it } from "vitest";
import { egressLine } from "../../src/app/parts/egressLine";
import { flattenStrings, strings } from "../../src/app/strings";
import { makeLedger } from "../../src/egress/ledger";
import { buildBlockedLine, buildLines } from "../../src/egress/line";
import { makePreview, send, type CheckValues } from "../../src/egress/send";
import type { JobResult } from "../../src/inference/types";

const values: CheckValues = {
  listedNames: ["Maria Okonkwo-Reyes", "Tomas Brandvold", "Priya Halloran"],
  surfaceForms: [],
  sentOnPurpose: [],
};
const CLEAN = "Visit date: 12/11\nPresent: [Person 1], worker";
const ok = <T>(value: T): JobResult<T> => ({ value, inferenceSource: "IN_CLOUD", connected: false });
const leak = (body: Uint8Array) => new Uint8Array([...body, ...new TextEncoder().encode(" Priya Halloran")]);

async function sendWith(seed: boolean) {
  const out = await send(
    { preview: makePreview(CLEAN, values), job: "draft", mode: "PREFER_IN_CLOUD", run: async (_t, text) => ok(text) },
    { ...values, ledger: makeLedger(), ...(seed ? { seedLeak: leak } : {}) },
  );
  if (out.status !== "sent") throw new Error("expected sent");
  return out;
}
const rowsOf = (n: HTMLElement) => [...n.querySelectorAll(".egress-rows tr")].map((r) => [r.querySelector("th")!.textContent, r.querySelector("td")!.textContent]);

describe("the fail card (R16.1)", () => {
  it("keeps the verdict line and ends in two rows with the owner's words", async () => {
    const out = await sendWith(true);
    expect(out.lines.verdict).toBe("Egress check failed. Found 1 of 3 listed names: Priya Halloran.");
    const rows = rowsOf(egressLine(out.lines));
    expect(rows.slice(-2)).toEqual([
      ["What happened", "this text has left this device."],
      ["What to do", "report it to whoever runs this page; mask the name before the next send."],
    ]);
    expect(rows).toHaveLength(5);
  });

  it("does not say 'Mask them, then send again.' any more, in the strings or on the card", async () => {
    expect(flattenStrings(strings).some((t) => t.includes("Mask them, then send again"))).toBe(false);
    expect(egressLine((await sendWith(true)).lines).textContent).not.toContain("send again");
  });

  it("a pass has three rows and no what-happened row", async () => {
    const out = await sendWith(false);
    expect(out.lines.kind).toBe("pass");
    expect(rowsOf(egressLine(out.lines))).toHaveLength(3);
    expect(egressLine(out.lines).textContent).not.toContain("What happened");
  });

  it("the card holds no paragraph", async () => {
    const card = egressLine((await sendWith(true)).lines).querySelector("[data-egress-card]")!;
    expect(card.querySelectorAll("p")).toHaveLength(0);
  });

  it("the block card keeps its one row", () => {
    const blocked = buildBlockedLine({ listedChecked: 3, listedFound: ["Priya Halloran"], maskedChecked: 0, maskedFound: [], onPurposeFound: [], passed: false });
    expect(rowsOf(egressLine(blocked))).toEqual([["What to do", "Mask it, then send."]]);
  });
});

describe("Seeded for a test. (R16.2)", () => {
  it("is on the card of a seeded fail", async () => {
    const out = await sendWith(true);
    expect(out.lines.seeded).toBe(true);
    const n = egressLine(out.lines);
    expect(n.querySelector("[data-egress-seeded]")?.textContent).toBe("Seeded for a test.");
    expect(n.querySelector("[data-egress-card] [data-egress-seeded]")).not.toBeNull();
  });

  it("is not on a pass, even with the seed set but nothing found", () => {
    const pass = buildLines({
      result: { listedChecked: 3, listedFound: [], maskedChecked: 0, maskedFound: [], onPurposeFound: [], passed: true },
      connected: true,
      seeded: true,
    });
    expect(pass.seeded).toBeUndefined();
    expect(egressLine(pass).querySelector("[data-egress-seeded]")).toBeNull();
  });

  it("is not on a fail that was not seeded", () => {
    const fail = buildLines({
      result: { listedChecked: 3, listedFound: ["Priya Halloran"], maskedChecked: 0, maskedFound: [], onPurposeFound: [], passed: false },
      connected: true,
    });
    expect(fail.seeded).toBeUndefined();
    expect(egressLine(fail).querySelector("[data-egress-seeded]")).toBeNull();
    expect(egressLine(fail).textContent).not.toContain("Seeded for a test.");
  });

  it("is not on a normal send", async () => {
    expect((await sendWith(false)).lines.seeded).toBeUndefined();
  });

  it("the words are in the string table and the failure colour stays on the failing line only", () => {
    expect(flattenStrings(strings).filter((t) => t === "Seeded for a test.")).toHaveLength(1);
    expect(strings.egress.happenedFail).not.toMatch(/\b(safe|private by design|anonymised|guaranteed|cleared)\b/i);
  });
});
