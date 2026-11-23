// Third-party notices (shell-and-offline R38, sixth review R1).
// Writes THIRD-PARTY-NOTICES.txt from package-lock.json: every production package with its name, version,
// licence and source address; the full text of each distinct licence once; the content of every NOTICE file.
// Licence and NOTICE texts are read from the installed packages in node_modules. Nothing is fetched and no
// package is added or removed.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const NOTICES_FILE = "THIRD-PARTY-NOTICES.txt";

export interface LockPackage {
  version?: string;
  resolved?: string;
  license?: string;
  dev?: boolean;
  link?: boolean;
}
export interface Lock {
  packages: Record<string, LockPackage>;
}

/** What is on disk for one installed package. */
export interface InstalledPackage {
  licenseFiles: { name: string; text: string }[];
  noticeFiles: { name: string; text: string }[];
  /** the repository address from the package's own package.json, if it has one */
  repository?: string;
}
export type ReadInstalled = (folder: string) => InstalledPackage | null;

export interface ProductionPackage {
  name: string;
  version: string;
  license: string;
  source: string;
  folder: string;
}

/** The name is what follows the last node_modules/ in the lock key. */
export function packageName(key: string): string {
  const at = key.lastIndexOf("node_modules/");
  return at === -1 ? key : key.slice(at + "node_modules/".length);
}

/** Every production package of the lock: not the root, not marked dev. Sorted by name, then version. */
export function productionPackages(lock: Lock): ProductionPackage[] {
  const out: ProductionPackage[] = [];
  for (const [key, p] of Object.entries(lock.packages)) {
    if (key === "" || p.dev === true || p.link === true) continue;
    out.push({
      name: packageName(key),
      version: p.version ?? "unknown",
      license: p.license ?? "not stated in the lock",
      source: p.resolved ?? "not stated in the lock",
      folder: key,
    });
  }
  return out.sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name)));
}

const id = (p: ProductionPackage) => `${p.name}@${p.version}`;
const clean = (t: string) => t.replace(/\r\n/g, "\n").trim();

/** A complete Apache 2.0 text: the standard terms, not a short notice. */
const isFullApache = (t: string) => /Apache License/.test(t) && /Version 2\.0/.test(t) && /TERMS AND CONDITIONS/.test(t);

export interface NoticesOutput {
  text: string;
  count: number;
  /** packages whose licence text was not found on disk and could not be stood in for */
  gaps: string[];
  /** packages that ship no licence file; the standard text of their licence is used */
  standIn: string[];
}

export function buildNotices(lock: Lock, read: ReadInstalled): NoticesOutput {
  const pkgs = productionPackages(lock);
  const installed = new Map<string, InstalledPackage | null>();
  for (const p of pkgs) installed.set(p.folder, read(p.folder));

  // Each distinct licence text once, with the packages that carry it.
  const texts = new Map<string, string[]>();
  const noticed: { pkg: string; file: string; text: string }[] = [];
  for (const p of pkgs) {
    const i = installed.get(p.folder);
    if (!i) continue;
    for (const f of i.licenseFiles) {
      const t = clean(f.text);
      if (t === "") continue;
      texts.set(t, [...(texts.get(t) ?? []), id(p)]);
    }
    for (const n of i.noticeFiles) if (clean(n.text) !== "") noticed.push({ pkg: id(p), file: n.name, text: clean(n.text) });
  }

  // A package with no licence file of its own: the standard Apache 2.0 text stands in, if the licence is
  // Apache-2.0 and a full text of it is on disk. Anything else is a gap, written down and never skipped.
  const apache = [...texts.keys()].filter(isFullApache).sort()[0];
  const standIn: string[] = [];
  const gaps: string[] = [];
  const own = new Set(pkgs.filter((p) => (installed.get(p.folder)?.licenseFiles ?? []).some((f) => clean(f.text) !== "")).map(id));
  for (const p of pkgs) {
    if (own.has(id(p))) continue;
    if (p.license === "Apache-2.0" && apache !== undefined) {
      standIn.push(id(p));
      texts.set(apache, [...(texts.get(apache) ?? []), `${id(p)} (standard text, no licence file in the package)`]);
    } else gaps.push(id(p));
  }

  const lines: string[] = [];
  lines.push("THIRD-PARTY NOTICES", "");
  lines.push("This file lists the packages from other authors that the built site ships, taken from package-lock.json,");
  lines.push("with the licence text of each and the content of each NOTICE file the packages carry.");
  lines.push("The project's own licence is in LICENSE and is not changed.", "");
  lines.push(`Production packages: ${pkgs.length}`, "");
  lines.push("=".repeat(72), "PACKAGES", "=".repeat(72), "");
  for (const p of pkgs) {
    lines.push(`PACKAGE: ${id(p)}`);
    lines.push(`  Licence: ${p.license}`);
    lines.push(`  Source: ${p.source}`);
    const repo = installed.get(p.folder)?.repository;
    if (repo) lines.push(`  Repository: ${repo}`);
    if (gaps.includes(id(p))) lines.push("  Licence text: not found in the installed package. See the notes in .kiro/specs/OPEN-QUESTIONS.md.");
    else if (standIn.includes(id(p))) lines.push("  Licence text: the package ships no licence file; the standard text of its licence is given below.");
    lines.push("");
  }
  lines.push("=".repeat(72), "LICENCE TEXTS (each distinct text once)", "=".repeat(72), "");
  const ordered = [...texts.entries()].sort((a, b) => a[1][0]!.localeCompare(b[1][0]!));
  ordered.forEach(([text, users], n) => {
    lines.push(`LICENCE TEXT ${n + 1}`, "Used by:");
    for (const u of [...users].sort()) lines.push(`  ${u}`);
    lines.push("", text, "", "-".repeat(72), "");
  });
  lines.push("=".repeat(72), "NOTICE FILES", "=".repeat(72), "");
  if (noticed.length === 0) lines.push("No production package carries a NOTICE file.", "");
  for (const n of noticed.sort((a, b) => a.pkg.localeCompare(b.pkg))) lines.push(`NOTICE: ${n.pkg} (${n.file})`, "", n.text, "", "-".repeat(72), "");

  return { text: lines.join("\n"), count: pkgs.length, gaps, standIn };
}

const LICENCE_NAME = /^(licen[sc]e|copying)(\.|$|-)/i;
const NOTICE_NAME = /^notice(\.|$)/i;

/** Reads one installed package folder from disk. */
export function readInstalledFrom(root: string): ReadInstalled {
  return (folder) => {
    const dir = join(root, folder);
    if (!existsSync(dir)) return null;
    const names = readdirSync(dir);
    const read = (f: string) => ({ name: f, text: readFileSync(join(dir, f), "utf8") });
    let repository: string | undefined;
    try {
      const pj = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { repository?: string | { url?: string } };
      repository = typeof pj.repository === "string" ? pj.repository : pj.repository?.url;
    } catch {
      repository = undefined;
    }
    return {
      licenseFiles: names.filter((n) => LICENCE_NAME.test(n)).map(read),
      noticeFiles: names.filter((n) => NOTICE_NAME.test(n)).map(read),
      ...(repository ? { repository } : {}),
    };
  };
}

export function main(): void {
  const root = process.cwd();
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as Lock;
  const out = buildNotices(lock, readInstalledFrom(root));
  writeFileSync(join(root, NOTICES_FILE), out.text.endsWith("\n") ? out.text : `${out.text}\n`);
  console.log(`${NOTICES_FILE}: ${out.count} packages, ${out.standIn.length} with the standard text, ${out.gaps.length} gaps`);
  if (out.gaps.length > 0) console.log(`Gaps: ${out.gaps.join(", ")}`);
}
