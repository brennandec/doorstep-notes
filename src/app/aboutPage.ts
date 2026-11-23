// /about. The agency section is the WO-14 draft. A privacy notice and a contact are not here:
// the draft left those for the owner.
import { WORKING_TITLE } from "../constants";
import { aboutFacts } from "./aboutFacts";
import { el } from "./dom";
import { fill, strings } from "./strings";

export function renderAbout(root: HTMLElement): void {
  const s = strings.about;
  const f = aboutFacts;
  document.title = s.title;
  const sections: [string, string][] = [
    [s.computers, fill(s.computersBody, {
      version: f.version, item: f.item, sdkRead: f.sdkRead, freeGb: f.freeGb, vramGb: f.vramGb, ramGb: f.ramGb, floorItem: f.floorItem,
    })],
    [s.switchTitle, fill(s.switchBody, { download: f.download, remove: f.remove, build: f.build })],
    [s.keeps, fill(s.keepsBody, { effective: f.effective, termsRead: f.termsRead })],
    [s.without, fill(s.withoutBody, {
      notes: f.notes, listCaught: f.listCaught, total: f.total, modelCaught: f.modelCaught, browser: f.browser, when: f.when,
    })],
    [s.leaves, s.leavesBody],
    [s.claims, s.claimsBody],
  ];
  root.replaceChildren(el(
    "main",
    { class: "about-page", "data-about": "" },
    el("a", { class: "btn", href: "/" }, WORKING_TITLE),
    el("h1", {}, s.title),
    el("h2", {}, s.agency),
    ...sections.map(([title, body]) => el("section", {}, el("h3", {}, title), el("p", {}, body))),
  ));
}
