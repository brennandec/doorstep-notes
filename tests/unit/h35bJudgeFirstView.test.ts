// @vitest-environment happy-dom
// Session H35b: what a judge sees first (D1, D4) and the device half for a judge without the model.
// No test here names a record file or a number of today. The committed folder is read through its own short rule
// and compared; the selection rule itself is tested on synthetic lookups.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { deviceStepRecord, offlinePressRecord, renderDeviceHalfPanel } from "../../src/app/deviceHalfPanel";
import { bundledResults, newestResultName, type ResultFile, type ResultsLookup } from "../../src/app/figures";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type AppState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";

const handlers = (): Handlers => ({
  onNoteInput: vi.fn(), onListInput: vi.fn(), onTryExample: vi.fn(), onRemoveExample: vi.fn(), onGetModel: vi.fn(), onMakeRecord: vi.fn(), onStartByHand: vi.fn(),
});
const mount = (s: AppState) => {
  const root = document.createElement("div");
  root.append(...renderScreen(s, handlers()));
  document.body.replaceChildren(root);
  return root;
};
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

function lookupOf(files: Record<string, Record<string, unknown>>, listNames = true): ResultsLookup {
  const f = ((name: string) => files[name] as ResultFile | undefined) as ResultsLookup;
  if (listNames) f.names = () => Object.keys(files);
  return f;
}

// The folder's own short rule: the highest (date, session, number) among names of a base. Independent of src/.
const read = (name: string) => JSON.parse(readFileSync(`results/${name}.json`, "utf8")) as Record<string, any>;
const keyOf = (name: string, base: string): number[] | null => {
  const m = new RegExp(`^${base}-(\\d{4})-(\\d{2})-(\\d{2})(?:-(?:(h)(\\d+)(?:-(\\d+))?|(\\d+)))?$`).exec(name);
  if (!m) return null;
  return [Number(`${m[1]}${m[2]}${m[3]}`), m[4] ? 1 : 0, Number(m[5] ?? m[7] ?? 0), Number(m[6] ?? 0)];
};
const newestByRule = (bases: string[], keep: (name: string) => boolean): string | undefined => {
  const all = readdirSync("results").filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  const rows = all
    .flatMap((n) => bases.map((b) => ({ n, k: keyOf(n, b) })))
    .filter((x): x is { n: string; k: number[] } => x.k !== null && keep(x.n));
  // date, then (h or plain), then number: for "h" records the session number and run; plain numbers rank below any "h".
  rows.sort((a, b) => {
    for (let i = 0; i < 4; i++) {
      const x = a.k[i] ?? 0;
      const y = b.k[i] ?? 0;
      if (x !== y) return y - x;
    }
    return 0;
  });
  return rows[0]?.n;
};
const deviceStepOk = (run: Record<string, any>): boolean =>
  run.status === "pass" &&
  Array.isArray(run.steps) &&
  run.steps.some(
    (s: any) =>
      s.mode === "ONLY_ON_DEVICE" && s.inferenceSource === "ON_DEVICE" && typeof s.seconds === "number" && typeof s.outsideRequests === "number" &&
      !(run.problems ?? []).some((p: string) => p.startsWith(`step ${s.step}:`)),
  );

describe("newestResultName with a session-plus-run suffix", () => {
  it("ranks h<session>-<run> above the same session alone, above plain numbers and below the next session", () => {
    const l = lookupOf({
      "x-2026-11-15-2": {}, "x-2026-11-15-h29": {}, "x-2026-11-15-h29-1": {}, "x-2026-11-15-h29-3": {}, "x-2026-11-15-h29-2": {}, "x-2026-11-15": {},
    });
    expect(newestResultName(l, "x")).toBe("x-2026-11-15-h29-3");
    expect(newestResultName(lookupOf({ "x-2026-11-15-h29-3": {}, "x-2026-11-15-h30": {} }), "x")).toBe("x-2026-11-15-h30");
    expect(newestResultName(lookupOf({ "x-2026-11-15-h29-3": {}, "x-2026-11-16": {} }), "x")).toBe("x-2026-11-16");
  });
  it("finds the newest committed offline-press record by the folder's own rule", () => {
    const expected = newestByRule(["offline-press"], () => true);
    expect(expected).toBeDefined();
    expect(newestResultName(bundledResults, "offline-press")).toBe(expected);
  });
});

describe("the device half panel reads the results lookup", () => {

  it("names the newest passing hosted or hybrid device step and the newest passing offline press, from the committed folder", () => {
    const stepFile = newestByRule(["hosted-run", "hybrid-run"], (n) => deviceStepOk(read(n)))!;
    const pressFile = newestByRule(["offline-press"], (n) => read(n).status === "pass")!;
    expect(stepFile).toBeDefined();
    expect(pressFile).toBeDefined();
    const root = mount(emptyState({ results: bundledResults, device: { state: "unavailable" } }));
    expect(q(root, "[data-author-device-panel]")).toBeNull();
    const run = read(stepFile);
    const step = run.steps.find((s: any) => s.mode === "ONLY_ON_DEVICE" && s.inferenceSource === "ON_DEVICE");
    expect(deviceStepRecord(bundledResults)).toMatchObject({
      file: stepFile,
      what: step.what,
      seconds: step.seconds,
      requests: step.outsideRequests,
    });
    const press = read(pressFile);
    expect(offlinePressRecord(bundledResults)).toMatchObject({
      file: pressFile,
      answered: press.summary.withCall,
      total: press.summary.pressesRun,
      requests: press.nonLocalThrough,
    });
  });

  it("holds no digit in its templates, and src/ carries no typed record name for it", () => {
    for (const t of Object.values(strings.authorDevicePanel)) expect(t.replace(/\{[a-z]+\}/g, "")).not.toMatch(/\d/);
    const src = readFileSync("src/app/deviceHalfPanel.ts", "utf8");
    expect(src).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(src).not.toMatch(/results\/[a-z-]+-\d/);
  });

  it("picks the newest passing record and updates when a newer one is given", () => {
    const step = (what: string, seconds: number) => ({ step: 2, what, mode: "ONLY_ON_DEVICE", inferenceSource: "ON_DEVICE", seconds, outsideRequests: 0 });
    const base = {
      "hosted-run-2026-11-15-2": { status: "pass", steps: [step("older", 9)], problems: [] },
      "hybrid-run-2026-11-14": { status: "pass", steps: [step("oldest", 8)], problems: [] },
    };
    expect(deviceStepRecord(lookupOf(base))?.file).toBe("hosted-run-2026-11-15-2");
    const newer = lookupOf({ ...base, "hosted-run-2026-11-16": { status: "pass", steps: [step("newer", 7.5)], problems: [] } });
    expect(deviceStepRecord(newer)).toEqual({ file: "hosted-run-2026-11-16", what: "newer", seconds: 7.5, requests: 0 });
    const root = mount(emptyState({ results: newer, device: { state: "unavailable" } }));
    expect(q(root, "[data-author-device-panel]")).toBeNull();
    expect(root.textContent).not.toContain("results/");
  });

  it("skips a failed run, a step with a problem, and a step without its fields", () => {
    const good = { step: 2, what: "w", mode: "ONLY_ON_DEVICE", inferenceSource: "ON_DEVICE", seconds: 3, outsideRequests: 0 };
    const l = lookupOf({
      "hosted-run-2026-11-15-2": { status: "pass", steps: [good], problems: [] },
      "hosted-run-2026-11-15-3": { status: "fail", steps: [good], problems: ["step 4: x"] },
      "hosted-run-2026-11-15-4": { status: "pass", steps: [{ ...good, seconds: "3" }], problems: [] },
      "hosted-run-2026-11-15-5": { status: "pass", steps: [good], problems: ["step 2: broke"] },
    });
    expect(deviceStepRecord(l)?.file).toBe("hosted-run-2026-11-15-2");
  });

  it("reads the newest offline press only when it passed with its counts", () => {
    const ok = { status: "pass", summary: { withCall: 4, pressesRun: 5 }, nonLocalThrough: 0 };
    expect(offlinePressRecord(lookupOf({ "offline-press-2026-11-15-h1-1": ok }))).toEqual({ file: "offline-press-2026-11-15-h1-1", answered: 4, total: 5, requests: 0 });
    expect(offlinePressRecord(lookupOf({ "offline-press-2026-11-15-h1-1": ok, "offline-press-2026-11-15-h1-2": { ...ok, status: "fail" } }))).toBeNull();
  });

  it("falls back to not measured on an empty lookup, and the screen does not paint that panel", () => {
    const panel = renderDeviceHalfPanel(emptyState({ results: lookupOf({}), device: { state: "unavailable" } }));
    expect(panel?.querySelector("[data-author-device-step]")?.textContent).toBe("Device step: not measured.");
    expect(panel?.querySelector("[data-author-offline-press]")?.textContent).toBe("Offline presses answered by the device model: not measured.");
    const root = mount(emptyState({ results: lookupOf({}), device: { state: "unavailable" } }));
    expect(root.querySelector("[data-author-device-panel]")).toBeNull();
  });

  it("is not painted on the screen, and the helper stays null only when the model is available", () => {
    const s = emptyState({ results: bundledResults, device: { state: "available" } });
    expect(renderDeviceHalfPanel(s)).toBeNull();
    expect(mount(s).querySelector("[data-author-device-panel]")).toBeNull();
    const downloadable = emptyState({ results: bundledResults, device: { state: "downloadable" } });
    expect(renderDeviceHalfPanel(downloadable)).not.toBeNull();
    expect(mount(downloadable).querySelector("[data-author-device-panel]")).toBeNull();
  });
});

describe("cold open and the example", () => {
  it("makes 'Try an invented visit' and 'Start a visit' the cold screen controls", () => {
    const root = mount(emptyState());
    expect(root.querySelector('[data-zone="note"]')).toBeNull();
    const filled = [...root.querySelectorAll("button.btn.primary:not([disabled])")];
    expect(filled.map((b) => b.id)).toEqual(["try-example"]);
    expect(filled[0]!.textContent).toBe("Try an invented visit");
    expect(q<HTMLButtonElement>(root, "#start-visit").textContent).toBe("Start a visit");
    expect(q<HTMLButtonElement>(root, "#start-visit").disabled).toBe(false);
    expect(root.querySelector("#make-record")).toBeNull();
  });

  it("once a visit has started, 'Try an invented visit' is the one filled button and stands before the note", () => {
    const root = mount(emptyState({ started: true }));
    const zone = q(root, '[data-zone="note"]');
    const filled = [...zone.querySelectorAll("button.btn.primary:not([disabled])")];
    expect(filled.map((b) => b.id)).toEqual(["try-example"]);
    expect(filled[0]!.textContent).toBe("Try an invented visit");
    const order = [...zone.querySelectorAll("#try-example, #note, #make-record")].map((n) => n.id);
    expect(order).toEqual(["try-example", "note", "make-record"]);
    expect(q<HTMLButtonElement>(root, "#make-record").classList.contains("primary")).toBe(false);
    expect(q<HTMLButtonElement>(root, "#make-record").disabled).toBe(true);
  });

  it("with the example loaded and no device model, says the record was made by hand for the example", () => {
    const root = mount(emptyState({ example: true, noteText: "a note", clientList: "A Name", record: null, device: { state: "unavailable" } }));
    const b = q<HTMLButtonElement>(root, "#make-record");
    expect(b.classList.contains("primary")).toBe(true);
    expect(b.disabled).toBe(false);
    expect(b.textContent).toBe("Use the example's record");
    expect(q(root, "[data-example-record-origin]").textContent).toBe("This record was made by hand for the example, not by the device model.");
  });

  it("keeps 'Enter the record by hand' and no origin line for her own note", () => {
    const root = mount(emptyState({ example: false, noteText: "her own note", device: { state: "unavailable" } }));
    expect(q(root, "#make-record").textContent).toBe("Enter the record by hand");
    expect(root.querySelector("[data-example-record-origin]")).toBeNull();
  });
});
