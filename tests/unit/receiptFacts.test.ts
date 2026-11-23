// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { CLOUD_MODEL_HOST } from "../../src/constants";
import type { LedgerEntry } from "../../src/egress/ledger";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { receiptFacts } from "../../src/app/parts/receiptFacts";
import { inventedVisit } from "../../src/app/example/inventedVisit";

const handlers = (): Handlers => ({
  onNoteInput: vi.fn(),
  onListInput: vi.fn(),
  onTryExample: vi.fn(),
  onRemoveExample: vi.fn(),
  onGetModel: vi.fn(),
  onMakeRecord: vi.fn(),
  onStartVisit: vi.fn(),
});

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    at: "2026-11-23T04:40:00.000Z",
    sha256: ["ab".repeat(32)],
    byteLengths: [8],
    listedChecked: 1,
    listedFound: 0,
    maskedChecked: 1,
    maskedFound: 0,
    onPurpose: 0,
    job: "draft",
    mode: "PREFER_IN_CLOUD",
    inferenceSource: "ON_DEVICE",
    connected: true,
    outcome: "answered",
    requests: [{ host: CLOUD_MODEL_HOST, bytes: 20, carriesNote: true, preflight: false }],
    ...over,
  };
}

describe("receipt facts under the finished mark", () => {
  it("a device draft after a cloud call says the call did not write the draft, and the device did", () => {
    const facts = receiptFacts({ source: "ON_DEVICE", connected: true }, [entry()]);
    expect(facts.sent).toBe(strings.receiptFacts.sentCloudNotThisDraft);
    expect(facts.produced).toBe(strings.receiptFacts.writtenOnDevice);
    expect(`${facts.sent} ${facts.produced}`).not.toContain("in the cloud");
    expect(facts.sent).not.toBe(strings.firstRun.destination);
  });

  it("a device draft with no cloud request was not sent", () => {
    const facts = receiptFacts({ source: "ON_DEVICE", connected: true }, [entry({
      mode: "ONLY_ON_DEVICE",
      requests: [],
    })]);
    expect(facts.sent).toBe(strings.receiptFacts.notSent);
    expect(facts.produced).toBe(strings.receiptFacts.writtenOnDevice);
  });

  it("uses the last draft entry, not an earlier cloud call", () => {
    const facts = receiptFacts({ source: "ON_DEVICE", connected: true }, [
      entry(),
      entry({ requests: [], mode: "ONLY_ON_DEVICE" }),
    ]);
    expect(facts.sent).toBe(strings.receiptFacts.notSent);
  });

  it("a connected cloud draft says the cloud answered and wrote the draft", () => {
    const facts = receiptFacts({ source: "IN_CLOUD", connected: true }, [entry({ inferenceSource: "IN_CLOUD" })]);
    expect(facts.sent).toBe(strings.receiptFacts.sentCloudAnswered);
    expect(facts.produced).toBe(strings.receiptFacts.writtenInCloud);
    expect(facts.produced).not.toContain("on this device");
  });

  it("a fixed sample was not sent and is not a cloud draft", () => {
    const facts = receiptFacts({ source: "IN_CLOUD", connected: false }, [entry({ connected: false, requests: [] })]);
    expect(facts.sent).toBe(strings.receiptFacts.notSent);
    expect(facts.produced).toBe(strings.receiptFacts.fixedSample);
    expect(`${facts.sent} ${facts.produced}`).not.toContain("in the cloud");
    expect(`${facts.sent} ${facts.produced}`).not.toContain(strings.firstRun.destination);
  });
});

describe("the quiet finished receipt", () => {
  function paint(source: "ON_DEVICE" | "IN_CLOUD", connected: boolean, ledger?: LedgerEntry[]) {
    const root = document.createElement("div");
    root.append(...renderScreen(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      record: structuredClone(inventedVisit.preparedRecord),
      finished: { text: "The worker rang the landlord.", source, connected },
      ...(ledger ? { ledger: { entries: ledger, ms: [] } } : {}),
    }), handlers()));
    return root;
  }

  it("paints the two device lines and does not paint Destination: the cloud.", () => {
    const root = paint("ON_DEVICE", true, [entry()]);
    const sent = root.querySelector("[data-receipt-sent]")?.textContent;
    const produced = root.querySelector("[data-receipt-produced]")?.textContent;
    expect(sent).toBe(strings.receiptFacts.sentCloudNotThisDraft);
    expect(produced).toBe(strings.receiptFacts.writtenOnDevice);
    expect(root.querySelector("[data-receipt]")?.textContent).not.toContain(strings.firstRun.destination);
    expect(root.querySelector("[data-receipt] .source-label")?.textContent).toBe("on this device");
  });

  it("paints the two cloud lines under the cloud mark", () => {
    const root = paint("IN_CLOUD", true, [entry({ inferenceSource: "IN_CLOUD" })]);
    expect(root.querySelector("[data-receipt-sent]")?.textContent).toBe(strings.receiptFacts.sentCloudAnswered);
    expect(root.querySelector("[data-receipt-produced]")?.textContent).toBe(strings.receiptFacts.writtenInCloud);
    expect(root.querySelector("[data-receipt] .source-label")?.textContent).toBe("in the cloud");
    expect(root.querySelector("[data-receipt-produced]")?.textContent).not.toContain("on this device");
  });
});
