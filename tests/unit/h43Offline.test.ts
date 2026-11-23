// @vitest-environment happy-dom
// Order H43b offline unit verification (0 real cloud calls):
// Covers A2 (assertHostedPass), A3 (browser refusal state/strings/device fallback),
// b1 (exact 111f0f3 cloud-sent bytes across all 4 measurement notes),
// b2 (every untagged he/she/him/her/his/hers flagged + whole F1 draft + 0 new warnings on other 11),
// b5 (watchAppCheck403 single-wrapper refcount FIFO/LIFO/throw restoration), and C1 (draft gate focus).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { cloudStatusView } from "../../src/app/cloudStatus";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { halvesSentences } from "../../src/app/halves";
import { renderScreen } from "../../src/app/screen";
import { emptyState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { buildOutgoing, INSTRUCTIONS, recordBlock } from "../../src/drafting/buildOutgoing";
import { prepareDraft, sendDraft } from "../../src/drafting/draftFlow";
import { draftLabels } from "../../src/drafting/labels";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { makeLedger } from "../../src/egress/ledger";
import { makeCloudService } from "../../src/firebase/cloudService";
import { DEVICE_APP_NAME } from "../../src/firebase/deviceApp";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { makeDraftJob } from "../../src/inference/draft/draft.real";
import { isBrowserRefusal, isCloudRefusal, watchAppCheck403 } from "../../src/inference/refusal";
import { makeSecondReaderJob } from "../../src/inference/secondReader/secondReader.real";
import { makeStructureJob } from "../../src/inference/structure/structure.real";
import { parseClientList } from "../../src/masking/clientList";
import { runPasses } from "../../src/masking/entry";
import { DEFAULT_POLICY } from "../../src/masking/policy";
import { maskText } from "../../src/masking/toggle";
import type { MaskSpan } from "../../src/masking/types";
import { evaluateWrongPersonPronouns } from "../e2e/device/n3Audit";
import { assertHostedPass, evaluateHostedVerdicts, finalizeHostedOutcome } from "../e2e/device/hostedVerdicts";
import { emptyLedger, readLedger, recordDailyAppCheck, writeLedger } from "../e2e/fixtures/cloudCalls";
import { parseMeasureArgs } from "../../scripts/measureArgs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("H43 A2 & A1.1: assertHostedPass and evaluateHostedVerdicts separate robot-check refusal from device/page faults", () => {
  const baseWorker = { registered: true, active: true, cachedFiles: 12, note: "registered", build: "production" };
  const baseSteps = [
    { step: 1, inferenceSource: "none", label: "Device model: ready, Cloud: connected", outsideRequests: 0 },
    { step: 2, inferenceSource: "ON_DEVICE", label: "on this device", outsideRequests: 0 },
    { step: 3, inferenceSource: "IN_CLOUD", label: "in the cloud", outsideRequests: 2 },
    { step: 4, inferenceSource: "IN_CLOUD", label: "in the cloud", outsideRequests: 1 },
  ];

  it("throws whenever status !== pass or problems remain, and stays quiet on clean pass", () => {
    expect(() => assertHostedPass("pass", [], "results/hosted-run.json")).not.toThrow();
    expect(() => assertHostedPass("fail", ["Exchange returned 403"], "results/hosted-run.json")).toThrow(/did not pass.*fail/);
    expect(() => assertHostedPass("miss", ["the hosted config or site key is not served"], "results/hosted-run.json")).toThrow(/miss/);
    expect(() => assertHostedPass("pass", ["stray problem"], "results/hosted-run.json")).toThrow(/stray problem/);
  });

  it("records accepted/pass when robot check and device half both succeed", () => {
    expect(
      evaluateHostedVerdicts({
        miss: false,
        openOk: true,
        loadedReleaseMatches: true,
        serviceWorker: baseWorker,
        debugTokenGlobal: "undefined",
        namesDebug: false,
        refusedCount: 0,
        deviceReadySeen: true,
        scriptLoaded: true,
        exchanges: [{ path: "/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken", status: 200 }],
        modelCalls: 3,
        steps: baseSteps,
        problems: [],
      }),
    ).toEqual({ robotCheck: "accepted", deviceHalf: "pass" });
  });

  it("separates robot-check refusal (403) with passing device half from a device/page fault", () => {
    const refused = evaluateHostedVerdicts({
      miss: false,
      openOk: true,
      loadedReleaseMatches: true,
      serviceWorker: baseWorker,
      debugTokenGlobal: "undefined",
      namesDebug: false,
      refusedCount: 0,
      deviceReadySeen: true,
      scriptLoaded: true,
      exchanges: [{ path: "/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken", status: 403 }],
      modelCalls: 0,
      steps: [
        baseSteps[0]!,
        baseSteps[1]!,
        { step: 3, inferenceSource: "not shown", label: "not shown", outsideRequests: 1 },
      ],
      problems: [
        "step 3: the reader showed an error.",
        "the App Check token exchange was missing or not status 200.",
      ],
    });
    expect(refused).toEqual({ robotCheck: "refused", deviceHalf: "pass" });
    expect(() => assertHostedPass("fail", ["the App Check token exchange was missing or not status 200."], "r.json")).toThrow(/did not pass/);

    const pageFault = evaluateHostedVerdicts({
      miss: false,
      openOk: true,
      loadedReleaseMatches: false,
      serviceWorker: { ...baseWorker, active: false },
      debugTokenGlobal: "undefined",
      namesDebug: false,
      refusedCount: 0,
      deviceReadySeen: false,
      scriptLoaded: false,
      exchanges: [],
      modelCalls: 0,
      steps: [],
      problems: ["loaded release mismatch after 1 reload"],
    });
    expect(pageFault).toEqual({ robotCheck: "not run", deviceHalf: "fail" });
    expect(() => assertHostedPass("fail", ["loaded release mismatch after 1 reload"], "r.json")).toThrow(/did not pass/);

    const missed = evaluateHostedVerdicts({
      miss: true,
      openOk: false,
      loadedReleaseMatches: false,
      serviceWorker: null,
      debugTokenGlobal: "not read",
      namesDebug: false,
      refusedCount: 0,
      deviceReadySeen: false,
      scriptLoaded: false,
      exchanges: [],
      modelCalls: 0,
      steps: [],
      problems: ["the hosted config or site key is not served"],
    });
    expect(missed).toEqual({ robotCheck: "not run", deviceHalf: "miss" });

    // D1: preflight abort keeps status "miss", robotCheck "not run", deviceHalf "miss", and 1 problem (no 6 post-run problems)
    const preflightAbort = finalizeHostedOutcome({
      preflightMissed: true,
      baseProblems: ["the hosted config or site key is not served"],
      loadedReleaseMatches: false,
      serviceWorker: null,
      debugTokenGlobal: "not read",
      namesDebug: false,
      refused: [],
      deviceReadySeen: false,
      scriptLoaded: false,
      exchanges: [],
      generateContent: 0,
      stoppedAtCap: false,
      steps: [],
    });
    expect(preflightAbort).toEqual({
      problems: ["the hosted config or site key is not served"],
      miss: true,
      status: "miss",
      verdicts: { robotCheck: "not run", deviceHalf: "miss" },
    });
    expect(() => assertHostedPass(preflightAbort.status, preflightAbort.problems, "r.json")).toThrow(/\(miss;/);

    // Case (b): App Check 200 with scriptLoaded + SW/Vertex fault => robotCheck "accepted", deviceHalf "fail"
    expect(
      evaluateHostedVerdicts({
        miss: false,
        openOk: true,
        loadedReleaseMatches: true,
        serviceWorker: { ...baseWorker, active: false },
        debugTokenGlobal: "undefined",
        namesDebug: false,
        refusedCount: 0,
        deviceReadySeen: false,
        scriptLoaded: true,
        exchanges: [{ path: "/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken", status: 200 }],
        modelCalls: 0,
        steps: [
          baseSteps[0]!,
          baseSteps[1]!,
          { step: 3, inferenceSource: "not shown", label: "not shown", outsideRequests: 1 },
        ],
        problems: ["the service worker was not active."],
      }),
    ).toEqual({ robotCheck: "accepted", deviceHalf: "fail" });

    // Case (c): scriptLoaded true, exchanges empty, and no step3/step4 reached => robotCheck "not run"
    expect(
      evaluateHostedVerdicts({
        miss: false,
        openOk: true,
        loadedReleaseMatches: true,
        serviceWorker: baseWorker,
        debugTokenGlobal: "undefined",
        namesDebug: false,
        refusedCount: 0,
        deviceReadySeen: true,
        scriptLoaded: true,
        exchanges: [],
        modelCalls: 0,
        steps: [baseSteps[0]!, baseSteps[1]!],
        problems: [],
      }),
    ).toEqual({ robotCheck: "not run", deviceHalf: "pass" });

    // Script explicitly blocked before exchange => robotCheck "refused"
    expect(
      evaluateHostedVerdicts({
        miss: false,
        openOk: true,
        loadedReleaseMatches: true,
        serviceWorker: baseWorker,
        debugTokenGlobal: "undefined",
        namesDebug: false,
        refusedCount: 1,
        deviceReadySeen: true,
        scriptLoaded: false,
        scriptBlocked: true,
        exchanges: [],
        modelCalls: 0,
        steps: [baseSteps[0]!, baseSteps[1]!],
        problems: ["1 outside request(s) were refused."],
      }),
    ).toEqual({ robotCheck: "refused", deviceHalf: "fail" });
  });

  it("never records mocked offline bundled App Check exchanges in the daily cloud ledger", () => {
    const dir = mkdtempSync(join(tmpdir(), "h43-appcheck-"));
    try {
      const ledgerFile = join(dir, "e2e-cloud-on-2026-11-16-h23.json");
      writeLedger({ ...emptyLedger("Chromium", ledgerFile), total: 91, appCheckExchanges: 32 }, ledgerFile);
      expect(recordDailyAppCheck(ledgerFile, "h43Offline.spec.ts")).toBe(false);
      expect(recordDailyAppCheck(ledgerFile, "h36aPageHonesty.spec.ts")).toBe(false);
      expect(readLedger(ledgerFile).appCheckExchanges).toBe(32);

      expect(recordDailyAppCheck(ledgerFile, "cloudDraft.spec.ts")).toBe(true);
      expect(recordDailyAppCheck(ledgerFile, "secondReaderLoop.spec.ts")).toBe(true);
      expect(readLedger(ledgerFile).appCheckExchanges).toBe(34);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses --out for scripts/measureN3CloudDrafts.ts so H43 B5 preserves H42 Run 4 baseline", () => {
    expect(parseMeasureArgs([])).toEqual({});
    expect(parseMeasureArgs(["--out", "results/h43-n3-cloud-drafts-2026-11-16.json"])).toEqual({
      outPath: "results/h43-n3-cloud-drafts-2026-11-16.json",
    });
    expect(parseMeasureArgs(["--out=results/h43-n3-cloud-drafts-2026-11-16.json"])).toEqual({
      outPath: "results/h43-n3-cloud-drafts-2026-11-16.json",
    });
  });
});

// H43c c6: this A3 block tests the author's own mock. It is kept, but it is never evidence.
describe("H43 A3: browser refusal state, halves, reader error, and device fallback honesty", () => {
  it("detects App Check 403 refusal without misclassifying unrelated errors", () => {
    expect(isBrowserRefusal(Object.assign(new Error("HTTP status: 403"), { code: "appCheck/fetch-status-error" }))).toBe(true);
    expect(isBrowserRefusal(new Error("AppCheck: server returned HTTP status 403"))).toBe(true);
    expect(isBrowserRefusal(new Error("Failed to fetch"))).toBe(false);
    expect(isCloudRefusal(new Error("AppCheck: HTTP status: 403"))).toBe(true);
  });

  it("keeps cloud status and halves as refused (never connected) across App Check 403 and ON_DEVICE fallback", async () => {
    let source = "ON_DEVICE";
    let shouldThrow = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("content-firebaseappcheck.googleapis.com")) {
          return new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 });
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const svc = makeCloudService({
      production: false,
      loadConfig: async () => ({
        ok: true,
        config: { apiKey: "k", authDomain: "a", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "i" },
      }),
      loadDebug: async () => ({ startDebugAppCheck: () => undefined }),
      loadModules: async () => ({
        app: { getApps: () => [], initializeApp: () => ({ name: "x" }) },
        ai: {
          GoogleAIBackend: class {},
          InferenceMode: { PREFER_IN_CLOUD: "prefer_in_cloud", ONLY_IN_CLOUD: "only_in_cloud" },
          getAI: () => ({}),
          getGenerativeModel: () => ({
            generateContent: async () => {
              await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", { method: "POST" });
              if (shouldThrow) throw new Error("Failed to fetch");
              return { response: { text: () => "Short device draft.", inferenceSource: source } };
            },
          }),
        },
        appCheck: {},
      }),
    });

    await svc.configure();
    // WO-02: configured and unused is "ready", not "connected". The later assertion at the end of
    // this test still expects "connected" — and it comes after a real IN_CLOUD answer, which is
    // exactly the distinction WO-02 draws.
    expect(svc.state()).toEqual({ kind: "ready" });

    // Call 1: reader throws after App Check 403
    shouldThrow = true;
    await expect(svc.generate((() => ({})) as never, "reader")).rejects.toThrow();
    expect(svc.state()).toEqual({ kind: "refused" });

    const view = cloudStatusView(svc.state());
    expect(view.words).toBe("the robot check refused this page");
    expect(view.words.toLowerCase()).not.toContain("connected");
    const halves = halvesSentences({ aiServiceEnabled: true, results: emptyState().results, cloudRefused: true });
    expect(halves.cloud).toContain("robot check refused this page");
    expect(halves.cloud.toLowerCase()).not.toContain("connected");
    const dom = document.createElement("div");
    dom.append(...renderScreen({ ...emptyState(), started: true, cloud: true, network: "online", cloudStatus: view }, {} as never));
    expect(dom.textContent?.toLowerCase() ?? "").not.toContain("connected");

    // Call 2: draft falls back to ON_DEVICE after App Check 403 — MUST stay refused (never "connected")
    shouldThrow = false;
    source = "ON_DEVICE";
    const fallbackOut = await svc.generate((() => ({})) as never, "draft");
    expect(fallbackOut.inferenceSource).toBe("ON_DEVICE");
    expect(svc.state()).toEqual({ kind: "refused" });
    expect(cloudStatusView(svc.state()).words).toBe("the robot check refused this page");

    // Only a genuine IN_CLOUD answer restores connected
    source = "IN_CLOUD";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await svc.generate((() => ({})) as never, "draft");
    expect(svc.state()).toEqual({ kind: "connected" });
  });

  it("a press after a refusal drops the cloud app, keeps the device app, and the next call exchanges again", async () => {
    const apps: { name: string }[] = [];
    const deleted: string[] = [];
    let exchanges = 0;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    const svc = makeCloudService({
      production: false,
      loadConfig: async () => ({
        ok: true,
        config: { apiKey: "k", authDomain: "a", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "i" },
      }),
      loadDebug: async () => ({ startDebugAppCheck: () => undefined }),
      loadModules: async () => ({
        app: {
          getApps: () => apps.slice(),
          initializeApp: () => {
            const created = { name: "[DEFAULT]" };
            apps.push(created);
            return created;
          },
          deleteApp: async (app: { name: string }) => {
            deleted.push(app.name);
            const at = apps.findIndex((a) => a === app);
            if (at >= 0) apps.splice(at, 1);
          },
        },
        ai: {
          GoogleAIBackend: class {},
          InferenceMode: {},
          getAI: () => ({}),
          getGenerativeModel: () => ({
            generateContent: async () => {
              exchanges += 1;
              await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", { method: "POST" });
              if (exchanges === 1) throw Object.assign(new Error("HTTP status: 403"), { code: "appCheck/fetch-status-error" });
              return { response: { text: () => "A cloud draft.", inferenceSource: "in_cloud" } };
            },
          }),
        },
        appCheck: {},
      }),
    });
    await svc.configure();
    await expect(svc.generate((() => ({})) as never, "one")).rejects.toThrow();
    expect(svc.state()).toEqual({ kind: "refused" });
    expect(deleted).toEqual([]);
    apps.push({ name: DEVICE_APP_NAME });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const out = await svc.generate((() => ({})) as never, "two");
    expect(deleted).toEqual(["[DEFAULT]"]);
    expect(apps.map((a) => a.name)).toContain(DEVICE_APP_NAME);
    expect(exchanges).toBe(2);
    expect(out.inferenceSource.toUpperCase()).toBe("IN_CLOUD");
    expect(svc.state()).toEqual({ kind: "connected" });
  });

  it("draftLabels, sendDraft, and askSecondReader surface browser-refused wording in plain English", async () => {
    expect(draftLabels({ value: { text: "Draft", short: true }, inferenceSource: "ON_DEVICE", connected: true }, true).shortLine).toBe(
      "The robot check refused this page, so this draft was written on this device. Press Send to try the check again.",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 403 })),
    );
    const clients = parseClientList(inventedVisit.clientList).entries;
    const prep = prepareDraft({ record: inventedVisit.preparedRecord, clients, policy: DEFAULT_POLICY });

    const fallbackDraft = makeDraftJob({
      sdk: {
        generate: async () => {
          await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", { method: "POST" });
          return { text: "On 12/11, [Person 1] was seen.", inferenceSource: "on_device" };
        },
      },
      state: async () => "available",
    });
    const outFallback = await sendDraft(prep, "PREFER_IN_CLOUD", { draft: fallbackDraft, ledger: makeLedger(), clients });
    expect(outFallback.status).toBe("drafted");
    if (outFallback.status === "drafted") {
      expect(outFallback.labels.shortLine).toBe("The robot check refused this page, so this draft was written on this device. Press Send to try the check again.");
    }

    const failedDraft = makeDraftJob({
      sdk: {
        generate: async () => {
          await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", { method: "POST" });
          throw Object.assign(new Error("HTTP status: 403"), { code: "appCheck/fetch-status-error" });
        },
      },
      state: async () => "unavailable",
    });
    const outFailed = await sendDraft(prep, "PREFER_IN_CLOUD", { draft: failedDraft, ledger: makeLedger(), clients });
    expect(outFailed.status).toBe("failed");
    if (outFailed.status === "failed") {
      expect(outFailed.refused).toBe(true);
      expect(outFailed.line).toBe("The robot check refused this page. Press Send to try the check again. Your masked record is kept.");
    }

    const { askSecondReader, prepareSecondReader } = await import("../../src/secondReader/flow");
    const rPrep = prepareSecondReader({
      maskedRecord: prep.outgoing.maskedRecord,
      mask: prep.outgoing.mask,
    });
    const reader = makeSecondReaderJob({
      sdk: {
        generate: async () => {
          await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken", { method: "POST" });
          throw new Error("network");
        },
      },
    });
    const outReader = await askSecondReader(rPrep, { reader, ledger: makeLedger(), clients, policy: DEFAULT_POLICY });
    expect(outReader.status).toBe("failed");
    if (outReader.status === "failed") {
      expect(outReader.line).toBe("The robot check refused this page, so the second reader could not run. Press Send to try the check again.");
    }
  });
});

describe("H43b b1, b2, b3, b5: 111f0f3 cloud bytes, every untagged pronoun, and watchAppCheck403 overlap", () => {
  const hwClients = parseClientList("Odalys Brennan-Webb; ; she/her\nIone; ; she/her").entries;
  const hwOutgoing = buildOutgoing({
    record: {
      visitDate: "12/11",
      present: [
        { label: "Odalys Brennan-Webb", role: "client" },
        { label: "Ione", role: "other" },
      ],
      seen: ["heating on now", "post piled by the door"],
      agreed: ["Odalys posts the benefits form Mon"],
      risks: [],
      nextSteps: ["I ring Fri to check it went"],
    },
    clients: hwClients,
    policy: DEFAULT_POLICY,
  });

  it("b1 stability check: the four hand-written inputs (handwriting-manifest, inventedVisit, synthetic-n001, synthetic-n002) still send byte-for-byte the 111f0f3 text and keep 0 client data in INSTRUCTIONS", async () => {
    const manifest = JSON.parse(readFileSync("tests/fixtures/handwriting/manifest.json", "utf8")) as { note: string };
    const synth = JSON.parse(readFileSync("results/synthetic-set.json", "utf8")) as {
      notes: Array<{
        id: string;
        text: string;
        clientList: Array<{ fullName: string; otherNames?: string[]; pronouns?: string }>;
      }>;
    };
    const run4 = JSON.parse(readFileSync("results/h42-n3-cloud-drafts-2026-11-16.json", "utf8")) as {
      samples: Array<{ fixtureId: string; outgoingSent: string }>;
    };
    const fmt = (cs: Array<{ fullName: string; otherNames?: string[]; pronouns?: string }>) =>
      cs.map((c) => `${c.fullName}; ${(c.otherNames ?? []).join(", ")}; ${c.pronouns ?? ""}`).join("\n");
    const n001 = synth.notes.find((n) => n.id === "n001")!;
    const n002 = synth.notes.find((n) => n.id === "n002")!;

    const cases: Array<{
      id: string;
      noteText: string;
      rawStructureJson: unknown;
      clients: ReturnType<typeof parseClientList>["entries"];
      typedSpans?: Array<{ term: string; tagKind: MaskSpan["tagKind"] }>;
      addedNames?: string[];
      expectedSha256: string;
    }> = [
      {
        id: "inventedVisit",
        noteText: inventedVisit.note,
        rawStructureJson: {
          visitDate: "12/11",
          present: [
            { label: "Maria Okonkwo-Reyes", role: "client" },
            { label: "Bea", role: "other" },
          ],
          seen: ["Mould in back bedroom again, worse by the window."],
          agreed: [
            "I ring landlord Mon",
            "Maria posts form Fri",
            "Tomas Brandvold (neighbour, also on my list) offered to help with the form.",
          ],
          risks: ["rent arrears if form is late."],
          nextSteps: ["revisit 26/11."],
        },
        clients: parseClientList(inventedVisit.clientList).entries,
        addedNames: ["Bea"],
        expectedSha256: "db12cc9068907d25d818e3a1b1557c4d4b06e612e0b6c26681bebf475aaa737c",
      },
      {
        id: "handwriting-manifest",
        noteText: manifest.note,
        rawStructureJson: {
          visitDate: "12/11",
          present: [
            { label: "Odalys Brennan-Webb", role: "client" },
            { label: "Ione", role: "other" },
          ],
          seen: ["heating on now", "post piled by the door"],
          agreed: ["Odalys posts the benefits form Mon"],
          risks: [],
          nextSteps: ["I ring Fri to check it went"],
        },
        clients: hwClients,
        expectedSha256: "65a08f7fefa943cdb6a971f7468cde9236a29fe74a83bf25b07fae2d5ef1457e",
      },
      {
        id: "synthetic-n001",
        noteText: n001.text,
        rawStructureJson: {
          visitDate: "06/01",
          present: [{ label: "Beatrice Delacroix", role: "client" }],
          seen: ["Flat 25, Eddlecombe House, curtains shut"],
          agreed: [],
          risks: [],
          nextSteps: ["Rebooking"],
        },
        clients: parseClientList(fmt(n001.clientList)).entries,
        typedSpans: [
          { term: "06/01", tagKind: "Date" },
          { term: "Flat 25, Eddlecombe House", tagKind: "Place" },
        ],
        expectedSha256: "9037ed5d25e32e917e536654a3f9af137e96a0acc39898eeab191cb892034194",
      },
      {
        id: "synthetic-n002",
        noteText: n002.text,
        rawStructureJson: {
          visitDate: "13/06",
          present: [{ label: "Nicolas Ashworth", role: "client" }],
          seen: ["Flat 23, Eddlecombe House, curtains shut"],
          agreed: [],
          risks: [],
          nextSteps: ["Rebooked for Thursday", "Text sent to confirm"],
        },
        clients: parseClientList(fmt(n002.clientList)).entries,
        typedSpans: [
          { term: "13/06", tagKind: "Date" },
          { term: "Flat 23", tagKind: "Place" },
          { term: "Eddlecombe House", tagKind: "Place" },
        ],
        expectedSha256: "d663c3996e1c9eaa447639e9daecf2282f36efc91bcc753e160fee1b956ff0c9",
      },
    ];

    for (const fx of cases) {
      const structured = await makeStructureJob({
        sdk: { generate: async () => ({ text: JSON.stringify(fx.rawStructureJson), inferenceSource: "on_device" }) },
        state: async () => "available",
      }).run({ noteText: fx.noteText });

      let spans: MaskSpan[] | undefined;
      if (fx.typedSpans) {
        const rawBlock = recordBlock(structured.value, fx.noteText);
        spans = runPasses(rawBlock, fx.clients, DEFAULT_POLICY).combined;
        for (const item of fx.typedSpans) {
          const idx = rawBlock.indexOf(item.term);
          if (idx >= 0) {
            spans = maskText(rawBlock, spans, item.term).spans.map((s) =>
              s.start === idx && s.end === idx + item.term.length ? { ...s, tagKind: item.tagKind } : s,
            );
          }
        }
      }

      const prep = prepareDraft({
        record: structured.value,
        noteText: fx.noteText,
        clients: fx.clients,
        policy: DEFAULT_POLICY,
        ...(spans ? { spans } : {}),
        ...(fx.addedNames ? { addedNames: fx.addedNames } : {}),
      });
      let sentText = "";
      const draftJob = makeDraftJob({
        sdk: {
          generate: async (call) => {
            sentText = call.text;
            return { text: "On 12/11, nobody answered.", inferenceSource: "in_cloud" };
          },
        },
        state: async () => "unavailable",
      });
      await sendDraft(prep, "PREFER_IN_CLOUD", { draft: draftJob, ledger: makeLedger(), clients: fx.clients });

      const baseline = run4.samples.find((s) => s.fixtureId === fx.id)!;
      // H46: the frozen baseline holds the old "Agreed: none" lines. The record
      // prefix keeps that rendering. WO-12 replaced the instruction block, so the
      // full-blob hash is no longer the pin. The new block stays at or under
      // release 18's 2,171 characters.
      const h46 = baseline.outgoingSent
        .replaceAll("Agreed: none\n", "Nothing was agreed.\n")
        .replaceAll("Risks: none\n", "No risks were recorded.\n");
      const recordOf = (text: string) => {
        const at = text.indexOf("\n\nInstructions:");
        return at >= 0 ? text.slice(0, at) : text;
      };
      expect(recordOf(sentText)).toBe(recordOf(h46));
      expect(sentText.endsWith(`\n\n${INSTRUCTIONS}`)).toBe(true);
      expect(INSTRUCTIONS.length).toBeLessThanOrEqual(2171);
    }

    for (const leaked of [
      "12/11",
      "26/11",
      "Mon",
      "Fri",
      "Maria",
      "Odalys",
      "Beatrice",
      "Nicolas",
      "Alder",
      "Eddlecombe",
      "landlord",
      "mould",
      "curtains",
      "revisit",
      "clinic",
    ]) {
      expect(INSTRUCTIONS).not.toContain(leaked);
    }
    expect(recordBlock(inventedVisit.preparedRecord)).toBe(
      [
        "Visit date: 12/11",
        "Present: Maria Okonkwo-Reyes, Bea, worker",
        "Seen: Mould in the back bedroom, worse by the window; Her sister was there; Letter about the benefits form on the table.",
        "Agreed: Worker rings the landlord on Mon; Maria posts the form on Fri; Tomas Brandvald offered to help with the form.",
        "Risks: Rent arrears if the form is late.",
        "Next steps: Revisit on 26/11.",
      ].join("\n"),
    );
  });

  it("b2 flags every untagged he/she/him/her/his/hers anywhere (removing multi-sentence exemption) and closes whole F1 draft with 0 new warnings on the other 11", () => {
    const run4 = JSON.parse(readFileSync("results/h42-n3-cloud-drafts-2026-11-16.json", "utf8")) as {
      samples: Array<{
        fixtureId: string;
        attempt: number;
        outgoingSent: string;
        rawCloudReply: string;
        restoredDraft: string;
        sheetNotes: string[];
      }>;
    };
    const synth = JSON.parse(readFileSync("results/synthetic-set.json", "utf8")) as {
      notes: Array<{ id: string; text: string; clientList: Array<{ fullName: string; otherNames?: string[]; pronouns?: string }> }>;
    };
    const fmt = (cs: Array<{ fullName: string; otherNames?: string[]; pronouns?: string }>) =>
      cs.map((c) => `${c.fullName}; ${(c.otherNames ?? []).join(", ")}; ${c.pronouns ?? ""}`).join("\n");
    const n001 = synth.notes.find((n) => n.id === "n001")!;
    const n002 = synth.notes.find((n) => n.id === "n002")!;
    const n001Clients = parseClientList(fmt(n001.clientList)).entries;
    const n002Clients = parseClientList(fmt(n002.clientList)).entries;
    const invClients = parseClientList(inventedVisit.clientList).entries;
    const invOutgoing = buildOutgoing({
      record: {
        visitDate: "12/11",
        present: [{ label: "Maria Okonkwo-Reyes", role: "client" }, { label: "Bea", role: "other" }],
        seen: ["Mould in back bedroom again, worse by the window."],
        agreed: ["I ring landlord Mon", "Maria posts form Fri", "Tomas Brandvold offered to help."],
        risks: [],
        nextSteps: [],
      },
      clients: invClients,
      policy: DEFAULT_POLICY,
    });
    const n001Outgoing = buildOutgoing({
      record: { visitDate: "06/01", present: [], seen: ["Flat 25, Eddlecombe House, curtains shut"], agreed: [], risks: [], nextSteps: [] },
      noteText: n001.text,
      clients: n001Clients,
      policy: DEFAULT_POLICY,
      extraMasked: ["06/01", "Flat 25, Eddlecombe House"],
    });
    const n002Outgoing = buildOutgoing({
      record: { visitDate: "13/06", present: [], seen: ["Flat 23", "Eddlecombe House", "curtains shut"], agreed: [], risks: [], nextSteps: [] },
      noteText: n002.text,
      clients: n002Clients,
      policy: DEFAULT_POLICY,
      extraMasked: ["13/06", "Flat 23", "Eddlecombe House"],
    });

    // Closing test 1: whole F1 draft (all sentences together from results/h42-n3-cloud-drafts-2026-11-16.json)
    const f1Sample = run4.samples.find((s) => s.fixtureId === "handwriting-manifest" && s.attempt === 3)!;
    const f1RawRestored = restoreDraft({ draft: f1Sample.rawCloudReply, outgoing: hwOutgoing, clients: hwClients });
    expect(f1RawRestored.notes).toContain(
      `${strings.drafting.pronounWrongPerson} She agreed that Odalys Brennan-Webb posts the benefits form Mon.`,
    );
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: f1Sample.rawCloudReply,
        outgoingSent: f1Sample.outgoingSent,
        sheetNotes: f1Sample.sheetNotes,
      }),
    ).toMatchObject({
      hasWrongPersonPronoun: true,
      hasWrongPersonWarning: false,
      silentWrongPersonPronoun: true,
      wrongPersonPronounHits: ["{they:Person 1} agreed that [Person 1] posts the benefits form Mon."],
    });
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: f1Sample.rawCloudReply,
        outgoingSent: f1Sample.outgoingSent,
        sheetNotes: f1RawRestored.notes,
      }),
    ).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });

    // Closing test 2: whole F1 draft with untagged She (including multi-sentence after named Person 1)
    for (const wholeUntaggedF1 of [
      "On 12/11, [Person 1] and [Person 2] were present. The heating was on now, and post was piled by the door. " +
        "She agreed that [Person 1] posts the benefits form Mon. There were no risks. The next steps are that I ring Fri to check it went.",
      f1Sample.restoredDraft,
    ]) {
      const restored = restoreDraft({ draft: wholeUntaggedF1, outgoing: hwOutgoing, clients: hwClients });
      expect(restored.notes).toContain(
        `${strings.drafting.pronounWrongPerson} She agreed that Odalys Brennan-Webb posts the benefits form Mon.`,
      );
      expect(
        evaluateWrongPersonPronouns({ rawCloudReply: wholeUntaggedF1, outgoingSent: hwOutgoing.text, sheetNotes: [] }),
      ).toMatchObject({ hasWrongPersonPronoun: true, silentWrongPersonPronoun: true });
      expect(
        evaluateWrongPersonPronouns({ rawCloudReply: wholeUntaggedF1, outgoingSent: hwOutgoing.text, sheetNotes: restored.notes }),
      ).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });
    }

    // Closing test 3: every one of he, she, him, her, his, hers anywhere in raw draft is warned (no anaphora exemption)
    const bareWords = ["he", "she", "him", "her", "his", "hers"] as const;
    for (const word of bareWords) {
      const sentence =
        word === "his" || word === "her"
          ? `Later ${word} friend called [Person 2].`
          : word === "him" || word === "hers"
            ? `Later I gave the leaflet to ${word} on arrival.`
            : `Later ${word} told [Person 2] about the form.`;
      const draft = `On 12/11, [Person 1] was present. ${sentence}`;
      const restored = restoreDraft({ draft, outgoing: hwOutgoing, clients: hwClients });
      const auditUnwarned = evaluateWrongPersonPronouns({ rawCloudReply: draft, outgoingSent: hwOutgoing.text, sheetNotes: [] });
      const auditWarned = evaluateWrongPersonPronouns({
        rawCloudReply: draft,
        outgoingSent: hwOutgoing.text,
        sheetNotes: restored.notes,
      });
      expect(restored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(true);
      expect(auditUnwarned).toMatchObject({ hasWrongPersonPronoun: true, silentWrongPersonPronoun: true });
      expect(auditWarned).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });
    }

    // Properly tagged pronoun after prior bare [Person 1] and expletive 'It' / plural 'they' still stay clean
    for (const cleanDraft of [
      "On 12/11, [Person 1] was present. {she:Person 1} told [Person 2] about the form.",
      "On 12/11, [Person 1] and [Person 2] were present. It was worse by the window. They went to a relative.",
    ]) {
      const restored = restoreDraft({ draft: cleanDraft, outgoing: hwOutgoing, clients: hwClients });
      expect(restored.notes.some((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toBe(false);
      expect(
        evaluateWrongPersonPronouns({ rawCloudReply: cleanDraft, outgoingSent: hwOutgoing.text, sheetNotes: restored.notes }),
      ).toMatchObject({ hasWrongPersonPronoun: false, hasWrongPersonWarning: false, silentWrongPersonPronoun: false });
    }

    // Other 11 drafts of results/h42-n3-cloud-drafts-2026-11-16.json: 0 new warnings and 0 audit hits
    const otherSamples = run4.samples.filter((s) => !(s.fixtureId === "handwriting-manifest" && s.attempt === 3));
    expect(otherSamples).toHaveLength(11);
    for (const s of otherSamples) {
      const cfg =
        s.fixtureId === "inventedVisit"
          ? { outgoing: invOutgoing, clients: invClients }
          : s.fixtureId === "handwriting-manifest"
            ? { outgoing: hwOutgoing, clients: hwClients }
            : s.fixtureId === "synthetic-n001"
              ? { outgoing: n001Outgoing, clients: n001Clients }
              : { outgoing: n002Outgoing, clients: n002Clients };
      const restored = restoreDraft({ draft: s.rawCloudReply, outgoing: cfg.outgoing, clients: cfg.clients });
      // H43c-2 c1-b: shape (b) is the whole sentence, so this one stored sentence newly warns
      // (listed in the built note for the desk to rule on); the other 10 stay quiet.
      if (s.fixtureId === "inventedVisit" && s.attempt === 3) {
        expect(restored.notes.filter((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toEqual([
          `${strings.drafting.pronounWrongPerson} It was agreed that I ring landlord Mon, she posts form Fri, and Tomas Brandvold offered to help Maria Okonkwo-Reyes with the form.`,
        ]);
        expect(
          evaluateWrongPersonPronouns({ rawCloudReply: s.rawCloudReply, outgoingSent: s.outgoingSent, sheetNotes: restored.notes }),
        ).toMatchObject({ hasWrongPersonPronoun: true, hasWrongPersonWarning: true, silentWrongPersonPronoun: false });
        continue;
      }
      expect(restored.notes.filter((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toEqual([]);
      expect(
        evaluateWrongPersonPronouns({ rawCloudReply: s.rawCloudReply, outgoingSent: s.outgoingSent, sheetNotes: s.sheetNotes }),
      ).toMatchObject({ hasWrongPersonPronoun: false, hasWrongPersonWarning: false, silentWrongPersonPronoun: false });
    }

    // D3: mapped token possessives ({her:Person 1}'s -> [Person 1]'s) match cleanly between restoreDraft and n3Audit
    const possDraft = "{her:Person 1}'s form was late. On 12/11, [Person 1] posted it.";
    const possRestored = restoreDraft({ draft: possDraft, outgoing: hwOutgoing, clients: hwClients });
    expect(possRestored.shown).toBe("Odalys Brennan-Webb's form was late. On 12/11, Odalys Brennan-Webb posted it.");
    expect(possRestored.notes.filter((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toEqual([]);
    // H43c-2 c2: the audit's {her:Person 1}'s preprocessing went (no stored sentence needs
    // it), so on this synthetic draft the audit flags the token sentence the device rewrites.
    expect(
      evaluateWrongPersonPronouns({ rawCloudReply: possDraft, outgoingSent: hwOutgoing.text, sheetNotes: possRestored.notes }),
    ).toEqual({
      hasWrongPersonPronoun: true,
      wrongPersonPronounHits: ["{her:Person 1}'s form was late."],
      hasWrongPersonWarning: false,
      silentWrongPersonPronoun: true,
    });

    const unmappedPossDraft = "{her:Person 9}'s form was late. On 12/11, [Person 1] posted it.";
    const unmappedPossRestored = restoreDraft({ draft: unmappedPossDraft, outgoing: hwOutgoing, clients: hwClients });
    // H43c c1: a tagged pronoun with no earlier bare [Person N] does not warn on that ground alone.
    expect(unmappedPossRestored.notes.filter((n) => n.startsWith(strings.drafting.pronounWrongPerson))).toEqual([]);
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: unmappedPossDraft,
        outgoingSent: hwOutgoing.text,
        sheetNotes: unmappedPossRestored.notes,
      }),
    ).toMatchObject({
      hasWrongPersonPronoun: false,
      hasWrongPersonWarning: false,
      silentWrongPersonPronoun: false,
    });

    // H43c c2: the audit is back to its 111f0f3 warning semantics (any warning line counts, no
    // 1-to-1 sentence matching). Hits here use untagged-pronoun shape (a); tagged-alone is not a hit.
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: "She agreed. He agreed.",
        outgoingSent: hwOutgoing.text,
        sheetNotes: [`${strings.drafting.pronounWrongPerson} She agreed.`],
      }),
    ).toEqual({
      hasWrongPersonPronoun: true,
      wrongPersonPronounHits: ["She agreed.", "He agreed."],
      hasWrongPersonWarning: true,
      silentWrongPersonPronoun: false,
    });
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: "She agreed. He agreed.",
        outgoingSent: hwOutgoing.text,
        sheetNotes: [],
      }),
    ).toEqual({
      hasWrongPersonPronoun: true,
      wrongPersonPronounHits: ["She agreed.", "He agreed."],
      hasWrongPersonWarning: false,
      silentWrongPersonPronoun: true,
    });

    // Cold Hound #517 3b: non-tag square brackets [she saw him] must still trigger bare-pronoun detection
    const bracketedBareDraft = "On 12/11, [Person 1] arrived. [she saw him] at the door.";
    const bracketedBareRestored = restoreDraft({ draft: bracketedBareDraft, outgoing: hwOutgoing, clients: hwClients });
    expect(bracketedBareRestored.notes).toContain(`${strings.drafting.pronounWrongPerson} she saw him at the door.`);
    expect(
      evaluateWrongPersonPronouns({ rawCloudReply: bracketedBareDraft, outgoingSent: hwOutgoing.text, sheetNotes: [] }),
    ).toEqual({
      hasWrongPersonPronoun: true,
      wrongPersonPronounHits: ["[she saw him] at the door."],
      hasWrongPersonWarning: false,
      silentWrongPersonPronoun: true,
    });
    expect(
      evaluateWrongPersonPronouns({
        rawCloudReply: bracketedBareDraft,
        outgoingSent: hwOutgoing.text,
        sheetNotes: bracketedBareRestored.notes,
      }),
    ).toEqual({
      hasWrongPersonPronoun: true,
      wrongPersonPronounHits: ["[she saw him] at the door."],
      hasWrongPersonWarning: true,
      silentWrongPersonPronoun: false,
    });
  });

  it("b5 watchAppCheck403 single-wraps fetch and restores original fetch across overlapping FIFO, LIFO, and throwing calls", async () => {
    const deferred = <T,>() => {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };

    const originalFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return new Response("denied", { status: url.includes("403") ? 403 : 200 });
    });
    vi.stubGlobal("fetch", originalFetch);

    // FIFO [1, 2]: call 1 settles before call 2
    const d1 = deferred<void>();
    const d2 = deferred<void>();
    const p1 = watchAppCheck403(async () => {
      await d1.promise;
      return "r1";
    });
    const wrapperDuringOverlap = globalThis.fetch;
    expect(wrapperDuringOverlap).not.toBe(originalFetch);
    const p2 = watchAppCheck403(async () => {
      await d2.promise;
      await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken?403");
      return "r2";
    });
    expect(globalThis.fetch).toBe(wrapperDuringOverlap);

    d1.resolve();
    expect(await p1).toEqual({ ok: true, value: "r1", saw403: false });
    expect(globalThis.fetch).toBe(wrapperDuringOverlap);

    d2.resolve();
    expect(await p2).toEqual({ ok: true, value: "r2", saw403: true });
    expect(globalThis.fetch).toBe(originalFetch);

    // LIFO [2, 1]: call 2 finishes BEFORE call 1, while fetch 403 fires in call 1 afterwards
    const l1 = deferred<void>();
    const l2 = deferred<void>();
    const lp1 = watchAppCheck403(async () => {
      await l1.promise;
      await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken?403");
      return "l1";
    });
    const lifoWrapper = globalThis.fetch;
    const lp2 = watchAppCheck403(async () => {
      await l2.promise;
      return "l2";
    });
    expect(globalThis.fetch).toBe(lifoWrapper);

    l2.resolve();
    expect(await lp2).toEqual({ ok: true, value: "l2", saw403: false });
    expect(globalThis.fetch).toBe(lifoWrapper);

    l1.resolve();
    expect(await lp1).toEqual({ ok: true, value: "l1", saw403: true });
    expect(globalThis.fetch).toBe(originalFetch);

    // Error throws in overlapping calls still restore originalFetch cleanly
    const t1 = deferred<void>();
    const t2 = deferred<void>();
    const tp1 = watchAppCheck403(async () => {
      await t1.promise;
      throw new Error("boom-1");
    });
    const tp2 = watchAppCheck403(async () => {
      await t2.promise;
      await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeDebugToken?403");
      throw new Error("boom-2");
    });
    t2.reject(new Error("boom-2"));
    expect(await tp2).toMatchObject({ ok: false });
    expect(globalThis.fetch).not.toBe(originalFetch);
    t1.reject(new Error("boom-1"));
    expect(await tp1).toMatchObject({ ok: false });
    expect(globalThis.fetch).toBe(originalFetch);

    // D5: ignores non-exchange App Check host paths and other-host 403s across true simultaneous in-flight fetches
    const gateOther = deferred<Response>();
    const gateNonExch = deferred<Response>();
    const gateExch = deferred<Response>();
    const concurrentFetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("example.com")) return gateOther.promise;
      if (url.includes("/debugTokens")) return gateNonExch.promise;
      return gateExch.promise;
    });
    vi.stubGlobal("fetch", concurrentFetch);
    const sIgnored = watchAppCheck403(async () => {
      await Promise.all([
        fetch("https://example.com/v1/projects/p/apps/a:exchangeDebugToken"),
        fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a/debugTokens"),
      ]);
      return "ignored-only";
    });
    const sExchange = watchAppCheck403(async () => {
      await fetch("https://content-firebaseappcheck.googleapis.com/v1/projects/p/apps/a:exchangeRecaptchaEnterpriseToken");
      return "exchange";
    });
    expect(concurrentFetch).toHaveBeenCalledTimes(3);
    gateOther.resolve(new Response("denied", { status: 403 }));
    gateNonExch.resolve(new Response("denied", { status: 403 }));
    expect(await sIgnored).toEqual({ ok: true, value: "ignored-only", saw403: false });
    expect(globalThis.fetch).not.toBe(concurrentFetch);
    gateExch.resolve(new Response("denied", { status: 403 }));
    expect(await sExchange).toEqual({ ok: true, value: "exchange", saw403: true });
    expect(globalThis.fetch).toBe(concurrentFetch);
  });
});

describe("H43 C1: undecided word gate shows reason right at #draft and moves focus with preventScroll", () => {
  it("renders [data-draft-reason] inside Zone 2 and focuses [data-likely-word] with preventScroll", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const c = makeController({
      root,
      device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
      aiServiceEnabled: false,
      tier: "no-cost",
      results: () => undefined,
      isOffline: async () => false,
      cloudStatus: () => ({ kind: "not-configured", words: "not configured" }),
      drafting: {
        draftFor: () => ({ run: vi.fn() }) as never,
        ledger: makeLedger(),
        policy: DEFAULT_POLICY,
        online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
        copy: async () => undefined,
      },
    } as ControllerDeps);
    await c.start();
    c.handlers.onTryExample();
    c.handlers.onStartByHand?.();
    c.handlers.onMask?.();
    c.handlers.onOpenRecord?.();
    const record = structuredClone(inventedVisit.preparedRecord);
    record.seen = [...record.seen, "Then Glenda arrived."];
    c.handlers.onRecordEdit?.(record);

    const protoFocus = HTMLElement.prototype.focus;
    const focusSpy = vi.fn(function (this: HTMLElement, opts?: FocusOptions) {
      protoFocus.call(this, opts);
    });
    HTMLElement.prototype.focus = focusSpy;
    try {
      (root.querySelector("#draft") as HTMLButtonElement).click();
      const gateReason = root.querySelector('[data-zone="leaves"] [data-draft-reason]');
      expect(gateReason?.textContent).toBe(strings.masking.resolveBeforeDraft);
      expect(document.activeElement?.getAttribute("data-likely-word")).toBe("Glenda");
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    } finally {
      HTMLElement.prototype.focus = protoFocus;
    }
  });
});
