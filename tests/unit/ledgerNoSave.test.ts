// @vitest-environment happy-dom
// H20 R2, H27: the build has no control that saves the ledger anywhere. The ledger fold and the egress ledger stay.
// The words of the removed control are built from fragments so no file holds them whole.
// Invented people only.
import { describe, expect, it } from "vitest";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { makeController, type ControllerDeps } from "../../src/app/controller";
import { ledgerPanel } from "../../src/app/parts/ledgerPanel";
import { makeLedger } from "../../src/egress/ledger";
import { makeDeviceModel } from "../../src/inference/deviceModel";
import { draftDouble } from "../../src/inference/draft/draft.double";
import { DEFAULT_POLICY } from "../../src/masking/policy";

const SAVE_ID = ["#save", "-ledger"].join("");
const SAVE_WORDS = ["Save", " ledger"].join("");

const tick = () => new Promise((r) => setTimeout(r, 5));
const settle = async () => {
  for (let i = 0; i < 8; i++) await tick();
};

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const ledger = makeLedger();
  const deps: ControllerDeps = {
    root,
    device: makeDeviceModel({ languageModel: { availability: async () => "unavailable" } }),
    aiServiceEnabled: true,
    tier: "paid",
    results: () => undefined,
    isOffline: async () => false,
    drafting: {
      draftFor: () => draftDouble as never,
      ledger,
      policy: DEFAULT_POLICY,
      online: { navigatorOnLine: () => true, fetch: async () => ({ ok: true }), now: () => 1 },
      copy: async () => undefined,
    },
  };
  return { root, c: makeController(deps) };
}

async function afterSend(s: ReturnType<typeof setup>) {
  await s.c.start();
  s.c.handlers.onTryExample();
  s.c.handlers.onRecordEdit?.(inventedVisit.preparedRecord);
  s.c.render();
  (s.root.querySelector("#draft") as HTMLButtonElement).click();
  await settle();
  // H35a D8: Draft stops at an unlisted name-like word (Bea) until she keeps it.
  for (let i = 0; i < 5 && s.root.querySelector("[data-keep-likely]"); i++) {
    (s.root.querySelector("[data-keep-likely]") as HTMLElement).click();
    await settle();
  }
  (s.root.querySelector("#send") as HTMLButtonElement).click();
  await settle();
}

describe("no control that saves the ledger in the build she is given (H20 R2, H27)", () => {
  it("shows the ledger fold with its entries, no save button and no cloud-off words", async () => {
    const s = setup();
    await afterSend(s);
    const fold = s.root.querySelector('[data-details="ledger"]');
    expect(fold, "the ledger fold stays").not.toBeNull();
    expect(fold!.querySelectorAll("[data-ledger-entry]").length).toBeGreaterThan(0);
    expect(s.root.querySelector(SAVE_ID)).toBeNull();
    expect(fold!.querySelector("button")).toBeNull();
    const words = fold!.textContent ?? "";
    expect(words).not.toContain(SAVE_WORDS);
    expect(words).not.toMatch(/test double|not connected|Written to/i);
    expect(words).toContain("Kept on this device");
  });

  it("shows no test double words in the status bar when the cloud is on, and none in the ledger fold", async () => {
    const s = setup();
    await afterSend(s);
    expect(s.root.querySelector(".status-bar")?.textContent ?? "").not.toMatch(/test double/i);
    expect(s.root.querySelector('[data-details="ledger"]')?.textContent ?? "").not.toMatch(/test double/i);
  });

  it("the panel has no button", () => {
    const panel = ledgerPanel({ entries: [] });
    expect(panel.querySelector(SAVE_ID)).toBeNull();
    expect(panel.querySelector("button")).toBeNull();
  });
});
