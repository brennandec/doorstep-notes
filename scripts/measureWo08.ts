// WO-08 measurement. Counts visible words and controls on every WO-08 screen. Run:
// node scripts/run.mjs scripts/measureWo08.ts
import { Window } from "happy-dom";
import { measureRoot, type ScreenMeasure } from "../src/app/measureScreen";

const FIRST_WORD_LIMIT = 120;
const MASKS_WORD_LIMIT = 350;
const MASKS_CONTROL_LIMIT = 30;

export async function main(): Promise<void> {
  const window = new Window({ url: "http://127.0.0.1/" });
  // happy-dom's classes are not the DOM lib's classes. The script assigns them onto the process global so the app renders.
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = window;
  g.document = window.document;
  g.HTMLElement = window.HTMLElement;
  g.Node = window.Node;
  g.NodeFilter = window.NodeFilter;
  g.Element = window.Element;
  g.SVGElement = window.SVGElement;

  const { emptyState } = await import("../src/app/state");
  const { renderScreen } = await import("../src/app/screen");
  const root = window.document.createElement("div");
  const host = root as unknown as ParentNode;
  host.append(
    ...renderScreen(emptyState(), {
      onNoteInput() {},
      onListInput() {},
      onTryExample() {},
      onRemoveExample() {},
      onGetModel() {},
      onMakeRecord() {},
      onStartVisit() {},
    }),
  );
  const first = measureRoot(host);
  const line = `MEASURE screen=first words=${first.words} controls=${first.controls} egress=${first.egress ? "yes" : "no"} limitWords=${FIRST_WORD_LIMIT}`;
  console.log(line);
  if (first.words > FIRST_WORD_LIMIT || first.egress) throw new Error(line);

  const { inventedVisit } = await import("../src/app/example/inventedVisit");
  const masksRoot = window.document.createElement("div");
  const masksHost = masksRoot as unknown as ParentNode;
  masksHost.append(
    ...renderScreen(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      noteText: inventedVisit.note,
      clientList: inventedVisit.clientList,
      record: inventedVisit.preparedRecord,
    }), {
      onNoteInput() {},
      onListInput() {},
      onTryExample() {},
      onRemoveExample() {},
      onGetModel() {},
      onMakeRecord() {},
      onStartVisit() {},
    }),
  );
  const masks = measureRoot(masksHost);
  const masksLine = `MEASURE screen=masks words=${masks.words} controls=${masks.controls} egress=${masks.egress ? "yes" : "no"} limitWords=${MASKS_WORD_LIMIT} limitControls=${MASKS_CONTROL_LIMIT}`;
  console.log(masksLine);
  if (masks.words > MASKS_WORD_LIMIT || masks.controls > MASKS_CONTROL_LIMIT || masks.egress) throw new Error(masksLine);

  const sendRoot = window.document.createElement("div");
  const sendHost = sendRoot as unknown as ParentNode;
  sendHost.append(
    ...renderScreen(emptyState({
      recordOpen: false,
      example: true,
      started: true,
      noteText: inventedVisit.note,
      clientList: inventedVisit.clientList,
      record: inventedVisit.preparedRecord,
      outgoingText: "Priya Halloran rang the worker.",
      egressLines: {
        kind: "blocked",
        icon: "crossedOctagon",
        failure: true,
        verdict: "",
        rows: [],
        standing: "",
        blocked: { listed: ["Priya Halloran"], masked: [] },
      },
    }), {
      onNoteInput() {},
      onListInput() {},
      onTryExample() {},
      onRemoveExample() {},
      onGetModel() {},
      onMakeRecord() {},
      onStartVisit() {},
    }),
  );
  const send = measureRoot(sendHost);
  const sendLine = `MEASURE screen=send words=${send.words} controls=${send.controls} egress=${send.egress ? "yes" : "no"}`;
  console.log(sendLine);
  if (send.egress) throw new Error(sendLine);

  const quiet = {
    onNoteInput() {},
    onListInput() {},
    onTryExample() {},
    onRemoveExample() {},
    onGetModel() {},
    onMakeRecord() {},
    onStartVisit() {},
  };
  const { strings } = await import("../src/app/strings");

  const paint = (state: Parameters<typeof emptyState>[0]): ScreenMeasure => {
    const node = window.document.createElement("div");
    (node as unknown as ParentNode).append(...renderScreen(emptyState(state), quiet));
    return measureRoot(node as unknown as ParentNode);
  };
  const report = (name: string, measured: ScreenMeasure, limits?: { words?: number; controls?: number; egress?: boolean }): void => {
    const line = `MEASURE screen=${name} words=${measured.words} controls=${measured.controls} egress=${measured.egress ? "yes" : "no"}`;
    console.log(line);
    if (limits?.words !== undefined && measured.words > limits.words) throw new Error(line);
    if (limits?.controls !== undefined && measured.controls > limits.controls) throw new Error(line);
    if (limits?.egress === false && measured.egress) throw new Error(line);
  };

  const finishedBase = {
    recordOpen: false,
    example: true,
    started: true,
    noteText: inventedVisit.note,
    clientList: inventedVisit.clientList,
    record: inventedVisit.preparedRecord,
    finished: {
      text: "The worker rang the landlord.",
      source: "IN_CLOUD" as const,
      connected: false,
      namesRestored: true,
    },
  };
  report("finished", paint(finishedBase), { egress: false });
  report("xray", paint({ ...finishedBase, xrayOpen: true, ledger: { entries: [], ms: [] } }), { egress: true });

  const aboutNode = window.document.createElement("div");
  const { renderAbout } = await import("../src/app/aboutPage");
  renderAbout(aboutNode as unknown as HTMLElement);
  report("about", measureRoot(aboutNode as unknown as ParentNode), { egress: true });

  report("offline", paint({ network: "offline" }), { words: FIRST_WORD_LIMIT, egress: false });
  report("downloading", paint({ device: { state: "downloading", percent: 0 } }), { words: FIRST_WORD_LIMIT, egress: false });
  report("refused", paint({
    recordOpen: false,
    example: true,
    started: true,
    noteText: inventedVisit.note,
    clientList: inventedVisit.clientList,
    record: inventedVisit.preparedRecord,
    outgoingText: "The worker rang the landlord.",
    cloudStatus: { kind: "refused", words: strings.status.cloudBrowserRefused },
  }), { egress: false });

  const absent = first.text.includes("not on this computer") && !first.text.includes(strings.status.deviceReady);
  console.log(`MEASURE contradiction=${absent ? "gone" : "present"}`);
  if (!absent) throw new Error("first screen still pairs the absent line with ready");
}
