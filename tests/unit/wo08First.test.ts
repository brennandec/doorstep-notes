// @vitest-environment happy-dom
// WO-08 cold first screen. The limit is the same counter the measurement script uses.
import { describe, expect, it, vi } from "vitest";
import type { LedgerEntry } from "../../src/egress/ledger";
import type { EgressLines } from "../../src/egress/line";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { measureRoot } from "../../src/app/measureScreen";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type Handlers } from "../../src/app/state";
import { fill, strings } from "../../src/app/strings";
import { legendLine, masksSendReady } from "../../src/app/zones/masksScreen";
import type { MaskSpan } from "../../src/masking/types";

const handlers = (over: Partial<Handlers> = {}): Handlers => ({
  onNoteInput: vi.fn(),
  onListInput: vi.fn(),
  onTryExample: vi.fn(),
  onRemoveExample: vi.fn(),
  onGetModel: vi.fn(),
  onMakeRecord: vi.fn(),
  onStartVisit: vi.fn(),
  ...over,
});

function mount(state = emptyState(), h = handlers()) {
  const root = document.createElement("div");
  root.append(...renderScreen(state, h));
  return root;
}

function withRequestRows(entry: LedgerEntry, n: number, preflight = false): LedgerEntry {
  return Object.assign(entry, {
    requests: Array.from({ length: n }, () => ({ host: "example.test", bytes: 1, carriesNote: false, preflight })),
  });
}

function requestCell(table: Element): string {
  const hit = [...table.querySelectorAll("tr")].find(
    (tr) => tr.querySelector("th")?.textContent === strings.xray.requests,
  );
  return hit?.querySelector("td")?.textContent ?? "";
}

describe("WO-08 cold first screen", () => {
  it("stays at or under 120 visible words, with two controls and no egress", () => {
    const root = mount();
    const measured = measureRoot(root);
    expect(measured.words).toBeLessThanOrEqual(120);
    expect(measured.words).toBeGreaterThan(0);
    expect(measured.controls).toBe(3);
    expect(root.querySelector("main [data-notices] a")?.textContent).toBe(strings.notices.link);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(measured.egress).toBe(false);
    expect(measured.text).not.toMatch(/egress/i);
  });

  it("is the split: the sentence, the two named controls, and the five steps", () => {
    const h = handlers();
    const root = mount(emptyState(), h);
    expect(root.querySelector('[data-plane="device"]')?.textContent).toContain(strings.firstRun.planeDevice);
    expect(root.querySelector('[data-plane="leaves"]')?.textContent).toContain(strings.zones.leaves);
    expect(root.querySelector("h1.first-sentence")?.textContent).toBe(strings.firstRun.sentence);
    expect(root.querySelector(".tagline")).toBeNull();
    expect(root.querySelector("[data-halves]")).toBeNull();
    expect(root.querySelector("footer")).toBeNull();
    const tryIt = root.querySelector<HTMLButtonElement>("#try-example")!;
    const start = root.querySelector<HTMLButtonElement>("#start-visit")!;
    expect(tryIt.textContent).toBe(strings.firstRun.tryExample);
    expect(tryIt.getAttribute("data-kind")).toBe("primary");
    expect(start.textContent).toBe(strings.firstRun.startVisit);
    expect(start.getAttribute("data-kind")).toBe("secondary");
    expect([...root.querySelectorAll("[data-first-step]")].map((n) => n.getAttribute("data-first-step"))).toEqual([
      "note", "record", "masks", "send", "finished",
    ]);
    expect(root.querySelector('[data-first-step="note"]')?.getAttribute("aria-current")).toBe("step");
    expect(root.querySelector('[data-first-step="note"] [data-icon="step-filled"]')).not.toBeNull();
    expect(root.querySelectorAll("[data-icon='step-outlined']")).toHaveLength(4);
    expect(root.querySelector('[data-first-step="note"]')?.textContent).toContain(strings.firstRun.stepNote);
    expect(root.textContent).toContain("Requests before send: 0.");
    expect(root.textContent).toContain(strings.firstRun.nothingLeft);
    expect(root.textContent).toContain(strings.firstRun.destination);
    expect(root.textContent).toContain(strings.status.deviceAbsent);
    expect(root.textContent).not.toContain(strings.status.deviceReady);
    tryIt.click();
    expect(h.onTryExample).toHaveBeenCalledTimes(1);
    start.click();
    expect(h.onStartVisit).toHaveBeenCalledTimes(1);
  });

  it("opens the empty visit after Start a visit, with the record control still waiting for a note", () => {
    const root = mount(emptyState({ started: true }));
    expect(root.querySelector('[data-zone="note"] h2')?.textContent).toBe(strings.zones.note);
    const make = root.querySelector<HTMLButtonElement>("#make-record")!;
    expect(make.disabled).toBe(true);
    expect(make.title).toBe(strings.addNoteFirst);
    expect(root.querySelector("[data-first-reason]")?.textContent).toBe(strings.addNoteFirst);
    expect(root.querySelector(".tagline")?.textContent).toBe("A writing aid with an egress check.");
  });
});

describe("WO-08 masks step", () => {
  const masksState = () => emptyState({
    recordOpen: false,
    example: true,
    started: true,
    noteText: inventedVisit.note,
    clientList: inventedVisit.clientList,
    record: structuredClone(inventedVisit.preparedRecord),
  });

  it("stays at or under 350 visible words and 30 controls, with the exact text hidden", () => {
    const root = mount(masksState());
    const measured = measureRoot(root);
    expect(measured.words).toBeLessThanOrEqual(350);
    expect(measured.words).toBeGreaterThan(0);
    expect(measured.controls).toBeLessThanOrEqual(30);
    expect(measured.egress).toBe(false);
    expect(measured.text).not.toMatch(/egress/i);
    expect(root.querySelector("#exact-text")?.hasAttribute("hidden")).toBe(true);
    expect(measured.text).not.toContain("Instructions:");
  });

  it("is the two columns, the step rail says Send, and Edit opens the rows", () => {
    const toggle = vi.fn();
    const h = handlers({ onOpenRecord: vi.fn(), onToggleMask: toggle });
    const root = mount(masksState(), h);
    expect(root.querySelector("[data-masks-step]")).not.toBeNull();
    expect(root.querySelector("main h1.sr-only")?.textContent).toBe(strings.steps.masks);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector('[data-masks-col="record"] h2')?.textContent).toBe(strings.recordTitle);
    expect(root.querySelector('[data-masks-col="leaves"] h2')?.textContent).toBe(strings.zones.leaves);
    expect(root.querySelector("[data-mark='example']")?.textContent).toBe(strings.firstRun.exampleMark);
    expect([...root.querySelectorAll("[data-step]")].map((n) => n.getAttribute("data-step"))).toEqual([
      "note", "record", "masks", "send", "finished",
    ]);
    expect(root.querySelector('[data-step="masks"]')?.getAttribute("aria-current")).toBe("step");
    expect(root.textContent).toContain(strings.firstRun.maskClue);
    expect(root.textContent).toContain("Show the exact text sent (");
    expect(root.textContent).not.toContain("Reader");
    expect(root.querySelector(".tagline")).toBeNull();
    expect(root.querySelector("footer")).toBeNull();
    expect(root.querySelector("[data-mask-view]")).toBeNull();
    expect(root.querySelector(".mask-chip")).not.toBeNull();
    expect(root.textContent).toContain("still written out");
    const leaves = root.querySelector("[data-masks-leaving]");
    expect(leaves?.textContent).not.toMatch(/\bBea\b/);
    expect(leaves?.textContent).toMatch(/\[Person \d+\]/);
    const manual = root.querySelector<HTMLButtonElement>('[data-chip="manual"]');
    expect(manual?.querySelector(".chip-text")?.textContent).toMatch(/^\[Person \d+\]$/);
    manual?.click();
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle.mock.calls[0]?.[0].surfaceForm).toBe("Bea");
    root.querySelector<HTMLButtonElement>("#edit-record")!.click();
    expect(h.onOpenRecord).toHaveBeenCalledTimes(1);
  });

  it("keeps the record rows when the masks step has not been asked to close them", () => {
    const root = mount(emptyState({
      started: true,
      record: structuredClone(inventedVisit.preparedRecord),
    }));
    expect(root.querySelector("[data-masks-step]")).toBeNull();
    expect(root.querySelector('[data-zone="note"]')).not.toBeNull();
  });

  it("asks for the draft from the masks step without opening the rows", () => {
    const h = handlers({ onDraft: vi.fn() });
    const root = mount(masksState(), h);
    root.querySelector<HTMLButtonElement>("#open-send")!.click();
    expect(h.onDraft).toHaveBeenCalledTimes(1);
    expect(root.querySelector("[data-mask-view]")).toBeNull();
  });

  it("names a person tag the screen shows and does not name a date", () => {
    const root = mount(masksState());
    const line = root.querySelector(".masks-stands")?.textContent ?? "";
    expect(line).toBe("Person 1 stands for a listed name. Each stays on this device.");
    expect(line).not.toContain("listed date");
  });

  it("names a date tag when one is on the screen", () => {
    const person: MaskSpan = {
      start: 0, end: 3, surfaceForm: "Bea", tag: "[Person 1]", kind: "manual",
      tagKind: "Person", key: "present:bea", accepted: true, sentOnPurpose: false,
    };
    const date: MaskSpan = {
      start: 4, end: 9, surfaceForm: "12/11", tag: "[Date 2]", kind: "listed",
      tagKind: "Date", key: "text:12/11", accepted: true, sentOnPurpose: false,
    };
    expect(legendLine([person, date])).toBe(
      "Person 1 stands for a listed name. Date 2 stands for a listed date. Each stays on this device.",
    );
    expect(legendLine([])).toBeNull();
  });

  it("does not look ready to send while offline with no device model and the cloud not configured", () => {
    const h = handlers({ onDraft: vi.fn() });
    const state = emptyState({
      recordOpen: false,
      example: true,
      started: true,
      noteText: inventedVisit.note,
      clientList: inventedVisit.clientList,
      record: structuredClone(inventedVisit.preparedRecord),
      network: "offline",
      device: { state: "unavailable" },
      cloud: false,
      cloudStatus: { kind: "not-configured", words: strings.status.cloudNotConfigured },
    });
    expect(masksSendReady(state)).toBe(false);
    const root = mount(state, h);
    const send = root.querySelector<HTMLButtonElement>("#open-send")!;
    expect(send.disabled).toBe(true);
    expect(send.getAttribute("title")).toBe(strings.cloudDisabledReason);
    send.click();
    expect(h.onDraft).not.toHaveBeenCalled();
  });
});

describe("WO-08 send step", () => {
  const blocked: EgressLines = {
    kind: "blocked",
    icon: "crossedOctagon",
    failure: true,
    verdict: "",
    rows: [],
    standing: "",
    blocked: { listed: ["Priya Halloran"], masked: [] },
  };

  const sendState = () => emptyState({
    recordOpen: false,
    example: true,
    started: true,
    noteText: inventedVisit.note,
    clientList: inventedVisit.clientList,
    record: structuredClone(inventedVisit.preparedRecord),
    outgoingText: "Priya Halloran rang the worker.",
    egressLines: blocked,
  });

  it("shows the listed-name block and does not paint egress", () => {
    const h = handlers({ onMaskBlocked: vi.fn(), onSend: vi.fn() });
    const root = mount(sendState(), h);
    const measured = measureRoot(root);
    expect(root.querySelector("[data-send-step]")).not.toBeNull();
    expect(root.querySelector("main h1.sr-only")?.textContent).toBe(strings.zones.leaves);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector('[data-step="send"]')?.getAttribute("aria-current")).toBe("step");
    expect(root.querySelector('[data-step="send"]')?.hasAttribute("data-stopped")).toBe(true);
    expect(root.querySelector("[data-block-line]")?.textContent).toContain("Not sent: 1 listed name is in the text. Mask it, then send.");
    expect(root.querySelector("[data-block-chip]")?.getAttribute("data-block-chip")).toBe("Priya Halloran");
    expect(root.querySelector("[data-zone='leaves']")).toBeNull();
    expect(measured.egress).toBe(false);
    expect(measured.text).not.toMatch(/egress/i);
    expect((root.querySelector("#send") as HTMLButtonElement).disabled).toBe(true);
    root.querySelector<HTMLButtonElement>("[data-block-chip] button")!.click();
    expect(h.onMaskBlocked).toHaveBeenCalledWith("Priya Halloran");
  });

  it("keeps the old send zone when the rows were not closed", () => {
    const root = mount(emptyState({
      started: true,
      record: structuredClone(inventedVisit.preparedRecord),
      outgoingText: "Priya Halloran rang the worker.",
      egressLines: blocked,
    }));
    expect(root.querySelector("[data-send-step]")).toBeNull();
    expect(root.querySelector('[data-zone="leaves"]')).not.toBeNull();
    expect(root.querySelector("[data-block-line]")).not.toBeNull();
  });
});

describe("WO-08 finished slot", () => {
  const finishedState = () => emptyState({
    recordOpen: false,
    example: true,
    started: true,
    record: structuredClone(inventedVisit.preparedRecord),
    finished: {
      text: "The worker rang the landlord.",
      source: "IN_CLOUD",
      connected: false,
      namesRestored: true,
    },
  });

  it("shows the five headings, both controls, and the receipt, with no egress", () => {
    const root = mount(finishedState());
    const measured = measureRoot(root);
    expect(root.querySelector("[data-finished-step]")).not.toBeNull();
    expect(root.querySelector("main h1.sr-only")?.textContent).toBe(strings.zones.finished);
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector('[data-step="finished"]')?.getAttribute("aria-current")).toBe("step");
    expect(root.textContent).toContain(strings.caseNote.purpose);
    expect(root.textContent).toContain(strings.caseNote.observed);
    expect(root.textContent).toContain(strings.caseNote.agreed);
    expect(root.textContent).toContain("Mould in the back bedroom");
    expect(root.textContent).toContain(strings.recordFields.risks);
    expect(root.textContent).toContain(strings.caseNote.nextContact);
    expect(root.querySelector("#copy")).not.toBeNull();
    expect(root.querySelector("#download-txt")).not.toBeNull();
    expect(root.querySelector("#xray")?.textContent).toBe(strings.xray.open);
    expect(root.querySelector("[data-xray]")).toBeNull();
    expect(root.querySelector("[data-receipt]")).not.toBeNull();
    expect(root.querySelector("[data-zone='finished']")).toBeNull();
    expect(measured.egress).toBe(false);
  });

  it("opens the X-ray onto mode, source, ms and requests, and keeps that word inside it", () => {
    const entry = {
      at: "2026-11-21T13:00:00.000Z",
      sha256: ["ab".repeat(32)],
      byteLengths: [10],
      listedChecked: 1,
      listedFound: 0,
      maskedChecked: 1,
      maskedFound: 0,
      onPurpose: 0,
      job: "draft",
      mode: "PREFER_IN_CLOUD",
      inferenceSource: "IN_CLOUD",
      connected: false,
      outcome: "answered",
      requests: [],
    } satisfies LedgerEntry;
    const second: LedgerEntry = { ...entry, mode: "ONLY_ON_DEVICE", inferenceSource: "ON_DEVICE" };
    withRequestRows(entry, 3);
    withRequestRows(second, 1);
    const root = mount(emptyState({
      ...finishedState(),
      xrayOpen: true,
      ledger: { entries: [entry, second], ms: [12, null] },
    }));
    const panel = root.querySelector("[data-xray]");
    expect(panel).not.toBeNull();
    const tables = [...root.querySelectorAll("[data-xray-entry]")];
    expect(tables).toHaveLength(2);
    expect(tables[0]?.textContent).toContain("PREFER_IN_CLOUD");
    expect(tables[0]?.textContent).toContain(strings.source.inCloud);
    expect(tables[0]?.textContent).toContain("12 ms");
    expect(requestCell(tables[0]!)).toBe("3");
    expect(tables[1]?.textContent).toContain("ONLY_ON_DEVICE");
    expect(tables[1]?.textContent).toContain(strings.source.onDevice);
    expect(tables[1]?.textContent).toContain(strings.xray.notMeasured);
    expect(requestCell(tables[1]!)).toBe("1");
    expect(root.querySelector("[data-receipt]")?.textContent).toContain(
      fill(strings.firstRun.requestsBefore, { n: 4 }),
    );
    expect(panel?.textContent).toMatch(/egress/i);
    const rest = root.cloneNode(true) as HTMLElement;
    rest.querySelector("[data-xray]")?.remove();
    expect(rest.textContent).not.toMatch(/egress/i);
    const onToggleXray = vi.fn();
    const closed = mount(finishedState(), handlers({ onToggleXray }));
    closed.querySelector<HTMLButtonElement>("#xray")?.click();
    expect(onToggleXray).toHaveBeenCalledOnce();
  });

  it("shows the preflight count in the row after Requests", () => {
    expect(strings.xray.requests).toBe("Requests");
    expect(strings.xray.preflights).toBe("Preflights");
    expect(strings.xray.preflightsValue).toBe("{n}");
    const entry = {
      at: "2026-11-21T13:00:00.000Z",
      sha256: ["ab".repeat(32)],
      byteLengths: [10],
      listedChecked: 1,
      listedFound: 0,
      maskedChecked: 1,
      maskedFound: 0,
      onPurpose: 0,
      job: "draft",
      mode: "PREFER_IN_CLOUD",
      inferenceSource: "IN_CLOUD",
      connected: false,
      outcome: "answered",
      requests: [
        ...Array.from({ length: 4 }, () => ({ host: "example.test", bytes: 1, carriesNote: false, preflight: true })),
        ...Array.from({ length: 2 }, () => ({ host: "example.test", bytes: 1, carriesNote: false, preflight: false })),
      ],
    } satisfies LedgerEntry;
    const open = (rows: LedgerEntry["requests"]) => mount(emptyState({
      ...finishedState(),
      xrayOpen: true,
      ledger: { entries: [{ ...entry, requests: rows }], ms: [12] },
    }));
    const cell = (root: HTMLElement, label: string) => {
      const table = root.querySelector("[data-xray-entry]");
      const hit = [...(table?.querySelectorAll("tr") ?? [])].find((tr) => tr.querySelector("th")?.textContent === label);
      return hit?.querySelector("td")?.textContent ?? "";
    };
    const mixed = open(entry.requests);
    expect(cell(mixed, "Requests")).toBe("6");
    expect(cell(mixed, "Preflights")).toBe("4");
    const labels = [...mixed.querySelectorAll("[data-xray-entry] th")].map((th) => th.textContent);
    expect(labels[labels.indexOf("Requests") + 1]).toBe("Preflights");
    const all = open(entry.requests.map((row) => ({ ...row, preflight: true })));
    expect(cell(all, "Requests")).toBe("6");
    expect(cell(all, "Preflights")).toBe("6");
    const none = open(entry.requests.map((row) => ({ ...row, preflight: false })));
    expect(cell(none, "Requests")).toBe("6");
    expect(cell(none, "Preflights")).toBe("0");
  });

  it("reads 0 when two entries hold no request rows", () => {
    const entry = {
      at: "2026-11-21T13:00:00.000Z",
      sha256: ["ab".repeat(32)],
      byteLengths: [10],
      listedChecked: 1,
      listedFound: 0,
      maskedChecked: 1,
      maskedFound: 0,
      onPurpose: 0,
      job: "draft",
      mode: "PREFER_IN_CLOUD",
      inferenceSource: "IN_CLOUD",
      connected: false,
      outcome: "answered",
      requests: [],
    } satisfies LedgerEntry;
    const second: LedgerEntry = { ...entry, mode: "ONLY_ON_DEVICE", inferenceSource: "ON_DEVICE" };
    const ledger = { entries: [entry, second], ms: [null, null] as const };
    const finished = mount(emptyState({ ...finishedState(), xrayOpen: true, ledger }));
    const line = fill(strings.firstRun.requestsBefore, { n: 0 });
    const entryCount = fill(strings.firstRun.requestsBefore, { n: 2 });
    expect(finished.querySelector("[data-receipt]")?.textContent).toContain(line);
    expect(finished.textContent).not.toContain(entryCount);
    expect([...finished.querySelectorAll("[data-xray-entry]")].map(requestCell)).toEqual(["0", "0"]);
    const leaves = mount(emptyState({
      recordOpen: false,
      started: true,
      record: structuredClone(inventedVisit.preparedRecord),
      ledger,
    }));
    expect(leaves.querySelector("[data-masks-step]")?.textContent).toContain(line);
    expect(leaves.textContent).not.toContain(entryCount);
    const first = mount(emptyState({ ledger }));
    expect(first.querySelector('[data-plane="leaves"]')?.textContent).toContain(line);
    expect(first.textContent).not.toContain(entryCount);
  });

  it("keeps the old finished zone when the rows were not closed", () => {
    const root = mount(emptyState({
      started: true,
      record: structuredClone(inventedVisit.preparedRecord),
      finished: { text: "The worker rang the landlord.", source: "ON_DEVICE", connected: true },
    }));
    expect(root.querySelector("[data-finished-step]")).toBeNull();
    expect(root.querySelector('[data-zone="finished"]')).not.toBeNull();
  });
});

describe("WO-08 designed states", () => {
  it("names offline on the first screen and stays at or under 120 words", () => {
    const root = mount(emptyState({ network: "offline" }));
    expect(root.querySelector("[data-offline-line]")?.textContent).toBe(strings.offline);
    expect(root.querySelector('[data-state="network"]')?.textContent).toContain(strings.status.offline);
    expect(root.querySelector("[data-model-download]")).toBeNull();
    const measured = measureRoot(root);
    expect(measured.words).toBeLessThanOrEqual(120);
    expect(measured.controls).toBe(3);
    expect(root.querySelector("main [data-notices] a")?.textContent).toBe(strings.notices.link);
    expect(measured.egress).toBe(false);
  });

  it("keeps model absent on the status line and off the long paragraph", () => {
    const root = mount();
    expect(root.querySelector('[data-state="device"]')?.textContent).toContain(strings.status.deviceAbsent);
    expect(root.textContent).not.toContain(strings.status.deviceReady);
    expect(root.textContent).not.toContain(strings.deviceModelAbsent);
    expect(root.querySelector("[data-model-line]")).toBeNull();
    expect(root.querySelector("[data-model-download]")).toBeNull();
    expect(root.querySelector("#get-model")).toBeNull();
    expect(measureRoot(root).words).toBeLessThanOrEqual(120);
  });

  it("shows the download slot only while the model is downloading", () => {
    const root = mount(emptyState({ device: { state: "downloading", percent: 37 } }));
    expect(root.querySelector(".model-progress")?.textContent).toBe("downloading, 37%");
    const bar = root.querySelector("progress.model-bar");
    expect(bar?.getAttribute("value")).toBe("37");
    expect(bar?.getAttribute("max")).toBe("100");
    expect(root.querySelector("#get-model")).toBeNull();
    expect(root.textContent).not.toContain("GB");
    const measured = measureRoot(root);
    expect(measured.words).toBeLessThanOrEqual(120);
    expect(measured.controls).toBe(3);
    expect(root.querySelector("main [data-notices] a")?.textContent).toBe(strings.notices.link);
    expect(measured.egress).toBe(false);
    expect(mount().querySelector("[data-model-download]")).toBeNull();
  });

  it("paints the refused line on the quiet send step and does not paint egress", () => {
    const root = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      noteText: inventedVisit.note,
      clientList: inventedVisit.clientList,
      record: structuredClone(inventedVisit.preparedRecord),
      outgoingText: "The worker rang the landlord.",
      cloudStatus: { kind: "refused", words: strings.status.cloudBrowserRefused },
    }));
    expect(root.querySelector("[data-send-step]")).not.toBeNull();
    expect(root.querySelector("[data-refused-line]")?.textContent).toContain(strings.cloud.browserRefusedDraft);
    expect(root.querySelector('[data-state="cloud"]')?.textContent).toContain(strings.status.cloudBrowserRefused);
    expect(measureRoot(root).text).not.toMatch(/egress/i);
    const calm = mount(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      record: structuredClone(inventedVisit.preparedRecord),
      outgoingText: "The worker rang the landlord.",
    }));
    expect(calm.querySelector("[data-refused-line]")).toBeNull();
  });
});
