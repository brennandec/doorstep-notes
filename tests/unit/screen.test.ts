// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderScreen } from "../../src/app/screen";
import { allFolded, emptyState, type AppState, type Handlers } from "../../src/app/state";
import { strings } from "../../src/app/strings";
import { inventedVisit } from "../../src/app/example/inventedVisit";
import { parseClientList } from "../../src/masking/clientList";

function handlers(over: Partial<Handlers> = {}): Handlers {
  return {
    onNoteInput: vi.fn(), onListInput: vi.fn(), onTryExample: vi.fn(), onRemoveExample: vi.fn(),
    onGetModel: vi.fn(), onMakeRecord: vi.fn(), ...over,
  };
}
const visit = (over: Partial<AppState> = {}) => emptyState({ started: true, ...over });
function mount(state: AppState, h: Handlers = handlers()): HTMLElement {
  const root = document.createElement("div");
  root.append(...renderScreen(state, h));
  return root;
}
const q = <T extends Element = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
const text = (n: Element | null) => n?.textContent ?? "";

describe("layout (task 16)", () => {
  it("puts the status bar first, then main, then the standing statements", () => {
    const parts = renderScreen(visit(), handlers());
    expect(parts.map((p) => p.tagName)).toEqual(["HEADER", "MAIN", "FOOTER"]);
  });

  it("has three zones in order with their titles, and the boundary between zone 1 and zone 2", () => {
    const main = mount(visit()).querySelector("main")!;
    const kids = [...main.children];
    expect(kids.map((k) => k.getAttribute("data-zone") ?? (k.hasAttribute("data-boundary") ? "boundary" : k.tagName))).toEqual([
      "H1", "note", "boundary", "leaves", "finished",
    ]);
    expect(kids[0]).toBe(main.firstElementChild);
    expect(kids[0]!.classList.contains("sr-only")).toBe(true);
    expect(text(kids[0]!)).toBe("Your note");
    expect(main.querySelectorAll("h1")).toHaveLength(1);
    expect(text(q(main, '[data-zone="note"] h2'))).toBe("Your note");
    expect(text(q(main, '[data-zone="leaves"] h2'))).toBe("What leaves");
    expect(text(q(main, '[data-zone="finished"] h2'))).toBe("Finished note");
  });

  it("has no hero and no heading above the tool", () => {
    const root = mount(visit());
    expect(root.querySelector("picture, video")).toBeNull();
    const images = [...root.querySelectorAll("img")];
    expect(images.map((img) => img.getAttribute("data-still-picture"))).toEqual(["docs/screens/10-whole-journey-device.png"]);
    expect(images[0]!.closest('[data-zone="note"]')).not.toBeNull();
    expect(images[0]!.closest("header")).toBeNull();
    const h1 = root.querySelector("h1")!;
    expect(h1.classList.contains("sr-only")).toBe(true);
    expect(h1.textContent).toBe("Your note");
    expect(h1.parentElement).toBe(root.querySelector("main"));
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector("header")!.nextElementSibling!.tagName).toBe("MAIN");
  });

  it("puts the line 'Everything here stays in this browser, on this device.' under the zone 1 title", () => {
    const zone = q(mount(visit()), '[data-zone="note"]');
    expect(zone.children[0]!.tagName).toBe("H2");
    expect(text(zone.children[1]!)).toBe("Everything here stays in this browser, on this device.");
    expect(strings.zoneNoteLine).toBe("Everything here stays in this browser, on this device.");
  });

  it("labels the boundary 'this device' then 'the cloud'", () => {
    const b = q(mount(visit()), "[data-boundary]");
    expect(b.getAttribute("role")).toBe("separator");
    expect(text(q(b, ".label-device"))).toBe("this device");
    expect(text(q(b, ".label-cloud"))).toBe("the cloud");
    expect(b.querySelector(".rule")).not.toBeNull();
  });

  it("zone 2 holds the outgoing text, the notice, Send and, last, the egress line", () => {
    const z = q(mount(visit()), '[data-zone="leaves"]');
    expect(z.querySelector("pre.outgoing")).not.toBeNull();
    expect(z.querySelector("[data-send-notice]")).not.toBeNull();
    expect(z.querySelector("#send")).not.toBeNull();
    expect(z.lastElementChild!.hasAttribute("data-egress-line")).toBe(true);
  });

  it("zone 3 holds a sheet and Copy; the source label shows only with a result", () => {
    const empty = q(mount(visit()), '[data-zone="finished"]');
    expect(empty.querySelector("[data-sheet]")).not.toBeNull();
    expect(empty.querySelector("#copy")).not.toBeNull();
    expect(empty.querySelector(".source-label")).toBeNull();
    const done = q(mount(visit({ finished: { text: "A short note.", source: "IN_CLOUD", connected: false } })), '[data-zone="finished"]');
    expect(done.querySelector(".source-label")).not.toBeNull();
    expect(text(done)).toContain("off");
    expect((q(done, "#copy") as HTMLButtonElement).disabled).toBe(false);
  });

  it("states the writing aid line, the H2 line and the cloud-off line in the footer", () => {
    const f = text(q(mount(visit()), "footer"));
    expect(f).toContain("A writing aid with an egress check on listed names. Unlisted details can still identify a person.");
    expect(f).toContain("Not yet checked against the real service.");
    expect(f).toContain("The cloud is off.");
    expect(f).toContain("not for real client data");
  });

  // Rewritten by shell-and-offline task 63 (fifth review N2): 5 : 4 : 4, zone 2 at least 400 px, stacked under 1100 px.
  it("makes the stacking rule a CSS matter at 1100 px, with the zones 5 : 4 : 4 and zone 2 at least 400 px", async () => {
    const { readFileSync } = await import("node:fs");
    const c = await import("../../src/constants");
    const css = readFileSync("src/app/styles/app.css", "utf8");
    expect(c.STACK_WIDTH_PX).toBe(1100);
    expect(c.ZONE_LEAVES_MIN_PX).toBe(400);
    expect(css).toContain(`@media (min-width: ${c.STACK_WIDTH_PX}px)`);
    expect(css).not.toContain("min-width: 1200px");
    const m = css.match(/@media \(min-width: 1100px\) \{\s*\.screen \{[^}]*grid-template-columns:\s*([^;]+);/)!;
    expect(m).not.toBeNull();
    expect(m[1]!.trim()).toBe(`minmax(320px, 5fr) 1px minmax(${c.ZONE_LEAVES_MIN_PX}px, 4fr) minmax(280px, 4fr)`);
  });

  it("stacks in the order of the journey below the breakpoint: one column, heading, note, boundary, leaves, finished", () => {
    const root = mount(visit());
    const zones = [...q(root, "main").children].map((n) => (n as HTMLElement).dataset.zone ?? ((n as HTMLElement).hasAttribute("data-boundary") ? "boundary" : n.tagName));
    expect(zones).toEqual(["H1", "note", "boundary", "leaves", "finished"]);
    expect(q(root, "main").firstElementChild?.classList.contains("sr-only")).toBe(true);
  });
});

describe("offline (task 19)", () => {
  it("shows the offline words and disables Send with the reason", () => {
    const root = mount(visit({ network: "offline", outgoingText: "Masked text" }));
    expect(text(root)).toContain("You are offline. Your note, the record, masking and the short draft still work on this device.");
    const send = q<HTMLButtonElement>(root, "#send");
    expect(send.disabled).toBe(true);
    expect(send.title).toBe(strings.cloudDisabledReason);
  });
  it("enables Send online when there is text", () => {
    expect(q<HTMLButtonElement>(mount(visit({ outgoingText: "Masked text" })), "#send").disabled).toBe(false);
    expect(q<HTMLButtonElement>(mount(visit()), "#send").disabled).toBe(true);
  });
  it("shows no offline words online", () => {
    expect(text(mount(visit()))).not.toContain("You are offline");
  });
});

describe("first run (task 17)", () => {
  let h: Handlers;
  beforeEach(() => { h = handlers(); });

  it("the empty state has one filled control, 'Try an invented visit'", () => {
    const zone = q(mount(visit(), h), '[data-zone="note"]');
    // H35b D1, D4: the example control is the one filled, enabled button; the first control is there but disabled until a note exists.
    const filled = [...zone.querySelectorAll('button[data-kind="primary"]:not([disabled])')];
    expect(filled).toHaveLength(1);
    expect(text(filled[0]!)).toBe("Try an invented visit");
    expect(zone.querySelectorAll('button[data-kind="secondary"]:not([disabled])')).toHaveLength(0);
    (filled[0] as HTMLButtonElement).click();
    expect(h.onTryExample).toHaveBeenCalledTimes(1);
  });

  it("with the example loaded: 12 names, the mark, the prepared record, and Remove example", () => {
    const state = visit({
      example: true, noteText: inventedVisit.note, clientList: inventedVisit.clientList, record: inventedVisit.preparedRecord,
      // Once a record exists the editor and the list fold (shell task 33); open both to read them.
      unfolded: { ...allFolded(), note: true, list: true },
    });
    const root = mount(state, h);
    expect(parseClientList(q<HTMLTextAreaElement>(root, "#client-list").value).entries).toHaveLength(12);
    expect(q<HTMLTextAreaElement>(root, "#note").value).toBe(inventedVisit.note);
    expect([...root.querySelectorAll('[data-mark]')].map((m) => text(m))).toEqual(["invented example"]);
    expect(root.querySelector("[data-record]")).not.toBeNull();
    // The control row under the note; the Mask step has its own row inside the record.
    const secondary = [...q(root, '[data-zone="note"] > .actions').querySelectorAll('button[data-kind="secondary"]')].filter((b) => b.id !== "make-record").map((b) => text(b));
    expect(secondary).toEqual(["Remove example"]);
    (root.querySelector("#remove-example") as HTMLButtonElement).click();
    expect(h.onRemoveExample).toHaveBeenCalledTimes(1);
  });

  it("shows no mark when nothing is an example", () => {
    expect(mount(visit({ noteText: "my own note" })).querySelector("[data-mark]")).toBeNull();
  });

  it("with no device model: one line, Make the record disabled, hand-entry route not blocked", () => {
    const root = mount(visit());
    expect(text(q(root, "[data-model-line]"))).toBe(strings.deviceModelAbsent);
    expect(q<HTMLButtonElement>(root, "#make-record").disabled).toBe(true);
    expect(q<HTMLTextAreaElement>(root, "#note").disabled).toBe(false);
  });

  it("with no results file the line has no version, no chrome:// address and no hardware figure", () => {
    const line = text(q(mount(visit()), "[data-model-line]"));
    expect(line).not.toMatch(/\d/);
    expect(line).not.toMatch(/chrome:\/\//i);
    expect(line).not.toMatch(/\b(GB|VRAM|RAM|GPU|flag)\b/i);
    expect(mount(visit()).querySelector("[data-model-steps]")).toBeNull();
  });

  it("a failed or missed check prints no steps either", () => {
    for (const status of ["fail", "miss"] as const) {
      const root = mount(visit({ results: (n) => (n === "device-model-check" ? { status, reason: "Chrome absent" } : undefined) }));
      expect(root.querySelector("[data-model-steps]")).toBeNull();
    }
  });

  it("a passing check with no date or machine is hidden", () => {
    const results: AppState["results"] = (n) =>
      n === "device-model-check" ? { status: "pass", chromeVersion: "999.0", steps: ["Step one from the file."] } : undefined;
    expect(mount(visit({ results })).querySelector("[data-model-steps]")).toBeNull();
  });

  it("a passing check reads as a past measurement, with its date and its machine, above the file's steps", () => {
    const results: AppState["results"] = (n) =>
      n === "device-model-check"
        ? {
            status: "pass",
            date: "2026-11-13",
            browser: "Google Chrome 999.0",
            steps: ["The browser reported the device model as ready, with no Chrome flag set."],
          }
        : undefined;
    const root = mount(visit({ results }));
    const steps = q(root, "[data-model-steps]");
    const past = text(q(root, "[data-past-measurement]"));
    expect(text(q(root, "[data-model-line]"))).toContain("not on this computer");
    expect(past).toContain("Past measurement of this project");
    expect(past).toContain("2026-11-13");
    expect(past).toContain("Google Chrome 999.0");
    expect(past).toContain("Not measured on this computer");
    expect(text(steps).indexOf("Not measured on this computer")).toBeLessThan(
      text(steps).indexOf("The browser reported the device model as ready"),
    );
    expect(text(steps)).not.toContain("Getting the device model");
    expect(text(steps)).not.toContain("Checked in Chrome");
  });

  it("with the device model ready the absent line is gone and Make the record works", () => {
    const root = mount(visit({ device: { state: "available" }, noteText: "a note" }), h);
    expect(root.querySelector("[data-model-line]")).toBeNull();
    const b = q<HTMLButtonElement>(root, "#make-record");
    expect(b.disabled).toBe(false);
    b.click();
    expect(h.onMakeRecord).toHaveBeenCalledTimes(1);
  });
});

describe("get the device model (task 18)", () => {
  it("shows the control only when the browser reports downloadable", () => {
    for (const state of ["unavailable", "downloading", "available"] as const) {
      expect(mount(visit({ device: { state } })).querySelector("#get-model")).toBeNull();
    }
    expect(mount(visit({ device: { state: "downloadable" } })).querySelector("#get-model")).not.toBeNull();
  });
  it("calls the handler only on the press", () => {
    const h = handlers();
    const root = mount(visit({ device: { state: "downloadable" } }), h);
    expect(h.onGetModel).not.toHaveBeenCalled();
    (root.querySelector("#get-model") as HTMLButtonElement).click();
    expect(h.onGetModel).toHaveBeenCalledTimes(1);
  });
  it("shows progress as 'downloading, N%'", () => {
    const root = mount(visit({ device: { state: "downloading", percent: 42.4 } }));
    expect(text(q(root, ".model-progress"))).toBe("downloading, 42%");
    expect(text(q(root, '[data-state="device"]'))).toContain("downloading, 42%");
  });
});
