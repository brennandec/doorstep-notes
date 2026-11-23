import "./styles/app.css";
import { AI_SERVICE_ENABLED, CLOUD_TIER } from "../constants";
import { cloudPermit, currentSettings } from "../firebase/remoteConfig";
import { appendPolicyFacts, isAboutPath } from "./aboutView";
import { initializeDeviceModelFromPress } from "../firebase/deviceInit";
import { preloadDeviceModules } from "../firebase/deviceApp";
import { cloudService } from "../firebase/cloudService";
import { registerWorker } from "./registerWorker";
import { cloudStatusView } from "./cloudStatus";
import { draftSdk } from "../firebase/draftSdk";
import { proposeSdk } from "../firebase/proposeSdk";
import { rewriteSdk } from "../firebase/rewriteSdk";
import { secondReaderSdk } from "../firebase/secondReaderSdk";
import { structureSdk } from "../firebase/structureSdk";
import { openPersistentLedger, makeLedgerStorage } from "../storage/ledger";
import { currentSwitches, makeKit } from "../inference";
import { makeDeviceModel, type LanguageModelLike } from "../inference/deviceModel";
import { installDownloadProgressWatch } from "../inference/downloadProgress";
import { makeDraftJob } from "../inference/draft/draft.real";
import { makeProposeMasksJob } from "../inference/proposeMasks/proposeMasks.real";
import { makeRewriteJob } from "../inference/rewrite/rewrite.real";
import { makeSecondReaderJob } from "../inference/secondReader/secondReader.real";
import { makeStructureJob } from "../inference/structure/structure.real";
import { defaultBackend, keptBackend } from "../storage/backend";
import { makeKeptStore } from "../storage/kept";
import { browserDeps, isOffline } from "../net/online";
import { makeController } from "./controller";
import { bundledResults } from "./figures";
import { renderAbout as renderAgency } from "./aboutPage";
import { E2E_MODE, cloudSwitchFrom, seedLeakFrom, withReaderFixture, withRewriteFixture } from "./testHooks";

const root = document.getElementById("app");
if (!root) throw new Error("The page has no #app element.");
root.setAttribute("data-build", import.meta.env.MODE);

// The cloud permit. In a build made with mode e2e a test may turn it off to use the doubles (R41.2);
// any other build uses the constant, and the hook is dropped from it. The permit alone does not make
// the cloud live: the cloud service must also be configured (hosted-cloud R2, R4), and the words on
// the status bar come from the cloud service, not from the constant.
const PERMIT = import.meta.env.MODE === E2E_MODE ? cloudSwitchFrom(E2E_MODE, window as { __cloudStandIn?: unknown }, AI_SERVICE_ENABLED) : AI_SERVICE_ENABLED;

const languageModel = (globalThis as { LanguageModel?: LanguageModelLike }).LanguageModel;
if (languageModel) installDownloadProgressWatch(languageModel);

const device = makeDeviceModel({
  languageModel,
  initializeDeviceModel: initializeDeviceModelFromPress,
});

// The structure job is a device job: it runs whenever the browser reports the model
// available (or still downloading, which it waits for), whether or not the cloud is on.
const backend = defaultBackend();
const structure = makeStructureJob({ sdk: structureSdk, state: (kind) => device.state(kind) });

async function start(): Promise<void> {
  // Reads the config file and, in a production build, the site key. No call to the project.
  // Installations, Remote Config and App Check wait for the first cloud call.
  const cloud = cloudService();
  await cloud.configure();
  const settings = currentSettings();
  if (isAboutPath(location.pathname)) {
    renderAgency(root!);
    appendPolicyFacts(root!, settings);
    return;
  }
  const CLOUD_ON = cloudPermit(PERMIT, cloud.state().kind !== "not-configured", settings);
  const switchesFor = (deviceState: Parameters<typeof currentSwitches>[0]) => ({ ...currentSwitches(deviceState), cloud: CLOUD_ON });

  // The draft, rewrite and propose-masks jobs. The kit decides, for each call, whether the
  // real job or the test double answers, from the two switches (ruling 23). The second
  // reader is cloud only; the kit gives its double while the cloud flag is off.
  const realJobs = {
    structure,
    proposeMasks: makeProposeMasksJob({ sdk: proposeSdk, state: () => device.state() }),
    draft: makeDraftJob({ sdk: draftSdk, state: () => device.state(), cloudModel: () => currentSettings().draftModel }),
    rewrite: makeRewriteJob({ sdk: rewriteSdk, state: () => device.state(), cloudEnabled: CLOUD_ON, cloudModel: () => currentSettings().draftModel }),
    secondReader: makeSecondReaderJob({ sdk: secondReaderSdk, cloudModel: () => currentSettings().readerModel }),
  };
  const ledger = await openPersistentLedger(makeLedgerStorage(backend));
  const controller = makeController({
    structure,
    // Everything she keeps on this device, in one versioned document (shell-and-offline R27).
    kept: makeKeptStore(keptBackend()),
    root: root!,
    device,
    aiServiceEnabled: CLOUD_ON,
    // Derived from the config and the last call. With the permit off (the e2e stand-in) the older words stay.
    ...(PERMIT ? { cloudStatus: () => cloudStatusView(cloud.state()) } : {}),
    tier: CLOUD_TIER,
    results: bundledResults,
    isOffline: () => isOffline(browserDeps()),
    // The device pass runs only when the kit gives the real job, that is, when the model is available.
    proposeMasks: (deviceState) => makeKit(switchesFor(deviceState), { real: realJobs }).proposeMasks,
    confirmPurpose: (question) => window.confirm(question),
    secondReader: {
      readerFor: (deviceState) => {
        const job = makeKit(switchesFor(deviceState), { real: realJobs }).secondReader;
        // Test-only: in a build made with mode e2e a test can set the words of the first guess.
        return import.meta.env.MODE === E2E_MODE ? withReaderFixture(E2E_MODE, window as { __readerWho?: unknown }, job) : job;
      },
    },
    drafting: {
      draftFor: (deviceState) => makeKit(switchesFor(deviceState), { real: realJobs }).draft,
      rewriteFor: (deviceState) => {
        const job = makeKit(switchesFor(deviceState), { real: realJobs }).rewrite;
        // Test-only: in a build made with mode e2e a test can set the words of the answer.
        return import.meta.env.MODE === E2E_MODE ? withRewriteFixture(E2E_MODE, window as { __rewriteTo?: unknown }, job) : job;
      },
      ledger,
      // "Clear everything this page keeps" empties the ledger too.
      clearLedger: async () => {
        await ledger.clear();
      },
      policy: currentSettings().policy,
      online: browserDeps(),
      copy: (text) => navigator.clipboard.writeText(text),
      // Test-only: present in a build made with mode e2e, dropped from every other build.
      ...(import.meta.env.MODE === E2E_MODE ? { seedLeak: () => seedLeakFrom(E2E_MODE, window as { __seedLeak?: unknown }) } : {}),
      // The device model looks at the returned draft for names the masker does not know.
      // It is a device job: no request. When the model cannot answer, no extra names are marked.
      findNames: async (text) => {
        const kit = makeKit(switchesFor(await device.state()), { real: realJobs });
        return (await kit.proposeMasks.run(text)).value;
      },
    },
  });
  await controller.start();
  cloud.onChange(() => controller.refreshCloud());
  window.addEventListener("online", () => void controller.refreshNetwork());
  window.addEventListener("offline", () => void controller.refreshNetwork());
}
void preloadDeviceModules().then(() => root.setAttribute("data-device-modules", "ready"), () => undefined);
void start();
registerWorker({ prod: import.meta.env.PROD, doc: document, win: window, nav: navigator, note: (s) => root.setAttribute("data-sw", s) });
