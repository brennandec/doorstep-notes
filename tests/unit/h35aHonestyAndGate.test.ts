// @vitest-environment happy-dom
// Session H35a: the stale-bundle guard, what the device status says, honest pre-send and error copy,
// What leaves staying empty until Draft, the gate for unlisted name-like words, and the second reader handoff.
// Every case fails on the base. Runs no browser and makes no request. Invented people only.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { blockLine } from "../../src/app/parts/blockLine";
import { renderStatusBar } from "../../src/app/statusBar";
import { strings } from "../../src/app/strings";
import { buildBlockedLine } from "../../src/egress/line";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { secondReaderDouble } from "../../src/inference/secondReader/secondReader.double";
import { makeStructureJob, type StructureSdk } from "../../src/inference/structure/structure.real";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { inspectServedBundle, setServedBundle, writeNewRecord, writeRecord } from "../e2e/fixtures/records";

/**
 * writeResult lives in deviceModel.ts, which imports Playwright; loading Playwright in this DOM environment makes a
 * stray connection to happy-dom's default origin. Its body is read instead: it must hand the record to writeRecord,
 * which this file runs. writeNewRecord and inspectServedBundle are the same functions deviceModel.ts re-exports.
 */
const deviceFixtureSource = () => readFileSync("tests/e2e/fixtures/deviceModel.ts", "utf8");

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const q = (root: ParentNode, sel: string) => root.querySelector(sel) as HTMLElement | null;
const press = async (root: HTMLElement, sel: string) => {
  if (!root.querySelector(sel)) root.querySelector<HTMLButtonElement>("#edit-record")?.click();
  const b = q(root, sel) as HTMLButtonElement | null;
  expect(b, `control ${sel}`).not.toBeNull();
  b!.click();
  await settle();
};
const outgoing = (root: HTMLElement) => q(root, "pre.outgoing")!.textContent ?? "";

afterEach(() => {
  setServedBundle(null);
  vi.unstubAllGlobals();
});

// ---- item 0: the stale-bundle guard and the served-bundle identity ---------------------------------------------

describe("item 0: a local build older than the newest source file is refused", () => {
  const EPOCH = 1_700_000_000;
  /** A folder tree like the project's: sources at `srcAt`, the built folder at `bundleAt` (seconds). */
  function tree(srcAt: number, bundleAt: number): string {
    const root = mkdtempSync(join(tmpdir(), "h35a-bundle-"));
    for (const d of ["src", "public", "scripts", "dist/assets"]) mkdirSync(join(root, d), { recursive: true });
    const files: [string, string, number][] = [
      ["src/a.ts", "x", srcAt],
      ["src/older.ts", "x", EPOCH - 500],
      ["index.html", "<html></html>", EPOCH - 500],
      ["public/probe.txt", "x", EPOCH - 500],
      ["scripts/vitePlugins.ts", "x", EPOCH - 500],
      ["dist/index.html", '<html><head><script type="module" crossorigin src="/assets/index-test.js"></script></head></html>', bundleAt],
      ["dist/assets/index-test.js", "x", bundleAt],
    ];
    for (const [file, body, at] of files) {
      writeFileSync(join(root, file), body);
      utimesSync(join(root, file), at, at);
    }
    return root;
  }

  it("throws TEST BUNDLE STALE, naming the folder, the main chunk, the build time and the newest source, when src/ is newer", () => {
    const root = tree(EPOCH + 100, EPOCH);
    let message = "";
    try {
      inspectServedBundle("dist", root);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("TEST BUNDLE STALE: dist was built before the newest source file.");
    expect(message).toContain("assets/index-test.js");
    expect(message).toContain(new Date(EPOCH * 1000).toISOString());
    expect(message).toContain("src/a.ts");
    expect(message).toContain(new Date((EPOCH + 100) * 1000).toISOString());
    expect(message).toContain("npm run build");
  });

  it("returns the folder, the main chunk and the build time once the bundle is newer than every source file", () => {
    const root = tree(EPOCH, EPOCH + 100);
    expect(inspectServedBundle("dist", root)).toEqual({
      dir: "dist",
      mainChunk: "assets/index-test.js",
      buildTime: new Date((EPOCH + 100) * 1000).toISOString(),
    });
  });

  it("throws when the folder has no index.html or no main chunk", () => {
    const root = tree(EPOCH, EPOCH + 100);
    expect(() => inspectServedBundle("dist-e2e", root)).toThrow(/dist-e2e/);
    const noChunk = tree(EPOCH, EPOCH + 100);
    writeFileSync(join(noChunk, "dist", "index.html"), '<script type="module" src="/assets/index-gone.js"></script>');
    utimesSync(join(noChunk, "dist", "index.html"), EPOCH + 100, EPOCH + 100);
    expect(() => inspectServedBundle("dist", noChunk)).toThrow(/index-gone\.js/);
  });

  it("stamps servedBundle into the JSON of writeResult, writeNewRecord and writeRecord", () => {
    const served = { folder: "dist-e2e", mainChunk: "assets/index-test.js", buildTime: "2026-11-15T00:00:00.000Z" };
    setServedBundle(served);
    const root = mkdtempSync(join(tmpdir(), "h35a-records-"));
    const b = JSON.parse(readFileSync(writeRecord("other", { status: "pass" }, root), "utf8")) as Record<string, unknown>;
    const file = join(root, "results", "direct.json");
    writeNewRecord(file, { status: "pass" });
    expect(existsSync(file)).toBe(true);
    const c = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    for (const body of [b, c]) expect(body["servedBundle"]).toEqual(served);
    // writeResult hands its record to writeRecord; writeNewRecord and the guard are the ones of records.ts.
    const src = deviceFixtureSource();
    expect(src).toMatch(/export function writeResult\([^)]*\)[^{]*\{[^}]*return writeRecord\(/);
    expect(src).toMatch(/export \{ writeNewRecord \} from "\.\/records"/);
    expect(src).toMatch(/export \{ inspectServedBundle, moduleEntryOf \} from "\.\/records"/);
    // openDevice inspects a local folder before the server and the browser start, and sets the bundle for the records.
    const open = src.slice(src.indexOf("export async function openDevice"));
    expect(open.indexOf("inspectServedBundle(")).toBeGreaterThan(-1);
    expect(open.indexOf("inspectServedBundle(")).toBeLessThan(open.indexOf("startStaticServer("));
    expect(open.indexOf("inspectServedBundle(")).toBeLessThan(open.indexOf("launchPersistentContext("));
    expect(open).toMatch(/setServedBundle\(servedBundle\)/);
    expect(open).toMatch(/last-modified/);
  });

  it("leaves a record alone when no bundle is known, and keeps one the body names itself", () => {
    const root = mkdtempSync(join(tmpdir(), "h35a-records-"));
    const none = JSON.parse(readFileSync(writeRecord("none", { a: 1 }, root), "utf8")) as Record<string, unknown>;
    expect("servedBundle" in none).toBe(false);
    setServedBundle({ folder: "dist", mainChunk: "assets/x.js", buildTime: "t" });
    const own = { folder: "hosted", mainChunk: "assets/own.js", buildTime: "u" };
    const kept = JSON.parse(readFileSync(writeRecord("own", { servedBundle: own }, root), "utf8")) as Record<string, unknown>;
    expect(kept["servedBundle"]).toEqual(own);
  });
});

// ---- (a) D3: the device is ready only after a session; errors carry their own name --------------------------------

describe("(a) D3: device status and the failure names", () => {
  const session = async () => ({ prompt: async () => '{"ok":true}', destroy() {} });
  const mount = (deps: Partial<ControllerDeps> & Pick<ControllerDeps, "device">) => {
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    const c = makeController({ root, aiServiceEnabled: false, tier: "no-cost", results: () => undefined, isOffline: async () => false, ...deps });
    return { root, c };
  };
  const words = (root: HTMLElement) => q(root, '[data-state="device"] .state-words')!.textContent;

  it("shows did not start after a failed probe, ready after an answered prompt, and the other states in words (H36c)", async () => {
    const noCreate = mount({ device: makeDeviceModel({ languageModel: { availability: async () => "available" } }) });
    await noCreate.c.start();
    expect(words(noCreate.root)).toBe("did not start");
    expect(q(noCreate.root, "#get-model")).not.toBeNull();

    const created = vi.fn(session);
    const withCreate = mount({ device: makeDeviceModel({ languageModel: { availability: async () => "available", create: created } }) });
    await withCreate.c.start();
    expect(words(withCreate.root)).toBe("ready");
    expect(created).toHaveBeenCalledTimes(1);

    const gone = mount({ device: makeDeviceModel({ languageModel: { availability: async () => "unavailable", create: created } }) });
    await gone.c.start();
    expect(words(gone.root)).toBe("not on this computer");
    expect(created).toHaveBeenCalledTimes(1);

    const bar = (input: Parameters<typeof renderStatusBar>[0]) => renderStatusBar(input).querySelector('[data-state="device"] .state-words')!.textContent;
    expect(bar({ network: "online", device: { state: "downloadable" }, cloud: false })).toBe("can be downloaded");
    expect(bar({ network: "online", device: { state: "downloading", percent: 37 }, cloud: false })).toBe("downloading, 37%");
    expect(bar({ network: "online", device: { state: "available" }, cloud: false })).toBe("ready");
  });

  it("shows downloading with the integer percent while the press runs, and never ready when no session can be made", async () => {
    let seen = "";
    let rootRef: HTMLElement | undefined;
    const device = makeDeviceModel({
      languageModel: { availability: async () => "downloadable", create: async () => { throw Object.assign(new Error("no model"), { name: "NotSupportedError" }); } },
      initializeDeviceModel: async (cb) => {
        cb(0.37);
        seen = words(rootRef!) ?? "";
      },
    });
    const { root, c } = mount({ device });
    rootRef = root;
    await c.start();
    (root.querySelector("#start-visit") as HTMLButtonElement).click();
    await press(root, "#get-model");
    expect(seen).toBe("downloading, 37%");
    expect(words(root)).toBe("did not start");
    expect(c.state().device.state).toBe("downloadable");
    expect(q(root, '[role="alert"], .error')!.textContent).toContain("The device model could not be started (NotSupportedError).");
    expect(q(root, "[data-error-hand-entry]")!.textContent).toBe("Fill in by hand");
    expect(q(root, "#get-model")).not.toBeNull();
  });

  const withStructure = (sdk: StructureSdk) => {
    const device = makeDeviceModel({ languageModel: { availability: async () => "available", create: session } });
    return mount({ device, structure: makeStructureJob({ sdk, state: async () => "available" }) });
  };
  const makeRecord = async (s: ReturnType<typeof mount>) => {
    await s.c.start();
    s.c.handlers.onNoteInput("12/11 visit. Mould in the back bedroom.");
    s.c.render();
    await press(s.root, "#make-record");
  };
  const quota = (extra: Record<string, number> = {}) => Object.assign(new Error("input too large"), { name: "QuotaExceededError", ...extra });

  it("a QuotaExceededError with no numbers is named, offers Fill in by hand, and is never called too long", async () => {
    const s = withStructure({ generate: async () => { throw quota(); } });
    await makeRecord(s);
    const alert = q(s.root, '[role="alert"]')!;
    expect(alert.textContent).toContain("The device model could not make the record (QuotaExceededError).");
    expect(alert.textContent).not.toContain("too long");
    expect(s.root.textContent).not.toContain("This note is too long");
    const hand = q(s.root, "[data-error-hand-entry]")!;
    expect(hand.textContent).toBe("Fill in by hand");
    hand.click();
    await settle();
    expect(s.c.state().record).not.toBeNull();
    expect(s.c.state().error).toBeNull();
  });

  it("a QuotaExceededError that is not over its window, or a session that measures under its quota, is not too long", async () => {
    const under = withStructure({ generate: async () => { throw quota({ requested: 9000, contextWindow: 9216 }); } });
    await makeRecord(under);
    expect(under.root.textContent).toContain("(QuotaExceededError)");
    expect(under.root.textContent).not.toContain("This note is too long");

    const measuredUnder = withStructure({ generate: async () => { throw quota(); }, measure: async () => ({ usage: 100, quota: 9216 }) });
    await makeRecord(measuredUnder);
    expect(measuredUnder.root.textContent).toContain("(QuotaExceededError)");
    expect(measuredUnder.root.textContent).not.toContain("This note is too long");
  });

  it("requested above contextWindow, or measureInputUsage above inputQuota, is called too long by the model's own measure", async () => {
    const over = withStructure({ generate: async () => { throw quota({ requested: 9500, contextWindow: 9216 }); } });
    await makeRecord(over);
    expect(q(over.root, '[role="alert"]')!.textContent).toContain("This note is too long for the device model. Split it into two parts.");

    const measured = withStructure({ generate: async () => { throw quota(); }, measure: async () => ({ usage: 12000, quota: 9216 }) });
    await makeRecord(measured);
    expect(q(measured.root, '[role="alert"]')!.textContent).toContain("This note is too long for the device model. Split it into two parts.");
  });
});

// ---- the example flow shared by (b) to (e) -------------------------------------------------------------------------

function setup() {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const fetchSpy = vi.fn(async () => { throw new Error("no request expected"); });
  vi.stubGlobal("fetch", fetchSpy);
  const draft = { run: vi.fn((t, i, m) => draftDouble.run(t, i, m)) };
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: false,
    tier: "no-cost",
    results: () => undefined,
    isOffline: async () => false,
    secondReader: { readerFor: () => secondReaderDouble },
    drafting: {
      draftFor: () => draft as never,
      ledger: makeLedger(),
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  };
  const c = makeController(deps);
  return { root, c, draft, fetchSpy };
}
/** #try-example, then the first control, which with no device model loads the example's record. */
async function toRecord(s: ReturnType<typeof setup>) {
  await s.c.start();
  await press(s.root, "#try-example");
  await press(s.root, "#make-record");
  s.root.querySelector<HTMLButtonElement>("#edit-record")?.click();
}

describe("(b) D5: the pre-send check headline and the refusal line, with no override", () => {
  it("says the check runs before anything is sent, and the block line names the way out without an override", async () => {
    expect(strings.egressWaiting).toBe("The egress check runs before anything is sent. It covers listed names only.");
    expect(strings.sendBlocked).toBe("Send is blocked until the names in the check line are masked.");
    const one = buildBlockedLine({ listedFound: ["Maria Okonkwo-Reyes"], maskedFound: [] } as never);
    const line = blockLine(one, () => undefined)!;
    expect(line.textContent).toContain("Not sent: 1 listed name is in the text. Mask it, then send.");
    expect(line.querySelectorAll("[data-block-chip]")).toHaveLength(1);
    expect(one.rows).toEqual([{ label: "What to do", value: "Mask it, then send." }]);
    const many = buildBlockedLine({ listedFound: ["Maria Okonkwo-Reyes", "Priya Halloran"], maskedFound: [] } as never);
    expect(blockLine(many)!.textContent).toContain("Not sent: 2 listed names are in the text. Mask them, then send.");
    expect(many.rows[0]!.value).toBe("Mask them, then send.");
    expect(blockLine(buildBlockedLine({ listedFound: [], maskedFound: ["Bea"] } as never))!.textContent).toContain("Not sent: 1 masked value is in the text. Mask it, then send.");

    const s = setup();
    await toRecord(s);
    expect(q(s.root, "[data-egress-line]")!.textContent).toContain("The egress check runs before anything is sent.");
    await press(s.root, "#draft");
    await press(s.root, "#try-listed");
    const zone = q(s.root, '[data-zone="leaves"]')!;
    expect(q(zone, "[data-block-line]")!.textContent).toContain("Not sent: 1 listed name is in the text. Mask it, then send.");
    expect(zone.textContent).not.toContain("Send this name on purpose");
    expect(zone.textContent).not.toContain("on purpose");
    expect(q(zone, "[data-block-chip] button")).not.toBeNull();
  });
});

describe("(c) D2: What leaves stays empty until Draft is pressed", () => {
  it("shows Nothing to send yet and keeps Send off until Draft, on the example, after a mask press and after a mask change", async () => {
    const s = setup();
    await toRecord(s);
    expect(s.c.state().outgoingText).toBe("");
    expect(outgoing(s.root)).toBe(strings.emptyOutgoing);
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(true);
    expect(q(s.root, ".sheet-empty")!.textContent).toBe(strings.finishedNext);

    await press(s.root, "#mask");
    expect(outgoing(s.root)).toBe(strings.emptyOutgoing);
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(true);

    await press(s.root, '[data-likely-word="Bea"]');
    expect(outgoing(s.root)).toBe(strings.emptyOutgoing);

    await press(s.root, "#draft");
    expect(outgoing(s.root).startsWith("Visit date:")).toBe(true);
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not bring a preview back after a reload: nothing is shown until Draft", async () => {
    const s = setup();
    await toRecord(s);
    s.c.handlers.onRecordEdit?.({ ...inventedVisit.preparedRecord });
    s.c.render();
    expect(outgoing(s.root)).toBe(strings.emptyOutgoing);
  });
});

function withGlenda(s: ReturnType<typeof setup>) {
  // The sentence is in the note, so she is not a name the model added. She is still unlisted.
  s.c.handlers.onNoteInput?.(inventedVisit.note + "\nThen Glenda arrived.");
  s.c.handlers.onRecordEdit?.({
    ...inventedVisit.preparedRecord,
    seen: [...inventedVisit.preparedRecord.seen, "Then Glenda arrived."],
  });
}

describe("(d) D8: Draft stops at words that look like unlisted names", () => {
  it("does not stop on a Present entry, and stops without a Mask press when an unlisted name is still open", async () => {
    const s = setup();
    await toRecord(s);
    await press(s.root, "#draft");
    const quiet = outgoing(s.root);
    expect(quiet.startsWith("Visit date:")).toBe(true);
    expect(quiet).not.toMatch(/\bBea\b/);
    expect(quiet).toMatch(/Present: \[Person 1\], \[Person 2\], worker/);
    expect(q(s.root, "[data-likely-line]")).toBeNull();
    expect(s.draft.run).not.toHaveBeenCalled();
    expect(s.fetchSpy).not.toHaveBeenCalled();

    withGlenda(s);
    s.c.render();
    await press(s.root, "#draft");
    expect(outgoing(s.root)).toBe(strings.emptyOutgoing);
    expect(s.c.state().outgoingText).toBe("");
    const line = q(s.root, "[data-likely-line]")!;
    expect(line.textContent).toBe("1 word looks like a name and is not on your list: Glenda. This is a guess by capital letters.");
    expect(q(s.root, '[data-likely-word="Glenda"]')).not.toBeNull();
    expect(q(s.root, '[data-keep-likely="Glenda"]')!.textContent).toBe("Keep Glenda");
    expect(q(s.root, "[data-resolve-before-draft]")!.textContent).toBe("Mask or keep each word above, then Draft continues.");
    expect(document.activeElement?.getAttribute("data-likely-word")).toBe("Glenda");
    expect(s.draft.run).not.toHaveBeenCalled();
    expect(s.fetchSpy).not.toHaveBeenCalled();
  });

  it("masking the unlisted word by a press makes Draft go on by itself, with that word masked in What leaves", async () => {
    const s = setup();
    await toRecord(s);
    withGlenda(s);
    await press(s.root, "#draft");
    await press(s.root, '[data-likely-word="Glenda"]');
    const text = outgoing(s.root);
    expect(text.startsWith("Visit date:")).toBe(true);
    expect(text).not.toMatch(/\bGlenda\b/);
    expect(text).not.toMatch(/\bBea\b/);
    // A press on a likely word masks it through maskText, which gives a Detail tag.
    // Present entries are already person tags. Bea is [Person 2] and is not in the text.
    expect(text).toMatch(/Present: \[Person 1\], \[Person 2\], worker/);
    expect(text).toMatch(/\[Detail \d+\]/);
    expect(q(s.root, "[data-likely-line]")).toBeNull();
    expect((q(s.root, "#send") as HTMLButtonElement).disabled).toBe(false);
    expect(s.fetchSpy).not.toHaveBeenCalled();
  });

  it("keeping the unlisted word on purpose makes Draft go on, with that word in What leaves because she chose it", async () => {
    const s = setup();
    await toRecord(s);
    withGlenda(s);
    await press(s.root, "#draft");
    await press(s.root, '[data-keep-likely="Glenda"]');
    expect(outgoing(s.root).startsWith("Visit date:")).toBe(true);
    expect(outgoing(s.root)).toContain("Glenda");
    expect(s.c.state().mask!.keptLikely).toEqual(["Glenda"]);
    // Pressing Draft again after resolving also goes on.
    await press(s.root, "#draft");
    expect(outgoing(s.root).startsWith("Visit date:")).toBe(true);
  });

  it("asks again when the record changes, because the kept words belong to the old record", async () => {
    const s = setup();
    await toRecord(s);
    withGlenda(s);
    await press(s.root, "#draft");
    await press(s.root, '[data-keep-likely="Glenda"]');
    s.c.handlers.onRecordEdit?.({
      ...inventedVisit.preparedRecord,
      seen: [...inventedVisit.preparedRecord.seen, "Then Glenda arrived."],
    });
    expect(s.c.state().mask).toBeNull();
    s.c.render();
    await press(s.root, "#draft");
    expect(q(s.root, "[data-likely-line]")).not.toBeNull();
    expect(q(s.root, '[data-likely-word="Glenda"]')).not.toBeNull();
  });
});

describe("(e) D6: Ask a second reader says what happened and where to press next", () => {
  it("shows the prepared line, relabels Send for the reader, and moves focus to Send", async () => {
    const s = setup();
    await toRecord(s);
    await press(s.root, "#draft");
    await press(s.root, "#ask-reader");
    const panel = q(s.root, ".reader-panel")!;
    expect(q(panel, "[data-reader-prepared]")!.textContent).toBe("Request prepared. It is shown under What leaves. Press Send.");
    const send = q(s.root, "#send") as HTMLButtonElement;
    expect(send.textContent).toBe("Send to the second reader");
    expect(send.id).toBe("send");
    expect(send.getAttribute("data-kind")).toBe("primary");
    expect(document.activeElement?.id).toBe("send");
    expect(s.fetchSpy).not.toHaveBeenCalled();

    await press(s.root, "#send");
    expect(q(s.root, "#send")!.textContent).toBe("Send");
    expect(q(s.root, "[data-reader-prepared]")).toBeNull();
  });
});
