// H49 + H49b: a build ships the results files of the HEAD commit and no local user path.
//
// 1. src/app/figures.ts globs results/*.json on disk. In a build, a results file that is not in the
//    HEAD commit (a run record a film take or a device spec just wrote) is left out of that glob, so
//    the build reads committed records only and a working tree full of run output still builds.
// 2. A committed results file whose bytes on disk differ from HEAD, or that is missing on disk, stops
//    the build with ONE refusal that lists every such file. The load hook then hands the bundler the
//    exact bytes it checked, so a file rewritten during the build cannot slip in between check and read.
//    A tree with no .git folder (a downloaded zip) has no commit to compare with; 1 and 2 are skipped.
// 3. After every file is written (the service worker list included), each text file in the output
//    folder is read and the build stops if any of them holds a local user path.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { Plugin } from "vite";

/** A home folder on macOS, Linux or Windows, or one written with a tilde. */
export const LOCAL_PATH =
  /\/Users\/[^/\s"'`]+|\/home\/[a-z_][a-z0-9_-]*(?=[/\s"'`\\]|$)|[A-Za-z]:\\\\?Users\\\\?[^\\\s"'`]+|[A-Za-z]:\/Users\/[^/\s"'`]+|(?<![\w.~/-])~[a-z_][a-z0-9_-]*\/[\w.-]+|(?<![\w.~/-])~\/[\w.-]+/;

export function localPathIn(text: string): string | null {
  const m = LOCAL_PATH.exec(text);
  return m ? m[0] : null;
}

/** The git blob id of some bytes, as `git hash-object` gives it. */
export function blobId(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** Why a results file may not be bundled, or null. `committed` maps repo-relative paths to their blob id at HEAD. */
export function resultsRefusal(rel: string, bytes: Buffer, committed: Map<string, string>): string | null {
  const id = committed.get(rel);
  if (!id) return `${rel} is not committed`;
  if (id !== blobId(bytes)) return `${rel} differs from the committed file`;
  return null;
}

/** The names figures.ts leaves out on its own; they are never bundled, so they are never checked. */
const NOT_BUNDLED = /^results\/(synthetic-set|misses|real-browser-[^/]*)\.json$/;
const RESULT = /^results\/[^/]+\.json$/;
const GLOB_META = /[*?[\]{}()!\\,"']/;

/** results/*.json files the figures glob would read, repo-relative, from a listing of names in results/. */
export function bundledNames(names: string[]): string[] {
  return names.map((n) => `results/${n}`).filter((r) => RESULT.test(r) && !NOT_BUNDLED.test(r)).sort();
}

/**
 * Compare the results folder on disk with HEAD. `onDisk` lists repo-relative results paths the glob reads;
 * `bytes(rel)` reads one. Returns the untracked files (left out) and every committed file that may not ship.
 */
export function resultsDrift(onDisk: string[], committed: Map<string, string>, bytes: (rel: string) => Buffer) {
  const untracked = onDisk.filter((r) => !committed.has(r));
  const offenders: string[] = [];
  const disk = new Set(onDisk);
  for (const r of onDisk) {
    if (!committed.has(r)) { if (GLOB_META.test(r)) offenders.push(`${r} is not committed and its name cannot be left out of the glob`); continue; }
    const why = resultsRefusal(r, bytes(r), committed);
    if (why) offenders.push(why);
  }
  for (const r of [...committed.keys()].filter((k) => RESULT.test(k) && !NOT_BUNDLED.test(k)).sort()) {
    if (!disk.has(r)) offenders.push(`${r} is committed but missing on disk`);
  }
  return { untracked, offenders };
}

/** One refusal naming every offender. */
export function driftRefusal(offenders: string[]): string {
  return `H49b: ${offenders.length} results file${offenders.length === 1 ? "" : "s"} would make this build differ from the HEAD commit: ${offenders.join(" · ")}. Commit them, restore them with git checkout, or move them out of results/.`;
}

const FIGURES_GLOB = '"/results/*.json",';

/** figures.ts source with a negation added to its glob for each untracked results file; throws if the glob is not where it was. */
export function leaveOut(code: string, untracked: string[]): string {
  if (!code.includes(FIGURES_GLOB)) throw new Error(`H49b: src/app/figures.ts no longer holds ${FIGURES_GLOB}; the untracked results cannot be left out of the bundle`);
  if (!untracked.length) return code;
  return code.replace(FIGURES_GLOB, `${FIGURES_GLOB} ${untracked.map((r) => JSON.stringify(`!/${r}`)).join(", ")},`);
}

/** The text of some bytes, or null when they are not valid UTF-8 (so the text would not be the same bytes). */
export function utf8(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function textFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return textFiles(p);
    return /\.(js|mjs|html|css|json|txt|webmanifest|map|svg)$/.test(p) ? [p] : [];
  });
}

/** Every local path in the text files under `dir`, as "file: match". */
export function localPathsUnder(dir: string): string[] {
  return textFiles(dir).flatMap((f) => {
    const hit = localPathIn(readFileSync(f, "utf8"));
    return hit ? [`${relative(dir, f).split(sep).join("/")}: ${hit}`] : [];
  });
}

export function bundleHygiene(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  let committed: Map<string, string> | null = null;
  let untracked: string[] = [];
  let failed = false;
  return {
    name: "bundle-hygiene",
    apply: "build",
    // Before Vite expands import.meta.glob, so the negations reach the glob.
    enforce: "pre",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    buildStart() {
      committed = null;
      untracked = [];
      if (!existsSync(join(root, ".git"))) return;
      // "<mode> blob <id>\t<path>" for every file under results/ in the HEAD commit.
      committed = new Map(
        git(root, ["ls-tree", "-r", "-z", "HEAD", "--", "results"]).split("\0").filter(Boolean).map((l) => {
          // Split on the first tab only: a path may itself hold a tab.
          const t = l.indexOf("\t");
          return [l.slice(t + 1), l.slice(0, t).split(" ")[2] ?? ""] as [string, string];
        }),
      );
      const dir = join(root, "results");
      const names = existsSync(dir) ? readdirSync(dir) : [];
      // A symlink would be bundled from where it points, past the checks below.
      const links = bundledNames(names.filter((n) => lstatSync(join(dir, n)).isSymbolicLink())).map((r) => `${r} is a symlink`);
      const onDisk = bundledNames(names.filter((n) => !lstatSync(join(dir, n)).isSymbolicLink() && statSync(join(dir, n)).isFile()));
      const drift = resultsDrift(onDisk, committed, (r) => readFileSync(join(root, r)));
      if (links.length || drift.offenders.length) this.error(driftRefusal([...links, ...drift.offenders]));
      untracked = drift.untracked;
      if (untracked.length) this.info(`H49b: left out of the bundle, not committed (${untracked.length}): ${untracked.join(" · ")}`);
    },
    transform(code, id) {
      if (!committed) return null;
      const rel = relative(root, id.split("?")[0] ?? id).split(sep).join("/");
      if (rel !== "src/app/figures.ts") return null;
      try {
        return { code: leaveOut(code, untracked), map: null };
      } catch (e) {
        this.error((e as Error).message);
      }
    },
    load(id) {
      const file = id.split("?")[0] ?? id;
      const rel = relative(root, file).split(sep).join("/");
      if (!RESULT.test(rel) || !committed) return null;
      const bytes = readFileSync(file);
      const why = resultsRefusal(rel, bytes, committed) ?? (utf8(bytes) === null ? `${rel} is not valid UTF-8` : null);
      if (why) this.error(`H49: ${why}. The build ships committed results only; commit it or move it out of results/.`);
      // The bytes just checked are the bytes bundled.
      return utf8(bytes)!;
    },
    buildEnd(error) {
      failed = Boolean(error);
    },
    // Last, after the service worker list and the hosting config are written.
    closeBundle: {
      order: "post",
      sequential: true,
      handler() {
        if (failed) return;
        const hits = localPathsUnder(resolve(root, outDir));
        if (hits.length) throw new Error(`H49: the built site holds a local user path (${hits.length} files): ${hits.slice(0, 5).join(" · ")}`);
      },
    },
  };
}
