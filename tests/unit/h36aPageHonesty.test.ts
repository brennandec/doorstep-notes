// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { halvesSentences } from "../../src/app/halves";
import { renderScreen } from "../../src/app/screen";
import { emptyState, type AppState } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { buildOutgoing } from "../../src/drafting/buildOutgoing";
import { restoreDraft } from "../../src/drafting/restoreDraft";
import { screenDraft } from "../../src/drafting/screenDraft";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import type { ClientEntry } from "../../src/masking/clientList";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const CLIENTS: ClientEntry[] = [
  { id: "c1", fullName: "Maria Okonkwo-Reyes", otherNames: ["Maria"], pronouns: "she/her" },
  { id: "c2", fullName: "Sam Patel", otherNames: ["Sam"], pronouns: "he/him" },
  { id: "c3", fullName: "Alex Rivera", otherNames: ["Alex"], pronouns: "they/them" },
];

const OUTGOING = buildOutgoing({
  record: {
    visitDate: "2026-06-03",
    present: [
      { role: "client", label: "Maria Okonkwo-Reyes" },
      { role: "client", label: "Sam Patel" },
      { role: "client", label: "Alex Rivera" },
    ],
    seen: ["Maria met Sam."],
    agreed: [],
    risks: [],
    nextSteps: [],
  },
  clients: CLIENTS,
  policy: DEFAULT_POLICY,
});

function restoreFrom(draft: string) {
  const screened = screenDraft({
    draft,
    outgoing: OUTGOING,
    clients: CLIENTS,
    policy: DEFAULT_POLICY,
    noteText: "Maria Sam Alex",
  });
  return restoreDraft({
    draft: screened.maskedText,
    outgoing: OUTGOING,
    clients: CLIENTS,
    screened,
  });
}

const NOOP_HANDLERS = {
  onNoteInput() {},
  onListInput() {},
  onTryExample() {},
  onRemoveExample() {},
  onGetModel() {},
  onMakeRecord() {},
};

function renderToDiv(state: AppState): HTMLDivElement {
  const root = document.createElement("div");
  root.append(...renderScreen(state, NOOP_HANDLERS));
  return root;
}

describe("H36a item 1: offline / failed cloud [data-halves] honesty", () => {
  it("halvesSentences does not say the cloud half is connected when offline", () => {
    const h = halvesSentences({ aiServiceEnabled: true, results: emptyState().results, offline: true });
    expect(h.cloud).not.toMatch(/connected/i);
  });

  it("halvesSentences does not say the cloud half is connected when cloudFailed is true", () => {
    const h = halvesSentences({ aiServiceEnabled: true, results: emptyState().results, cloudFailed: true });
    expect(h.cloud).not.toMatch(/connected/i);
  });

  it("renderScreen [data-halves] does not claim connected while offline", () => {
    const root = renderToDiv({ ...emptyState(), started: true, cloud: true, network: "offline" });
    const halvesText = root.querySelector("[data-halves]")?.textContent ?? "";
    expect(halvesText).not.toMatch(/The cloud half is connected/i);
  });

  it("renderScreen [data-halves] does not claim connected when cloudStatus failed", () => {
    const root = renderToDiv({
      ...emptyState(),
      started: true,
      cloud: true,
      network: "online",
      cloudStatus: { kind: "failed", words: "unreachable" },
    });
    const halvesText = root.querySelector("[data-halves]")?.textContent ?? "";
    expect(halvesText).not.toMatch(/The cloud half is connected/i);
  });
});

describe("H36a item 2: zero-weight Chromium session guard", () => {
  it("availability() demotes 0 inputQuota sessions to downloadable instead of available", async () => {
    let destroyed = false;
    const device = makeDeviceModel({
      languageModel: {
        availability: async () => "available",
        create: async () => ({
          inputQuota: 0,
          destroy() {
            destroyed = true;
          },
        }),
      },
    });
    const status = await device.state();
    expect(status).toBe("downloadable");
    expect(destroyed).toBe(true);
  });

  it("availability() demotes sessions whose measureInputUsage rejects to downloadable", async () => {
    let destroyed = false;
    const device = makeDeviceModel({
      languageModel: {
        availability: async () => "available",
        create: async () => ({
          inputQuota: 4096,
          measureInputUsage: async () => {
            throw new DOMException("No device weights", "QuotaExceededError");
          },
          destroy() {
            destroyed = true;
          },
        }),
      },
    });
    const status = await device.state();
    expect(status).toBe("downloadable");
    expect(destroyed).toBe(true);
  });

  it("initialize rejects with QuotaExceededError when create resolves to 0 inputQuota", async () => {
    let destroyed = false;
    const device = makeDeviceModel({
      languageModel: {
        availability: async () => "downloadable",
        create: async () => ({
          inputQuota: 0,
          destroy() {
            destroyed = true;
          },
        }),
      },
      initializeDeviceModel: async () => {},
    });
    await expect(device.initialize(() => {})).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(destroyed).toBe(true);
  });

  it("keeps plain mock sessions without inputQuota or measureInputUsage working once one short prompt answers", async () => {
    const device = makeDeviceModel({
      languageModel: {
        availability: async () => "available",
        create: async () => ({ prompt: async () => '{"ok":true}', destroy() {} }),
      },
    });
    const status = await device.state();
    expect(status).toBe("available");
  });

  it("exposes clearSessionMade on DeviceModel", () => {
    const device = makeDeviceModel({
      languageModel: {
        availability: async () => "available",
        create: async () => ({ destroy() {} }),
      },
    });
    expect(typeof (device as { clearSessionMade?: unknown }).clearSessionMade).toBe("function");
  });
});

describe("H36a item 3 (N1): single Fill in by hand and alert placement in Zone 1", () => {
  it("renders exactly one Fill in by hand button when errorHand is shown without a record", () => {
    const root = renderToDiv({
      ...emptyState(),
      device: { state: "downloadable" },
      noteText: "Visit note",
      error: "The device model gave QuotaExceededError.",
      errorHand: true,
    });
    const handButtons = [...root.querySelectorAll("button")].filter(
      (b) => (b.textContent ?? "").trim() === strings.record.handEntry,
    );
    expect(handButtons).toHaveLength(1);
    expect(root.querySelector("[data-error-hand-entry]")).not.toBeNull();
    expect(root.querySelector("#start-by-hand")).toBeNull();
  });

  it("places [role='alert'] before modelLines, devicePanel, and coldStart", () => {
    const root = renderToDiv({
      ...emptyState(),
      device: { state: "downloadable" },
      noteText: "Visit note",
      error: "The device model gave QuotaExceededError.",
      errorHand: true,
    });
    const alert = root.querySelector("[role='alert']");
    const modelLine = root.querySelector("[data-model-line]");
    expect(alert).not.toBeNull();
    expect(modelLine).not.toBeNull();
    expect(root.querySelector("[data-author-device-panel]")).toBeNull();
    expect(alert!.compareDocumentPosition(modelLine!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("H36a item 4 (N2): the lab-note panel stays off the screen", () => {
  it("does not paint [data-author-device-panel] when the device is downloadable", () => {
    const root = renderToDiv({ ...emptyState(), started: true, device: { state: "downloadable" } });
    expect(root.querySelector("#make-record")).not.toBeNull();
    expect(root.querySelector("[data-author-device-panel]")).toBeNull();
    expect(root.querySelector("[data-model-line]")).not.toBeNull();
    expect(root.textContent).toContain("home-visit caseworkers");
  });

  it("omits [data-author-device-panel] when device is available", () => {
    const root = renderToDiv({ ...emptyState(), device: { state: "available" } });
    expect(root.querySelector("[data-author-device-panel]")).toBeNull();
  });
});

describe("H36a item 5 (N3): Keep button is a secondary button at >= 44px height", () => {
  it("renders [data-keep-likely] using button(..., 'secondary', ...) and keeps >= 44px min-height in CSS", () => {
    const maskViewSrc = readFileSync(resolve(process.cwd(), "src/app/parts/maskView.ts"), "utf8");
    const css = readFileSync(resolve(process.cwd(), "src/app/styles/app.css"), "utf8");
    expect(maskViewSrc).toMatch(/button\([\s\S]*?"secondary"/);
    expect(maskViewSrc).toContain("keep-likely");
    expect(css).toMatch(/\.keep-likely[\s\S]*?min-height:\s*44px/);
  });
});

describe("H36a item 6 (A5·W): object-form pronoun warning line under finished note", () => {
  it("adds one plain warning line when {him:Tag} matches the nearest prior tag in the same sentence", () => {
    const res = restoreFrom("[Person 1] greeted [Person 2] and handed {him:Person 2} the letter.");
    expect(res.shown).toContain("Maria Okonkwo-Reyes greeted Sam Patel and handed him the letter.");
    expect(res.copyHeld).toBe(false);
    expect(res.notes).toContain(
      "Check this sentence: a pronoun may point at the wrong person. Maria Okonkwo-Reyes greeted Sam Patel and handed him the letter.",
    );
  });

  it("adds the plain warning line when {them:Tag} (any case) matches the nearest prior tag in the same sentence", () => {
    const res = restoreFrom("[Person 3] said the schedule suited {Them:Person 3}.");
    expect(res.copyHeld).toBe(false);
    expect(res.notes).toContain(
      "Check this sentence: a pronoun may point at the wrong person. Alex Rivera said the schedule suited Them.",
    );
  });

  it("adds no line for subject or possessive pronouns matching the prior tag", () => {
    const subj = restoreFrom("[Person 1] agreed that {she:Person 1} posts the form on Fri.");
    expect(subj.notes.some((n) => n.startsWith("Check this sentence:"))).toBe(false);

    const poss = restoreFrom("[Person 2] checked {his:Person 2} calendar.");
    expect(poss.notes.some((n) => n.startsWith("Check this sentence:"))).toBe(false);
  });

  it("adds no line when another tag stands between or across a sentence boundary", () => {
    const between = restoreFrom("[Person 1] greeted [Person 2] and asked {him:Person 1} to sign.");
    expect(between.notes.some((n) => n.startsWith("Check this sentence:"))).toBe(false);

    const crossSentence = restoreFrom("[Person 1] arrived early. The worker met {him:Person 1} outside.");
    expect(crossSentence.notes.some((n) => n.startsWith("Check this sentence:"))).toBe(false);
  });
});
