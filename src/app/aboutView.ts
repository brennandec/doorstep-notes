// /about. Three facts: the policy name, its version, and the time the fetch settled.
import type { RemoteSettings } from "../firebase/remoteConfig";

export function isAboutPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/about" || path.endsWith("/about");
}

export function aboutLines(settings: RemoteSettings): { name: string; version: string; fetchTime: string } {
  const name = settings.policy.name?.trim();
  return {
    name: name ? name : "compiled",
    version: String(settings.policy.version ?? 1),
    fetchTime: settings.fetchTime,
  };
}

/** The three facts the bundled check reads. Appends. Does not clear the page. */
export function appendPolicyFacts(root: HTMLElement, settings: RemoteSettings): void {
  const lines = aboutLines(settings);
  const name = document.createElement("p");
  name.setAttribute("data-policy-name", "");
  name.textContent = lines.name;
  const version = document.createElement("p");
  version.setAttribute("data-policy-version", "");
  version.textContent = lines.version;
  const time = document.createElement("p");
  time.setAttribute("data-fetch-time", "");
  time.textContent = lines.fetchTime;
  const section = root.querySelector("[data-about]") ?? root;
  section.append(name, version, time);
}

export function renderAbout(root: HTMLElement, settings: RemoteSettings): void {
  const lines = aboutLines(settings);
  root.replaceChildren();
  const section = document.createElement("section");
  section.setAttribute("data-about", "");
  const name = document.createElement("p");
  name.setAttribute("data-policy-name", "");
  name.textContent = lines.name;
  const version = document.createElement("p");
  version.setAttribute("data-policy-version", "");
  version.textContent = lines.version;
  const time = document.createElement("p");
  time.setAttribute("data-fetch-time", "");
  time.textContent = lines.fetchTime;
  section.append(name, version, time);
  root.append(section);
}
